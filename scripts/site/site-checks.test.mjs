// qscatlas.org site checks: the scanners on small built sites made here, and their agreement with
// the routes manifest. The real matrix builds run only in npm run site:check.
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { NEVER_ROOTS, ROOT, STAMP_FILE, matrixModes, modeEnv, readTools, requiresClosure } from './lib/common.mjs';
import { checkDist, expectations, findGatedRefs, rolePattern, wordFindings } from './lib/dist.mjs';
import { inputFingerprint, staleReason } from './lib/inputs.mjs';
import { formatGroup, groupFindings, makeLookIn } from './lib/report.mjs';
import { gatedRootsFromTools, scanSource, scanText } from './lib/source.mjs';
import { readNoteFronts } from './lib/notes.mjs';
import { inVerbatim, inlineScripts, jsProse, recordIndex, visibleSegments } from './lib/text.mjs';
import { ROLE_META } from '../../src/lib/process';
import { compareMirror, notionProfiles } from './check-mirror.mjs';
import { allFiles, allPages, builtPages } from '../../src/lib/site/routes';
import { SITE_FIXTURES, otherSitesRoot } from '../../src/lib/lab/registry-fixture';
import { noteSitemapPaths, publishedNotes } from '../../src/lib/site/notes';
import * as mirror from '../../src/lib/site/mirror';

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
// words the house style bans, put together here so this file itself passes the style scan
const word = (...parts) => parts.join('');
const BANNED_1 = word('rob', 'ust');
const BANNED_2 = word('navig', 'ating');
const BANNED_3 = word('seam', 'less');
const ORIGIN = 'https://qsc-atlas.vercel.app';
const ORIGINS = [ORIGIN, 'https://qscatlas.org'];
const ROOTS = new Set(['prepare', 'standards', 'target-dates', 'lab', 'research', 'elsewhere']);

// a small registry and manifest, shaped like data/lab/tools.json and routes.ts
const TOOLS = [
  { id: 'readiness', title: 'Readiness Check', section: 'prepare', route: '/prepare/check', requires: [], public: false },
  { id: 'exposure', title: 'Exposure Clock', section: 'prepare', route: '/prepare/exposure', requires: [], public: false },
  { id: 'cascade', title: 'Standards Cascade', section: 'standards', route: '/standards/cascade', requires: [], public: false },
  { id: 'suppliers', title: 'Supplier letter', section: 'prepare', route: '/prepare/suppliers', requires: ['readiness'], public: false },
  { id: 'fixture-research', title: 'Research Fixture', site: 'research', route: '/research/fixture-research', requires: [], public: false },
  { id: 'rulebook', title: 'Rulebook in Motion', site: 'elsewhere', route: '/elsewhere/eu-rules', requires: [], public: false },
  { id: 'fixture-ai', title: 'AI Fixture', site: 'ai', route: '/lab/fixture-ai', public: false },
];
const PAGES = [
  { path: '/prepare', gate: 'prepare-any' },
  { path: '/prepare/check', gate: 'readiness', toolId: 'readiness' },
  { path: '/prepare/guides', gate: 'readiness' },
  { path: '/prepare/exposure', gate: 'exposure', toolId: 'exposure' },
  { path: '/prepare/suppliers', gate: 'suppliers', toolId: 'suppliers' },
  { path: '/standards', gate: 'local:cascade' },
  { path: '/standards/cascade', gate: 'cascade', toolId: 'cascade' },
  { path: '/standards/fips-203', gate: 'local:cascade' },
  { path: '/research/fixture-research', gate: 'fixture-research', toolId: 'fixture-research' },
  { path: '/elsewhere/eu-rules', gate: 'rulebook', toolId: 'rulebook' },
];
// the pages kept to Swann's machine: no matrix mode may build or name one
const KEPT = ['/standards', '/standards/fips-203', '/research/fixture-research', '/elsewhere/eu-rules'];
const FILES = [{ path: '/prepare/inventory-template.csv', gate: 'suppliers' }];

const OFF = { id: 'off', production: true, forced: [] };
const ON = { id: 'on', production: false, forced: [] };
const CASCADE = { id: 'tool-cascade', production: true, forced: ['cascade'] };
const SUPPLIERS = { id: 'tool-suppliers', production: true, forced: ['readiness', 'suppliers'] };

const page = ({ title = 'A page', body = '', noindex = false, banner = false } = {}) =>
  `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${title} · QSC Atlas</title>` +
  `<meta name="description" content="Where governments stand on quantum-safe cryptography.">` +
  `${noindex ? '<meta name="robots" content="noindex">' : ''}</head><body>` +
  `${banner ? '<div class="fr-banner" role="note"><p>Preview: not public yet. Please do not quote or share.</p></div>' : ''}` +
  `<header><a href="/">QSC Atlas</a> <a href="/countries">Countries</a></header><main>\n${body}\n</main></body></html>`;

