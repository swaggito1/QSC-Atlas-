import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isLocalBuild, loadTools } from '../lab/load';
import { allPrivateRoot, otherSitesRoot } from '../lab/registry-fixture';
import { anyShown, gatePublic, link, pageHref, shown, shownTools, withExtra } from './gates';
import { builtPages, sectionMenu } from './routes';

// The environments a build can run in. Vercel sets VERCEL=1 and VERCEL_ENV on every build.
const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview' };
const LOCAL = {};

const real = loadTools().tools;
const atlasIds = real.filter((t) => (t.site ?? 'atlas') === 'atlas').map((t) => t.id);
const elsewhereIds = real.filter((t) => t.site === 'elsewhere').map((t) => t.id);
// the real registry holds no ai or research tool, so the rules for those two sites are tested on
// the real registry with one fixture entry of each added (src/lib/lab/registry-fixture.ts)
const SITES = otherSitesRoot();
const withFixtures = loadTools({ root: SITES }).tools;
const aiIds = withFixtures.filter((t) => t.site === 'ai').map((t) => t.id);
const researchIds = withFixtures.filter((t) => t.site === 'research').map((t) => t.id);
// every build the Atlas can be made in, the matrix's forced production builds included
const EVERY_ENV = [PRODUCTION, PREVIEW, LOCAL, { VERCEL_ENV: 'development' }, { ATLAS_OFFLINE: '1' }, { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: real.map((t) => t.id).join(',') }];
// the six Atlas tools Swann made public on 8 October 2026 (data/lab/tools.json)
const PUBLIC_SINCE_8_OCTOBER = ['readiness', 'exposure', 'cascade', 'dates', 'inventory', 'suppliers'];
// the real registry with every tool private again (src/lib/lab/registry-fixture.ts): the gate
// logic of stage 0 and the flag states built on it are tested against this root
const STAGE0 = allPrivateRoot();

