import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LabToolSchema, ToolsFileSchema } from './schema';
import { forcedPublic, isLocalBuild, isProduction, latestVerifiedAt, loadMemberships, siteBuilt, siteLinked, toolState, visibleTools, withoutLeads, loadTools } from './load';

const prov = {
  url: 'https://european-union.europa.eu/principles-countries-history/eu-countries_en',
  retrievedAt: '2026-09-30',
  excerpt: 'Test excerpt.',
  sourceClass: 'trusted-institutional',
};

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'lab-load-'));
  mkdirSync(join(root, 'data/lab/shared'), { recursive: true });
  writeFileSync(
    join(root, 'data/lab/tools.json'),
    JSON.stringify({
      tools: [
        { id: 'a', title: 'Public tool', section: 'prepare', route: '/prepare/a', byline: 'X', public: true, publishedAt: '2026-09-30', status: 'public', gates: [] },
        { id: 'b', title: 'Preview tool', section: 'prepare', route: '/prepare/b', byline: 'X', public: false, status: 'planned', gates: [] },
        { id: 'c', title: 'Research tool', site: 'research', route: '/research/c', byline: 'X', public: false, status: 'building', gates: [] },
        { id: 'd', title: 'Other site tool', site: 'ai', route: '/lab/d', byline: 'X', public: true, publishedAt: '2026-09-30', status: 'public', gates: [] },
        { id: 'e', title: 'Kept elsewhere', site: 'elsewhere', route: '/elsewhere/e', byline: 'X', public: true, publishedAt: '2026-09-30', status: 'public', gates: [] },
      ],
    }),
  );
  writeFileSync(
    join(root, 'data/lab/shared/memberships.json'),
    JSON.stringify({
      lists: [
        { id: 'checked', label: 'Checked list', count: 1, members: [{ iso3: 'FRA', name: 'France' }], verify: false, verifiedAt: '2026-09-30', provenance: [prov] },
        { id: 'lead', label: 'Lead list', count: 1, members: [{ iso3: 'DEU', name: 'Germany' }], verify: true, verifiedAt: null, provenance: [] },
      ],
    }),
  );
});

