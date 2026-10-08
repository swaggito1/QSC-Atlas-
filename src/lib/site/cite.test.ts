import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { citeAuthors, citeText, citeUrl, correctionHref, DOI_URL, pageCitation, toolCitation, ZENODO_CREATORS } from './cite';
import { CORRECTIONS_EMAIL, ZENODO_DOI, siteOrigin } from './config';
import { formatDate } from '../lab/format';
import { loadTools } from '../lab/load';
import { allPrivateRoot } from '../lab/registry-fixture';
import { builtPage } from './routes';
import { isPreviewPage, methodAnchorFor, pageCrumbs, sectionMenu, toolCrumbs, viewSwitch } from '../../components/site/frame/contracts';

const DASH = new RegExp('[\\u2012\\u2013\\u2014\\u2015]');
// the Atlas's own tools (an entry with no site, or site "atlas"); the others never get a page here
const tools = (
  JSON.parse(readFileSync(join(process.cwd(), 'data/lab/tools.json'), 'utf8')).tools as {
    id: string;
    title: string;
    byline: string;
    route: string;
    site?: string;
  }[]
).filter((t) => !t.site || t.site === 'atlas');

describe('citations', () => {
  it('names the page at the Atlas origin from siteOrigin(), with no trailing slash', () => {
    const text = pageCitation({ title: 'Germany', path: '/countries/deu/', asOf: '2026-06-25' });
    expect(text).toContain(`${siteOrigin()}/countries/deu `);
    expect(text).not.toContain('/countries/deu/');
    expect(citeUrl('/', 'https://example.org/')).toBe('https://example.org/');
    expect(citeUrl('/prepare/check?theme=x#f=eu', 'https://example.org')).toBe('https://example.org/prepare/check');
  });

  it('follows the origin when the domain moves', () => {
    const text = pageCitation({ title: 'Germany', path: '/countries/deu', asOf: '2026-06-25', origin: 'https://qscatlas.org' });
    expect(text).toContain('https://qscatlas.org/countries/deu');
  });

  it('carries the as-of date and its year', () => {
    const text = pageCitation({ title: 'Prepare', path: '/prepare', asOf: '2026-09-30' });
    expect(text).toContain(formatDate('2026-09-30'));
    expect(text).toContain('30 September 2026');
    expect(text).toContain('(2026).');
  });

  it('says n.d. rather than guessing a year when nothing is verified yet', () => {
    const text = pageCitation({ title: 'Prepare', path: '/prepare', asOf: null });
    expect(text).toContain('(n.d.)');
    expect(text).not.toMatch(/data as of/);
  });

  it('names the Zenodo creators and CEPS, for a page and for a tool alike', () => {
    expect(ZENODO_CREATORS).toEqual(['Ashworth, S.']);
    expect(citeAuthors()).toBe('Ashworth, S., & CEPS');
    expect(pageCitation({ title: 'X', path: '/x', asOf: '2026-01-02' })).toMatch(/^Ashworth, S\., & CEPS\. /);
    for (const t of tools) expect(toolCitation(t, '2026-09-30')).toMatch(/^Ashworth, S\., & CEPS\. \(2026\)\. /);
  });

  it('cites the archived dataset by its DOI and states no licence', () => {
    const text = pageCitation({ title: 'X', path: '/x', asOf: '2026-01-02' });
    expect(DOI_URL).toBe(`https://doi.org/${ZENODO_DOI}`);
    expect(text).toContain(DOI_URL);
    expect(text).not.toMatch(/licen[cs]e|CC BY/i);
  });

  it('builds a citation for every Atlas tool, each at its route, with the as-of date and no em or en dash', () => {
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      const text = toolCitation(t, '2026-09-30');
      expect(text).toContain(`${siteOrigin()}${t.route}`);
      expect(text).toContain('30 September 2026');
      expect(text).toContain(t.title);
      expect(text).not.toMatch(DASH);
    }
  });

  it('cites the page a tool is shown on when a path is given', () => {
    const t = tools[0];
    expect(toolCitation(t, '2026-09-30', { path: '/somewhere/else/' })).toContain(`${siteOrigin()}/somewhere/else `);
  });

  it('puts no full stop after an address, as APA 7 asks', () => {
    for (const asOf of ['2026-09-30', null]) {
      const text = pageCitation({ title: 'Exposure Clock.', path: '/prepare/exposure', asOf });
      const urls = text.match(/https?:\/\/\S+/g) ?? [];
      expect(urls.length).toBe(2);
      for (const u of urls) expect(u).not.toMatch(/[.,;:]$/);
      expect(text.endsWith(DOI_URL)).toBe(true);
    }
  });

  it('never contains an em or en dash, whatever the title', () => {
    for (const title of ['Exposure Clock', 'Standards Cascade', 'Rulebook in Motion', 'Readiness Check', 'Target dates']) {
      expect(citeText({ title, path: '/a/b', asOf: '2026-03-04' })).not.toMatch(DASH);
      expect(pageCitation({ title, path: '/a/b', asOf: null })).not.toMatch(DASH);
    }
  });
});

