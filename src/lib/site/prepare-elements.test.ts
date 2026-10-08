import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../lab/load';
import { allPrivateRoot } from '../lab/registry-fixture';
import { loadReadiness } from '../lab/readiness-data';
import {
  APPROACH_ACTIONS,
  INVENTORY_ACTIONS,
  TEMPLATE_PATH,
  WHY_EVIDENCE,
  approachModel,
  beyondMenu,
  csvFiles,
  fillMilestones,
  guidePageModel,
  guidesModel,
  inventoryCsv,
  inventoryHeaders,
  inventoryModel,
  questionsFor,
  splitAudience,
  supplierQuestions,
  suppliersModel,
} from './prepare-elements';
import { csvText, decodeWorksheet, encodeWorksheet, worksheetCsv } from '../../components/site/pages/prepare-approach/worksheet';
import { letterText, readSources, sourcesValue } from '../../components/site/pages/prepare-suppliers/letter';

const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview' };
// the real registry with every tool private again (src/lib/lab/registry-fixture.ts): a flag
// state forces exactly the tools it names
const STAGE0 = allPrivateRoot();
const only = (ids: string) => ({ root: STAGE0, env: { ATLAS_OFFLINE: '1', VERCEL_ENV: 'production', ATLAS_FORCE_PUBLIC: ids } });
const preview = { env: PREVIEW };

const DASHES = new RegExp('[\\u2012-\\u2015]'); // the figure dash, en dash, em dash and horizontal bar
const readiness = loadReadiness(preview);
const readJson = (rel: string) => JSON.parse(readFileSync(join(projectRoot(), rel), 'utf8'));

