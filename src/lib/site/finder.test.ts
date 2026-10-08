// The country finder and the layout shell's metadata (spec 3.3 and 17).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { POSTURE_META } from '../process';
import { CAP, buildFinderData, matchCountries, norm, type FinderRow } from '../../scripts/finder';
import { breadcrumbJsonLd, canonicalUrl, cleanPath, formatDay, latestDay, pageTitle, reportHref, withSubject } from './meta';
import { footerColumns, primaryNav } from './nav';
import { allPrivateRoot } from '../lab/registry-fixture';

const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const countries: { iso3: string; name: string }[] = read('data/countries.json');
const aliases: Record<string, string[]> = read('data/site/country-aliases.json').aliases;
const known = new Set(countries.map((c) => c.iso3));
const names = new Map(countries.map((c) => [c.iso3, c.name]));

// the same rows the build reads, from the version-controlled copy of the profiles
const rows: FinderRow[] = readdirSync(join(root, 'data/profiles'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => read(`data/profiles/${f}`))
  .map((p) => ({ iso3: p.iso3, name: p.country ?? names.get(p.iso3) ?? '', posture: p.coordinationPosture ?? null }));
const data = buildFinderData(rows, aliases, POSTURE_META, 'No posture recorded');

describe('country aliases', () => {
  it('every alias resolves to an ISO3 code in data/countries.json', () => {
    for (const iso3 of Object.keys(aliases)) expect(known.has(iso3), iso3).toBe(true);
  });
  it('covers the names the spec lists', () => {
    const all = Object.values(aliases).flat().map(norm);
    for (const a of ['UK', 'Britain', 'Great Britain', 'Holland', 'Czechia', 'Turkey', 'Türkiye', 'Korea', 'South Korea', 'US', 'USA', 'America', 'EU', 'European Union', 'NATO'])
      expect(all, a).toContain(norm(a));
  });
  it('no alias points to two places', () => {
    const seen = new Map<string, string>();
    for (const [iso3, list] of Object.entries(aliases))
      for (const a of list) {
        const k = norm(a);
        expect(seen.get(k) ?? iso3, `${a} is listed for ${seen.get(k)} and ${iso3}`).toBe(iso3);
        seen.set(k, iso3);
      }
  });
});

describe('finder.json', () => {
  it('lists every profile once', () => {
    expect(data.c).toHaveLength(rows.length);
    expect(new Set(data.c.map((c) => c.i)).size).toBe(rows.length);
  });
  it('is under 20 KB', () => {
    expect(Buffer.byteLength(JSON.stringify(data))).toBeLessThan(20 * 1024);
  });
  it('carries a posture key only where one is recorded, with its short label and colour', () => {
    for (const c of data.c) if (c.p) expect(Object.keys(POSTURE_META)).toContain(c.p);
    expect(data.p.EU).toEqual([POSTURE_META.EU.short, POSTURE_META.EU.color]);
  });
});

describe('matching', () => {
  const first = (q: string) => matchCountries(data.c, q)[0]?.i.toLowerCase();
  it.each([
    ['Austria', 'aut'],
    ['UK', 'gbr'],
    ['Türkiye', 'tur'],
    ['Turkey', 'tur'],
    ['Holland', 'nld'],
    ['EU', 'euu'],
    ['NATO', 'nato'],
    ['deu', 'deu'],
    ['america', 'usa'],
    ['korea', 'kor'],
    ["cote d'ivoire", 'civ'],
    ['St Lucia', 'lca'],
  ])('%s offers %s first', (q, iso3) => {
    expect(first(q)).toBe(iso3);
  });
  it('returns nothing for an empty query or no match', () => {
    expect(matchCountries(data.c, '  ')).toEqual([]);
    expect(matchCountries(data.c, 'Atlantis')).toEqual([]);
  });
  it('never offers more than eight', () => {
    expect(CAP).toBe(8);
    expect(matchCountries(data.c, 'an').length).toBeLessThanOrEqual(CAP);
  });
  it('with no limit returns every match, so the list can say how many more there are', () => {
    const all = matchCountries(data.c, 's', Infinity);
    expect(all.length).toBeGreaterThan(CAP);
    expect(all.slice(0, CAP)).toEqual(matchCountries(data.c, 's'));
  });
});

describe('script weight', () => {
  it('the header and finder scripts together are under 5 KB gzipped', async () => {
    const out = await build({
      stdin: { contents: "import { initShell } from './src/scripts/finder.ts'; initShell();", resolveDir: root, loader: 'ts' },
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2020',
      write: false,
    });
    // plus the one-line inline script in Base.astro that marks <html class="js">
    const inline = "document.documentElement.classList.add('js');";
    const bytes = gzipSync(Buffer.from(out.outputFiles[0].text + inline)).length;
    expect(bytes).toBeLessThan(5 * 1024);
  });
});

describe('meta', () => {
  it('canonical addresses carry no trailing slash', () => {
    expect(canonicalUrl('/countries/deu/', 'https://example.org')).toBe('https://example.org/countries/deu');
    expect(canonicalUrl('/about/index.html', 'https://example.org/')).toBe('https://example.org/about');
    expect(canonicalUrl('/', 'https://example.org')).toBe('https://example.org');
    expect(cleanPath('/404.html')).toBe('/404');
  });
  it('titles name the page, then the site', () => {
    expect(pageTitle('Germany')).toBe('Germany · QSC Atlas');
    expect(pageTitle('QSC Atlas')).toBe('QSC Atlas');
    expect(pageTitle(undefined)).toBe('QSC Atlas');
  });
  it('formats days in British English and finds the latest', () => {
    expect(formatDay('2026-06-25')).toBe('25 June 2026');
    expect(formatDay(null)).toBeNull();
    expect(latestDay(['2026-01-02', null, '2026-06-25', 'not a date'])).toBe('2026-06-25');
  });
  it('builds BreadcrumbList data with absolute addresses', () => {
    const ld = JSON.parse(breadcrumbJsonLd([{ label: 'Countries', href: '/countries' }, { label: 'Germany', href: '/countries/deu' }], 'https://example.org'));
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement[1]).toEqual({ '@type': 'ListItem', position: 2, name: 'Germany', item: 'https://example.org/countries/deu' });
  });
  it('names the page in a correction subject', () => {
    expect(reportHref('a@b.eu', 'Germany', '/countries/deu/')).toBe(`mailto:a@b.eu?subject=${encodeURIComponent('Correction: Germany (/countries/deu)')}`);
    expect(withSubject('mailto:a@b.eu', 'About', '/about')).toContain('subject=');
    expect(withSubject('https://example.org', 'About', '/about')).toBe('https://example.org');
  });
});

