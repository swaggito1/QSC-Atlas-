import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTools, projectRoot } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { SITE_FIXTURES, allPrivateRoot, otherSitesRoot } from '../lab/registry-fixture';
import { gatedComponentsSource } from '../../../astro.config.mjs';
import {
  PREPARE_QUESTION,
  STANDARDS_QUESTION,
  allFiles,
  allPages,
  builtFiles,
  builtPages,
  childPages,
  NOTES_ROOT,
  isGatedPath,
  isLocalGate,
  isNotesPath,
  isStaticPath,
  keyForRoute,
  redirectRules,
  robotsTxt,
  sectionMenu,
  sitemapPaths,
  staticPagePaths,
  staticRoutes,
} from './routes';
import { PREVIOUS_HOST, originMoved, siteOrigin } from './config';
import { noteSitemapPaths } from './notes';

const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview' };
const LOCAL = {};
const ALL_ON = { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1' };

const root = projectRoot();
const tools = loadTools().tools;
const atlas = tools.filter((t) => (t.site ?? 'atlas') === 'atlas');
const other = tools.filter((t) => (t.site ?? 'atlas') !== 'atlas');
const elsewhere = tools.filter((t) => t.site === 'elsewhere');
// a page kept to Swann's machine: a research or elsewhere tool, or a page behind a local gate
const keptLocal = (p: { section: string; gate: string | null }) => p.section === 'research' || p.section === 'elsewhere' || isLocalGate(p.gate);
const forceAll = { env: { ...ALL_ON, ATLAS_FORCE_PUBLIC: atlas.map((t) => t.id).join(',') } };
// the real registry with every tool private again (src/lib/lab/registry-fixture.ts): an
// all-private production build and the flag states built on it read this root
const STAGE0 = allPrivateRoot();
const stage0 = (env: Record<string, string>) => ({ root: STAGE0, env });
// the real registry holds no ai or research tool: the real registry with one fixture entry of each
// site added (src/lib/lab/registry-fixture.ts) carries the tests of those two sites
const SITES = otherSitesRoot();

const raw = (rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

describe('the manifest', () => {
  const pages = allPages({ env: PREVIEW });
  const paths = pages.map((p) => p.path);

  it('has unique paths and unique component keys per path', () => {
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of pages) expect(p.path).toMatch(/^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/);
  });

  it('never collides with a page built from a file in src/pages', () => {
    const routes = staticRoutes();
    expect(routes.length).toBeGreaterThan(0);
    for (const path of paths) {
      const clash = routes.find((r) => r.pattern.test(path));
      expect(clash, `${path} collides with src/pages/${clash?.file}`).toBeUndefined();
      expect(isStaticPath(path)).toBe(false);
    }
  });

  it('puts nothing under /countries/, which the profile route answers', () => {
    for (const path of paths) expect(path.startsWith('/countries/'), path).toBe(false);
  });

  it('gives every Atlas tool exactly one page, at its route, and no ai tool a page', () => {
    for (const t of atlas) {
      const own = pages.filter((p) => p.toolId === t.id);
      expect(own, t.id).toHaveLength(1);
      expect(own[0].path).toBe(t.route);
      expect(own[0].gate).toBe(t.id);
      expect(own[0].section).toBe(t.section);
      expect(paths.filter((p) => p === t.route)).toHaveLength(1);
    }
    const fixturePaths = allPages({ root: SITES, env: PREVIEW }).map((p) => p.path);
    for (const t of loadTools({ root: SITES }).tools.filter((x) => x.site === 'ai')) {
      expect(t.id).toBe('fixture-ai');
      expect(fixturePaths).not.toContain(t.route);
    }
  });

  it('gives a tool kept for another website one page under /elsewhere, outside every Atlas section', () => {
    // the Rulebook (2 October 2026) and the migration approach (5 October 2026), both Swann's decisions
    expect(elsewhere.map((t) => t.id)).toEqual(['rulebook', 'approach']);
    for (const t of elsewhere) {
      const own = pages.filter((p) => p.toolId === t.id);
      expect(own, t.id).toHaveLength(1);
      expect(own[0]).toMatchObject({ path: t.route, gate: t.id, section: 'elsewhere', parent: null });
      expect(own[0].path.startsWith('/elsewhere/')).toBe(true);
    }
    expect(paths).not.toContain('/prepare/eu-rules');
    expect(paths).not.toContain('/prepare/approach');
  });

  it('holds the Prepare pages of spec 2 under their gates', () => {
    const at = (path: string) => pages.find((p) => p.path === path);
    expect(at('/prepare')?.gate).toBe('prepare-any');
    for (const path of ['/prepare/check', '/prepare/guides']) expect(at(path)?.gate).toBe('readiness');
    // Where the guides differ left the site (Swann, 4 October 2026): no page, whatever the build
    expect(at('/prepare/differences')).toBeUndefined();
    for (const env of [PREVIEW, LOCAL]) expect(allPages({ env }).some((p) => p.key === 'prepare-differences')).toBe(false);
    expect(at('/prepare/exposure')?.gate).toBe('exposure');
    for (const id of ['inventory', 'suppliers']) expect(at(`/prepare/${id}`)?.gate).toBe(id);
    // the migration approach left the Atlas (Swann, 5 October 2026): its page is kept under /elsewhere
    expect(at('/prepare/approach')).toBeUndefined();
    expect(at('/elsewhere/approach')).toMatchObject({ gate: 'approach', section: 'elsewhere', parent: null });
    expect(at('/target-dates')?.gate).toBe('dates');
    expect(at('/standards/cascade')?.gate).toBe('cascade');
  });

  it('gates the Standards overview and the page of each standard with the Cascade', () => {
    // the overview is the section's front page wherever the Cascade is (Swann, 5 October 2026),
    // and the page of each standard follows it (Swann, 8 October 2026)
    expect(pages.find((p) => p.path === '/standards')).toMatchObject({ gate: 'cascade', key: 'standards-list', section: 'standards', parent: null });
    const standards = pages.filter((p) => p.key === 'standard');
    expect(standards.length).toBeGreaterThan(0);
    for (const p of standards) expect(p, p.path).toMatchObject({ gate: 'cascade', section: 'standards', parent: '/standards' });
    // no page of the manifest waits behind a local gate any longer
    expect(pages.filter((p) => isLocalGate(p.gate))).toEqual([]);
  });

  it('has one page per guide in readiness.json, seven today', () => {
    const guides = raw('data/lab/readiness/readiness.json').frameworks.map((f: { id: string }) => f.id);
    const built = pages.filter((p) => p.key === 'prepare-guide');
    expect(built.map((p) => p.props?.guideId).sort()).toEqual([...guides].sort());
    expect(built.map((p) => p.path).sort()).toEqual(guides.map((id: string) => `/prepare/guides/${id}`).sort());
    expect(guides).toHaveLength(7);
  });

  it('has a page for exactly the standards with at least one verified edge', () => {
    const standards: { id: string; verify: boolean }[] = raw('data/lab/cascade/standards.json').standards;
    const edges: { to: string; verify: boolean }[] = raw('data/lab/cascade/edges.json').edges;
    const expected = standards
      .filter((s) => s.verify === false && edges.some((e) => e.to === s.id && e.verify === false))
      .map((s) => `/standards/${s.id.toLowerCase()}`)
      .sort();
    const built = pages.filter((p) => p.key === 'standard').map((p) => p.path).sort();
    expect(built).toEqual(expected);
    // and none for a standard no verified edge names
    for (const s of standards) {
      if (!edges.some((e) => e.to === s.id && e.verify === false)) expect(built).not.toContain(`/standards/${s.id.toLowerCase()}`);
    }
  });

  it('gives every page built from the records its question from spec 2', () => {
    const at = (path: string) => pages.find((p) => p.path === path);
    expect(at('/prepare')?.question).toBe(PREPARE_QUESTION);
    expect(at('/standards')?.question).toBe(STANDARDS_QUESTION);
    expect(at('/prepare/guides')?.question).toBe('Which guides does Prepare draw on, and who are they written for?');
    for (const p of pages.filter((x) => x.key === 'prepare-guide')) expect(p.question).toBe('What does this guide ask, of whom, and by when?');
    for (const p of pages.filter((x) => x.key === 'standard')) expect(p.question).toBe('Who names this standard, and in which documents?');
    for (const p of pages.filter((x) => !x.toolId)) expect(p.question, p.path).toMatch(/\?$/);
  });

  it('keys each page to its component folder', () => {
    expect(keyForRoute('/prepare/check')).toBe('prepare-check');
    expect(pages.find((p) => p.path === '/target-dates')?.key).toBe('target-dates');
    expect(pages.find((p) => p.path === '/prepare')?.key).toBe('prepare-hub');
    expect(pages.find((p) => p.path === '/standards')?.key).toBe('standards-list');
    // the migration approach keeps its folder at its new address, so its return is a registry change
    expect(pages.find((p) => p.path === '/elsewhere/approach')?.key).toBe('prepare-approach');
    expect(existsSync(join(root, 'src/components/site/pages/prepare-approach/index.astro'))).toBe(true);
  });
});

describe('which pages a build generates', () => {
  it('generates no gated page in production while every tool is private', () => {
    expect(builtPages(stage0(PRODUCTION))).toEqual([]);
  });

  it('generates every Atlas page in preview, and no page kept to Swann\'s machine', () => {
    const built = builtPages({ env: PREVIEW });
    expect(built.length).toBe(allPages({ env: PREVIEW }).filter((p) => !keptLocal(p)).length);
    expect(built.some((p) => /^\/(research|elsewhere)\//.test(p.path))).toBe(false);
    expect(built.map((p) => p.path)).toEqual(expect.arrayContaining(['/standards', '/standards/cascade', '/standards/fips-203']));
  });

  it('adds the research and elsewhere pages in a local build only', () => {
    const local = builtPages({ root: SITES, env: LOCAL }).map((p) => p.path);
    const kept = allPages({ root: SITES, env: LOCAL }).filter(keptLocal).map((p) => p.path);
    expect(kept).toEqual(expect.arrayContaining(['/research/fixture-research', '/elsewhere/eu-rules', '/elsewhere/approach']));
    // the overview and the page of each standard are built wherever the Cascade is (5 and 8 October 2026)
    expect(kept).not.toContain('/standards');
    expect(kept).not.toContain('/standards/fips-203');
    expect(local).toEqual(expect.arrayContaining(kept));
    // never in a deployment, whatever is public or forced
    const forceEvery = { env: { ...ALL_ON, ATLAS_FORCE_PUBLIC: [...tools, ...SITE_FIXTURES].map((t) => t.id).join(',') } };
    for (const opts of [{ env: PRODUCTION }, { env: PREVIEW }, { env: { VERCEL_ENV: 'development' } }, forceAll, forceEvery]) {
      const built = builtPages({ ...opts, root: SITES }).map((p) => p.path);
      for (const path of kept) expect(built, `${path} in ${JSON.stringify(opts.env)}`).not.toContain(path);
    }
  });

  it('with only the Exposure Clock public, builds its page and the hub, and nothing that needs readiness', () => {
    const paths = builtPages(stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'exposure' })).map((p) => p.path);
    expect(paths).toEqual(['/prepare', '/prepare/exposure']);
  });

  it('keeps the supplier letter out until the Readiness Check is in', () => {
    expect(builtPages(stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'suppliers' }))).toEqual([]);
    expect(builtPages(stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'suppliers,readiness' })).map((p) => p.path)).toContain('/prepare/suppliers');
  });
});