describe('the inventory template', () => {
  it('is a header row only, with a byte-order mark and one CRLF line', () => {
    const csv = inventoryCsv(preview);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('');
  });

  it('names the guide and the place in it in every column header', () => {
    const headers = inventoryHeaders(preview);
    const names = readiness.frameworks.map((f) => f.shortLabel);
    expect(headers.length).toBeGreaterThan(10);
    for (const h of headers) {
      expect(names.some((n) => h.includes(`(${n}, `)), h).toBe(true);
      expect(DASHES.test(h), h).toBe(false);
    }
  });

  it('holds the Canadian per-system fields, the NCSC data fields and the route, and no CBOM column', () => {
    const headers = inventoryHeaders(preview).join('\n');
    expect(headers).toMatch(/^System \(Canadian roadmap, Section 3\.2/);
    expect(headers).toContain('Expected lifetime of the data (NCSC timelines');
    expect(headers).toContain('Value of the data to an adversary (NCSC timelines');
    expect(headers).not.toMatch(/standard format/i);
  });

  it('names the same five options and two cases in its Migration approach column as the approach page', () => {
    const route = inventoryHeaders(preview).find((h) => h.startsWith('Migration approach'));
    expect(route).toBeDefined();
    const { options, cases } = approachModel(preview);
    expect(options).toHaveLength(5);
    expect(cases).toHaveLength(2);
    for (const o of [...options, ...cases]) expect(route).toContain(o.label);
    expect(route).toMatch(/\(NCSC timelines, Planning your PQC migration, Migration strategy selection\)$/);
  });

  it('counts in its facts line only the guides that give the template a column', () => {
    const headers = inventoryHeaders(preview);
    const names = readiness.frameworks.map((f) => f.shortLabel);
    const columnGuides = new Set(headers.map((h) => names.find((n) => h.includes(`(${n}, `))));
    const m = inventoryModel(preview);
    expect(m.reads[0].label).toBe(`${headers.length} template columns from ${columnGuides.size} guides`);
    // the EU roadmap's advice on a standard format is shown on the page but is not a column
    expect(m.groups.some((g) => g.guide.id === 'eu-roadmap')).toBe(true);
    expect(columnGuides.has('EU roadmap')).toBe(false);
  });

  it('is generated only when the inventory is shown', () => {
    expect(csvFiles(preview)).toEqual([{ file: 'inventory-template', path: TEMPLATE_PATH }]);
    expect(csvFiles({ root: STAGE0, env: PRODUCTION })).toEqual([]);
    expect(csvFiles(only('readiness'))).toEqual([]);
    expect(csvFiles(only('inventory'))).toEqual([]); // the inventory needs the Readiness Check
    expect(csvFiles(only('inventory,readiness'))).toEqual([{ file: 'inventory-template', path: TEMPLATE_PATH }]);
  });

  it('links its download only when the file is built', () => {
    expect(inventoryModel(preview).csv?.href).toBe(TEMPLATE_PATH);
    expect(inventoryModel(only('inventory,readiness')).csv?.href).toBe(TEMPLATE_PATH);
  });

  it('opens with the Canadian advice to start with an incomplete inventory, and quotes every row', () => {
    const m = inventoryModel(preview);
    expect(m.start[0].quotes[0].text).toMatch(/initial, incomplete inventory/);
    expect(m.start[0].scope).toMatch(/Government of Canada/); // the advice is the Canadian roadmap's, with its scope
    for (const g of m.groups) for (const r of g.rows) expect(r.quotes.length, r.id).toBeGreaterThan(0);
    expect(m.groups.find((g) => g.guide.id === 'ca-roadmap')?.scope).toMatch(/Government of Canada/);
  });

  it('links back to each action it draws on, in the Readiness Check', () => {
    const m = inventoryModel(preview);
    const ids = m.groups.flatMap((g) => g.actions.map((a) => a.id));
    expect(ids.sort()).toEqual([...INVENTORY_ACTIONS].sort());
    for (const g of m.groups) for (const a of g.actions) expect(a.href).toBe(`/prepare/check?action=${a.id}`);
  });
});

describe('the migration approach, kept off the Atlas (Swann, 5 October 2026)', () => {
  const builds = [{ env: {} }, preview, { env: PRODUCTION }, only('readiness,inventory,approach,suppliers,exposure')];
  const LINK = /\/prepare\/approach|\/elsewhere/;

  it('is linked from no Prepare page in any build, the local one included', () => {
    for (const opts of builds) {
      const at = JSON.stringify(opts.env);
      const models = [
        inventoryModel(opts),
        suppliersModel(opts),
        guidesModel(opts),
        ...readiness.frameworks.map((f) => guidePageModel(f.id, opts)).filter(Boolean),
      ];
      for (const model of models) expect(JSON.stringify(model), at).not.toMatch(LINK);
      expect(beyondMenu([{ label: 'x', href: '/prepare/approach' }], opts)).toHaveLength(1); // the menu never lists it
    }
  }, 30_000);

  it('leaves the inventory template its Migration approach column, with no link and no link copy', () => {
    const m = inventoryModel({ env: {} });
    expect('approachHref' in m).toBe(false);
    expect(m.next.map((l) => l.label)).not.toContain('Choose a route for each system');
    const inventory = readJson('data/lab/prepare/elements-copy.json').copy.inventory;
    expect(inventory.approachLink).toBeUndefined();
    expect(inventory.nextApproach).toBeUndefined();
    const page = readFileSync(join(projectRoot(), 'src/components/site/pages/prepare-inventory/index.astro'), 'utf8');
    expect(page).not.toMatch(/approachHref|approachLink|nextApproach/);
    // the column stays, as a field of the inventory
    expect(inventoryHeaders({ env: {} }).some((h) => h.startsWith('Migration approach'))).toBe(true);
  });

  it('keeps its own code and copy, for its return', () => {
    expect(readJson('data/lab/prepare/elements-copy.json').copy.approach.question).toBeTruthy();
    expect(readFileSync(join(projectRoot(), 'src/components/site/pages/prepare-approach/index.astro'), 'utf8')).toMatch(/approachModel\(\)/);
  });
});

describe('the migration approach', () => {
  const m = approachModel(preview);

  it('sets out the NCSC five options and its two cases that need no choice', () => {
    expect(m.options.map((o) => o.id)).toEqual(['in-place', 're-platform', 'retire', 'run-to-end', 'tolerate']);
    expect(m.cases.map((o) => o.id).sort()).toEqual(['commodity', 'no-pkc']);
    for (const o of [...m.options, ...m.cases, ...m.legacy]) expect(o.quotes[0].url).toBe('https://www.ncsc.gov.uk/guidance/pqc-migration-timelines');
  });

  it('offers the worksheet the routes under the same heads, names and order as the explanation above it', () => {
    expect(m.choices.map((g) => g.group)).toEqual([m.copy.casesHead, m.copy.optionsHead]);
    expect(m.choices[0].items.map((o) => o.label)).toEqual(m.cases.map((o) => o.label));
    expect(m.choices[1].items.map((o) => o.label)).toEqual(m.options.map((o) => o.label));
    expect(Object.values(m.labels)).toEqual([...m.cases, ...m.options].map((o) => o.label));
  });

  it('names its one source once: the NCSC timelines, Migration strategy selection, linked to the document', () => {
    expect(m.source).toEqual({ name: 'NCSC timelines', where: 'Migration strategy selection', url: 'https://www.ncsc.gov.uk/guidance/pqc-migration-timelines', retrievedAt: '2026-10-01' });
    const page = readFileSync(join(projectRoot(), 'src/components/site/pages/prepare-approach/index.astro'), 'utf8');
    expect(page.match(/m\.source\.url/g)).toHaveLength(1);
    expect(page).toMatch(/reads=\{\[\]\}/); // no "Reads the NCSC timelines" in the head
    // explain first, then the worksheet, then the source
    const at = (id: string) => page.indexOf(`id="${id}"`);
    expect(at('ap-explain-h')).toBeGreaterThan(-1);
    expect(at('ap-explain-h')).toBeLessThan(at('pe-ws-h'));
    expect(at('pe-ws-h')).toBeLessThan(at('ap-source-h'));
  });

  it('quotes the action it comes from', () => {
    expect(m.actions.map((a) => a.id)).toEqual(APPROACH_ACTIONS);
    expect(m.actions[0].href).toBe('/prepare/check?action=ncsc-approach');
  });

  it('round-trips the worksheet through the hash', () => {
    const known = Object.keys(m.labels);
    const rows = [
      { name: 'Payroll', route: 'in-place' },
      { name: 'HR portal, v2: legacy', route: 'retire' },
      { name: 'Öffentliche Dienste #1 & co', route: null },
      { name: '', route: 'commodity' },
    ];
    const hash = encodeWorksheet(rows, known);
    expect(hash.startsWith('w=')).toBe(true);
    expect(decodeWorksheet(`#${hash}`, known)).toEqual(rows);
  });

  it('drops empty rows, unknown routes and broken escapes instead of failing', () => {
    const known = Object.keys(m.labels);
    expect(encodeWorksheet([{ name: '  ', route: null }], known)).toBe('');
    expect(decodeWorksheet('', known)).toBeNull();
    expect(decodeWorksheet('#f=eu-roadmap', known)).toBeNull();
    // the skip link's fragment holds no worksheet, so following it leaves the sheet as it is
    expect(decodeWorksheet('#main', known)).toBeNull();
    expect(decodeWorksheet('#w=', known)).toEqual([]);
    expect(decodeWorksheet('#w=A:nonsense,%E0%A4%A:retire,B:tolerate', known)).toEqual([
      { name: 'A', route: null },
      { name: 'B', route: 'tolerate' },
    ]);
  });

  it('downloads a CSV whose header names its source', () => {
    const csv = worksheetCsv([{ name: '=SUM(A1)', route: 'tolerate' }], m.labels, m.csvHeader);
    const [head, row] = csv.slice(1).split('\r\n');
    expect(head).toContain('NCSC timelines');
    expect(row).toBe("'=SUM(A1),Tolerate the risk");
  });
});

describe('the supplier letter', () => {
  const m = suppliersModel(preview);
  const all = supplierQuestions(preview);

  it('draws its questions from the supplier actions and the vendor sentences, each quoted', () => {
    const allowed = new Set([
      ...readiness.actions.filter((a) => a.domain === 'suppliers').map((a) => a.id),
      'cisa-discovery-tools',
      'ca-inventory-fields',
    ]);
    expect(all.length).toBeGreaterThan(10);
    for (const q of all) {
      expect(allowed.has(q.action.id), q.id).toBe(true);
      expect(q.guide).toBe(readiness.actions.find((a) => a.id === q.action.id)!.source);
      expect(q.quotes.length, q.id).toBeGreaterThan(0);
      expect(q.tag).toMatch(/^\(.+, .+\)$/);
      expect(q.action.href).toBe(`/prepare/check?action=${q.action.id}`);
      expect(DASHES.test(q.label), q.id).toBe(false);
    }
    // every one of the six supplier actions gives at least one question
    for (const a of readiness.actions.filter((x) => x.domain === 'suppliers')) expect(all.some((q) => q.action.id === a.id), a.id).toBe(true);
  });

  it('counts its questions and guides in digits in the facts line', () => {
    expect(m.reads[0].label).toBe(`${m.count} questions from ${m.guides.length} guides`);
  });

  it('tags a question with the guide and page, as in (CISA, NSA and NIST factsheet, p. 2)', () => {
    expect(all.some((q) => q.tag === '(CISA, NSA and NIST factsheet, p. 2)')).toBe(true);
  });

  it('shows only ANSSI questions for ?f=anssi-faq', () => {
    const known = m.guides.map((g) => g.id);
    const chosen = readSources('?f=anssi-faq', known, m.defaults);
    expect(chosen).toEqual(['anssi-faq']);
    const shown = questionsFor(chosen, preview);
    expect(shown.length).toBeGreaterThan(0);
    for (const q of shown) {
      expect(q.guide).toBe('anssi-faq');
      expect(q.lang).toBe('fr');
    }
  });

  it('opens on the EU roadmap and the NCSC timelines, and on them again when ?f= names no guide it has', () => {
    const known = m.guides.map((g) => g.id);
    expect(m.defaults).toEqual(['eu-roadmap', 'ncsc-timelines']);
    expect(readSources('', known, m.defaults)).toEqual(m.defaults);
    expect(readSources('?f=nl-handbook', known, m.defaults)).toEqual(m.defaults);
    expect(readSources('?f=cisa-factsheet,ca-roadmap', known, m.defaults)).toEqual(['ca-roadmap', 'cisa-factsheet']);
    expect(sourcesValue(['ncsc-timelines', 'eu-roadmap'], known)).toBe('eu-roadmap,ncsc-timelines');
  });

  it('fills the ANSSI purchasing year from its milestone, and drops a question whose milestone is missing', () => {
    const anssi = all.find((q) => q.id === 'anssi-purchasing');
    const year = readiness.frameworks.find((f) => f.id === 'anssi-faq')!.milestones.find((x) => x.id === 'anssi-2030')!.year;
    expect(anssi?.label).toContain(`from ${year}.`);
    expect(fillMilestones('from {milestone:none-such}', readiness.frameworks)).toBeNull();
  });

  it('writes a letter with no contact address, sender or sign-off', () => {
    const text = letterText({
      paragraph: m.copy.paragraph,
      groups: m.groups.map((g) => ({ head: g.head, questions: g.questions.map((q) => ({ label: q.label, tag: q.tag })) })),
      sourcesHead: m.copy.textSources,
      sources: m.guides.map((g) => ({ label: g.shortLabel, url: 'https://example.org/' })),
    });
    expect(text).not.toMatch(/@|mailto|ceps|yours (sincerely|faithfully)|kind regards|best regards/i);
    expect(text).toMatch(/^We are preparing/);
    expect(text).toMatch(/\n1\. /);
    expect(DASHES.test(text)).toBe(false);
  });

  it('keeps every visible string free of dashes, and the copy file holds no form or address', () => {
    const file = readJson('data/lab/prepare/elements-copy.json');
    const raw = JSON.stringify(file.copy);
    expect(DASHES.test(raw)).toBe(false);
    expect(raw).not.toMatch(/@|mailto|briefing/i);
  });
});

describe('the evidence', () => {
  it('gives every checked record an excerpt of at most 60 words', () => {
    for (const rel of ['data/lab/prepare/inventory.json', 'data/lab/prepare/approach.json', 'data/lab/prepare/elements-copy.json']) {
      const walk = (v: unknown): void => {
        if (Array.isArray(v)) return v.forEach(walk);
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          if (o.verify === false) {
            const prov = o.provenance as { excerpt: string }[];
            expect(prov.length, rel).toBeGreaterThan(0);
            for (const p of prov) expect(p.excerpt.trim().split(/\s+/).length, p.excerpt).toBeLessThanOrEqual(60);
          }
          Object.values(o).forEach(walk);
        }
      };
      walk(readJson(rel));
    }
  });

  it('drops nothing in preview: every question, field and note names an action or guide the Check has', () => {
    const file = readJson('data/lab/prepare/elements-copy.json');
    const actionIds = new Set(readiness.actions.map((a) => a.id));
    const guideIds = new Set(readiness.frameworks.map((f) => f.id));
    for (const key of Object.keys(file.questions)) expect(actionIds.has(key), key).toBe(true);
    const total = Object.values(file.questions as Record<string, unknown[]>).reduce((n, list) => n + list.length, 0);
    expect(supplierQuestions(preview)).toHaveLength(total);
    const inventory = readJson('data/lab/prepare/inventory.json');
    for (const x of [...inventory.fields, ...inventory.notes]) expect(guideIds.has(x.source), x.id).toBe(true);
    expect(inventoryModel(preview).groups.flatMap((g) => g.rows)).toHaveLength(inventory.fields.length);
    for (const id of [...INVENTORY_ACTIONS, ...APPROACH_ACTIONS]) expect(actionIds.has(id), id).toBe(true);
  });

  it('builds the same pages in production when a tool is forced public, with no lead dropped', () => {
    // the migration approach can no longer be forced public (site elsewhere); its model still reads its data the same way
    const env = only('readiness,inventory,suppliers');
    expect(inventoryModel(env).groups.flatMap((g) => g.rows)).toHaveLength(inventoryModel(preview).groups.flatMap((g) => g.rows).length);
    expect(supplierQuestions(env)).toHaveLength(supplierQuestions(preview).length);
    expect(approachModel(env).options).toHaveLength(5);
  });
});