/** A built site in a temporary folder: { "about/index.html": "<html>..." }. */
function site(files, mode) {
  const dir = mkdtempSync(join(tmpdir(), 'site-check-'));
  const production = mode.production;
  const base = {
    'index.html': page({ title: 'QSC Atlas', body: '<h1>Where governments stand</h1>' }),
    'about/index.html': page({ title: 'About', body: '<p id="briefing">Lorenzo Pupillo and Swann Ashworth give briefings on the Atlas on request.</p>' }),
    'robots.txt': production ? `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',
  };
  const all = { ...base, ...files };
  if (!('sitemap.xml' in files)) {
    const listed = Object.keys(all)
      .filter((f) => f.endsWith('index.html'))
      .map((f) => (f === 'index.html' ? '/' : `/${f.slice(0, -'/index.html'.length)}`))
      .filter((p) => production || !/^\/(prepare|standards|target-dates)/.test(p))
      .filter((p) => !/noindex/.test(all[p === '/' ? 'index.html' : `${p.slice(1)}/index.html`]));
    all['sitemap.xml'] = `<?xml version="1.0"?><urlset>${listed.map((p) => `<url><loc>${ORIGIN}${p === '/' ? '/' : p}</loc></url>`).join('')}</urlset>`;
  }
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
  return dir;
}

const ROLES = rolePattern(Object.values(ROLE_META));
const run = (dir, mode, verbatim = [], extra = {}) => checkDist({ dir, mode, tools: TOOLS, pages: PAGES, files: FILES, origins: ORIGINS, verbatim, roles: ROLES, ...extra });
const errors = (findings) => findings.filter((f) => f.level !== 'warn');

describe('what each mode builds', () => {
  it('builds no gated page with every flag false in production', () => {
    const exp = expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode: OFF });
    expect(exp.builtPages).toEqual([]);
    expect(exp.hiddenTitles.map((t) => t.title)).toContain('Readiness Check');
    // a title that is the site's ordinary vocabulary is left to the address check
    expect(exp.hiddenTitles.map((t) => t.title)).not.toContain('Supplier letter');
  });

  it('builds every Atlas page in a preview, never a research, elsewhere, AI or local-only page, and marks each as preview', () => {
    const exp = expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode: ON });
    for (const path of KEPT) expect(exp.builtPages.map((p) => p.path)).not.toContain(path);
    expect(exp.builtPages).toHaveLength(PAGES.length - KEPT.length);
    expect([...exp.previewPaths].sort()).toEqual(exp.builtPages.map((p) => p.path).sort());
    expect(exp.hiddenTitles.map((t) => t.title).sort()).toEqual(['AI Fixture', 'Research Fixture', 'Rulebook in Motion']);
  });

  it('never builds a page kept to Swann\'s machine, in any mode, even with every tool forced public', () => {
    const everything = { id: 'x', production: true, forced: TOOLS.map((t) => t.id) };
    for (const mode of [OFF, ON, CASCADE, SUPPLIERS, everything]) {
      const exp = expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode });
      for (const path of KEPT) expect(exp.builtPaths.has(path), `${path} in ${mode.id}`).toBe(false);
    }
    expect(expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode: CASCADE }).builtPages.map((p) => p.path)).toEqual(['/standards/cascade']);
    // and the roots of the research and elsewhere sites may not even be named by a deployment
    expect(NEVER_ROOTS).toEqual(expect.arrayContaining(['lab', 'research', 'elsewhere']));
  });

  it('keeps a tool that requires another hidden unless both are forced', () => {
    const alone = expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode: { id: 'x', production: true, forced: ['suppliers'] } });
    expect(alone.builtPages).toEqual([]);
    const both = expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode: SUPPLIERS });
    expect(both.builtPages.map((p) => p.path).sort()).toEqual(['/prepare', '/prepare/check', '/prepare/guides', '/prepare/suppliers']);
    expect([...both.builtPaths]).toContain('/prepare/inventory-template.csv');
  });

  it('forces each tool with the tools it requires, and never sets VERCEL', () => {
    const modes = matrixModes(readTools());
    expect(modes.map((m) => m.id).slice(0, 2)).toEqual(['off', 'on']);
    for (const m of modes.filter((x) => x.tool)) {
      expect(m.forced).toEqual(requiresClosure(readTools(), m.tool));
      const env = modeEnv(m, { VERCEL: '1', VERCEL_ENV: 'preview', NOTION_TOKEN: 'x' });
      expect(env.VERCEL).toBeUndefined();
      expect(env).toMatchObject({ ATLAS_OFFLINE: '1', VERCEL_ENV: 'production', ATLAS_FORCE_PUBLIC: m.forced.join(',') });
    }
    expect(modes.some((m) => ['rulebook', 'approach'].includes(m.tool))).toBe(false);
    // nor a tool of site ai or research (fixture entries, since the real registry holds none)
    expect(matrixModes([...readTools(), ...SITE_FIXTURES]).map((m) => m.id)).toEqual(modes.map((m) => m.id));
  });

  it('agrees with the routes manifest in every mode of the real registry', () => {
    const tools = readTools();
    for (const mode of matrixModes(tools)) {
      const env = modeEnv(mode, {});
      const mine = expectations({ tools, pages: allPages({ env, root: ROOT }), files: allFiles(), mode });
      const theirs = builtPages({ env, root: ROOT }).map((p) => p.path).sort();
      expect(mine.builtPages.map((p) => p.path).sort(), mode.id).toEqual(theirs);
    }
  });

  it('keeps the research and elsewhere tools out of every mode, and builds the standard pages wherever the Cascade is', () => {
    // the real registry with a fixture ai and research entry added (src/lib/lab/registry-fixture.ts)
    const root = otherSitesRoot();
    const tools = readTools(root);
    const kept = allPages({ env: {}, root }).filter((p) => /^\/(research|elsewhere)\//.test(p.path) || p.gate?.startsWith('local:'));
    expect(kept.map((p) => p.path)).toEqual(expect.arrayContaining(['/elsewhere/eu-rules', '/research/fixture-research']));
    // the Standards overview (5 October 2026) and the page of each standard (8 October 2026) are
    // built with the Cascade, so neither is kept
    expect(kept.map((p) => p.path)).not.toContain('/standards');
    expect(kept.map((p) => p.path)).not.toContain('/standards/fips-203');
    for (const mode of matrixModes(tools)) {
      const env = modeEnv(mode, {});
      const built = new Set(builtPages({ env, root }).map((p) => p.path));
      for (const p of kept) expect(built.has(p.path), `${p.path} in ${mode.id}`).toBe(false);
      for (const path of ['/standards', '/standards/fips-203']) expect(built.has(path), `${path} in ${mode.id}`).toBe(built.has('/standards/cascade'));
      expect(expectations({ tools, pages: allPages({ env, root }), files: allFiles(), mode }).hiddenTitles.map((t) => t.id), mode.id).toEqual(expect.arrayContaining(['rulebook', 'fixture-ai', 'fixture-research']));
    }
  });
});

describe('gated addresses in built files', () => {
  it('finds them in hrefs, island props, scripts and own absolute links, and nowhere else', () => {
    const text = [
      '<a href="/prepare/check?theme=x#a">x</a>',
      '<astro-island props="{&quot;href&quot;:[0,&quot;/standards/fips-203&quot;]}"></astro-island>',
      'const a="/target-dates?in=DEU,FRA";',
      `<a href="${ORIGIN}/lab/cascade">old</a> and https://qscatlas.org/research/fixture-research.`,
      '<a href="https://www.nist.gov/standards/x">NIST</a> <a href="/countries/deu">Germany</a> labels /labels',
    ].join('\n');
    const refs = findGatedRefs(text, { roots: ROOTS, origins: ORIGINS });
    expect(refs.map((r) => [r.path, r.line])).toEqual([
      ['/prepare/check', 1],
      ['/standards/fips-203', 2],
      ['/target-dates', 3],
      ['/lab/cascade', 4],
      ['/research/fixture-research', 4],
    ]);
  });
});

