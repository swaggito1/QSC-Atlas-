import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadTools } from '../lab/load';
import { allPrivateRoot, otherSitesRoot } from '../lab/registry-fixture';
import { SOURCE_CLASSES } from '../lab/schema';
import { buildChangelog, changelog, changelogTools, latestCheck, readReleases, RELEASES_FILE, toolFiles } from './changelog';
import type { ChangelogInput, ChangeMonth } from './changelog';
import { datesFor, foldLines } from './dates';
import { profilesByIso3 } from './joins';

const ROOT = process.cwd();
const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview' };
// the test matrix's way to make one tool public in a production-mode build (never on Vercel)
const forced = (ids: string) => ({ VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: ids });
// the real registry with every tool private again (src/lib/lab/registry-fixture.ts): an
// all-private build and the flag states built on it read this root
const STAGE0 = allPrivateRoot();

const profiles = readdirSync(join(ROOT, 'data/profiles'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(ROOT, 'data/profiles', f), 'utf8')) as { iso3: string; country: string; lastUpdated?: string | null })
  .map((p) => ({ iso3: p.iso3, country: p.country, lastUpdated: p.lastUpdated ?? null }));

const visible = (months: ChangeMonth[]) =>
  months.flatMap((m) => [m.label, ...m.days.flatMap((d) => [d.label, ...d.entries.flatMap((e) => [e.text, ...e.places.map((p) => p.name)])])]);

const sample: ChangelogInput = {
  releases: [
    { date: '2026-07-08', text: 'The Atlas dataset was archived on Zenodo.' },
    { date: '2026-06-02', text: 'A release earlier in June.' },
  ],
  tools: [{ id: 'exposure', title: 'Exposure Clock', href: '/prepare/exposure', publishedAt: '2026-07-08', checkedAt: '2026-06-25' }],
  profiles: [
    { iso3: 'FRA', name: 'France', lastUpdated: '2026-06-25', href: '/countries/fra' },
    { iso3: 'DEU', name: 'Germany', lastUpdated: '2026-06-25T09:00:00.000Z', href: '/countries/deu' },
    { iso3: 'AUT', name: 'Austria', lastUpdated: '2026-06-25', href: '/countries/aut' },
    { iso3: 'ZAF', name: 'South Africa', lastUpdated: '2026-06-14', href: '/countries/zaf' },
    { iso3: 'GIN', name: 'Guinea', lastUpdated: null, href: '/countries/gin' },
  ],
};