// Every excerpt of six words or more that the pages hold, to check that no visible string repeats
// one: the source's own words are kept for review, never shown (Swann, 2 October 2026).
const rawReadiness = readJson('data/lab/readiness/readiness.json');
const excerpts: string[] = [];
const collect = (v: unknown): void => {
  if (Array.isArray(v)) return v.forEach(collect);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.excerpt === 'string' && o.excerpt.trim().split(/\s+/).length >= 6) excerpts.push(o.excerpt.trim());
    Object.values(o).forEach(collect);
  }
};
for (const rel of ['data/lab/readiness/readiness.json', 'data/lab/prepare/inventory.json', 'data/lab/prepare/approach.json', 'data/lab/prepare/elements-copy.json']) collect(readJson(rel));
const quotesNone = (label: string, strings: string[]) => {
  for (const s of strings) for (const e of excerpts) expect(s.includes(e), `${label}: "${s}" repeats an excerpt`).toBe(false);
};

describe('the guides', () => {
  const m = guidesModel(preview);

  it('lists every guide with its issuer, date, Status and Bindingness as two labels, audience, themes and document', () => {
    expect(m.guides.map((g) => g.id)).toEqual(readiness.frameworks.map((f) => f.id));
    expect(m.sources.length).toBeGreaterThanOrEqual(m.guides.length);
    for (const g of m.guides) {
      const f = rawReadiness.frameworks.find((x: { id: string }) => x.id === g.id);
      expect(g.status, g.id).toBe('Published');
      expect(['Guidance', 'Soft law']).toContain(g.bindingness);
      expect(g.status).not.toBe(g.bindingness);
      expect(g.writtenFor.startsWith('Written for '), g.id).toBe(true);
      expect(g.covers.length, g.id).toBeGreaterThan(0);
      expect(g.source?.url).toBe(f.provenance[0].url);
      expect(g.dateLine).toMatch(/^published (\d{1,2} )?[A-Z][a-z]+ \d{4}$|^publication date not recorded$/);
    }
  });

  it('keeps the source’s own words for an audience apart from the plain line', () => {
    expect(splitAudience('public and private organisations (organisations publiques et privées)', 'fr')).toEqual({
      plain: 'public and private organisations',
      own: 'organisations publiques et privées',
    });
    expect(splitAudience('organisations (with notes)', null).own).toBeNull();
    const anssi = m.guides.find((g) => g.id === 'anssi-faq')!;
    expect(anssi.writtenFor).toBe('Written for public and private organisations');
    expect(anssi.ownWords).toBe('organisations publiques et privées');
    expect(anssi.lang).toBe('fr');
  });

  it('shows no quoted words', () => {
    quotesNone('guides', [m.lede, ...m.guides.flatMap((g) => [g.writtenFor, ...g.covers])]);
  });

  it('gives each guide a page with its actions, its own target dates and its status phrase', () => {
    for (const f of readiness.frameworks) {
      const g = guidePageModel(f.id, preview)!;
      const own = readiness.actions.filter((a) => a.source === f.id);
      expect(g.covers.map((x) => x.id).sort(), f.id).toEqual(own.map((a) => a.id).sort());
      for (const x of g.covers) {
        expect(x.href).toBe(`/prepare/check?action=${x.id}`);
        expect(x.quotes.length, x.id).toBeGreaterThan(0);
        if (x.target) expect(f.milestones.some((ms) => x.target!.endsWith(String(ms.year))), x.id).toBe(true);
      }
      if (g.covers.some((x) => x.target)) expect(g.targetsNote, f.id).toMatch(/not a legal deadline\.$/);
      else expect(g.targetsNote).toBeNull();
      expect(g.labels.status).not.toBe(g.labels.bindingness);
      quotesNone(f.id, [g.lede, g.card.audience, ...g.covers.map((x) => x.label)]);
    }
    expect(guidePageModel('not-a-guide', preview)).toBeNull();
  });
});