describe('the real registry', () => {
  it('has Atlas and elsewhere entries to gate, and the fixture root an ai and a research entry', () => {
    expect(atlasIds).toEqual(expect.arrayContaining(['readiness', 'exposure', 'cascade', 'dates', 'inventory', 'suppliers']));
    expect(atlasIds).not.toContain('rulebook');
    // the migration approach left the Atlas (Swann, 5 October 2026)
    expect(atlasIds).not.toContain('approach');
    expect(real.filter((t) => t.site === 'ai' || t.site === 'research')).toEqual([]);
    expect(aiIds).toEqual(['fixture-ai']);
    expect(researchIds).toEqual(['fixture-research']);
    expect(elsewhereIds).toEqual(['rulebook', 'approach']);
  });

  it('shows the six Atlas tools in production since 8 October 2026, and no tool of another site', () => {
    const env = PRODUCTION;
    expect(atlasIds.filter((id) => real.find((t) => t.id === id)!.public).sort()).toEqual([...PUBLIC_SINCE_8_OCTOBER].sort());
    expect(shownTools({ env }).map((t) => t.id).sort()).toEqual([...PUBLIC_SINCE_8_OCTOBER].sort());
    for (const id of PUBLIC_SINCE_8_OCTOBER) {
      expect(shown(id, { env }), id).toBe(true);
      expect(link(id, {}, { env }), id).toBe(real.find((t) => t.id === id)!.route);
      expect(gatePublic(id, { env: PREVIEW }), id).toBe(true);
    }
    for (const id of elsewhereIds) {
      expect(shown(id, { env }), id).toBe(false);
      expect(link(id, {}, { env }), id).toBeNull();
    }
    expect(shownTools({ root: SITES, env }).map((t) => t.id).sort()).toEqual([...PUBLIC_SINCE_8_OCTOBER].sort());
    for (const id of [...aiIds, ...researchIds, ...elsewhereIds]) {
      expect(shown(id, { root: SITES, env }), id).toBe(false);
      expect(link(id, {}, { root: SITES, env }), id).toBeNull();
    }
    expect(anyShown('prepare', { env })).toBe(true);
    expect(anyShown('standards', { env })).toBe(true);
    expect(anyShown('countries', { env })).toBe(true);
  });

  it('shows every Atlas tool in preview, and nothing else', () => {
    const ids = shownTools({ env: PREVIEW }).map((t) => t.id);
    expect(ids.sort()).toEqual([...atlasIds].sort());
    for (const id of atlasIds) expect(link(id, {}, { env: PREVIEW }), id).toBe(real.find((t) => t.id === id)!.route);
  });

  it('never shows a tool of site ai, in any build', () => {
    for (const env of [PRODUCTION, PREVIEW, LOCAL, { ATLAS_OFFLINE: '1', VERCEL_ENV: 'production', ATLAS_FORCE_PUBLIC: aiIds.join(',') }]) {
      for (const id of aiIds) {
        expect(shown(id, { root: SITES, env }), `${id} in ${JSON.stringify(env)}`).toBe(false);
        expect(link(id, {}, { root: SITES, env })).toBeNull();
      }
    }
  });

  it('shows a research tool only when VERCEL_ENV is unset', () => {
    for (const id of researchIds) {
      const root = SITES;
      expect(shown(id, { root, env: LOCAL })).toBe(true);
      expect(shown(id, { root, env: { VERCEL_ENV: 'preview' } })).toBe(false);
      expect(shown(id, { root, env: { VERCEL_ENV: 'production' } })).toBe(false);
      expect(shown(id, { root, env: { VERCEL_ENV: 'development' } })).toBe(false);
      expect(shown(id, { root, env: PREVIEW })).toBe(false);
      expect(shown(id, { root, env: { ATLAS_OFFLINE: '1', VERCEL_ENV: 'production', ATLAS_FORCE_PUBLIC: id } })).toBe(false);
    }
  });

  it('never links or names a tool kept off the Atlas (the Rulebook, the migration approach), in any build', () => {
    for (const env of EVERY_ENV) {
      const at = JSON.stringify(env);
      for (const id of elsewhereIds) {
        expect(shown(id, { env }), `${id} in ${at}`).toBe(false);
        expect(link(id, {}, { env }), `${id} in ${at}`).toBeNull();
        expect(link(id, { query: { article: '32022L2555' } }, { env }), `${id} in ${at}`).toBeNull();
        expect(shownTools({ env }).map((t) => t.id), at).not.toContain(id);
      }
      for (const path of [
        '/elsewhere/eu-rules',
        '/elsewhere/eu-rules?article=x#a',
        '/prepare/eu-rules',
        '/lab/rulebook',
        '/elsewhere/approach',
        '/elsewhere/approach#w=A:retire',
        '/prepare/approach',
        '/prepare/approach?x=1#y',
      ]) {
        expect(pageHref(path, { env }), `${path} in ${at}`).toBeNull();
      }
    }
  });

  it('opens a local gate only in a build on Swann\'s machine', () => {
    expect(shown('local:cascade', { env: LOCAL })).toBe(true);
    for (const env of [PRODUCTION, PREVIEW, { VERCEL_ENV: 'development' }, { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'cascade' }]) {
      expect(shown('local:cascade', { env }), JSON.stringify(env)).toBe(false);
    }
    expect(gatePublic('local:cascade', { env: LOCAL })).toBe(false);
  });

});

describe('an all-private registry (stage 0)', () => {
  const root = STAGE0;

  it('hides every Atlas tool in production while all are private', () => {
    const env = PRODUCTION;
    expect(shownTools({ root, env })).toEqual([]);
    for (const id of atlasIds) {
      expect(shown(id, { root, env }), id).toBe(false);
      expect(link(id, {}, { root, env }), id).toBeNull();
    }
    expect(anyShown('prepare', { root, env })).toBe(false);
    expect(anyShown('standards', { root, env })).toBe(false);
    expect(anyShown('countries', { root, env })).toBe(false);
  });

  it('honours ATLAS_FORCE_PUBLIC offline and off Vercel only', () => {
    const forced = { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'exposure' };
    expect(shown('exposure', { root, env: forced })).toBe(true);
    expect(shown('readiness', { root, env: forced })).toBe(false);
    // ignored when the VERCEL variable is set, whatever its value
    expect(shown('exposure', { root, env: { ...forced, VERCEL: '1' } })).toBe(false);
    expect(shown('exposure', { root, env: { ...forced, VERCEL: '' } })).toBe(false);
    // ignored without ATLAS_OFFLINE=1
    expect(shown('exposure', { root, env: { VERCEL_ENV: 'production', ATLAS_FORCE_PUBLIC: 'exposure' } })).toBe(false);
  });

  it('builds the Prepare hub when any Prepare entry is shown, and not for Target dates alone', () => {
    const only = (ids: string) => ({ root, env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: ids } });
    expect(shown('prepare-any', only('exposure'))).toBe(true);
    expect(pageHref('/prepare', only('exposure'))).toBe('/prepare');
    expect(shown('prepare-any', only('dates'))).toBe(false);
    expect(pageHref('/prepare', only('dates'))).toBeNull();
    expect(anyShown('countries', only('dates'))).toBe(true);
  });

  it('counts a gate as public only when a production build would show it', () => {
    expect(gatePublic(null, { root, env: PREVIEW })).toBe(true);
    expect(gatePublic('exposure', { root, env: PREVIEW })).toBe(false);
    expect(gatePublic('prepare-any', { root, env: PREVIEW })).toBe(false);
    expect(gatePublic('exposure', { root, env: { ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'exposure' } })).toBe(true);
  });
});