describe('the pages below a page', () => {
  it('lists the guides in readiness.json order and the standards in standards.json order', () => {
    const guides = raw('data/lab/readiness/readiness.json').frameworks.map((f: { id: string }) => `/prepare/guides/${f.id}`);
    expect(childPages('/prepare/guides', { env: PREVIEW }).map((p) => p.path)).toEqual(guides);
    const order: string[] = raw('data/lab/cascade/standards.json').standards.map((s: { id: string }) => `/standards/${s.id.toLowerCase()}`);
    // the Cascade first, then the page of each standard, in a preview and a production build as locally (8 October 2026)
    for (const env of [PREVIEW, PRODUCTION, LOCAL]) {
      const below = childPages('/standards/', { env }).map((p) => p.path);
      expect(below[0], JSON.stringify(env)).toBe('/standards/cascade');
      const standards = below.slice(1);
      expect(standards, JSON.stringify(env)).toEqual([...standards].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
      expect(standards.sort(), JSON.stringify(env)).toEqual(allPages({ env }).filter((p) => p.key === 'standard').map((p) => p.path).sort());
    }
  });

  it('lists only built pages', () => {
    expect(childPages('/prepare/guides', stage0(PRODUCTION))).toEqual([]);
    expect(childPages('/standards', stage0(PRODUCTION))).toEqual([]);
    expect(childPages('/prepare', stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'exposure' })).map((p) => p.path)).toEqual(['/prepare/exposure']);
    expect(childPages('/prepare/check', { env: PREVIEW })).toEqual([]);
  });
});