describe('Where to go next beside the side menu', () => {
  // the Prepare side menu lists these pages in a preview build; no page offers one of them again
  const MENU = ['/prepare', '/prepare/check', '/prepare/exposure', '/prepare/inventory', '/prepare/suppliers', '/prepare/guides'];

  it('drops a row the side menu lists, and keeps a row that leaves Prepare or carries a state', () => {
    const rows = [
      { label: 'menu', href: '/prepare/guides' },
      { label: 'group', href: '/prepare/check?theme=planning' },
      { label: 'out', href: '/documents' },
      { label: 'unbuilt', href: null },
    ];
    expect(beyondMenu(rows, preview).map((r) => r.label)).toEqual(['group', 'out', 'unbuilt']);
  });

  it('leaves no menu page in any element page closing list', () => {
    const lists = [
      inventoryModel(preview).next,
      approachModel(preview).next,
      suppliersModel(preview).next,
      guidesModel(preview).next,
      ...readiness.frameworks.map((f) => guidePageModel(f.id, preview)!.next),
    ];
    for (const next of lists) {
      for (const l of next) expect(MENU, `${l.label}: ${l.href}`).not.toContain(l.href);
      expect(next.filter((l) => l.href).length, JSON.stringify(next)).toBeGreaterThan(0);
    }
  });

  it('links no page to Where the guides differ, which left the site (Swann, 4 October 2026)', () => {
    const lists = [
      inventoryModel(preview),
      approachModel(preview),
      suppliersModel(preview),
      guidesModel(preview),
      ...readiness.frameworks.map((f) => guidePageModel(f.id, preview)!),
    ];
    for (const m of lists) expect(JSON.stringify(m)).not.toMatch(/\/prepare\/differences|guides differ/i);
  });
});