describe('production detection', () => {
  it('treats only VERCEL_ENV=production as production', () => {
    expect(isProduction({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isProduction({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(isProduction({})).toBe(false);
  });
});

describe('leads never reach a production build', () => {
  it('drops every verify: true record in production', () => {
    const data = loadMemberships({ root, env: { VERCEL_ENV: 'production' } });
    expect(data.lists.map((l) => l.id)).toEqual(['checked']);
    expect(JSON.stringify(data)).not.toContain('"verify":true');
  });

  it('keeps them in preview and in local development', () => {
    expect(loadMemberships({ root, env: { VERCEL_ENV: 'preview' } }).lists).toHaveLength(2);
    expect(loadMemberships({ root, env: {} }).lists).toHaveLength(2);
  });

  it('filters nested leads at any depth', () => {
    const nested = { a: [{ verify: false, b: [{ verify: true }, { verify: false }] }, { verify: true }] };
    expect(withoutLeads(nested)).toEqual({ a: [{ verify: false, b: [{ verify: false }] }] });
  });
});

describe('tool visibility', () => {
  it('shows only public tools in production', () => {
    expect(visibleTools({ root, env: { VERCEL_ENV: 'production', VERCEL: '1' } }).map((t) => t.id)).toEqual(['a']);
  });
  it('shows every Atlas tool in preview, and no research, elsewhere or ai tool', () => {
    expect(visibleTools({ root, env: { VERCEL_ENV: 'preview', VERCEL: '1' } }).map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('adds the research and elsewhere tools in a local build only, and never an ai tool', () => {
    expect(visibleTools({ root, env: {} }).map((t) => t.id)).toEqual(['a', 'b', 'c', 'e']);
  });
  it('never builds an elsewhere tool on a deployment, even public and forced', () => {
    const e = loadTools({ root }).tools.find((t) => t.id === 'e')!;
    expect(siteBuilt(e, {})).toBe(true);
    for (const env of [
      { VERCEL: '1', VERCEL_ENV: 'production' },
      { VERCEL: '1', VERCEL_ENV: 'preview' },
      { VERCEL_ENV: 'development' },
      { VERCEL: '1' },
      { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'e' },
    ]) {
      expect(siteBuilt(e, env), JSON.stringify(env)).toBe(false);
      expect(toolState({ root, env }).shown.has('e'), JSON.stringify(env)).toBe(false);
    }
  });
  it('links every site but elsewhere', () => {
    expect(siteLinked({})).toBe(true);
    expect(siteLinked({ site: 'atlas' })).toBe(true);
    expect(siteLinked({ site: 'research' })).toBe(true);
    expect(siteLinked({ site: 'elsewhere' })).toBe(false);
  });
  it('marks a local build in the tool state, so only it opens a local gate', () => {
    expect(toolState({ root, env: {} }).local).toBe(true);
    expect(toolState({ root, env: { VERCEL: '1', VERCEL_ENV: 'preview' } }).local).toBe(false);
    expect(toolState({ root, env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1' } }).local).toBe(false);
  });
  it('knows a local build by the absence of both Vercel variables', () => {
    expect(isLocalBuild({})).toBe(true);
    expect(isLocalBuild({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(isLocalBuild({ VERCEL: '1' })).toBe(false);
  });
  it('reads ATLAS_FORCE_PUBLIC only offline and off Vercel', () => {
    expect([...forcedPublic({ ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'a, b' })]).toEqual(['a', 'b']);
    expect(forcedPublic({ ATLAS_FORCE_PUBLIC: 'a' }).size).toBe(0);
    expect(forcedPublic({ ATLAS_OFFLINE: '1', VERCEL: '1', ATLAS_FORCE_PUBLIC: 'a' }).size).toBe(0);
  });
});

describe('the as-of date', () => {
  it('is the most recent verifiedAt anywhere in the data', () => {
    expect(latestVerifiedAt({ x: [{ verifiedAt: '2026-01-02' }, { y: { verifiedAt: '2026-03-04' } }, { verifiedAt: null }] })).toBe('2026-03-04');
    expect(latestVerifiedAt({ x: [] })).toBeNull();
  });
});

describe('the real tools registry', () => {
  it('matches its schema and keeps every tool off production until its gates are cleared', () => {
    const { tools } = loadTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      if (t.public) expect(t.gates, `${t.id} is public: empty its gates list once each gate is cleared (see _about in tools.json)`).toEqual([]);
    }
  });
  it('makes the six Atlas tools public on 8 October 2026, and keeps every entry of another site private', () => {
    const { tools } = loadTools();
    // Swann confirmed Lorenzo Pupillo's no-objection in writing on 8 October 2026 (_about in tools.json)
    const atlas = tools.filter((x) => (x.site ?? 'atlas') === 'atlas');
    expect(atlas.map((t) => t.id).sort()).toEqual(['cascade', 'dates', 'exposure', 'inventory', 'readiness', 'suppliers']);
    for (const t of atlas) expect(t, t.id).toMatchObject({ public: true, status: 'public', gates: [], publishedAt: '2026-10-08' });
    for (const t of tools.filter((x) => (x.site ?? 'atlas') !== 'atlas')) {
      expect(t.public, t.id).toBe(false);
      expect(t.gates.length, t.id).toBeGreaterThan(0);
      expect(t.publishedAt, t.id).toBeUndefined();
    }
  });
  it('keeps the Rulebook for another website: site elsewhere, outside the Atlas sections, private', () => {
    const rulebook = loadTools().tools.find((t) => t.id === 'rulebook');
    expect(rulebook?.site).toBe('elsewhere');
    expect(rulebook?.route).toBe('/elsewhere/eu-rules');
    expect(rulebook?.section).toBeUndefined();
    expect(rulebook?.legacyRoutes).toEqual([]);
    expect(rulebook?.public).toBe(false);
  });
});

describe('the registry schema', () => {
  const base = { id: 'x', title: 'X', section: 'prepare', route: '/prepare/x', byline: 'X', public: false, status: 'planned', gates: [] };
  it('accepts the new routes and fills legacyRoutes and requires', () => {
    const t = LabToolSchema.parse(base);
    expect(t.legacyRoutes).toEqual([]);
    expect(t.requires).toEqual([]);
  });
  it('asks for publishedAt when a tool is public', () => {
    expect(LabToolSchema.safeParse({ ...base, public: true }).success).toBe(false);
    expect(LabToolSchema.safeParse({ ...base, public: true, publishedAt: '2026-10-01' }).success).toBe(true);
  });
  it('rejects a route that is not a lower-case site path, and an Atlas tool with no section', () => {
    expect(LabToolSchema.safeParse({ ...base, route: '/Prepare/x' }).success).toBe(false);
    expect(LabToolSchema.safeParse({ ...base, route: 'prepare/x' }).success).toBe(false);
    const { section: _drop, ...noSection } = base;
    expect(LabToolSchema.safeParse(noSection).success).toBe(false);
  });
  it('keeps a research or elsewhere tool under its own root, with no section and no legacy route', () => {
    const { section: _drop, ...noSection } = base;
    expect(LabToolSchema.safeParse({ ...noSection, site: 'elsewhere', route: '/elsewhere/x' }).success).toBe(true);
    expect(LabToolSchema.safeParse({ ...noSection, site: 'elsewhere', route: '/prepare/x' }).success).toBe(false);
    expect(LabToolSchema.safeParse({ ...noSection, site: 'research', route: '/elsewhere/x' }).success).toBe(false);
    expect(LabToolSchema.safeParse({ ...base, site: 'elsewhere', route: '/elsewhere/x' }).success).toBe(false);
    expect(LabToolSchema.safeParse({ ...noSection, site: 'elsewhere', route: '/elsewhere/x', legacyRoutes: ['/lab/x'] }).success).toBe(false);
  });
  it('rejects an unknown requirement and a route used twice', () => {
    expect(ToolsFileSchema.safeParse({ tools: [{ ...base, requires: ['nope'] }] }).success).toBe(false);
    expect(ToolsFileSchema.safeParse({ tools: [base, { ...base, id: 'y' }] }).success).toBe(false);
  });
});