describe('the files of gated pages', () => {
  it('builds the inventory template only where the inventory page is built', () => {
    expect(allFiles().map((f) => f.path)).toEqual(['/prepare/inventory-template.csv']);
    for (const f of allFiles()) expect(allPages({ env: PREVIEW }).some((p) => p.toolId === f.gate)).toBe(true);
    expect(builtFiles(stage0(PRODUCTION))).toEqual([]);
    expect(builtFiles({ env: PREVIEW }).map((f) => f.path)).toEqual(['/prepare/inventory-template.csv']);
    expect(builtFiles(stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'inventory' }))).toEqual([]);
    expect(builtFiles(stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'inventory,readiness' }))).toHaveLength(1);
  });

  it('leaves every path inside a gated section to the manifest', () => {
    for (const path of ['/prepare', '/prepare/x.csv', '/prepare/eu-rules', '/standards/fips-203', '/target-dates', '/elsewhere/eu-rules']) expect(isGatedPath(path), path).toBe(true);
    // the section of a research tool (the fixture entry; the real registry holds none)
    expect(isGatedPath('/research/fixture-research', { root: SITES })).toBe(true);
    for (const path of ['/', '/countries/deu', '/documents', '/about', '/prepared', '/map']) expect(isGatedPath(path), path).toBe(false);
  });
});