describe('the shell in an all-false production build', () => {
  // the real registry with every tool private again (src/lib/lab/registry-fixture.ts)
  const production = { root: allPrivateRoot(), env: { VERCEL: '1', VERCEL_ENV: 'production' } };
  const tools: { id: string; title: string; route: string }[] = read('data/lab/tools.json').tools;
  const texts = () => [
    ...primaryNav(production).flatMap((i) => [i.label, i.question, i.href]),
    ...footerColumns(production).flatMap((c) => [c.heading, ...c.links.flatMap((l) => [l.label, l.href])]),
  ];
  it('the header and footer name no gated section, view or tool', () => {
    const all = texts();
    for (const word of ['Prepare', 'Standards', 'Target dates', ...tools.map((t) => t.title)])
      expect(all.filter((t) => t.includes(word)), word).toEqual([]);
  });
  it('no header or footer link points at a gated or removed address', () => {
    for (const t of texts().filter((x) => x.startsWith('/')))
      expect(t, t).not.toMatch(/^\/(prepare|standards|target-dates|research|lab)(\/|$)/);
  });
  it('the header reads Countries, Documents, Methodology, About', () => {
    expect(primaryNav(production).map((i) => i.label)).toEqual(['Countries', 'Documents', 'Methodology', 'About']);
  });
});

describe('the shell in production since 8 October 2026', () => {
  // the real registry: the six Atlas tools are public; no tool of another site is
  const production = { env: { VERCEL: '1', VERCEL_ENV: 'production' } };
  const tools: { id: string; title: string; site?: string }[] = read('data/lab/tools.json').tools;
  const texts = () => [
    ...primaryNav(production).flatMap((i) => [i.label, i.question, i.href]),
    ...footerColumns(production).flatMap((c) => [c.heading, ...c.links.flatMap((l) => [l.label, l.href])]),
  ];
  it('names no tool of another site and links no address kept off the Atlas', () => {
    const all = texts();
    for (const t of tools.filter((x) => (x.site ?? 'atlas') !== 'atlas')) expect(all.filter((x) => x.includes(t.title)), t.id).toEqual([]);
    for (const t of all.filter((x) => x.startsWith('/'))) expect(t, t).not.toMatch(/^\/(research|lab|elsewhere|notes)(\/|$)/);
  });
});