describe('an all-off production build', () => {
  it('passes when nothing gated is built or named', () => {
    expect(errors(run(site({}, OFF), OFF))).toEqual([]);
  });

  it('names the file and line of a hard-coded link to /prepare', () => {
    const dir = site({ 'countries/index.html': page({ body: '<p>Countries</p>\n<a href="/prepare">Prepare</a>' }) }, OFF);
    const found = errors(run(dir, OFF));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'countries/index.html', line: 3, rule: expect.stringContaining('/prepare') });
  });

  it('fails on a page or a link kept to Swann\'s machine: the list of standards, a standard, the Rulebook', () => {
    const dir = site(
      {
        'standards/fips-203/index.html': page({ title: 'FIPS 203' }),
        'elsewhere/eu-rules/index.html': page({ title: 'EU rules' }),
        'documents/index.html': page({ body: '<a href="/standards">All standards</a> <a href="/standards/fips-203">FIPS 203</a> <a href="/elsewhere/eu-rules?article=x">rules</a> <a href="/prepare/eu-rules">old</a>' }),
        'about/index.html': page({ title: 'About', body: '<p id="briefing">Lorenzo Pupillo and Swann Ashworth give briefings on the Atlas on request.</p><p>Try the Rulebook in Motion.</p>' }),
      },
      ON,
    );
    const rules = errors(run(dir, ON)).map((f) => `${f.file} ${f.rule}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^standards\/fips-203\/index.html gated page or file built outside/),
        expect.stringMatching(/^elsewhere\/eu-rules\/index.html a file under \/elsewhere was built/),
        'documents/index.html names a page this build does not have: /standards',
        'documents/index.html names a page this build does not have: /standards/fips-203',
        'documents/index.html names a /elsewhere address: /elsewhere/eu-rules',
        'documents/index.html names a page this build does not have: /prepare/eu-rules',
        expect.stringMatching(/^about\/index.html names the hidden tool "Rulebook in Motion"/),
      ]),
    );
  });

  it('fails on a gated folder, a hidden tool title, a /lab link and a gated sitemap row', () => {
    const dir = site(
      {
        'standards/index.html': page({ title: 'Standards' }),
        'map/index.html': page({ body: '<p>Open the Exposure Clock</p><a href="/lab">old</a>' }),
        '_astro/app.js': 'const t="Readiness Check";',
      },
      OFF,
    );
    const rules = errors(run(dir, OFF)).map((f) => `${f.file} ${f.rule}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^standards\/index.html gated page or file built outside/),
        expect.stringMatching(/^map\/index.html names the hidden tool "Exposure Clock"/),
        expect.stringMatching(/^map\/index.html names a \/lab address/),
        expect.stringMatching(/^_astro\/app.js names the hidden tool "Readiness Check"/),
        expect.stringMatching(/^sitemap.xml sitemap lists a page this build does not have: \/standards/),
      ]),
    );
  });

  it('checks robots.txt and the preview line for production', () => {
    const dir = site({ 'robots.txt': 'User-agent: *\nDisallow: /\n', 'documents/index.html': page({ banner: true }) }, OFF);
    const rules = errors(run(dir, OFF)).map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['robots.txt must allow every crawler in a production build', 'preview line in a production build']));
  });
});

