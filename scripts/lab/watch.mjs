#!/usr/bin/env node
// QSC Atlas Labs: the watch pipeline, deterministic first layer. Never calls a model.
//
// Reads labs/config/watchlist.yaml, fetches every enabled source, normalises its text,
// hashes it and compares the hash with the one in data/lab/watch/state.json. On a change it
// writes the new snapshot, a unified diff against the previous one, and a change entry for
// the triage step. A source seen for the first time records a baseline and reports nothing.
// A failed fetch is recorded as an error, never as a change.
//
// Usage:
//   node scripts/lab/watch.mjs [--only id1,id2] [--out labs/.watch/changes.json] [--dry-run]
// Writes "changed=true|false" to $GITHUB_OUTPUT when that variable is set.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import { createTwoFilesPatch } from 'diff';
import YAML from 'yaml';
import { ROOT, isMain } from './lib/common.mjs';
import { gitOrNull } from './lib/git.mjs';
import { findCandidates } from './cascade-candidates.mjs';

export const USER_AGENT = 'QSC-Atlas-Lab-Watch/1.0 (+https://github.com/swaggito1/QSC-Atlas-)';
export const TIMEOUT_MS = 30_000;
export const RETRIES = 2;
export const MAX_SNAPSHOT_BYTES = 500 * 1024;

export const WATCH_DIR = 'data/lab/watch';
export const snapshotPath = (id) => `${WATCH_DIR}/snapshots/${id}.txt`;
export const diffPath = (id) => `${WATCH_DIR}/diffs/${id}.diff`;

// ---- normalising --------------------------------------------------------------

// Query parameters that track visitors or bust caches; stripped from every link.
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|mkt_tok|oly_anon_id|oly_enc_id|vero_id|igshid|ver|v|_|cb|cachebuster|timestamp)$/i;

/** A link without tracking or cache-busting parameters, session ids or fragments. */
export function cleanUrl(href, base) {
  let u;
  try {
    u = new URL(href, base);
  } catch {
    return href;
  }
  if (!/^https?:$/.test(u.protocol)) return href;
  u.pathname = u.pathname.replace(/;jsessionid=[^/]*/i, '');
  for (const key of [...u.searchParams.keys()]) if (TRACKING.test(key)) u.searchParams.delete(key);
  u.hash = '';
  return u.toString();
}

// Lines that record when a page was rendered rather than anything in its content.
const RENDER_STAMP = [
  /^(this )?page (was )?(generated|rendered|built|served|cached)\b.*$/i,
  /^(generated|rendered|cached|served) (at|on|in)\b.*$/i,
  /^(server|render|response) time\b.*$/i,
  /^last (refreshed|rendered|cached)\b.*$/i,
  /^page load(ed)? in\b.*$/i,
];

