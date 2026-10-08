import { describe, expect, it } from 'vitest';
import { loadTools } from '../lab/load';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRoot } from '../lab/load';
import { allPrivateRoot } from '../lab/registry-fixture';
import { COMMENTARY_IN_FOOTER, footerColumns, footerLinks, isCurrent, menuLinks, primaryNav, viewSwitch } from './nav';
import { allPages } from './routes';

const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview' };
const LOCAL = {};
const whoBuilt = existsSync(join(projectRoot(), 'src/pages/who.astro'));
const atlasIds = loadTools()
  .tools.filter((t) => (t.site ?? 'atlas') === 'atlas')
  .map((t) => t.id);
// stage 0: a production build of the real registry with every tool private again
// (src/lib/lab/registry-fixture.ts); the flag states below are built on the same registry
const STAGE0 = allPrivateRoot();
const stage0 = { root: STAGE0, env: PRODUCTION };
const allPublic = { env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: atlasIds.join(',') } };

const hrefs = (cols: ReturnType<typeof footerColumns>) => cols.flatMap((c) => c.links.map((l) => l.href));

describe('the header', () => {
  it('reads Countries, Documents, Methodology, About at stage 0', () => {
    expect(primaryNav(stage0).map((i) => i.label)).toEqual(['Countries', 'Documents', 'Methodology', 'About']);
  });

  it('reads Countries, Prepare, Standards, Documents, Methodology, About in production since 8 October 2026, with no Notes item', () => {
    // the real registry: the six Atlas tools are public, and src/content/notes holds no note
    expect(primaryNav({ env: PRODUCTION }).map((i) => i.label)).toEqual(['Countries', 'Prepare', 'Standards', 'Documents', 'Methodology', 'About']);
  });

  it('adds Prepare and Standards in their places once every tool is public, Standards opening the overview', () => {
    expect(primaryNav(allPublic).map((i) => i.label)).toEqual(['Countries', 'Prepare', 'Standards', 'Documents', 'Methodology', 'About']);
    expect(primaryNav(allPublic).map((i) => i.href)).toEqual(['/countries', '/prepare', '/standards', '/documents', '/methodology', '/about']);
  });

  it('opens the Standards overview from Standards in every build that shows the Cascade (5 October 2026)', () => {
    for (const env of [PREVIEW, LOCAL]) {
      expect(primaryNav({ env }).find((i) => i.id === 'standards')?.href, JSON.stringify(env)).toBe('/standards');
    }
    expect(primaryNav(stage0).some((i) => i.id === 'standards')).toBe(false);
  });

  it('shows Prepare for the Exposure Clock alone, and Standards only with the Cascade', () => {
    const only = (ids: string) => ({ root: STAGE0, env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: ids } });
    expect(primaryNav(only('exposure')).map((i) => i.id)).toEqual(['countries', 'prepare', 'documents', 'methodology', 'about']);
    expect(primaryNav(only('cascade')).map((i) => i.id)).toEqual(['countries', 'standards', 'documents', 'methodology', 'about']);
    expect(primaryNav(only('dates')).map((i) => i.id)).toEqual(['countries', 'documents', 'methodology', 'about']);
  });

  it('marks Countries current on the list, the map, target dates and every profile', () => {
    const countries = primaryNav(stage0).find((i) => i.id === 'countries')!;
    for (const path of ['/countries', '/countries/', '/map', '/target-dates', '/target-dates?in=DEU', '/countries/deu']) {
      expect(isCurrent(countries, path), path).toBe(true);
    }
    for (const path of ['/', '/documents', '/countries-x', '/mapping', '/about']) expect(isCurrent(countries, path), path).toBe(false);
  });

  it('marks the other sections on their own paths', () => {
    const nav = primaryNav(allPublic);
    const current = (path: string) => nav.filter((i) => isCurrent(i, path)).map((i) => i.id);
    expect(current('/prepare/guides/eu-roadmap')).toEqual(['prepare']);
    expect(current('/standards/fips-203')).toEqual(['standards']);
    expect(current('/about/changes')).toEqual(['about']);
    expect(current('/methodology')).toEqual(['methodology']);
    expect(current('/')).toEqual([]);
  });

  it('gives every item its question for the phone menu, Prepare and Standards from their pages', () => {
    for (const item of primaryNav(allPublic)) expect(item.question).toMatch(/\?$/);
    const prepare = primaryNav(allPublic).find((i) => i.id === 'prepare')!;
    expect(prepare.question).toBe(allPages(allPublic).find((p) => p.path === prepare.href)?.question);
    // the overview asks the question of its own page
    const standards = primaryNav(allPublic).find((i) => i.id === 'standards')!;
    expect(standards.question).toBe(allPages(allPublic).find((p) => p.path === standards.href)?.question);
  });
});