describe('words a visitor reads', () => {
  const body = (s) => page({ body: s });

  it('fails on dashes, banned words, advisory and readiness wording in the site copy', () => {
    const dir = site(
      {
        'documents/index.html': body(`<p>Dates 2025 ${EN} 2030</p><p>A ${BANNED_1} record ${EM} kept.</p><a class="btn">Request a briefing</a><p>See how ready each one is.</p>`),
      },
      OFF,
    );
    const rules = errors(run(dir, OFF)).map((f) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining(['en dash', 'em dash', `banned word "${BANNED_1}"`, 'advisory wording "Request a briefing"', 'readiness wording "how ready" about a place']),
    );
  });

  it('exempts a source title, a quotation and the briefing sentence on /about, and warns on a record', () => {
    const title = `Migration to Post Quantum Cryptography ${EN} Recommendations for action`;
    const dir = site(
      {
        'countries/deu/index.html': body(`<a href="https://example.org/x">${title}</a><blockquote>A ${BANNED_1} ${EM} quoted line</blockquote>`),
        'countries/aus/index.html': body(`<p>Organisations are ${BANNED_2} the move.</p>`),
      },
      OFF,
    );
    const findings = checkDist({ dir, mode: OFF, tools: TOOLS, pages: PAGES, files: FILES, origins: ORIGINS, verbatim: [title], records: [`Organisations are ${BANNED_2} the move.`] });
    expect(errors(findings)).toEqual([]);
    expect(findings.filter((f) => f.level === 'warn').map((f) => f.rule)).toEqual([expect.stringMatching(new RegExp(`^banned word "${BANNED_2}" in a record`))]);
  });

  it('allows "how ready" only about an organisation, and an offer of briefings only on /about#briefing', () => {
    const seg = (text, ids = []) => wordFindings({ text, quoted: false, ids }, { verbatim: [], records: [], briefingAllowed: ids.includes('briefing') }).map((f) => f.rule);
    expect(seg('Assess how ready your organisation is for the migration')).toEqual([]);
    expect(seg('how ready it really is')).toEqual(['readiness wording "how ready" about a place']);
    expect(seg('We give briefings on request.')).toEqual(['briefings offered outside the one sentence on /about (decision 1)']);
    expect(seg('We give briefings on request.', ['briefing'])).toEqual([]);
    expect(seg('A Global Risk Institute briefing reports a proposed machine design.')).toEqual([]);
    expect(seg('The Atlas is maintained alongside advisory work.')).toEqual(['advisory wording (spec 18, decision 1)']);
  });

  it('wants one plain #briefing sentence on /about', () => {
    const dir = site({ 'about/index.html': page({ body: '<h2 id="briefing">Request a briefing</h2>' }) }, OFF);
    const rules = errors(run(dir, OFF)).map((f) => f.rule);
    expect(rules).toEqual(expect.arrayContaining(['the #briefing element is a h2; it must be one plain sentence', 'advisory wording "Request a briefing"']));
  });

  it('reads text, readable attributes, meta tags and island props, but not scripts or styles', () => {
    const segs = visibleSegments(
      '<html><head><title>T</title><meta name="description" content="D"><style>.a{}</style></head><body><img alt="A"><script>var x="S s"</script><astro-island props="{&quot;label&quot;:[0,&quot;Show as a table&quot;],&quot;href&quot;:[0,&quot;/countries&quot;]}"></astro-island><q>Q</q></body></html>',
    );
    expect(segs.map((s) => [s.text, s.quoted])).toEqual([
      ['T', false],
      ['D', false],
      ['A', false],
      ['Show as a table', false],
      ['Q', true],
    ]);
  });

  it('reads prose from scripts but not a list of identifiers', () => {
    const js = `const a="allowFullScreen async autoFocus ${BANNED_3}";const b="Copy link";const c="loading the map";`;
    expect(jsProse(js).map((s) => s.text)).toEqual(['Copy link']);
  });

  it('pairs quotes as the script does, past regular expressions and template substitutions', () => {
    const js = [
      'const r=/["\']/g;',
      'const a=`${x?"is-active":""}${y?" is-past":""}`,b={deadlines:l,links:h,label:"Copy link"};',
      'const t=`The image could not be made: ${e.message}.`;',
      'switch(k){case"contextualiser":return n/2}',
    ].join('');
    expect(jsProse(js).map((s) => s.text)).toEqual(['Copy link', 'The image could not be made: .']);
  });

  it('matches a source title even when markup splits it', () => {
    const t = `Kryptografie quantensicher gestalten ${EN} Grundlagen`;
    expect(inVerbatim(t, t.indexOf(EN), t.indexOf(EN) + 1, [t])).toBe(true);
    expect(inVerbatim(`quantensicher gestalten ${EN} Grundlagen`, 24, 25, [t])).toBe(true);
    expect(inVerbatim(`Our own words ${EN} here`, 14, 15, [t])).toBe(false);
  });
});

describe('names, scripts and slots the first scan missed', () => {
  it('finds a hidden tool name wrapped over two lines or joined by a non-breaking space', () => {
    const dir = site({ 'map/index.html': page({ body: '<p>Mark each action in the Readiness\nCheck, then open the Exposure&nbsp;Clock.</p>' }) }, OFF);
    const found = errors(run(dir, OFF)).map((f) => [f.rule, f.line]);
    expect(found).toEqual(
      expect.arrayContaining([
        ['names the hidden tool "Readiness Check" (readiness)', 2],
        ['names the hidden tool "Exposure Clock" (exposure)', 3],
      ]),
    );
    const split = site({ 'map/index.html': page({ body: '<p>Open the Exposure <em>Clock</em> later.</p>' }) }, OFF);
    expect(errors(run(split, OFF)).map((f) => f.rule)).toContain('names the hidden tool "Exposure Clock" (exposure)');
  });

  it('reads the words of inline scripts, data blocks and island slots', () => {
    const dir = site(
      {
        'about/index.html': page({
          title: 'About',
          body:
            '<p id="briefing">Lorenzo Pupillo and Swann Ashworth give briefings on the Atlas on request.</p>\n' +
            `<script type="module">// a comment's apostrophe opens no string\nconst m="The citation was copied ${EM} a ${BANNED_3} result.";</script>\n` +
            `<script type="application/json">{"label":"A ${BANNED_1} label"}</script>\n` +
            `<script type="application/ld+json">{"name":"A ${BANNED_1} name for search engines"}</script>\n` +
            `<astro-island><template data-astro-template>Shown ${EN} after hydration</template></astro-island>\n` +
            `<template id="x">Never shown ${EN} here</template>`,
        }),
      },
      OFF,
    );
    const found = errors(run(dir, OFF)).map((f) => `${f.rule} @${f.line}`);
    expect(found).toEqual(expect.arrayContaining(['em dash @4', `banned word "${BANNED_3}" @4`, `banned word "${BANNED_1}" @5`, 'en dash @7']));
    expect(found).toHaveLength(4);
    expect(inlineScripts('<script src="/a.js"></script><script>var a = "x"; // it\'s</script>').map((s) => s.text.includes("it's"))).toEqual([false]);
  });
});