describe('the migration approach, taken off the Atlas (Swann, 5 October 2026)', () => {
  const approach = real.find((t) => t.id === 'approach')!;
  // every build but one on Swann's machine (VERCEL_ENV and VERCEL unset; ATLAS_OFFLINE alone is one)
  const DEPLOYMENTS = EVERY_ENV.filter((env) => !isLocalBuild(env));
  const forceAll = { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: real.map((t) => t.id).join(',') };

  it('is kept for another website, at a route under /elsewhere, with no section and no old address', () => {
    expect(approach).toMatchObject({ site: 'elsewhere', route: '/elsewhere/approach', legacyRoutes: [] });
    expect(approach.section).toBeUndefined();
  });

  it('has its page built in a local build only, and never at its old Atlas address', () => {
    expect(builtPages({ env: LOCAL }).map((p) => p.path)).toContain('/elsewhere/approach');
    for (const env of DEPLOYMENTS) {
      const paths = builtPages({ env }).map((p) => p.path);
      expect(paths, JSON.stringify(env)).not.toContain('/elsewhere/approach');
    }
    for (const env of EVERY_ENV) expect(builtPages({ env }).map((p) => p.path), JSON.stringify(env)).not.toContain('/prepare/approach');
    expect(gatePublic('approach', { env: forceAll })).toBe(false);
  });

  it('is named by no link, no page address and no Prepare side menu, in any build, the local one included', () => {
    for (const env of EVERY_ENV) {
      const at = JSON.stringify(env);
      expect(shown('approach', { env }), at).toBe(false);
      expect(link('approach', {}, { env }), at).toBeNull();
      expect(link('approach', { hash: 'w=A:retire' }, { env }), at).toBeNull();
      for (const path of ['/elsewhere/approach', '/prepare/approach']) expect(pageHref(path, { env }), `${path} in ${at}`).toBeNull();
      for (const current of ['/prepare', '/prepare/inventory', '/elsewhere/approach']) {
        const menu = sectionMenu('prepare', current, { env });
        expect(menu.map((m) => m.label), at).not.toContain('Migration approach');
        expect(menu.some((m) => /approach|elsewhere/.test(m.href)), at).toBe(false);
      }
    }
    // the Prepare hub still stands on the tools that remain
    expect(anyShown('prepare', { env: PREVIEW })).toBe(true);
  });

  it('stays off every deployment even if its entry were made public', () => {
    const root = mkdtempSync(join(tmpdir(), 'site-gates-approach-'));
    mkdirSync(join(root, 'data/lab'), { recursive: true });
    const entry = (id: string, extra: Record<string, unknown>) => ({ id, title: id, byline: 'X', public: true, publishedAt: '2026-10-05', status: 'public', gates: [], ...extra });
    writeFileSync(
      join(root, 'data/lab/tools.json'),
      JSON.stringify({
        tools: [
          entry('readiness', { section: 'prepare', route: '/prepare/check' }),
          entry('approach', { site: 'elsewhere', route: '/elsewhere/approach', requires: ['readiness'] }),
        ],
      }),
    );
    for (const env of [PRODUCTION, PREVIEW]) {
      expect(shown('approach', { root, env })).toBe(false);
      expect(link('approach', {}, { root, env })).toBeNull();
      expect(builtPages({ root, env }).map((p) => p.path)).not.toContain('/elsewhere/approach');
    }
    expect(builtPages({ root, env: LOCAL }).map((p) => p.path)).toContain('/elsewhere/approach');
    expect(link('approach', {}, { root, env: LOCAL })).toBeNull();
  });
});

