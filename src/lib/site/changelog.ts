// What changed (/about/changes, spec 10): one list, generated at build, that tells a returning
// reader what has been updated on the Atlas and when.
//
// It joins four records and writes nothing of its own:
//   1. site and data releases, from data/lab/shared/releases.json;
//   2. tool publications, from each registry entry's publishedAt (only a public tool has one);
//   3. the latest date each shown tool's data was checked against its sources (the newest
//      verifiedAt in the tool's own datasets; leads are dropped in production before it is read);
//   4. the profiles updated on each day, from each profile's lastUpdated, by name.
// Entries are grouped by month, newest first, and by day inside a month. Within a day, profiles
// are listed alphabetically by name. No entry carries a count: a profile is named, never tallied,
// and nothing is ranked by how often it changed.
//
// buildChangelog is pure, so the tests can call it with any input; the loaders below read the
// repository and the registry. Server code only.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATASETS, ReleasesFileSchema } from '../lab/schema';
import { latestVerifiedAt, loadDataset, projectRoot } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { formatDate } from '../lab/format';
import { gatePublic, link, pageHref, shownTools } from './gates';

export const RELEASES_FILE = 'data/lab/shared/releases.json';

export type ChangeKind = 'release' | 'tool' | 'data' | 'profiles';

export interface ChangePlace {
  iso3: string;
  name: string;
  href: string | null; // the profile, when built
}

export interface ChangeEntry {
  kind: ChangeKind;
  text: string; // the visible words; a profiles entry names its places separately
  href: string | null; // a tool's page, when built
  places: ChangePlace[]; // profiles only, alphabetical by name
  preview: boolean; // the tool behind the entry is not public: preview and local builds only
}

export interface ChangeDay {
  date: string; // ISO day
  label: string; // "25 June 2026"
  day: string; // "25": under its month's heading the page shows the day alone, so the month is said once
  entries: ChangeEntry[];
}

export interface ChangeMonth {
  month: string; // "2026-06"
  label: string; // "June 2026"
  days: ChangeDay[];
}

export interface ChangelogInput {
  releases: { date: string; text: string }[];
  tools: { id: string; title: string; href: string | null; publishedAt: string | null; checkedAt: string | null; preview?: boolean }[];
  profiles: { iso3: string; name: string; lastUpdated: string | null; href: string | null }[];
}