describe('offers of briefings and advisory wording', () => {
  const seg = (text, ids = [], extra = {}) => wordFindings({ text, quoted: false, ids }, { briefingAllowed: ids.includes('briefing'), ...extra }).map((f) => f.rule);
  const OFFER = 'briefings offered outside the one sentence on /about (decision 1)';

  it('catches the common ways of offering one', () => {
    for (const t of [
      'Ask for a briefing.',
      'For a briefing, write to swann.ashworth@ceps.eu.',
      'Lorenzo Pupillo and Swann Ashworth are available for briefings.',
      'Briefings for governments and companies',
      'We brief ministries; our briefings cover the Atlas.',
    ]) {
      expect(seg(t), t).toEqual([OFFER]);
    }
    expect(seg('Lorenzo Pupillo and Swann Ashworth are available for briefings.', ['briefing'])).toEqual([]);
  });

  it('leaves a source or an agency briefing alone, and judges every match', () => {
    expect(seg('A Global Risk Institute briefing reports a proposed machine design.')).toEqual([]);
    expect(seg('The European Parliamentary Research Service publishes briefings on quantum technologies.')).toEqual([]);
    expect(seg('A US government briefing set out the plan.')).toEqual([]);
    const title = 'How to book a briefing room';
    expect(seg(`${title}, and ask for a briefing too.`, [], { verbatim: [title] })).toEqual([OFFER]);
  });

  it('fails the old profile lead-in and consulting wording, and not an agency advising in a record', () => {
    expect(seg('Advising on this transition, or your own sector\'s?')).toEqual(['advisory wording "advising on" (spec 18, decision 1)']);
    expect(seg('The Atlas is maintained alongside consulting work.')).toEqual(['advisory wording (spec 18, decision 1)']);
    const record = { text: 'The agency is advising on hybrid schemes.', where: 'data/profiles/XYZ.json (XYZ), summary' };
    expect(seg(record.text, [], { records: [record] })).toEqual([]);
  });
});

describe('deadline, theory and role words', () => {
  const findings = (text, extra = {}) => wordFindings({ text, quoted: false, ids: [], ...(extra.seg ?? {}) }, { roles: ROLES, ...extra });
  const rules = (text, extra) => findings(text, extra).map((f) => `${f.level} ${f.rule}`);
  const LUX = 'Critical and high-risk use cases migrated to post-quantum cryptography (EU deadline noted by ILNAS and NC3)';

  it('warns on a target called a deadline in a record and names the record', () => {
    const record = { text: `2030 | ${LUX}`, where: 'data/profiles/LUX.json (LUX), migrationTimeline' };
    expect(rules(LUX, { records: [record] })).toEqual([
      'warn the word "deadline" outside binding law (spec 13) in a record Swann edits (Notion, then the dump): data/profiles/LUX.json (LUX), migrationTimeline',
    ]);
    const summary = { text: 'No dated national migration deadline has been published.', where: 'data/profiles/CZE.json (CZE), summary' };
    expect(rules(summary.text, { records: [summary] })).toEqual([]);
  });

  it('fails the word in the site\'s own words, except denied, reporting, named, on a binding-law page or reviewed', () => {
    expect(rules('Every target has a deadline of 2030.')).toEqual(['error the word "deadline" outside binding law (spec 13)']);
    expect(rules('It is not binding and sets a deadline of 2030.')).toEqual(['error the word "deadline" outside binding law (spec 13)']);
    for (const ok of [
      'A target, not a legal deadline, unless the profile marks it binding.',
      'Every date here is a target. None is a legal deadline.',
      ': completion, in guidance (not a legal deadline)',
      'Which EU acts may reach an organisation, with the reporting deadlines each act sets.',
      'The word deadline is kept for dates set in binding law.',
    ]) {
      expect(rules(ok), ok).toEqual([]);
    }
    expect(rules('drawing the deadlines', { bindingLaw: true })).toEqual([]);
    const allow = [{ page: '/commentary', phrase: 'drew some of them as hard deadlines', rule: 'the word "deadline"' }];
    const used = new Set();
    expect(rules('An earlier version drew some of them as hard deadlines.', { allow, used })).toEqual([]);
    expect(used.size).toBe(1);
  });

  it('fails theoretical vocabulary anywhere and role words outside the role badge', () => {
    expect(rules('A Triple Helix reading of the census.')).toEqual(['error theoretical vocabulary "Triple Helix" (CLAUDE.md, visible copy)']);
    expect(rules('Germany acts as a standard-maker here.')).toEqual(['error role word "standard-maker" outside the role badge (spec 13)']);
    expect(rules('Most countries are Takers.')).toEqual(['error role word "Takers" outside the role badge (spec 13)']);
    expect(rules('Standard-maker', { seg: { badge: true } })).toEqual([]);
    expect(rules('Sovereign developer', { seg: { props: true } })).toEqual([]);
    expect(rules('Written for technical decision-makers and risk owners.')).toEqual([]);
  });

  it('finds a role word in a built page only outside the badge', () => {
    const dir = site({ 'countries/index.html': page({ body: '<span class="role-badge">Standard-taker</span><p>The contextualisers add rules.</p>' }) }, OFF);
    expect(errors(run(dir, OFF)).map((f) => f.rule)).toEqual(['role word "contextualisers" outside the role badge (spec 13)']);
  });

  it('passes the role table of a built script but not a role word in its sentences', () => {
    const table = 'const o={taker:{key:"taker",label:"Standard-taker",short:"Taker"},"sovereign-developer":{label:"Sovereign developer",short:"Sovereign developer"}};';
    const prose = 'const t="Most countries here act as a Sovereign developer.";';
    const dir = site({ '_astro/process.js': table, '_astro/note.js': prose }, ON);
    const found = errors(run(dir, ON)).filter((f) => f.rule.startsWith('role word'));
    expect(found.map((f) => f.file)).toEqual(['_astro/note.js']);
  });

  it('keeps each record with its file, country and field', () => {
    const lux = recordIndex(ROOT).find((r) => r.where.startsWith('data/profiles/LUX.json'));
    expect(lux?.where).toMatch(/^data\/profiles\/LUX\.json \(LUX\), \w+$/);
  });
});