describe('buildChangelog', () => {
  const months = buildChangelog(sample);

  it('groups entries by month, newest first, each month once', () => {
    expect(months.map((m) => m.month)).toEqual(['2026-07', '2026-06']);
    expect(months.map((m) => m.label)).toEqual(['July 2026', 'June 2026']);
    for (const m of months) for (const d of m.days) expect(d.date.startsWith(m.month)).toBe(true);
    expect(months[1].days.map((d) => d.date)).toEqual(['2026-06-25', '2026-06-14', '2026-06-02']);
  });

  it('gives each day its day of the month alone, so under the month heading the month is said once', () => {
    expect(months[1].days.map((d) => d.day)).toEqual(['25', '14', '2']);
    expect(months[0].days[0].label).toBe('8 July 2026');
  });

  it('lists the profiles of a day alphabetically by name, in one entry', () => {
    const day = months[1].days.find((d) => d.date === '2026-06-25')!;
    const profileEntries = day.entries.filter((e) => e.kind === 'profiles');
    expect(profileEntries).toHaveLength(1);
    expect(profileEntries[0].places.map((p) => p.name)).toEqual(['Austria', 'France', 'Germany']);
  });

  it('puts a release first in a day, then a publication, a check and the profiles', () => {
    const july = months[0].days[0];
    expect(july.entries.map((e) => e.kind)).toEqual(['release', 'tool']);
    const june25 = months[1].days[0];
    expect(june25.entries.map((e) => e.kind)).toEqual(['data', 'profiles']);
    expect(june25.entries[0].text).toBe('Exposure Clock: sources checked');
  });

  it('leaves out a profile with no update date', () => {
    expect(visible(months)).not.toContain('Guinea');
  });

  it('carries no count anywhere: no number in any entry, and no count field', () => {
    for (const m of months) {
      for (const d of m.days) {
        for (const e of d.entries) {
          expect(e.text, e.text).not.toMatch(/\d/);
          for (const p of e.places) expect(p.name).not.toMatch(/\d/);
          expect(Object.keys(e)).not.toContain('count');
        }
      }
    }
  });

  it('writes no em or en dash', () => {
    expect(visible(months).join(' ')).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('What changed from the real repository', () => {
  it('reads the releases file, every row a day with a sentence', () => {
    const releases = readReleases();
    expect(releases.length).toBeGreaterThan(0);
    for (const r of releases) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.text).toMatch(/\.$/);
    }
  });

  it('gives every release row its evidence: an address, the day it was read, a short excerpt and a class', () => {
    // the schema keeps only date, precision and text, so the provenance CLAUDE.md asks for is checked here
    const raw = JSON.parse(readFileSync(join(ROOT, RELEASES_FILE), 'utf8')) as { releases: { date: string; provenance?: unknown[] }[] };
    for (const r of raw.releases) {
      const prov = (r.provenance ?? []) as { url?: string; retrievedAt?: string; excerpt?: string; sourceClass?: string }[];
      expect(prov.length, r.date).toBeGreaterThan(0);
      for (const p of prov) {
        expect(p.url, r.date).toMatch(/^https:\/\//);
        expect(p.retrievedAt, r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof p.excerpt, r.date).toBe('string');
        expect(p.excerpt!.trim().split(/\s+/).length, r.date).toBeLessThanOrEqual(60);
        expect(SOURCE_CLASSES as readonly string[], r.date).toContain(p.sourceClass);
      }
    }
  });

  it('names the six Atlas tools in production since 8 October 2026, each published that day, and no tool of another site', () => {
    const env = PRODUCTION;
    const tools = changelogTools({ env });
    expect(tools.map((t) => t.id).sort()).toEqual(['cascade', 'dates', 'exposure', 'inventory', 'readiness', 'suppliers']);
    for (const t of tools) {
      expect(t, t.id).toMatchObject({ publishedAt: '2026-10-08', preview: false });
      expect(t.checkedAt, t.id).toBe(latestCheck(t.id, { env }));
    }
    const text = visible(changelog(profiles, { env })).join(' ');
    for (const t of loadTools().tools.filter((x) => (x.site ?? 'atlas') !== 'atlas')) expect(text, t.title).not.toContain(t.title);
    // a preview shows the same tools, none of them marked as a preview any longer
    for (const t of changelogTools({ env: PREVIEW })) expect(t.preview, t.id).toBe(false);
  });

  it('names no tool in an all-false production build', () => {
    expect(changelogTools({ root: STAGE0, env: PRODUCTION })).toEqual([]);
    const text = visible(changelog(profiles, { root: STAGE0, env: PRODUCTION })).join(' ');
    for (const t of loadTools().tools) expect(text, t.title).not.toContain(t.title);
  });

  it('names a tool once it is public, with the day its data was last checked', () => {
    const env = forced('exposure');
    const tools = changelogTools({ root: STAGE0, env });
    expect(tools.map((t) => t.id)).toEqual(['exposure']);
    expect(tools[0].preview).toBe(false);
    expect(tools[0].checkedAt).toBe(latestCheck('exposure', { root: STAGE0, env }));
    expect(tools[0].checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('marks a tool that is shown only in preview, and never names an ai or research entry', () => {
    const tools = changelogTools({ root: STAGE0, env: PREVIEW });
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) expect(t.preview).toBe(true);
    const ids = new Set(tools.map((t) => t.id));
    for (const t of loadTools().tools.filter((x) => (x.site ?? 'atlas') !== 'atlas')) expect(ids.has(t.id), t.id).toBe(false);
    // a local build shows a research tool, and What changed still never names it (a fixture entry,
    // src/lib/lab/registry-fixture.ts, since the real registry holds none)
    const local = changelogTools({ root: otherSitesRoot(), env: {} }).map((t) => t.id);
    expect(local).toContain('readiness');
    for (const id of ['fixture-ai', 'fixture-research']) expect(local, id).not.toContain(id);
  });

  it('finds the data files of a tool, globs included', () => {
    const files = toolFiles('exposure').map((f) => f.file);
    expect(files).toContain('data/lab/exposure/presets.json');
    expect(files.some((f) => /^data\/lab\/exposure\/surveys\/[^/]+\.json$/.test(f))).toBe(true);
  });

  it('lists the real profile updates by name, alphabetically within each day, with no count', () => {
    const months = changelog(profiles, { env: PRODUCTION });
    const days = months.flatMap((m) => m.days);
    expect(days.length).toBeGreaterThan(0);
    for (const d of days) {
      for (const e of d.entries.filter((x) => x.kind === 'profiles')) {
        const names = e.places.map((p) => p.name);
        expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en-GB')));
        expect(e.text).not.toMatch(/\d/);
      }
    }
    // every profile with an update date appears exactly once, on that day
    const named = days.flatMap((d) => d.entries.flatMap((e) => e.places.map((p) => `${d.date}|${p.iso3}`)));
    const expected = profiles.filter((p) => p.lastUpdated).map((p) => `${p.lastUpdated!.slice(0, 10)}|${p.iso3}`);
    expect(named.sort()).toEqual(expected.sort());
  });
});

// The commentary (/commentary) names migration years in its prose and checks them against the
// Atlas's records when the page is built, with only a warning in the build log. This test makes
// the same check fail the suite: every year in its PROSE_DATES literal must be one its place's
// record holds (a line of the profile's migration timeline, or a dated target of a guide the place
// issues, which for the EU is the coordinated roadmap), in a production build and in preview, and
// China must be the only place in its ACTORS with no migration date, as the prose says.
describe('The commentary\'s prose dates against the records', () => {
  const source = readFileSync(join(ROOT, 'src/pages/commentary.astro'), 'utf8');
  const literal = (name: string) => {
    const m = new RegExp(`const ${name}[^=]*=\\s*([\\[{][^;]*?[\\]}]);`).exec(source);
    if (!m) throw new Error(`no ${name} literal in commentary.astro`);
    return JSON.parse(m[1].replace(/'/g, '"').replace(/([{,]\s*)([A-Z]{3})\s*:/g, '$1"$2":'));
  };
  const proseDates = literal('PROSE_DATES') as Record<string, number[]>;
  const actors = literal('ACTORS') as string[];
  const profiles = profilesByIso3();
  // as the page reads them: the profile's dated lines that no confirmed annotation folds into a
  // guide, and the dated targets of the guides the place issues itself
  const held = (iso3: string, env: Record<string, string>) => {
    const lines = (profiles.get(iso3)?.timeline ?? []).filter((m): m is typeof m & { year: number } => typeof m.year === 'number');
    const folded = foldLines(iso3, lines.map((m) => ({ year: m.year, label: m.label })), { env });
    return new Set([
      ...lines.filter((_, i) => !folded[i]).map((m) => m.year),
      ...datesFor([iso3], { env })
        .filter((r) => r.relation === 'own' && r.origin === 'guide' && !r.lead)
        .map((r) => r.year),
    ]);
  };

  it('reads both literals from the page', () => {
    expect(Object.keys(proseDates).length).toBeGreaterThan(0);
    expect(actors).toContain('CHN');
  });

  for (const [label, env] of [['production', PRODUCTION], ['preview', PREVIEW]] as const) {
    it(`finds every year the prose names in its place's record (${label})`, () => {
      for (const [iso3, years] of Object.entries(proseDates)) {
        const have = held(iso3, env);
        for (const y of years) expect(have.has(y), `${iso3} ${y}`).toBe(true);
      }
    });

    it(`has China as the only place with no migration date (${label})`, () => {
      const without = actors.filter((iso3) => held(iso3, env).size === 0);
      expect(without).toEqual(['CHN']);
    });
  }
});