describe('report an error', () => {
  it('writes to the corrections address with the page in the subject', () => {
    const href = correctionHref('Exposure Clock', '/prepare/exposure/');
    expect(href.startsWith(`mailto:${CORRECTIONS_EMAIL}?subject=`)).toBe(true);
    expect(decodeURIComponent(href.split('subject=')[1])).toBe('Correction: Exposure Clock (/prepare/exposure)');
  });

  it('keeps the query and fragment out of the subject', () => {
    const href = correctionHref('Readiness Check', '/prepare/check?theme=governance#f=eu-roadmap');
    expect(decodeURIComponent(href.split('subject=')[1])).toBe('Correction: Readiness Check (/prepare/check)');
  });
});

// The frame's own rules, through the one module its components read (src/components/site/frame/
// contracts.ts). They live here because vitest collects tests from src/lib/site.
describe('the page frame', () => {
  const PREVIEW = { env: { VERCEL: '1', VERCEL_ENV: 'preview' } };
  const PRODUCTION = { env: { VERCEL: '1', VERCEL_ENV: 'production' } };
  // the real registry with every tool private again (src/lib/lab/registry-fixture.ts)
  const STAGE0 = allPrivateRoot();
  const PREVIEW_PRIVATE = { ...PREVIEW, root: STAGE0 };
  const PRODUCTION_PRIVATE = { ...PRODUCTION, root: STAGE0 };
  const byId = new Map(loadTools(PREVIEW).tools.map((t) => [t.id, t]));
  const crumbs = (id: string, opts = PREVIEW) => toolCrumbs(byId.get(id)!, opts);

  it('gives each tool the breadcrumb of its section and title, never a Lab crumb', () => {
    const want: Record<string, string> = {
      exposure: 'Prepare › Exposure Clock',
      cascade: 'Standards › Standards Cascade',
      readiness: 'Prepare › Readiness Check',
    };
    // Rulebook in Motion left the Atlas for another website (Swann, 2 October 2026): no section,
    // so its crumb is its title alone and it never sits under Prepare.
    expect(crumbs('rulebook').map((x) => x.label).join(' › ')).toBe('Rulebook in Motion');
    for (const [id, text] of Object.entries(want)) {
      const c = crumbs(id);
      expect(c.map((x) => x.label).join(' › ')).toBe(text);
      expect(c[c.length - 1].href).toBeNull(); // the page itself is never a link
      for (const x of c) expect(x.href ?? '').not.toMatch(/^\/lab/);
    }
    // the section root links only when it is built in this build
    expect(crumbs('exposure')[0].href).toBe(builtPage('/prepare', PREVIEW) ? '/prepare' : null);
  });

  it('walks a guide page up to its section root', () => {
    const c = pageCrumbs({ title: 'NCSC timelines', parent: '/prepare/guides', section: 'prepare' }, PREVIEW);
    expect(c.map((x) => x.label)).toEqual(['Prepare', 'The guides', 'NCSC timelines']);
    expect(pageCrumbs({ title: 'Prepare', parent: null, section: 'prepare' }, PREVIEW)).toEqual([]);
  });

  it('shows the preview line on gated pages in non-production builds only', () => {
    expect(isPreviewPage('exposure', PREVIEW_PRIVATE)).toBe(true);
    expect(isPreviewPage('prepare-any', PREVIEW_PRIVATE)).toBe(true);
    expect(isPreviewPage(null, PREVIEW_PRIVATE)).toBe(false);
    expect(isPreviewPage('exposure', PRODUCTION_PRIVATE)).toBe(false);
  });

  it('lists only built pages in the Prepare side menu and marks exactly the current one', () => {
    const menu = sectionMenu('prepare', '/prepare/exposure/', PREVIEW);
    expect(menu.length).toBeGreaterThan(0);
    for (const m of menu) expect(builtPage(m.href, PREVIEW)).not.toBeNull();
    expect(menu.filter((m) => m.current).map((m) => m.href)).toEqual(['/prepare/exposure']);
    expect(sectionMenu('prepare', '/prepare/exposure', PRODUCTION_PRIVATE)).toEqual([]);
    expect(sectionMenu('standards', '/standards/cascade', PREVIEW)).toEqual([]);
  });

  it('gives Standards the switch Overview, Cascade where the Cascade is built, and none in an all-private production build', () => {
    expect(viewSwitch('standards', '/standards/cascade', PREVIEW).map((v) => v.label)).toEqual(['Overview', 'Cascade']);
    expect(viewSwitch('standards', '/standards/cascade', PRODUCTION_PRIVATE)).toEqual([]);
  });

  it('points each tool at its methodology anchor', () => {
    expect(methodAnchorFor('exposure')).toBe('exposure');
    expect(methodAnchorFor('rulebook')).toBe('eu-rules');
    expect(methodAnchorFor('cascade')).toBe('standards');
    expect(methodAnchorFor('readiness')).toBe('prepare');
    expect(methodAnchorFor('nothing')).toBeNull();
  });
});
