// Notion against the JSON copy (spec 16.6).
//
// Profiles render from Notion; the lab tools read data/profiles. mirrorDiff() compares the two
// fields both sides depend on, the Migration Timeline and Last Updated, for one profile, and
// returns the differences. The profile page prints one preview-only line when there are any, and
// npm run site:check fails on them; production only logs. An empty list means the copies agree.
// documentsMirrorDiff() does the same for the documents (count per country, then title and year
// per document), so an offline build that lags Notion is named rather than silently different.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { docId } from './docid';

export type MirrorField = 'migrationTimeline' | 'lastUpdated' | 'profile';

export interface MirrorDifference {
  iso3: string;
  field: MirrorField;
  notion: string | null;
  json: string | null;
}

export interface MirrorInput {
  iso3: string;
  migrationTimeline: string | null;
  lastUpdated: string | null;
}

/** One line per milestone, trimmed, blank lines dropped, CRLF folded: what the timeline says. */
export function normaliseTimeline(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s*\|\s*/g, ' | '))
    .filter(Boolean);
  return lines.length ? lines.join('\n') : null;
}

/** The day of a date or date-time ("2026-06-25T00:00:00.000Z" gives "2026-06-25"). */
export function normaliseDay(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s || null;
}

/** The two mirrored fields of data/profiles/{ISO3}.json, or null when there is no such file. */
export function readJsonProfile(iso3: string, opts: LoadOptions = {}): MirrorInput | null {
  const path = join(opts.root ?? projectRoot(), 'data', 'profiles', `${iso3.toUpperCase()}.json`);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return { iso3: iso3.toUpperCase(), migrationTimeline: str(raw.migrationTimeline), lastUpdated: str(raw.lastUpdated) };
}

/** The differences between a profile's Notion fields and its JSON copy; empty when they agree. */
export function mirrorDiff(notion: MirrorInput, opts: LoadOptions = {}): MirrorDifference[] {
  const iso3 = notion.iso3.toUpperCase();
  const json = readJsonProfile(iso3, opts);
  if (!json) return [{ iso3, field: 'profile', notion: iso3, json: null }];
  const out: MirrorDifference[] = [];
  const nt = normaliseTimeline(notion.migrationTimeline);
  const jt = normaliseTimeline(json.migrationTimeline);
  if (nt !== jt) out.push({ iso3, field: 'migrationTimeline', notion: nt, json: jt });
  const nd = normaliseDay(notion.lastUpdated);
  const jd = normaliseDay(json.lastUpdated);
  if (nd !== jd) out.push({ iso3, field: 'lastUpdated', notion: nd, json: jd });
  return out;
}

/** mirrorDiff over many profiles, for npm run site:check. */
export function mirrorDiffs(profiles: MirrorInput[], opts: LoadOptions = {}): MirrorDifference[] {
  return profiles.flatMap((p) => mirrorDiff(p, opts));
}

// ---- documents ---------------------------------------------------------------------------------

export interface DocumentMirrorInput {
  url: string | null;
  title: string;
  country: string | null;
  year: number | null;
}

export type DocumentMirrorDifference =
  | { kind: 'count'; iso3: string; notion: number; json: number }
  | { kind: 'missing'; iso3: string; url: string; title: string } // in Notion, not in the JSON copy
  | { kind: 'extra'; iso3: string; url: string; title: string } // in the JSON copy, not in Notion
  | { kind: 'field'; iso3: string; url: string; field: 'title' | 'year'; notion: string | null; json: string | null };

/**
 * The differences between the included documents Notion holds and the included rows of
 * data/results: the count per ISO3, each document present on one side only (matched by docId), and
 * a title or year that differs. Empty when the copies agree. For npm run site:check, as a warning.
 */
export function documentsMirrorDiff(notion: DocumentMirrorInput[], json: DocumentMirrorInput[]): DocumentMirrorDifference[] {
  const key = (d: DocumentMirrorInput) => (d.url ? docId(d.url) : `untitled|${d.title}`);
  const code = (d: DocumentMirrorInput) => (d.country ?? '').toUpperCase();
  const counts = (docs: DocumentMirrorInput[]) => docs.reduce((m, d) => m.set(code(d), (m.get(code(d)) ?? 0) + 1), new Map<string, number>());
  const out: DocumentMirrorDifference[] = [];
  const nc = counts(notion);
  const jc = counts(json);
  for (const iso3 of [...new Set([...nc.keys(), ...jc.keys()])].sort()) {
    if ((nc.get(iso3) ?? 0) !== (jc.get(iso3) ?? 0)) out.push({ kind: 'count', iso3, notion: nc.get(iso3) ?? 0, json: jc.get(iso3) ?? 0 });
  }
  const byKey = new Map(json.map((d) => [key(d), d]));
  const seen = new Set<string>();
  for (const n of notion) {
    const k = key(n);
    seen.add(k);
    const j = byKey.get(k);
    if (!j) {
      out.push({ kind: 'missing', iso3: code(n), url: n.url ?? '', title: n.title });
      continue;
    }
    if (n.title.trim() !== j.title.trim()) out.push({ kind: 'field', iso3: code(n), url: n.url ?? '', field: 'title', notion: n.title, json: j.title });
    if (n.year !== j.year) out.push({ kind: 'field', iso3: code(n), url: n.url ?? '', field: 'year', notion: n.year === null ? null : String(n.year), json: j.year === null ? null : String(j.year) });
  }
  for (const j of json) if (!seen.has(key(j))) out.push({ kind: 'extra', iso3: code(j), url: j.url ?? '', title: j.title });
  return out;
}

/** One plain line for a build log. */
export function describeDifference(d: MirrorDifference): string {
  if (d.field === 'profile') return `${d.iso3}: in Notion but not in data/profiles`;
  return `${d.iso3}: ${d.field} differs (Notion ${JSON.stringify(d.notion)}, JSON ${JSON.stringify(d.json)})`;
}