describe('what Swann reads', () => {
  it('groups one mistake shown on many pages and modes into one entry, with where to look', () => {
    const footer = `Data and licence ${EM} see below`;
    const findings = [];
    for (const mode of [OFF, CASCADE]) {
      const dir = site({ 'map/index.html': page({ body: `<footer>${footer}</footer>` }), 'documents/index.html': page({ body: `<footer>${footer}</footer>` }) }, mode);
      findings.push(...errors(run(dir, mode)));
    }
    const groups = groupFindings(findings.filter((f) => f.rule === 'em dash'));
    expect(groups).toHaveLength(1);
    expect(groups[0].files.sort()).toEqual(['documents/index.html', 'map/index.html']);
    expect(groups[0].modes).toEqual(['off', 'tool-cascade']);
    const root = mkdtempSync(join(tmpdir(), 'site-look-'));
    mkdirSync(join(root, 'src/components'), { recursive: true });
    writeFileSync(join(root, 'src/components/Footer.astro'), `<footer>\n  ${footer}\n</footer>\n`);
    const text = formatGroup(groups[0], makeLookIn(root));
    expect(text).toMatch(/^em dash \(2 files; modes off, tool-cascade\)/);
    expect(text).toContain('look in: src/components/Footer.astro:2');
  });
});

describe('a matrix build that is out of date', () => {
  const fixture = () => {
    const root = mkdtempSync(join(tmpdir(), 'site-stale-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src/a.txt'), 'a');
    writeFileSync(join(root, 'src/b.txt'), 'b');
    const old = new Date(Date.now() - 60_000);
    for (const f of ['src/a.txt', 'src/b.txt']) utimesSync(join(root, f), old, old);
    const out = join(root, 'out');
    mkdirSync(out);
    writeFileSync(join(out, STAMP_FILE), JSON.stringify({ mode: 'off', startedMs: Date.now(), inputs: inputFingerprint(root).digest }));
    return { root, out };
  };

  it('is current until an input changes, and stale after a delete or a rename', () => {
    const a = fixture();
    expect(staleReason(a.out, inputFingerprint(a.root))).toBeNull();
    rmSync(join(a.root, 'src/b.txt'));
    expect(staleReason(a.out, inputFingerprint(a.root))).toBe('an input changed since it was built');

    const b = fixture();
    renameSync(join(b.root, 'src/b.txt'), join(b.root, 'src/c.txt'));
    expect(staleReason(b.out, inputFingerprint(b.root))).toBe('an input changed since it was built');

    const c = fixture();
    rmSync(join(c.out, STAMP_FILE));
    expect(staleReason(c.out, inputFingerprint(c.root))).toBe('not built yet');
  });
});

describe('a single-tool build', () => {
  const cascadeSite = (extra = {}) =>
    site(
      {
        'standards/cascade/index.html': page({ title: 'Standards Cascade', body: '<a href="/standards/cascade?std=FIPS-203">FIPS 203 in the Cascade</a>' }),
        ...extra,
      },
      CASCADE,
    );

  it('passes when it builds and names only its own pages', () => {
    expect(errors(run(cascadeSite(), CASCADE))).toEqual([]);
  });

  it('builds the Cascade without the list of standards or a standard page, and names neither', () => {
    const dir = cascadeSite({
      'standards/index.html': page({ title: 'Standards' }),
      'countries/usa/index.html': page({ body: '<a href="/standards/fips-203">FIPS 203</a> <a href="/standards">Standards</a>' }),
    });
    const rules = errors(run(dir, CASCADE)).map((f) => `${f.file} ${f.rule}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^standards\/index.html gated page or file built outside/),
        'countries/usa/index.html names a page this build does not have: /standards/fips-203',
        'countries/usa/index.html names a page this build does not have: /standards',
      ]),
    );
  });

  it('fails on a page or a link outside its scope, a missing page and a missing sitemap row', () => {
    const dir = cascadeSite({
      'prepare/check/index.html': page({ title: 'Readiness Check' }),
      'countries/deu/index.html': page({ body: '<a href="/prepare/check">x</a> <a href="/target-dates?in=DEU">y</a>' }),
      'sitemap.xml': `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>`,
    });
    const rules = errors(run(dir, CASCADE)).map((f) => `${f.file ?? ''} ${f.rule}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^prepare\/check\/index.html gated page or file built outside/),
        expect.stringMatching(/names a page this build does not have: \/prepare\/check/),
        expect.stringMatching(/names a page this build does not have: \/target-dates$/),
        expect.stringMatching(/names the hidden tool "Readiness Check"/),
        expect.stringMatching(/sitemap leaves out the public page \/standards\/cascade/),
      ]),
    );
    const missing = errors(run(site({}, CASCADE), CASCADE)).map((f) => f.rule);
    expect(missing).toContain('expected page missing: /standards/cascade (gate cascade)');
  });
});