describe('the Notes item', () => {
  // fixture notes in a temporary folder only: src/content/notes never holds an invented note
  const folder = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'nav-notes-'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  };
  const note = (draft: boolean) => `---\ntitle: Fixture note\ndate: 2026-10-04\nsummary: A fixture note for the tests.\npages: [readiness]\ndraft: ${draft}\n---\nFixture body.\n`;
  const finished = folder({ 'fixture-note.md': note(false) });
  const draftOnly = folder({ 'fixture-draft.md': note(true) });
  const forced = (ids: string) => ({ VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: ids });
  const labels = (env: Record<string, string>, notesDir: string) => primaryNav({ root: STAGE0, env, notesDir }).map((i) => i.label);

  it('is absent from an all-private production build, whatever the folder holds', () => {
    expect(labels(PRODUCTION, finished)).toEqual(['Countries', 'Documents', 'Methodology', 'About']);
    expect(labels(PRODUCTION, draftOnly)).toEqual(['Countries', 'Documents', 'Methodology', 'About']);
  });

  it('appears between Documents and Methodology once a note is published with its page', () => {
    const nav = primaryNav({ root: STAGE0, env: forced('readiness'), notesDir: finished });
    expect(nav.map((i) => i.label)).toEqual(['Countries', 'Prepare', 'Documents', 'Notes', 'Methodology', 'About']);
    const notes = nav.find((i) => i.id === 'notes')!;
    expect(notes.href).toBe('/notes');
    expect(notes.question).toMatch(/\?$/);
    for (const path of ['/notes', '/notes/fixture-note']) expect(isCurrent(notes, path), path).toBe(true);
    expect(isCurrent(notes, '/notesx')).toBe(false);
  });

  it('appears in a preview with a finished note, and for a draft in a local build only', () => {
    expect(labels(PREVIEW, finished)).toContain('Notes');
    expect(labels(PREVIEW, draftOnly)).not.toContain('Notes');
    expect(labels(forced('readiness'), draftOnly)).not.toContain('Notes');
    expect(labels(LOCAL, draftOnly)).toContain('Notes');
  });
});

describe('the footer band (the minimal pass)', () => {
  it('draws six links at most, in the order the spec gives, in every build', () => {
    for (const opts of [stage0, allPublic, { env: PREVIEW }, { env: LOCAL }]) {
      const links = footerLinks(opts);
      const at = JSON.stringify(opts.env);
      expect(links.length, at).toBeLessThanOrEqual(6);
      expect(links.map((l) => l.label), at).toEqual([
        'Methodology',
        'About',
        ...(whoBuilt ? ['How to read the Atlas'] : []),
        'Report an error',
        'Data downloads',
        'GitHub',
      ]);
    }
  });

  it('points each link where the index does, and names no gated section, tool or licence', () => {
    const links = footerLinks(stage0);
    const href = (label: string) => links.find((l) => l.label === label)?.href;
    expect(href('Methodology')).toBe('/methodology');
    expect(href('About')).toBe('/about');
    if (whoBuilt) expect(href('How to read the Atlas')).toBe('/who');
    expect(href('Report an error')).toBe('mailto:swann.ashworth@ceps.eu');
    expect(href('Data downloads')).toBe('/documents');
    expect(href('GitHub')).toBe('https://github.com/swaggito1/QSC-Atlas-');
    for (const opts of [stage0, allPublic]) {
      for (const l of footerLinks(opts)) expect(l.href).not.toMatch(/^\/(prepare|standards|target-dates|lab|research|elsewhere)(\/|$)/);
    }
    expect(JSON.stringify(links)).not.toMatch(/licen[cs]e|Prepare|Standards|EU rules/i);
  });

  it('is drawn from links the full index already holds, so the index checks cover it', () => {
    for (const opts of [stage0, allPublic, { env: PREVIEW }]) {
      const index = new Set(hrefs(footerColumns(opts)));
      for (const l of footerLinks(opts)) expect(index.has(l.href), l.href).toBe(true);
    }
  });
});