describe('a tool that requires another', () => {
  let root: string;
  const tool = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    title: id,
    section: 'prepare',
    route: `/prepare/${id}`,
    byline: 'X',
    public: false,
    status: 'planned',
    gates: ['lorenzo-no-objection'],
    ...extra,
  });
  const write = (tools: unknown[]) => writeFileSync(join(root, 'data/lab/tools.json'), JSON.stringify({ tools }));

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'site-gates-'));
    mkdirSync(join(root, 'data/lab'), { recursive: true });
  });

  it('keeps the supplier letter hidden while the Readiness Check is hidden, even if it were public', () => {
    write([tool('readiness'), tool('suppliers', { public: true, publishedAt: '2026-10-01', requires: ['readiness'] })]);
    expect(shown('suppliers', { root, env: PRODUCTION })).toBe(false);
    expect(link('suppliers', {}, { root, env: PRODUCTION })).toBeNull();
    // and shows it once the Readiness Check is public too
    write([
      tool('readiness', { public: true, publishedAt: '2026-10-01' }),
      tool('suppliers', { public: true, publishedAt: '2026-10-02', requires: ['readiness'] }),
    ]);
    expect(shown('suppliers', { root, env: PRODUCTION })).toBe(true);
    expect(link('suppliers', {}, { root, env: PRODUCTION })).toBe('/prepare/suppliers');
  });

  it('shows both in preview, where nothing needs to be public', () => {
    write([tool('readiness'), tool('suppliers', { requires: ['readiness'] })]);
    expect(shown('suppliers', { root, env: PREVIEW })).toBe(true);
  });
});

describe('links', () => {
  it('adds a query and a hash, keeping commas readable and dropping empty values', () => {
    expect(withExtra('/target-dates', { query: { in: 'DEU,FRA,EUU' } })).toBe('/target-dates?in=DEU,FRA,EUU');
    expect(withExtra('/prepare/check', { query: { action: 'eu-scope', theme: undefined, x: '' }, hash: 'f=eu-roadmap' })).toBe(
      '/prepare/check?action=eu-scope#f=eu-roadmap',
    );
    expect(link('exposure', { query: { j: 'DEU' } }, { env: PREVIEW })).toBe('/prepare/exposure?j=DEU');
    expect(link('no-such-tool', {}, { env: PREVIEW })).toBeNull();
  });

  it('finds static pages with their query and hash, and gated pages only when built', () => {
    expect(pageHref('/countries', { env: PRODUCTION })).toBe('/countries');
    expect(pageHref('/countries/deu', { env: PRODUCTION })).toBe('/countries/deu');
    expect(pageHref('/documents?country=DEU#doc-d0123456789', { env: PRODUCTION })).toBe('/documents?country=DEU#doc-d0123456789');
    expect(pageHref('/about#team', { env: PRODUCTION })).toBe('/about#team');
    expect(pageHref('/prepare/guides/eu-roadmap', { root: STAGE0, env: PRODUCTION })).toBeNull();
    expect(pageHref('/prepare/guides/eu-roadmap', { env: PREVIEW })).toBe('/prepare/guides/eu-roadmap');
    expect(pageHref('/standards/cascade', { env: PREVIEW })).toBe('/standards/cascade');
    expect(pageHref('/lab/cascade', { env: PREVIEW })).toBeNull();
    expect(pageHref('/research/fixture-research', { root: SITES, env: PREVIEW })).toBeNull();
    expect(pageHref('/no-such-page', { env: PREVIEW })).toBeNull();
  });

  it('names the overview and the page of each standard wherever the Cascade is, and neither in an all-private production build', () => {
    // the overview has the Cascade's gate (5 October 2026), the standard pages too (8 October 2026), and the Cascade keeps its own
    const cascadeShown = [PRODUCTION, PREVIEW, LOCAL, { VERCEL_ENV: 'development' }, { root: STAGE0, VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'cascade' }];
    for (const { root, ...env } of cascadeShown as ({ root?: string } & Record<string, string>)[]) {
      for (const path of ['/standards', '/standards/fips-203', '/standards/fips-203#x', '/standards/rfc-10024']) {
        expect(pageHref(path, { root, env }), `${path} in ${JSON.stringify(env)}`).toBe(path);
      }
    }
    for (const path of ['/standards', '/standards/fips-203', '/standards/cascade']) expect(pageHref(path, { root: STAGE0, env: PRODUCTION }), path).toBeNull();
    // a standard with no verified document naming it has no page anywhere
    expect(pageHref('/standards/chn-ngcc', { env: LOCAL })).toBeNull();
    expect(link('cascade', {}, { env: PREVIEW })).toBe('/standards/cascade');
    expect(pageHref('/standards/cascade?std=FIPS-203', { env: PREVIEW })).toBe('/standards/cascade?std=FIPS-203');
  });

  it('names a profile only at its lower-case address, for a country the Atlas records', () => {
    expect(pageHref('/countries/euu', { env: PRODUCTION })).toBe('/countries/euu');
    expect(pageHref('/countries/nato', { env: PRODUCTION })).toBe('/countries/nato');
    // the site never emits upper case, and /countries/DEU stays a 404 (spec 15.1)
    expect(pageHref('/countries/DEU', { env: PRODUCTION })).toBeNull();
    expect(pageHref('/countries/zzz', { env: PRODUCTION })).toBeNull();
    expect(pageHref('/countries/deu/x', { env: PRODUCTION })).toBeNull();
  });

  it('names a gated file only when its gate is shown', () => {
    expect(pageHref('/prepare/inventory-template.csv', { root: STAGE0, env: PRODUCTION })).toBeNull();
    expect(pageHref('/prepare/inventory-template.csv', { env: PREVIEW })).toBe('/prepare/inventory-template.csv');
    const only = (ids: string) => ({ root: STAGE0, env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: ids } });
    expect(pageHref('/prepare/inventory-template.csv', only('inventory'))).toBeNull();
    expect(pageHref('/prepare/inventory-template.csv', only('inventory,readiness'))).toBe('/prepare/inventory-template.csv');
  });
});

