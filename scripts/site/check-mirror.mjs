#!/usr/bin/env node
// qscatlas.org: compare Notion with the JSON copy (spec 16.6).
//
// Usage: node scripts/site/check-mirror.mjs
//
// Profiles render from Notion; the tools and the offline builds read data/profiles and
// data/results. For every profile Notion holds, this compares the Migration Timeline and Last
// Updated with data/profiles (mirrorDiff in src/lib/site/mirror.ts) and fails on any difference:
// the fix is to run the dump. Documents (count per country, then title and year) are compared
// too and reported as warnings, as mirror.ts intends.
//
// It reads Notion only, never writes to it. The token comes from NOTION_TOKEN in the environment
// or, when that is unset, from the NOTION_TOKEN line of .env (no other line of .env is read
// except the two data source ids). With no token, or when Notion cannot be reached, it says so
// and passes: CI has no Notion secret and runs offline.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { ROOT, loadTs } from './lib/common.mjs';

const ENV_KEYS = ['NOTION_TOKEN', 'NOTION_DB_COUNTRIES', 'NOTION_DB_DOCUMENTS'];
const NETWORK = new Set(['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'notionhq_client_request_timeout']);

/** The Notion settings: the environment first, else those three lines of .env. */
export function notionSettings(root = ROOT, env = process.env) {
  const out = {};
  let file = {};
  if (env.NOTION_TOKEN === undefined && existsSync(join(root, '.env'))) {
    try {
      file = parseEnv(readFileSync(join(root, '.env'), 'utf8'));
    } catch {
      file = {};
    }
  }
  for (const k of ENV_KEYS) out[k] = env[k] !== undefined ? env[k] : file[k];
  // the ids the site itself falls back to (src/content.config.ts)
  const config = readFileSync(join(root, 'src', 'content.config.ts'), 'utf8');
  const fallback = (key) => new RegExp(`${key}\\s*\\?\\?\\s*'([^']+)'`).exec(config)?.[1];
  out.NOTION_DB_COUNTRIES ||= fallback('NOTION_DB_COUNTRIES');
  out.NOTION_DB_DOCUMENTS ||= fallback('NOTION_DB_DOCUMENTS');
  return out;
}

// ---- Notion properties, read as src/loaders/notion.ts reads them ------------------------------

const rich = (arr) => {
  const s = (arr ?? []).map((t) => t?.plain_text ?? '').join('').trim();
  return s === '' ? null : s;
};
const txt = (p, name) => (p[name]?.type === 'title' ? rich(p[name].title) : p[name]?.type === 'rich_text' ? rich(p[name].rich_text) : null);
const date = (p, name) => (p[name]?.type === 'date' ? p[name].date?.start ?? null : null);
const num = (p, name) => (p[name]?.type === 'number' ? p[name].number ?? null : null);
const bool = (p, name) => (p[name]?.type === 'checkbox' ? Boolean(p[name].checkbox) : false);
const url = (p, name) => (p[name]?.type === 'url' ? p[name].url ?? null : null);

async function queryAll(client, id) {
  const rows = [];
  let cursor;
  do {
    const res = await client.dataSources.query({ data_source_id: id, start_cursor: cursor, page_size: 100 });
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return rows;
}

/** The profiles' mirrored fields, as the site's Notion loader maps them (rows without a country or ISO3 skipped). */
export function notionProfiles(pages) {
  return pages.flatMap((page) => {
    const p = page.properties ?? {};
    const iso3 = txt(p, 'ISO3');
    if (!txt(p, 'Country') || !iso3) return [];
    return [{ iso3: iso3.toUpperCase(), migrationTimeline: txt(p, 'Migration Timeline'), lastUpdated: date(p, 'Last Updated') }];
  });
}

/** The included documents, as the site's Notion loader maps them. */
export function notionDocuments(pages) {
  return pages.flatMap((page) => {
    const p = page.properties ?? {};
    const title = txt(p, 'Title');
    if (!title || !bool(p, 'Included')) return [];
    return [{ title, country: txt(p, 'Country'), year: num(p, 'Year'), url: url(p, 'URL') ?? url(p, 'userDefined:URL') }];
  });
}

/** The included rows of data/results, in the same shape. */
export function jsonDocuments(root = ROOT) {
  const dir = join(root, 'data', 'results');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => {
      const rows = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      return (Array.isArray(rows) ? rows : [])
        .filter((r) => r?.included === true && typeof r.title === 'string' && r.title.trim())
        .map((r) => ({ title: r.title, country: r.country ?? null, year: typeof r.year === 'number' ? r.year : null, url: typeof r.url === 'string' && r.url.trim() ? r.url : null }));
    });
}

/**
 * The findings for a set of Notion rows: each profile difference is an error, each document
 * difference a warning, and a profile in data/profiles that Notion does not hold a warning.
 */
export function compareMirror({ profiles, documents, mirror, root = ROOT }) {
  const findings = [];
  const add = (rule, level, file = null) => findings.push({ mode: 'mirror', rule, file, line: null, col: null, excerpt: '', level });
  for (const d of mirror.mirrorDiffs(profiles, { root })) {
    add(`${mirror.describeDifference(d)}; run the dump so data/profiles matches Notion`, 'error', `data/profiles/${d.iso3}.json`);
  }
  const inNotion = new Set(profiles.map((p) => p.iso3));
  const profileDir = join(root, 'data', 'profiles');
  if (existsSync(profileDir)) {
    for (const f of readdirSync(profileDir).filter((x) => x.endsWith('.json')).sort()) {
      const iso3 = f.replace(/\.json$/, '').toUpperCase();
      if (!inNotion.has(iso3)) add(`${iso3}: in data/profiles but not in Notion`, 'warn', `data/profiles/${f}`);
    }
  }
  if (documents) {
    for (const d of mirror.documentsMirrorDiff(documents, jsonDocuments(root))) {
      const what =
        d.kind === 'count'
          ? `${d.iso3}: ${d.notion} included documents in Notion, ${d.json} in data/results`
          : d.kind === 'field'
            ? `${d.iso3}: ${d.field} differs for ${d.url} (Notion ${JSON.stringify(d.notion)}, JSON ${JSON.stringify(d.json)})`
            : `${d.iso3}: ${d.kind === 'missing' ? 'in Notion, not in data/results' : 'in data/results, not in Notion'}: ${d.title}`;
      add(what, 'warn', `data/results/${d.iso3 || 'unknown'}.json`);
    }
  }
  return findings;
}

/**
 * Run the comparison against Notion. Returns { status: 'skipped' | 'checked', note, findings }.
 * Skipped without a token or when Notion cannot be reached; a reply from Notion that refuses the
 * token is a failure, since a broken token would hide every difference.
 */
export async function runMirror(root = ROOT, env = process.env) {
  const s = notionSettings(root, env);
  if (!s.NOTION_TOKEN) return { status: 'skipped', note: 'no NOTION_TOKEN in the environment or .env, so Notion was not compared (CI runs offline)', findings: [] };
  const { Client } = await import('@notionhq/client');
  const client = new Client({ auth: s.NOTION_TOKEN, timeoutMs: 20000 });
  let profilePages;
  let documentPages;
  try {
    profilePages = await queryAll(client, s.NOTION_DB_COUNTRIES);
    documentPages = await queryAll(client, s.NOTION_DB_DOCUMENTS);
  } catch (e) {
    const code = e?.code ?? e?.cause?.code ?? '';
    if (NETWORK.has(code) || /fetch failed|network|timed? ?out/i.test(String(e?.message))) {
      return { status: 'skipped', note: `Notion could not be reached (${code || e.message}), so it was not compared`, findings: [] };
    }
    return {
      status: 'checked',
      note: 'Notion answered with an error',
      findings: [{ mode: 'mirror', rule: `Notion refused the query: ${e?.message ?? e}`, file: null, line: null, col: null, excerpt: '', level: 'error' }],
    };
  }
  const mirror = await loadTs('src/lib/site/mirror.ts', root);
  const findings = compareMirror({ profiles: notionProfiles(profilePages), documents: notionDocuments(documentPages), mirror, root });
  return { status: 'checked', note: `${profilePages.length} profile rows and ${documentPages.length} document rows read from Notion`, findings };
}

async function main() {
  const { status, note, findings } = await runMirror();
  for (const f of findings) console.log(`${f.file ?? '(notion)'} [mirror]${f.level === 'warn' ? ' [warn]' : ''} ${f.rule}`);
  const errors = findings.filter((f) => f.level !== 'warn').length;
  console.log(`check-mirror: ${status === 'skipped' ? `skipped: ${note}` : `${note}; ${errors ? `${errors} difference(s)` : 'the JSON copy matches Notion'}`}`);
  return errors ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`check-mirror: ${e.message}`);
      process.exit(2);
    });
}