describe('the release guard', () => {
  it('lets no page go public before something renders it', () => {
    // a public page with no component would show "This page is being built." in production
    for (const page of builtPages({ env: PRODUCTION })) {
      const tool = page.toolId && existsSync(join(root, `src/components/lab/tools/${page.toolId}/index.astro`));
      const view = existsSync(join(root, `src/components/site/pages/${page.key}/index.astro`));
      expect(tool || view, `${page.path} is public but has no component`).toBe(true);
    }
  });
});

describe('the Prepare side menu', () => {
  it('lists built pages in the fixed order and marks the current one', () => {
    const menu = sectionMenu('prepare', '/prepare/exposure', { env: PREVIEW });
    expect(menu.map((m) => m.label)).toEqual([
      'Overview',
      'Readiness Check',
      'Target dates',
      'Exposure Clock',
      'Inventory template',
      'Supplier letter',
      'The guides',
    ]);
    expect(menu.filter((m) => m.current).map((m) => m.label)).toEqual(['Exposure Clock']);
    expect(menu.find((m) => m.label === 'Target dates')?.note).toBe('in Countries');
  });

  it('marks The guides on a guide page and lists nothing that is not built', () => {
    expect(sectionMenu('prepare', '/prepare/guides/eu-roadmap/', { env: PREVIEW }).find((m) => m.current)?.label).toBe('The guides');
    expect(sectionMenu('prepare', '/prepare', stage0(PRODUCTION))).toEqual([]);
    const exposureOnly = sectionMenu('prepare', '/prepare', stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'exposure' }));
    expect(exposureOnly.map((m) => m.label)).toEqual(['Overview', 'Exposure Clock']);
  });

  it('never lists EU rules or the migration approach, even in a local build where their pages are built', () => {
    for (const env of [PREVIEW, LOCAL]) {
      const menu = sectionMenu('prepare', '/prepare', { env });
      expect(menu.map((m) => m.label)).not.toContain('EU rules');
      expect(menu.map((m) => m.label)).not.toContain('Migration approach');
      expect(menu.some((m) => /eu-rules|approach|elsewhere/.test(m.href))).toBe(false);
    }
    expect(builtPages({ env: LOCAL }).map((p) => p.path)).toEqual(expect.arrayContaining(['/elsewhere/eu-rules', '/elsewhere/approach']));
  });
});