describe('a file in src/pages inside a gated section', () => {
  // the inventory template's endpoint (src/pages/prepare/[file].csv.ts) answers every /prepare/*.csv
  // pattern, but builds only the files whose gate is shown: pageHref follows the gate, not the pattern
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'site-gated-files-'));
    mkdirSync(join(root, 'data/lab'), { recursive: true });
    mkdirSync(join(root, 'src/pages/prepare'), { recursive: true });
    mkdirSync(join(root, 'src/pages/countries'), { recursive: true });
    const tool = (id: string, extra: Record<string, unknown> = {}) => ({
      id,
      title: id,
      section: 'prepare',
      route: `/prepare/${id}`,
      byline: 'X',
      public: false,
      status: 'planned',
      gates: ['lorenzo-no-objection'],
      ...extra,
    });
    writeFileSync(join(root, 'data/lab/tools.json'), JSON.stringify({ tools: [tool('readiness'), tool('inventory', { requires: ['readiness'] })] }));
    writeFileSync(join(root, 'src/pages/prepare/[file].csv.ts'), 'export const GET = () => new Response("");\n');
    writeFileSync(join(root, 'src/pages/countries/[iso3].astro'), '---\n---\n');
    writeFileSync(join(root, 'src/pages/about.astro'), '---\n---\n');
  });

  it('keeps the template unnamed in production and names no other file the pattern matches', () => {
    expect(pageHref('/prepare/inventory-template.csv', { root, env: PRODUCTION })).toBeNull();
    expect(pageHref('/prepare/inventory-template.csv', { root, env: PREVIEW })).toBe('/prepare/inventory-template.csv');
    expect(pageHref('/prepare/other.csv', { root, env: PREVIEW })).toBeNull();
    expect(pageHref('/about#team', { root, env: PRODUCTION })).toBe('/about#team');
  });

  it('accepts any lower-case profile address when no country list is there to check', () => {
    expect(pageHref('/countries/deu', { root, env: PRODUCTION })).toBe('/countries/deu');
    expect(pageHref('/countries/DEU', { root, env: PRODUCTION })).toBeNull();
  });
});