describe('the source words', () => {
  it('reach a page only through SourceWords', () => {
    const dir = join(projectRoot(), 'src/components/site/pages');
    const own = ['prepare-guides', 'prepare-guide', 'prepare-inventory', 'prepare-approach', 'prepare-suppliers'];
    for (const folder of own) {
      for (const name of readdirSync(join(dir, folder)).filter((n: string) => n.endsWith('.astro'))) {
        const text = readFileSync(join(dir, folder, name), 'utf8');
        if (name === 'Words.astro' && folder === 'prepare-inventory') {
          expect(text).toMatch(/<SourceWords>[\s\S]*<blockquote[\s\S]*<\/SourceWords>/);
          continue;
        }
        // no quotation element and no excerpt (a quote's text) outside Words.astro
        expect(/<blockquote|<q[\s>]|\b(q|w|quote|quotes\[\d\])\.text\b/.test(text), `${folder}/${name}`).toBe(false);
      }
    }
  });

  it('leave every visible label and record in plain words', () => {
    const inv = inventoryModel(preview);
    quotesNone('inventory', [inv.lede, ...inv.start.map((s) => s.text), ...inv.groups.flatMap((g) => g.rows.flatMap((r) => [r.label, r.record]))]);
    const ap = approachModel(preview);
    quotesNone('approach', [ap.lede, ...[...ap.options, ...ap.cases, ...ap.legacy].flatMap((o) => [o.label, o.text])]);
    const su = suppliersModel(preview);
    quotesNone('suppliers', [su.lede, su.why!.text, su.intent!.text, ...su.groups.flatMap((g) => g.questions.map((q) => q.label))]);
  });
});