describe('vercel.json', () => {
  const rules = redirectRules();
  const json = raw('vercel.json');

  it('keeps no trailing slash, and puts the old-host rule first exactly when the origin has moved', () => {
    expect(json.trailingSlash).toBe(false);
    const hostRules = rules.filter((r) => r.has);
    if (!originMoved()) {
      expect(hostRules).toEqual([]);
      return;
    }
    expect(hostRules).toHaveLength(1);
    expect(rules[0]).toEqual({
      source: '/:path*',
      has: [{ type: 'host', value: PREVIOUS_HOST }],
      destination: `${siteOrigin()}/:path*`,
      permanent: true,
    });
  });

  it('redirects every legacy route of an Atlas tool to its route, permanent exactly when the tool is public', () => {
    for (const t of atlas) {
      for (const legacy of t.legacyRoutes) {
        const rule = rules.find((r) => r.source === legacy);
        expect(rule, `${t.id}: no rule for ${legacy}`).toBeDefined();
        expect(rule!.destination).toBe(t.route);
        expect(rule!.permanent, `${legacy} must be permanent only once ${t.id} is public`).toBe(t.public);
      }
    }
  });

  it('puts the /lab/:path* catch-all after every named /lab rule', () => {
    const catchAll = rules.findIndex((r) => r.source === '/lab/:path*');
    expect(catchAll).toBeGreaterThan(-1);
    rules.forEach((r, i) => {
      if (r.source.startsWith('/lab/') && r.source !== '/lab/:path*') expect(i, r.source).toBeLessThan(catchAll);
    });
  });

  // the old Atlas addresses of each tool kept elsewhere, and the Atlas page each is sent to with a 307
  const OLD_ADDRESSES: Record<string, Record<string, string>> = {
    rulebook: { '/lab/rulebook': '/', '/prepare/eu-rules': '/' },
    approach: { '/prepare/approach': '/prepare' },
  };

  it('names no ai or research tool in any rule, and no tool kept elsewhere except to send its old addresses to an Atlas page', () => {
    expect(Object.keys(OLD_ADDRESSES).sort()).toEqual(elsewhere.map((t) => t.id).sort());
    for (const r of rules) {
      for (const t of [...other, ...SITE_FIXTURES]) {
        const oldAddress = t.site === 'elsewhere' && OLD_ADDRESSES[t.id]?.[r.source] === r.destination && r.permanent === false;
        for (const s of oldAddress ? [r.destination] : [r.source, r.destination]) {
          expect(s.includes(t.route), `${s} names ${t.id}`).toBe(false);
          expect(s.split(/[/#?]/).includes(t.id), `${s} names ${t.id}`).toBe(false);
        }
      }
      // nothing sends a visitor to a page kept to Swann's machine
      expect(r.destination, r.source).not.toMatch(/^\/(research|elsewhere)(\/|$)/);
    }
  });

  it('sends the Rulebook\'s old addresses home with a 307, the Rulebook having left the Atlas', () => {
    for (const source of ['/lab/rulebook', '/prepare/eu-rules']) {
      expect(rules.find((r) => r.source === source), source).toMatchObject({ destination: '/', permanent: false });
    }
  });

  it('sends the old address of the migration approach, taken off the Atlas, to the Prepare hub with a 307', () => {
    expect(rules.find((r) => r.source === '/prepare/approach')).toMatchObject({ destination: '/prepare', permanent: false });
    // no build has a page there, and the hub it sends to is a manifest page
    for (const env of [PRODUCTION, PREVIEW, LOCAL]) expect(builtPages({ env }).map((p) => p.path)).not.toContain('/prepare/approach');
    expect(allPages({ env: PREVIEW }).some((p) => p.path === '/prepare')).toBe(true);
    // and nothing in vercel.json sends anyone to its page under /elsewhere
    for (const r of rules) expect(r.destination.includes('/elsewhere/approach'), r.source).toBe(false);
  });

  it('redirects nothing under /standards: the overview is the section\'s own page since 5 October 2026', () => {
    const under = rules.filter((r) => r.source === '/standards' || r.source.startsWith('/standards/') || r.source.startsWith('/standards:'));
    expect(under).toEqual([]);
    for (const r of rules) expect(r.source.includes('*') && r.source.startsWith('/standards'), r.source).toBe(false);
    // the old address of the Cascade still reaches it
    expect(rules.find((r) => r.source === '/lab/cascade')).toMatchObject({ destination: '/standards/cascade' });
  });

  it('sends the address of Where the guides differ, which left the site, to the Prepare hub with a 307', () => {
    expect(rules.find((r) => r.source === '/prepare/differences')).toMatchObject({ destination: '/prepare', permanent: false });
    // the page it named is gone from every build, and the hub it sends to is a manifest page
    for (const env of [PREVIEW, LOCAL]) expect(allPages({ env }).map((p) => p.path)).not.toContain('/prepare/differences');
    expect(allPages({ env: PREVIEW }).some((p) => p.path === '/prepare')).toBe(true);
  });

  it('never redirects an address a deployment builds, so no rule hides a page', () => {
    // vercel.json answers on deployments only, and no rule may hide a page a deployment builds
    const built = new Set([...builtPages({ env: PREVIEW }), ...builtPages(forceAll)].map((p) => p.path));
    for (const r of rules) {
      if (r.has || r.source.includes(':')) continue;
      expect(built.has(r.source), `${r.source} is a page and a redirect`).toBe(false);
    }
  });

  it('sends /lab home, and leaves /who to its own page', () => {
    expect(rules.find((r) => r.source === '/lab')).toMatchObject({ destination: '/', permanent: true });
    expect(rules.some((r) => r.source === '/who' || r.source.startsWith('/who/'))).toBe(false);
  });
});

describe('the static pages', () => {
  it('lists fixed-path pages for the sitemap without the 404 page or a redirected address', () => {
    const paths = staticPagePaths();
    expect(paths).toEqual(expect.arrayContaining(['/', '/countries', '/map', '/documents', '/methodology', '/about']));
    expect(paths).not.toContain('/404');
    // /who is its own page again, listed once src/pages/who.astro is back
    expect(paths.includes('/who')).toBe(existsSync(join(root, 'src/pages/who.astro')));
    for (const r of redirectRules()) expect(paths, r.source).not.toContain(r.source);
    for (const p of paths) expect(p.includes('[')).toBe(false);
  });

  it('leaves every address under /notes to the notes, though src/pages/notes defines routes there', () => {
    const notes = staticRoutes().filter((r) => r.route.startsWith(`${NOTES_ROOT}/`));
    expect(notes.map((r) => r.route).sort()).toEqual(['/notes/[...list]', '/notes/[feed].xml', '/notes/[slug]']);
    // the rest parameter answers the folder's own address, as Astro's does
    const list = notes.find((r) => r.route === '/notes/[...list]')!;
    for (const path of ['/notes', '/notes/a', '/notes/a/b']) expect(list.pattern.test(path), path).toBe(true);
    expect(list.pattern.test('/notesx')).toBe(false);
    for (const env of [PRODUCTION, PREVIEW, LOCAL]) {
      for (const path of ['/notes', '/notes/a-note', '/notes/rss.xml']) expect(isStaticPath(path, { env }), path).toBe(false);
    }
    expect(staticPagePaths().filter(isNotesPath)).toEqual([]);
    expect(allPages({ env: LOCAL }).some((p) => isNotesPath(p.path))).toBe(false);
  });

  it('builds profiles at lower-case addresses of recorded countries only', () => {
    expect(isStaticPath('/countries/deu')).toBe(true);
    expect(isStaticPath('/countries/deu?x=1#a')).toBe(true);
    expect(isStaticPath('/countries/DEU')).toBe(false);
    expect(isStaticPath('/countries/zzz')).toBe(false);
    expect(isStaticPath('/Documents')).toBe(false);
  });
});

describe('what crawlers are told', () => {
  // the profiles as the collection gives them (iso3 and Data Status), read from the JSON copy
  const profiles = readdirSync(join(root, 'data/profiles'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => raw(`data/profiles/${f}`) as { iso3: string; dataStatus: string | null });
  const placeholders = profiles.filter((p) => p.dataStatus === 'Placeholder').map((p) => `/countries/${p.iso3.toLowerCase()}`);
  const gatedPaths = allPages({ env: PREVIEW }).map((p) => p.path);
  const isGated = (path: string) => /^\/(prepare|standards|target-dates|lab|research|elsewhere)(\/|$)/.test(path) || gatedPaths.includes(path);

  it('lists no gated page and no Placeholder profile in an all-private production build', () => {
    const paths = sitemapPaths(profiles, stage0(PRODUCTION));
    expect(placeholders.length).toBeGreaterThan(0);
    expect(paths.filter(isGated)).toEqual([]);
    for (const p of placeholders) expect(paths).not.toContain(p);
    const indexable = profiles.filter((p) => p.dataStatus !== 'Placeholder');
    expect(indexable.length).toBeGreaterThan(0);
    for (const p of indexable) expect(paths).toContain(`/countries/${p.iso3.toLowerCase()}`);
    expect(paths).toEqual(expect.arrayContaining(['/', '/countries', '/documents', '/methodology', '/about']));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('lists no gated page in preview, where every one carries noindex', () => {
    expect(sitemapPaths(profiles, { env: PREVIEW }).filter(isGated)).toEqual([]);
    expect(sitemapPaths(profiles, { env: LOCAL }).filter(isGated)).toEqual([]);
  });

  it('lists a gated page in production once its tool is public', () => {
    const paths = sitemapPaths(profiles, stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'exposure' }));
    expect(paths.filter(isGated)).toEqual(['/prepare', '/prepare/exposure']);
  });

  it('lists the Standards overview, the Cascade and the page of each standard once the Cascade is public', () => {
    const paths = sitemapPaths(profiles, stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'cascade' }));
    const standards = allPages({ env: PREVIEW }).filter((p) => p.key === 'standard').map((p) => p.path);
    expect(standards.length).toBeGreaterThan(0);
    expect(paths.filter(isGated)).toEqual(['/standards', '/standards/cascade', ...standards].sort());
  });

  it('lists today\'s public pages in production: the six Atlas tools, their record pages and the standards, nothing kept to Swann\'s machine', () => {
    const paths = sitemapPaths(profiles, { env: PRODUCTION });
    const built = builtPages({ env: PRODUCTION }).map((p) => p.path);
    expect(built).toEqual(expect.arrayContaining(['/prepare', '/prepare/check', '/prepare/exposure', '/prepare/inventory', '/prepare/suppliers', '/prepare/guides', '/standards', '/standards/cascade', '/standards/fips-203', '/target-dates']));
    expect(paths.filter(isGated)).toEqual([...built].sort());
    expect(paths.filter((p) => /^\/(lab|research|elsewhere|notes)(\/|$)/.test(p))).toEqual([]);
  });

  it('lists the public notes in production only, and nothing outside /notes passed as a note', () => {
    const notes = ['/notes', '/notes/a-note', '/documents/x', '/prepare/check'];
    const prod = sitemapPaths(profiles, stage0(PRODUCTION), notes);
    expect(prod.filter(isNotesPath)).toEqual(['/notes', '/notes/a-note']);
    expect(prod).not.toContain('/documents/x');
    expect(prod).not.toContain('/prepare/check');
    for (const env of [PREVIEW, LOCAL]) expect(sitemapPaths(profiles, { env }, notes).filter(isNotesPath), JSON.stringify(env)).toEqual([]);
  });

  it('lists no note in an all-private production build, even with a finished note waiting for its page', () => {
    // a fixture note in a temporary folder only: src/content/notes never holds an invented note
    const dir = mkdtempSync(join(tmpdir(), 'routes-notes-'));
    writeFileSync(join(dir, 'fixture-note.md'), '---\ntitle: Fixture note\ndate: 2026-10-04\nsummary: A fixture note for the tests.\npages: [readiness]\ndraft: false\n---\nFixture body.\n');
    expect(noteSitemapPaths({ ...stage0(PRODUCTION), notesDir: dir })).toEqual([]);
    expect(sitemapPaths(profiles, stage0(PRODUCTION), noteSitemapPaths({ ...stage0(PRODUCTION), notesDir: dir })).filter(isNotesPath)).toEqual([]);
    const released = { ...stage0({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'readiness' }), notesDir: dir };
    expect(sitemapPaths(profiles, released, noteSitemapPaths(released)).filter(isNotesPath)).toEqual(['/notes', '/notes/fixture-note']);
  });

  it('lets crawlers in on production only, naming the sitemap', () => {
    const map = 'https://example.org/sitemap.xml';
    expect(robotsTxt(map, { env: PRODUCTION })).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${map}\n`);
    for (const env of [PREVIEW, LOCAL, { VERCEL_ENV: 'development' }]) {
      expect(robotsTxt(map, { env })).toBe('User-agent: *\nDisallow: /\n');
    }
  });
});

describe('the components a build includes', () => {
  const imports = (src: string) => [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1].replace(/^.*\/src\//, 'src/'));
  /**
   * gatedComponentsSource() as a build runs it, with its manifest read from the all-private
   * registry: the function reads the repository's own root, so for this one call builtPages()
   * answers from the fixture root instead. Everything else in the function runs as it is.
   */
  const stage0Source = async (env: Record<string, string>) => {
    vi.doMock('./routes', async (importOriginal) => {
      const routes = await importOriginal<typeof import('./routes')>();
      return { ...routes, builtPages: (opts: LoadOptions = {}) => routes.builtPages({ ...opts, root: STAGE0 }) };
    });
    try {
      return await gatedComponentsSource(env);
    } finally {
      vi.doUnmock('./routes');
    }
  };

  it('reads the same manifest whatever Node version builds it (native type stripping or Vite)', async () => {
    for (const env of [PRODUCTION, PREVIEW]) {
      expect(await gatedComponentsSource(env, false)).toBe(await gatedComponentsSource(env, true));
    }
  }, 60_000);

  it('includes no component at all in an all-private production build', async () => {
    const src = await stage0Source(PRODUCTION);
    expect(imports(src)).toEqual([]);
    expect(src).toContain('export const TOOL_COMPONENTS = {  };');
  });

  it('includes the components of shown pages only, never an ai tool, and a research tool, the Rulebook and the migration approach only locally', async () => {
    const preview = imports(await gatedComponentsSource(PREVIEW));
    expect(preview).toContain('src/components/lab/tools/readiness/index.astro');
    expect(preview).toContain('src/components/lab/tools/cascade/index.astro');
    // the Standards overview (5 October 2026) and the page of each standard (8 October 2026) are built with the Cascade
    expect(preview).toContain('src/components/site/pages/standards-list/index.astro');
    expect(preview).toContain('src/components/site/pages/standard/index.astro');
    expect(preview.some((f) => /tools\/rulebook\/|pages\/prepare-approach\//.test(f))).toBe(false);
    const local = imports(await gatedComponentsSource(LOCAL));
    expect(local).toEqual(
      expect.arrayContaining([
        'src/components/lab/tools/rulebook/index.astro',
        'src/components/site/pages/prepare-approach/index.astro',
        'src/components/site/pages/standards-list/index.astro',
        'src/components/site/pages/standard/index.astro',
      ]),
    );
    // a build imports the component of a tool only when builtPages() names it: an ai tool never,
    // a research tool only in a local build (the fixture entries stand in for both)
    for (const env of [PRODUCTION, PREVIEW, LOCAL, ALL_ON]) {
      const ids = builtPages({ root: SITES, env }).map((p) => p.toolId);
      expect(ids, JSON.stringify(env)).not.toContain('fixture-ai');
      expect(ids.includes('fixture-research'), JSON.stringify(env)).toBe(env === LOCAL);
    }
    const exposureOnly = imports(await stage0Source({ ...ALL_ON, ATLAS_FORCE_PUBLIC: 'exposure' }));
    expect(exposureOnly.filter((f) => f.includes('/lab/tools/'))).toEqual(['src/components/lab/tools/exposure/index.astro']);
  });
});