describe('a preview build', () => {
  it('wants the preview line and noindex on every page that is not public, robots closed and no gated sitemap row', () => {
    const files = {};
    for (const p of PAGES.filter((x) => !KEPT.includes(x.path))) files[`${p.path.slice(1)}/index.html`] = page({ noindex: true, banner: true });
    files['prepare/inventory-template.csv'] = 'field,label\n';
    expect(errors(run(site(files, ON), ON))).toEqual([]);

    files['prepare/check/index.html'] = page();
    files['documents/index.html'] = page({ banner: true });
    files['robots.txt'] = `User-agent: *\nAllow: /\n`;
    const rules = errors(run(site(files, ON), ON)).map((f) => `${f.file} ${f.rule}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        'prepare/check/index.html page not public yet lacks the preview line',
        'prepare/check/index.html page not public yet lacks noindex',
        'documents/index.html preview line on a page that is public',
        'robots.txt robots.txt must disallow every crawler outside production',
      ]),
    );
  });
});

describe('the notes', () => {
  // fixture notes only: src/content/notes never holds an invented note
  const NOTE = { slug: 'fixture-note', draft: false, pages: ['readiness'], image: null };
  const DRAFT = { slug: 'fixture-draft', draft: true, pages: ['readiness'], image: null };
  const READINESS = { id: 'tool-readiness', production: true, forced: ['readiness'] };
  const withNotes = (dir, mode, notes) => run(dir, mode, [], { notes });
  const prepare = { 'prepare/index.html': page(), 'prepare/check/index.html': page(), 'prepare/guides/index.html': page() };
  const released = {
    ...prepare,
    'notes/index.html': page({ title: 'Notes' }),
    'notes/fixture-note/index.html': page({ title: 'Fixture note' }),
    'notes/rss.xml': `<rss><channel><item><link>${ORIGIN}/notes/fixture-note</link></item></channel></rss>`,
  };

  it('expects no list, no note page and no feed in an all-private production build, and passes one without them', () => {
    const exp = expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode: OFF, notes: [NOTE, DRAFT] });
    expect(exp.notes.paths).toEqual([]);
    expect(exp.notes.feed).toBeNull();
    expect(errors(withNotes(site({}, OFF), OFF, [NOTE, DRAFT]))).toEqual([]);
  });

  it('fails an all-private production build with the list, a note, the feed, an image or a Notes link', () => {
    const dir = site(
      {
        'notes/index.html': page({ title: 'Notes' }),
        'notes/fixture-note/index.html': page({ title: 'Fixture note' }),
        'notes/rss.xml': '<rss></rss>',
        'notes/fixture.png': 'x',
        'documents/index.html': page({ body: '<nav><a href="/notes">Notes</a></nav>' }),
      },
      OFF,
    );
    const rules = errors(withNotes(dir, OFF, [NOTE])).map((f) => `${f.file} ${f.rule}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^notes\/index.html gated page or file built outside/),
        expect.stringMatching(/^notes\/fixture-note\/index.html gated page or file built outside/),
        expect.stringMatching(/^notes\/rss.xml gated page or file built outside/),
        expect.stringMatching(/^notes\/fixture.png gated page or file built outside/),
        'documents/index.html names a page this build does not have: /notes',
      ]),
    );
  });

  it('wants the list, the note, the feed and their sitemap rows once the note\'s page is public, and never the draft', () => {
    expect(errors(withNotes(site(released, READINESS), READINESS, [NOTE, DRAFT]))).toEqual([]);
    const missing = errors(withNotes(site(prepare, READINESS), READINESS, [NOTE])).map((f) => f.rule);
    expect(missing).toEqual(
      expect.arrayContaining([
        'expected page missing: /notes (a published note)',
        'expected page missing: /notes/fixture-note (a published note)',
        'expected file missing: /notes/rss.xml (a published note)',
      ]),
    );
    const sitemap = { ...released, 'sitemap.xml': `<urlset><url><loc>${ORIGIN}/</loc></url></urlset>` };
    expect(errors(withNotes(site(sitemap, READINESS), READINESS, [NOTE])).map((f) => f.rule)).toEqual(
      expect.arrayContaining(['sitemap leaves out the public page /notes', 'sitemap leaves out the public page /notes/fixture-note']),
    );
    const noindex = { ...released, 'notes/fixture-note/index.html': page({ noindex: true }) };
    expect(errors(withNotes(site(noindex, READINESS), READINESS, [NOTE])).map((f) => f.rule)).toContain('a published note page carries noindex');
  });

  it('wants the feed to list exactly the published notes', () => {
    const wrong = { ...released, 'notes/rss.xml': `<rss><channel><item><link>${ORIGIN}/notes/fixture-draft</link></item></channel></rss>` };
    const rules = errors(withNotes(site(wrong, READINESS), READINESS, [NOTE, DRAFT])).map((f) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        `the feed lists a note this build does not publish: ${ORIGIN}/notes/fixture-draft`,
        `the feed leaves out the published note ${ORIGIN}/notes/fixture-note`,
        'names a page this build does not have: /notes/fixture-draft',
      ]),
    );
  });

  it('marks a note as a preview until its page is public, and keeps every note out of a preview sitemap', () => {
    const exp = expectations({ tools: TOOLS, pages: PAGES, files: FILES, mode: ON, notes: [NOTE, DRAFT] });
    expect(exp.notes.pagePaths).toEqual(['/notes', '/notes/fixture-note']);
    expect([...exp.previewPaths]).toEqual(expect.arrayContaining(['/notes', '/notes/fixture-note']));
    expect(exp.notes.sitemap).toEqual([]);
    const open = TOOLS.map((t) => (t.id === 'readiness' ? { ...t, public: true } : t));
    const pub = expectations({ tools: open, pages: PAGES, files: FILES, mode: ON, notes: [NOTE] });
    expect([...pub.previewPaths].filter((p) => p.startsWith('/notes'))).toEqual([]);
  });

  it('agrees with the publishing rule of notes.ts in every mode of the real registry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'site-notes-'));
    const base = 'title: Fixture note\ndate: 2026-10-04\nsummary: A fixture note for the tests.';
    const write = (slug, front) => writeFileSync(join(dir, `${slug}.md`), `---\n${base}\n${front}\n---\nFixture body.\n`);
    write('fixture-readiness', 'pages: [readiness, /prepare/guides]\ndraft: false');
    write('fixture-pair', 'pages: [exposure, cascade]\ndraft: false');
    write('fixture-suppliers', 'pages: [suppliers]\ndraft: false');
    write('fixture-documents', 'pages: [/documents]\ndraft: false');
    write('fixture-draft', 'pages: [dates]\ndraft: true');
    const tools = readTools();
    const notes = readNoteFronts(ROOT, dir);
    expect(notes.map((n) => [n.slug, n.draft])).toEqual([
      ['fixture-documents', false],
      ['fixture-draft', true],
      ['fixture-pair', false],
      ['fixture-readiness', false],
      ['fixture-suppliers', false],
    ]);
    for (const mode of matrixModes(tools)) {
      const env = modeEnv(mode, {});
      const exp = expectations({ tools, pages: allPages({ env, root: ROOT }), files: allFiles(), mode, notes });
      expect([...exp.notes.published].sort(), mode.id).toEqual(publishedNotes({ env, notesDir: dir }).map((n) => n.slug).sort());
      expect([...exp.notes.sitemap].sort(), mode.id).toEqual(noteSitemapPaths({ env, notesDir: dir }).sort());
      expect(exp.notes.published, mode.id).not.toContain('fixture-draft');
    }
  });
});