describe('the épuré pass (labs/review/epure-audit.md)', () => {
  const read = (rel: string) => readFileSync(join(projectRoot(), rel), 'utf8');

  it('says once that nothing leaves the page: beside the input, never again in About this view (finding 37)', () => {
    for (const rel of ['src/components/site/pages/prepare-approach/index.astro', 'src/components/site/pages/prepare-suppliers/index.astro', 'src/components/lab/tools/readiness/index.astro']) {
      expect(/^\s*local(\s|=|$)/m.test(read(rel)), rel).toBe(false);
    }
  });

  it('sets a source quotation off by indent and quotation marks, never by a left rule (finding 29)', () => {
    expect(read('src/components/site/pages/prepare-inventory/Words.astro')).toMatch(/<blockquote class="quote"/);
    for (const rel of ['src/styles/prepare-elements.css', 'src/styles/prepare.css', 'src/styles/lab-readiness.css']) {
      const css = read(rel).replace(/\/\*[\s\S]*?\*\//g, '');
      // the one left rule allowed is the current group's in Go to a group (--rule-current)
      const lefts = css.match(/border-left:[^;]+;/g) ?? [];
      expect(lefts.filter((l) => !/--rule-current|transparent/.test(l)), rel).toEqual([]);
      expect(/#[0-9a-f]{3,6}\b/i.test(css), `${rel}: a raw colour`).toBe(false);
    }
  });

  it('draws every list of links as an index, ink on a thin teal underline (Swann, 4 October 2026)', () => {
    for (const rel of [
      'src/components/site/pages/prepare-hub/index.astro',
      'src/components/site/pages/prepare-guides/index.astro',
      'src/components/site/pages/prepare-guide/index.astro',
      'src/components/site/pages/prepare-inventory/QuotedFrom.astro',
    ]) {
      expect(read(rel), rel).toMatch(/class="row-link"/);
    }
  });
});

describe('why ask your suppliers', () => {
  const m = suppliersModel(preview);

  it('rests every statement on records the page already holds', () => {
    const ids = new Set(supplierQuestions(preview).map((q) => q.id));
    for (const id of WHY_EVIDENCE.questions) expect(ids.has(id), id).toBe(true);
    for (const id of WHY_EVIDENCE.actions) expect(readiness.actions.some((a) => a.id === id), id).toBe(true);
    expect(m.why?.quotes.length).toBeGreaterThanOrEqual(WHY_EVIDENCE.questions.length);
  });

  it('is one paragraph with no date, no figure and no dash', () => {
    const text = m.why!.text;
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/\n/);
    expect(DASHES.test(text)).toBe(false);
  });

  it('names the statement of intent in plain words, with its source in brackets', () => {
    expect(m.intent?.tag).toBe('(NCSC timelines, Next steps)');
    expect(m.intent?.quotes.length).toBeGreaterThan(0);
  });
});

describe('csvText', () => {
  it('quotes cells with commas and quotation marks', () => {
    expect(csvText([['a, b', 'say "x"']])).toBe('﻿"a, b","say ""x"""\r\n');
  });
});