/** Collapse whitespace, keep line structure, drop render stamps, keep every content date. */
export function normaliseText(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((l) => l.replace(/[ \t\f\v]+/g, ' ').trim())
    .filter((l) => !RENDER_STAMP.some((re) => re.test(l)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

// Page furniture removed before text is extracted.
const FURNITURE = [
  'script', 'style', 'noscript', 'template', 'iframe', 'svg', 'button', 'input', 'select',
  'header', 'footer', 'nav', 'aside',
  '[role=banner]', '[role=contentinfo]', '[role=navigation]', '[aria-hidden=true]',
  '[id*=cookie]', '[class*=cookie]', '[id*=consent]', '[class*=consent]', '[id*=gdpr]', '[class*=gdpr]',
  '[class*=skip-link]', '[class*=visually-hidden]', '[class*=sr-only]',
];

const BLOCK = new Set(['p', 'div', 'section', 'article', 'main', 'li', 'ul', 'ol', 'table', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dt', 'dd', 'dl', 'blockquote', 'pre', 'figure', 'figcaption', 'br', 'hr', 'tbody', 'thead']);

function textOf(node, base) {
  if (node.nodeType === 3) return node.text; // entities decoded
  if (node.nodeType !== 1) return '';
  const tag = node.rawTagName?.toLowerCase();
  let inner = node.childNodes.map((c) => textOf(c, base)).join('');
  if (tag === 'a') {
    const href = node.getAttribute('href');
    if (href && !href.startsWith('#') && !/^(javascript|mailto|tel):/i.test(href)) {
      inner = `${inner.trim()} <${cleanUrl(href, base)}>`;
    }
  }
  if (tag === 'td' || tag === 'th') return inner.trim() + '\t';
  return BLOCK.has(tag) ? `\n${inner}\n` : inner;
}

/** Readable text of an HTML page: the extract selector if given, else main, article or body. */
export function extractHtml(html, { extract, url } = {}) {
  const root = parseHtml(html, { comment: false });
  let scope;
  if (extract) {
    scope = root.querySelectorAll(extract);
    // a selector that stops matching means the page was redesigned: report it, do not hash the whole page
    if (!scope.length) throw new Error(`the extract selector "${extract}" matched nothing`);
  } else {
    scope = [root.querySelector('main') ?? root.querySelector('article') ?? root.querySelector('body') ?? root];
  }
  const parts = scope.map((node) => {
    for (const sel of FURNITURE) for (const el of node.querySelectorAll(sel)) el.remove();
    return textOf(node, url);
  });
  return normaliseText(parts.join('\n\n'));
}

/** SPARQL JSON results as a header line and sorted tab-separated rows. */
export function sparqlToLines(json) {
  const vars = json?.head?.vars ?? [];
  const rows = (json?.results?.bindings ?? []).map((b) => vars.map((v) => (b[v]?.value ?? '').replace(/\s+/g, ' ').trim()).join('\t'));
  rows.sort();
  return vars.join('\t') + '\n' + rows.join('\n') + '\n';
}

/** Zenodo versions as sorted lines: id, version, publication date, DOI. */
export function zenodoToLines(json) {
  const hits = json?.hits?.hits ?? [];
  const rows = hits.map((h) => [h.id, h.metadata?.version ?? '', h.metadata?.publication_date ?? '', h.doi ?? h.metadata?.doi ?? ''].join('\t'));
  rows.sort();
  return 'id\tversion\tpublication_date\tdoi\n' + rows.join('\n') + '\n';
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Cap a snapshot at MAX_SNAPSHOT_BYTES without splitting a character. */
export function cap(text) {
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= MAX_SNAPSHOT_BYTES) return { text, truncated: false };
  let cut = buf.subarray(0, MAX_SNAPSHOT_BYTES).toString('utf8');
  if (cut.endsWith('\ufffd')) cut = cut.slice(0, -1);
  return { text: cut + '\n[truncated at 500 KB]\n', truncated: true };
}

// ---- fetching -----------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with a 30 second timeout and two retries with backoff. */
export async function fetchWithRetry(url, init = {}, { fetchImpl = globalThis.fetch, retries = RETRIES, backoffMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(backoffMs * 3 ** attempt);
    }
  }
  throw lastErr;
}

const isLocal = (url) => !/^https?:\/\//i.test(url);

/** Fetch one source and return its normalised text. */
export async function readSource(source, { root = ROOT, fetchImpl, backoffMs } = {}) {
  const opts = { fetchImpl, backoffMs };
  switch (source.kind) {
    case 'html': {
      const html = isLocal(source.url)
        ? readFileSync(join(root, source.url), 'utf8')
        : await (await fetchWithRetry(source.url, { headers: { Accept: 'text/html,application/xhtml+xml' } }, opts)).text();
      return extractHtml(html, { extract: source.extract, url: isLocal(source.url) ? undefined : source.url });
    }
    case 'pdf': {
      const dir = mkdtempSync(join(tmpdir(), 'lab-pdf-'));
      try {
        const file = join(dir, 'source.pdf');
        if (isLocal(source.url)) writeFileSync(file, readFileSync(join(root, source.url)));
        else writeFileSync(file, Buffer.from(await (await fetchWithRetry(source.url, {}, opts)).arrayBuffer()));
        const out = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return normaliseText(out);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    case 'sparql': {
      const query = readFileSync(join(root, source.query), 'utf8');
      const res = await fetchWithRetry(
        source.url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
          body: new URLSearchParams({ query }).toString(),
        },
        opts,
      );
      return sparqlToLines(await res.json());
    }
    case 'zenodo': {
      const res = await fetchWithRetry(source.url, { headers: { Accept: 'application/json' } }, opts);
      return zenodoToLines(await res.json());
    }
    default:
      throw new Error(`unknown kind "${source.kind}"`);
  }
}

// ---- the Cascade's candidates --------------------------------------------------------

/** Documents naming a standard that are neither verified edges nor already rejected. */
export function newCascadeCandidates(root = ROOT, limit = 20) {
  const read = (f, key) => (existsSync(join(root, f)) ? JSON.parse(readFileSync(join(root, f), 'utf8'))[key] ?? [] : []);
  if (!existsSync(join(root, 'data/lab/cascade/standards.json'))) return [];
  const known = new Set(read('data/lab/cascade/edges.json', 'edges').map((e) => `${e.documentUrl}|${e.to}`));
  for (const r of read('data/lab/cascade/rejected.json', 'rejected')) known.add(`${r.docUrl}|${r.standardId}`);
  return findCandidates({ root }).filter((c) => !known.has(`${c.docUrl}|${c.standardId}`)).slice(0, limit);
}

// ---- the run --------------------------------------------------------------------

export function loadWatchlist(root = ROOT, file = 'labs/config/watchlist.yaml') {
  const doc = YAML.parse(readFileSync(join(root, file), 'utf8'));
  return doc?.sources ?? [];
}

export function loadState(root = ROOT) {
  const p = join(root, WATCH_DIR, 'state.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : { sources: {} };
}

const sortKeys = (o) =>
  Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) ? sortKeys(o[k]) : o[k]]));

/**
 * Run the watcher. Returns { changes, writes, log }. With dryRun, nothing is written:
 * `writes` lists what would have been.
 */
export async function runWatch({ root = ROOT, only = '', dryRun = false, now = new Date(), fetchImpl, backoffMs, git = gitOrNull, sources } = {}) {
  const all = sources ?? loadWatchlist(root);
  const wanted = only ? new Set(only.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  const log = [];
  for (const id of wanted ?? []) {
    const s = all.find((x) => x.id === id);
    if (!s) log.push(`${id}: not in the watchlist`);
    else if (!s.enabled) log.push(`${id}: disabled, skipped`);
  }
  const run = all.filter((s) => s.enabled && (!wanted || wanted.has(s.id)));
  const state = loadState(root);
  state.sources ??= {};
  const changes = [];
  const writes = new Map(); // repo-relative path -> content
  const stamp = now.toISOString();

  for (const source of run) {
    const prev = state.sources[source.id] ?? {};
    const next = { ...prev, kind: source.kind, lastAttempt: stamp };

    if (source.kind === 'internal-diff') {
      const commit = git(['log', '-1', '--format=%H', '--', source.url], { cwd: root });
      if (!commit) {
        next.lastError = `no commit found for ${source.url}`;
        next.consecutiveFailures = (prev.consecutiveFailures ?? 0) + 1;
        log.push(`${source.id}: ${next.lastError}`);
      } else {
        next.lastFetch = stamp;
        next.lastError = null;
        next.consecutiveFailures = 0;
        next.commit = commit;
        if (!prev.commit) log.push(`${source.id}: baseline at ${commit.slice(0, 7)}`);
        else if (prev.commit !== commit) {
          next.lastChange = stamp;
          const entry = {
            sourceId: source.id, tool: source.tool, kind: source.kind, url: source.url, class: source.class,
            previousHash: prev.commit, currentHash: commit, snapshotPath: null, previousSnapshotRef: prev.commit,
            diffPath: null, informational: source.informational ?? true, detectedAt: stamp,
          };
          // the Cascade watches the corpus for documents that newly name a standard
          if (source.candidates === 'cascade') {
            entry.newCandidates = newCascadeCandidates(root);
            entry.informational = entry.newCandidates.length === 0;
          }
          changes.push(entry);
          log.push(`${source.id}: moved ${prev.commit.slice(0, 7)} to ${commit.slice(0, 7)}`);
        } else log.push(`${source.id}: unchanged`);
      }
      state.sources[source.id] = next;
      continue;
    }

    let text;
    try {
      text = await readSource(source, { root, fetchImpl, backoffMs });
    } catch (err) {
      next.lastError = String(err?.cause?.code ?? err?.message ?? err);
      next.consecutiveFailures = (prev.consecutiveFailures ?? 0) + 1;
      state.sources[source.id] = next;
      log.push(`${source.id}: FAILED (${next.lastError}), ${next.consecutiveFailures} in a row`);
      continue;
    }
    const capped = cap(text);
    const hash = sha256(capped.text);
    Object.assign(next, { lastFetch: stamp, lastError: null, consecutiveFailures: 0, truncated: capped.truncated, bytes: Buffer.byteLength(capped.text) });
    const snap = snapshotPath(source.id);

    if (!prev.hash) {
      next.hash = hash;
      writes.set(snap, capped.text);
      log.push(`${source.id}: baseline recorded (${next.bytes} bytes${capped.truncated ? ', truncated' : ''})`);
    } else if (prev.hash !== hash) {
      const oldPath = join(root, snap);
      const oldText = existsSync(oldPath) ? readFileSync(oldPath, 'utf8') : '';
      const snapCommit = git(['log', '-1', '--format=%H', '--', snap], { cwd: root });
      const patch = createTwoFilesPatch(`a/${snap}`, `b/${snap}`, oldText, capped.text, prev.lastChange ?? prev.lastFetch ?? '', stamp, { context: 3 });
      next.hash = hash;
      next.lastChange = stamp;
      writes.set(snap, capped.text);
      writes.set(diffPath(source.id), patch);
      changes.push({
        sourceId: source.id, tool: source.tool, kind: source.kind, url: source.url, class: source.class,
        previousHash: prev.hash, currentHash: hash, snapshotPath: snap,
        previousSnapshotRef: snapCommit ? `${snapCommit}:${snap}` : null,
        diffPath: diffPath(source.id), informational: source.informational ?? false, detectedAt: stamp,
      });
      log.push(`${source.id}: CHANGED`);
    } else log.push(`${source.id}: unchanged`);
    state.sources[source.id] = next;
  }

  writes.set(`${WATCH_DIR}/state.json`, JSON.stringify(sortKeys(state), null, 2) + '\n');
  if (!dryRun) {
    for (const [p, content] of writes) {
      mkdirSync(dirname(join(root, p)), { recursive: true });
      writeFileSync(join(root, p), content);
    }
  }
  return { changes, writes, log };
}

async function main() {
  const args = process.argv.slice(2);
  const val = (name, dflt) => {
    const i = args.indexOf(name);
    if (i >= 0) return args[i + 1] ?? '';
    const eq = args.find((a) => a.startsWith(name + '='));
    return eq ? eq.slice(name.length + 1) : dflt;
  };
  const dryRun = args.includes('--dry-run');
  const out = val('--out', 'labs/.watch/changes.json');
  const only = val('--only', '');

  const { changes, writes, log } = await runWatch({ only, dryRun });
  for (const line of log) console.log(line);

  if (dryRun) {
    console.log('\nDry run. Would write:');
    for (const [p, content] of writes) console.log(`  ${p} (${Buffer.byteLength(content)} bytes)`);
    console.log(`  ${out} (${changes.length} change(s))`);
    if (changes.length) console.log(JSON.stringify(changes, null, 2));
  } else {
    mkdirSync(dirname(join(ROOT, out)), { recursive: true });
    writeFileSync(join(ROOT, out), JSON.stringify(changes, null, 2) + '\n');
    console.log(`\n${changes.length} change(s) written to ${out}`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changes.length > 0}\n`);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