describe('hard-coded gated links in the source', () => {
  it('counts the notes as a gated section, so a literal link to them must go through the notes helpers', () => {
    const roots = gatedRootsFromTools(TOOLS);
    expect(roots.has('notes')).toBe(true);
    expect(scanText('<a href="/notes">Notes</a>\n<a href={notesHref()}>Notes</a>', roots, ORIGINS).map((h) => h.line)).toEqual([1]);
  });

  it('finds hrefs, href properties, branches and location changes, never pageHref() or comments', () => {
    const src = [
      '<a href="/prepare">Prepare</a>',
      "const item = { label: 'x', href: '/standards/cascade' };",
      "<a href={open ? '/target-dates' : null}>x</a>",
      "<a href={pageHref('/prepare')}>ok</a>",
      "// <a href=\"/prepare\"> in a comment",
      "const match = ['/countries', '/map', '/target-dates'];",
      '<a href="https://example.org/standards">external</a>',
      `<a href="${ORIGIN}/prepare/check">own origin</a>`,
      "window.location.href = '/lab/readiness';",
      'html += `<a href="/prepare/guides/${id}">`;',
    ].join('\n');
    expect(scanText(src, ROOTS, ORIGINS).map((h) => [h.line, h.sink])).toEqual([
      [1, 'href'],
      [2, 'href'],
      [3, 'href'],
      [8, 'href'],
      [9, 'location.href'],
      [10, 'href'],
    ]);
  });

  it('names the component file and line when one is added, and honours the allow list', () => {
    const root = mkdtempSync(join(tmpdir(), 'site-src-'));
    mkdirSync(join(root, 'src/components'), { recursive: true });
    mkdirSync(join(root, 'src/components/lab/tools/fixture-ai'), { recursive: true });
    writeFileSync(join(root, 'src/components/Hero.astro'), '---\nconst a = 1;\n---\n<p>Intro</p>\n<a href="/prepare">Prepare</a>\n');
    writeFileSync(join(root, 'src/components/Nav.ts'), "const S = [\n  { href: '/standards', path: '/standards' },\n];\n");
    writeFileSync(join(root, 'src/components/lab/tools/fixture-ai/index.astro'), '<a href="/lab/fixture-ai">never built</a>\n');
    const allow = [{ file: 'src/components/Nav.ts', line: "{ href: '/standards', path: '/standards' },", reason: 'test' }];
    const found = scanSource(root, { tools: TOOLS, allow, origins: ORIGINS });
    expect(found.map((f) => `${f.file}:${f.line} ${f.level}`)).toEqual(['src/components/Hero.astro:5 error']);
  });

  it('finds none in the Atlas source today', () => {
    expect(scanSource().filter((f) => f.level !== 'warn')).toEqual([]);
  });
});

describe('Notion against the JSON copy', () => {
  it('fails on a profile whose timeline or date differs, and warns on documents', () => {
    const root = mkdtempSync(join(tmpdir(), 'site-mirror-'));
    mkdirSync(join(root, 'data/profiles'), { recursive: true });
    mkdirSync(join(root, 'data/results'), { recursive: true });
    writeFileSync(join(root, 'data/profiles/DEU.json'), JSON.stringify({ iso3: 'DEU', migrationTimeline: '2030 | first line', lastUpdated: '2026-06-25' }));
    writeFileSync(join(root, 'data/profiles/FRA.json'), JSON.stringify({ iso3: 'FRA', migrationTimeline: null, lastUpdated: '2026-06-01' }));
    writeFileSync(join(root, 'data/results/DEU.json'), JSON.stringify([{ title: 'A', country: 'DEU', year: 2025, url: 'https://example.org/a', included: true }]));
    const prop = (type, value) => (type === 'date' ? { type, date: { start: value } } : { type, [type]: [{ plain_text: value }] });
    const notionPage = (iso3, timeline, updated) => ({
      properties: { Country: prop('title', iso3), ISO3: prop('rich_text', iso3), 'Migration Timeline': prop('rich_text', timeline), 'Last Updated': prop('date', updated) },
    });
    const profiles = notionProfiles([notionPage('DEU', '2030 | first line', '2026-06-25T00:00:00.000Z'), notionPage('FRA', '2030 | a line', '2026-06-01')]);
    const findings = compareMirror({ profiles, documents: [{ title: 'A', country: 'DEU', year: 2026, url: 'https://example.org/a/' }], mirror, root });
    expect(findings.filter((f) => f.level === 'error').map((f) => f.file)).toEqual(['data/profiles/FRA.json']);
    expect(findings.filter((f) => f.level === 'warn').map((f) => f.rule)).toEqual([expect.stringContaining('year differs')]);
  });
});