// The fixed words of each kind of entry. Drafts for Swann (decision 1).
export const CHANGE_WORDS = {
  published: '{title} published',
  checked: '{title}: sources checked',
  profiles: 'Profiles updated',
} as const;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** The ISO day of a value, or null: "2026-06-25T00:00:00Z" gives "2026-06-25". */
export function isoDay(value: string | null | undefined): string | null {
  const m = value ? ISO_DAY.exec(value) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const ORDER: Record<ChangeKind, number> = { release: 0, tool: 1, data: 2, profiles: 3 };

/** Every entry, grouped by month and day, newest first; profiles alphabetical within a day. */
export function buildChangelog(input: ChangelogInput): ChangeMonth[] {
  const byDay = new Map<string, ChangeEntry[]>();
  const add = (day: string | null, entry: ChangeEntry) => {
    if (!day) return;
    const list = byDay.get(day) ?? [];
    list.push(entry);
    byDay.set(day, list);
  };

  for (const r of input.releases) {
    add(isoDay(r.date), { kind: 'release', text: r.text.trim(), href: null, places: [], preview: false });
  }
  for (const t of input.tools) {
    const preview = t.preview ?? false;
    add(isoDay(t.publishedAt), { kind: 'tool', text: fill(CHANGE_WORDS.published, { title: t.title }), href: t.href, places: [], preview });
    add(isoDay(t.checkedAt), { kind: 'data', text: fill(CHANGE_WORDS.checked, { title: t.title }), href: t.href, places: [], preview });
  }

  // one profiles entry per day, its places in alphabetical order of their names
  const placesByDay = new Map<string, ChangePlace[]>();
  for (const p of input.profiles) {
    const day = isoDay(p.lastUpdated);
    if (!day) continue;
    const list = placesByDay.get(day) ?? [];
    if (!list.some((x) => x.iso3 === p.iso3)) list.push({ iso3: p.iso3, name: p.name, href: p.href });
    placesByDay.set(day, list);
  }
  for (const [day, places] of placesByDay) {
    places.sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
    add(day, { kind: 'profiles', text: CHANGE_WORDS.profiles, href: null, places, preview: false });
  }

  const months = new Map<string, ChangeDay[]>();
  for (const day of [...byDay.keys()].sort().reverse()) {
    const entries = byDay.get(day)!.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
    const month = day.slice(0, 7);
    const list = months.get(month) ?? [];
    list.push({ date: day, label: formatDate(day), day: String(Number(day.slice(8, 10))), entries });
    months.set(month, list);
  }
  return [...months.entries()].map(([month, days]) => ({ month, label: formatDate(month), days }));
}

// ---- reading the repository ------------------------------------------------------------------

/** The release rows of data/lab/shared/releases.json; none when the file is missing. */
export function readReleases(opts: LoadOptions = {}): { date: string; text: string }[] {
  try {
    return loadDataset(RELEASES_FILE, ReleasesFileSchema, opts).releases.map((r) => ({ date: r.date, text: r.text }));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
    throw err;
  }
}

/** The data files of one tool: the DATASETS entries with that tool id, globs expanded. */
export function toolFiles(toolId: string, opts: LoadOptions = {}): { file: string; schema: (typeof DATASETS)[number]['schema'] }[] {
  const root = opts.root ?? projectRoot();
  const out: { file: string; schema: (typeof DATASETS)[number]['schema'] }[] = [];
  for (const entry of DATASETS.filter((d) => d.tool === toolId)) {
    if (!entry.file.includes('*')) {
      out.push({ file: entry.file, schema: entry.schema });
      continue;
    }
    // one "*" per path segment, as datasetFor() reads it
    const dir = entry.file.slice(0, entry.file.lastIndexOf('/'));
    const pattern = new RegExp(`^${entry.file.slice(dir.length + 1).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+')}$`);
    let names: string[] = [];
    try {
      names = readdirSync(join(root, dir));
    } catch {
      names = [];
    }
    for (const name of names.filter((n) => pattern.test(n)).sort()) out.push({ file: `${dir}/${name}`, schema: entry.schema });
  }
  return out;
}

/**
 * The latest day a tool's data was checked against its sources: the newest verifiedAt in its own
 * datasets, read through loadDataset, so in production a lead never counts. Null when none is.
 */
export function latestCheck(toolId: string, opts: LoadOptions = {}): string | null {
  let latest: string | null = null;
  for (const { file, schema } of toolFiles(toolId, opts)) {
    let data: unknown;
    try {
      data = loadDataset(file, schema, opts);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
      throw err;
    }
    const day = isoDay(latestVerifiedAt(data));
    if (day && (latest === null || day > latest)) latest = day;
  }
  return latest;
}

/**
 * The tools What changed may name: the Atlas tools this build shows (in production, the public
 * ones), never an ai or research entry. A tool that is shown but not public is marked preview.
 */
export function changelogTools(opts: LoadOptions = {}): ChangelogInput['tools'] {
  return shownTools(opts)
    .filter((t) => (t.site ?? 'atlas') === 'atlas')
    .map((t) => ({
      id: t.id,
      title: t.title,
      href: link(t.id, {}, opts),
      publishedAt: t.publishedAt ?? null,
      checkedAt: latestCheck(t.id, opts),
      preview: !gatePublic(t.id, opts),
    }));
}

/** The profile rows What changed reads: name, code, lastUpdated and the profile's address when built. */
export function changelogProfiles(
  profiles: { iso3: string; country: string; lastUpdated: string | null }[],
  opts: LoadOptions = {},
): ChangelogInput['profiles'] {
  return profiles.map((p) => ({
    iso3: p.iso3.toUpperCase(),
    name: p.country,
    lastUpdated: p.lastUpdated,
    href: pageHref(`/countries/${p.iso3.toLowerCase()}`, opts),
  }));
}

/** Everything the page needs, read from the repository and the given profiles. */
export function changelog(profiles: { iso3: string; country: string; lastUpdated: string | null }[], opts: LoadOptions = {}): ChangeMonth[] {
  return buildChangelog({ releases: readReleases(opts), tools: changelogTools(opts), profiles: changelogProfiles(profiles, opts) });
}