describe('the shell index (footerColumns)', () => {
  it('names no gated page at stage 0 and has no Prepare column', () => {
    const cols = footerColumns(stage0);
    expect(cols.map((c) => c.heading)).toEqual(['The Atlas', 'About']);
    for (const href of hrefs(cols)) expect(href).not.toMatch(/^\/(prepare|standards|target-dates|lab|research|elsewhere)/);
    expect(JSON.stringify(cols)).not.toMatch(/Target dates|Standards|Prepare|Readiness|Exposure|Rulebook|Cascade/);
  });

  it('adds Target dates, the Standards overview, the Cascade and the Prepare column when they are public', () => {
    const cols = footerColumns(allPublic);
    expect(cols.map((c) => c.heading)).toEqual(['The Atlas', 'Prepare', 'About']);
    expect(cols[0].links.map((l) => l.label)).toEqual(['Countries', 'Map', 'Target dates', 'Standards', 'Standards Cascade', 'Documents']);
    expect(cols[0].links.find((l) => l.label === 'Standards')?.href).toBe('/standards');
    expect(cols[0].links.find((l) => l.label === 'Standards Cascade')?.href).toBe('/standards/cascade');
    const prepare = cols[1].links.map((l) => l.label);
    expect(prepare[0]).toBe('Overview');
    expect(prepare).not.toContain('Target dates');
  });

  it('names neither EU rules nor the page of a standard in any build', () => {
    for (const opts of [stage0, allPublic, { env: PREVIEW }, { env: LOCAL }]) {
      const cols = footerColumns(opts);
      const at = JSON.stringify(opts.env);
      expect(JSON.stringify(cols), at).not.toMatch(/EU rules|Rulebook|eu-rules|elsewhere/);
      for (const href of hrefs(cols)) {
        expect(href, at).not.toMatch(/^\/standards\/(?!cascade$)/);
        expect(href, at).not.toMatch(/^\/(lab|research|elsewhere)(\/|$)/);
      }
    }
  });

  it('lists the About column in order, with no link into an /about anchor but #team or #briefing', () => {
    for (const opts of [stage0, { env: PREVIEW }, { env: LOCAL }]) {
      const about = footerColumns(opts).find((c) => c.heading === 'About')!.links;
      expect(about.map((l) => l.label)).toEqual([
        'About',
        ...(whoBuilt ? ['How to read the Atlas'] : []),
        'Methodology',
        'What changed',
        'Report an error',
        'Data downloads',
        'GitHub',
        'Zenodo record',
        ...(COMMENTARY_IN_FOOTER ? ['Commentary'] : []),
      ]);
      expect(about.find((l) => l.label === 'About')?.href).toBe('/about');
      if (whoBuilt) expect(about.find((l) => l.label === 'How to read the Atlas')?.href).toBe('/who');
      expect(about.find((l) => l.label === 'What changed')?.href).toBe('/about/changes');
      expect(about.find((l) => l.label === 'Data downloads')?.href).toBe('/documents');
      for (const href of hrefs(footerColumns(opts))) {
        const anchor = /^\/about(?:\/)?#(.+)$/.exec(href);
        if (anchor) expect(['team', 'briefing'], href).toContain(anchor[1]);
      }
    }
  });

  it('sends corrections to the address About already publishes, and links the record and the code', () => {
    const about = footerColumns(stage0).find((c) => c.heading === 'About')!.links;
    expect(about.find((l) => l.label === 'Report an error')?.href).toBe('mailto:swann.ashworth@ceps.eu');
    expect(about.some((l) => l.href === 'https://doi.org/10.5281/zenodo.21262284')).toBe(true);
    expect(about.some((l) => l.href === 'https://github.com/swaggito1/QSC-Atlas-')).toBe(true);
    // decision 5: no licence is named until Swann and CEPS agree one
    expect(JSON.stringify(about)).not.toMatch(/licen[cs]e/i);
  });

  it('links the commentary only once its dates are corrected (decision 4)', () => {
    const about = footerColumns(stage0).find((c) => c.heading === 'About')!.links;
    expect(about.some((l) => l.label === 'Commentary')).toBe(COMMENTARY_IN_FOOTER);
  });
});

describe('the phone menu\'s quiet links', () => {
  it('reads how to read the Atlas (/who) and Report an error, and points into no other /about anchor', () => {
    const links = menuLinks(stage0);
    expect(links.map((l) => l.label)).toEqual([...(whoBuilt ? ['How to read the Atlas'] : []), 'Report an error']);
    if (whoBuilt) expect(links[0].href).toBe('/who');
    expect(links.at(-1)?.href).toBe('mailto:swann.ashworth@ceps.eu');
    for (const l of links) expect(l.href).not.toMatch(/^\/about#/);
  });
});

describe('the view switch', () => {
  it('offers List and Map at stage 0, and Target dates once it is shown', () => {
    expect(viewSwitch('countries', '/map', stage0)).toEqual([
      { label: 'List', href: '/countries', current: false },
      { label: 'Map', href: '/map', current: true },
    ]);
    expect(viewSwitch('countries', '/target-dates', { env: PREVIEW }).map((v) => [v.label, v.current])).toEqual([
      ['List', false],
      ['Map', false],
      ['Target dates', true],
    ]);
  });

  it('offers Overview and Cascade on Standards wherever the Cascade is built, and nothing at stage 0', () => {
    for (const opts of [allPublic, { env: PREVIEW }, { env: LOCAL }]) {
      expect(viewSwitch('standards', '/standards/cascade', opts), JSON.stringify(opts.env)).toEqual([
        { label: 'Overview', href: '/standards', current: false },
        { label: 'Cascade', href: '/standards/cascade', current: true },
      ]);
      expect(viewSwitch('standards', '/standards', opts).map((v) => [v.label, v.current]), JSON.stringify(opts.env)).toEqual([
        ['Overview', true],
        ['Cascade', false],
      ]);
    }
    // one view alone is no switch, and a production build with the Cascade private has neither
    expect(viewSwitch('standards', '/standards', stage0)).toEqual([]);
  });
});
