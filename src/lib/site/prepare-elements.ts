// qscatlas.org: what the Prepare element pages show (spec 5.2): the inventory template
// (/prepare/inventory and /prepare/inventory-template.csv), the supplier letter
// (/prepare/suppliers) and the guides (/prepare/guides and /prepare/guides/{id}); and the migration
// approach, taken off the Atlas on 5 October 2026 (Swann) and kept, unlinked, at
// /elsewhere/approach on his machine only. No Atlas page links to it.
//
// Every field, option, case and question comes from data/lab/prepare/inventory.json,
// approach.json and elements-copy.json, each record carrying the source's own words read at the
// source; every visible string comes from elements-copy.json. The guides, the actions they come
// from and who each guide is written for come from the Readiness Check's data (readiness-data.ts),
// so a guide's name, an action's label and a date are each kept once. In production loadDataset drops any record still marked verify: true, and a
// question whose action or guide was dropped goes with it.
//
// A source's own words are kept for review, never shown to visitors (Swann, 2 October 2026): the
// models still carry them as quotes, and the pages render them only inside SourceWords, which a
// production build leaves out. Every item a visitor sees has a plain label of the Atlas's own.
//
// Every link goes through link() or pageHref(), which give null for a page this build does not
// make; a component renders nothing for null. Nothing here counts, scores or ranks anything: the
// counts in the facts lines are an inventory of what the page holds.

import { ApproachFileSchema, ElementsCopyFileSchema, InventoryFileSchema } from '../lab/schema';
import { latestVerifiedAt, loadDataset } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { DEFAULT_SOURCES, loadReadiness, readReadiness } from '../lab/readiness-data';
import type { ReadinessData } from '../lab/readiness-data';
import { formatDate } from '../lab/format';
import type { SourceEntry } from '../lab/format';
import type { RdAction, RdFramework, RdMilestone, RdProvenance } from '../lab/readiness';
import { INSTRUMENT_STATUS_META } from '../regulation';
import type { InstrumentStatus } from '../regulation';
import { link, pageHref } from './gates';
import { guideRecords, nameInSentence, placeName } from './joins';
import { builtFiles, sectionMenu } from './routes';
import { csvText } from '../../components/site/pages/prepare-approach/worksheet';

export type { LoadOptions };

const DIR = 'data/lab/prepare';
export const TEMPLATE_PATH = '/prepare/inventory-template.csv';

type Copy = Record<string, string>;

// ---- shapes the pages render ----------------------------------------------------------

export interface Link {
  label: string;
  href: string | null; // null: the page is not built, and the link is not rendered
}

/**
 * Where to go next on a Prepare page, less every row the Prepare side menu beside it already
 * lists (épuré audit, finding 11): a page is never offered twice in one view. A row stays when it
 * leaves Prepare, or carries what the menu's plain entry does not (a group, an action, a guide
 * chosen, a place in a page), because its address then differs from the menu's.
 */
export function beyondMenu<T extends { href: string | null }>(next: T[], opts: LoadOptions = {}): T[] {
  const listed = new Set(sectionMenu('prepare', '/prepare', opts).map((e) => e.href));
  return next.filter((l) => l.href === null || !listed.has(l.href));
}

/** A source's own words, with where they were read. */
export interface Quote {
  text: string;
  url: string;
  title: string | null;
  publisher: string | null;
  locator: string | null;
  retrievedAt: string;
  lang: string | null; // "fr" for ANSSI; null for English
}

/** A guide a page quotes, as the Readiness Check names it. */
export interface GuideRef {
  id: string;
  shortLabel: string; // "Canadian roadmap"
  label: string; // the title in its own language
  issuer: string;
  audience: string;
  href: string | null; // its guide page, when built
}

/** An action of the Readiness Check that a page draws on: "Quoted from" and back. */
export interface ActionRef {
  id: string;
  label: string;
  guide: string; // the guide's short label
  href: string | null; // /prepare/check?action={id}
  audienceNote: string | null;
}

// ---- shared helpers -------------------------------------------------------------------

/** "{n} questions" with n filled in; an unknown key is left as it is. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z0-9:-]+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items: string[], and = 'and'): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A count as the reading copy writes it: words up to ten, figures above. */
export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

function langOf(url: string): string | null {
  return /cyber\.gouv\.fr/.test(url) ? 'fr' : null;
}

/** The source's own words of some provenance records, each with where it was read; a record without words gives none. */
function quotesOf(provenance: RdProvenance[]): Quote[] {
  return provenance
    .filter((p): p is RdProvenance & { excerpt: string } => typeof p.excerpt === 'string' && p.excerpt.length > 0)
    .map((p) => ({
      text: p.excerpt,
      url: p.url,
      title: p.title ?? null,
      publisher: p.publisher ?? null,
      locator: p.locator ?? null,
      retrievedAt: p.retrievedAt,
      lang: langOf(p.url),
    }));
}

/** The data every element reads, once per build (and again when a file changes in dev). */
interface ElementsData {
  copy: { common: Copy; inventory: Copy; approach: Copy; suppliers: Copy; groups: Copy; status: Copy; guides: Copy; guide: Copy };
  file: ReturnType<typeof readCopyFile>;
  readiness: ReadinessData;
}

function readCopyFile(opts: LoadOptions) {
  return loadDataset(`${DIR}/elements-copy.json`, ElementsCopyFileSchema, opts);
}

function section(file: ReturnType<typeof readCopyFile>, key: string): Copy {
  const v = file.copy[key];
  return v && typeof v === 'object' ? (v as Copy) : {};
}

function elementsData(opts: LoadOptions): ElementsData {
  const file = readCopyFile(opts);
  return {
    copy: {
      common: section(file, 'common'),
      inventory: section(file, 'inventory'),
      approach: section(file, 'approach'),
      suppliers: section(file, 'suppliers'),
      groups: section(file, 'groups'),
      status: section(file, 'status'),
      guides: section(file, 'guides'),
      guide: section(file, 'guide'),
    },
    file,
    readiness: loadReadiness(opts),
  };
}

function guideRef(f: RdFramework, opts: LoadOptions): GuideRef {
  return {
    id: f.id,
    shortLabel: f.shortLabel,
    label: f.label,
    issuer: f.issuer,
    audience: f.audience,
    href: pageHref(`/prepare/guides/${f.id}`, opts),
  };
}

function actionRef(a: RdAction, frameworks: RdFramework[], opts: LoadOptions): ActionRef {
  return {
    id: a.id,
    label: a.label,
    guide: frameworks.find((f) => f.id === a.source)?.shortLabel ?? a.source,
    href: link('readiness', { query: { action: a.id } }, opts),
    audienceNote: a.audienceNote,
  };
}

/**
 * The sources a page lists in About this view: one entry per document its quotations come from,
 * in the order first quoted, each with the date printed on the document where the Readiness
 * Check records one.
 */
function sourcesFor(quotes: Quote[], readiness: ReadinessData): SourceEntry[] {
  const known = new Map(readiness.sources.filter((s) => s.url).map((s) => [s.url as string, s]));
  const out: SourceEntry[] = [];
  const seen = new Set<string>();
  for (const q of quotes) {
    if (seen.has(q.url)) continue;
    seen.add(q.url);
    out.push(known.get(q.url) ?? { author: q.publisher ?? q.title ?? q.url, date: null, title: q.title ?? q.url, url: q.url, retrievedAt: q.retrievedAt });
  }
  return out;
}

/**
 * How a page names a document in short: a guide's own document by the guide's short name ("NCSC
 * timelines"), any other (the EU roadmap's FAQ) by its title as the source gives it.
 */
function docName(q: Pick<Quote, 'url' | 'title' | 'publisher'>, opts: LoadOptions): string {
  const own = readReadiness(opts).frameworks.find((f) => f.provenance[0]?.url === q.url);
  return own?.shortLabel ?? q.title ?? q.publisher ?? q.url;
}

// ---- the inventory template -------------------------------------------------------------

export interface InventoryRow {
  id: string;
  label: string;
  record: string;
  locator: string;
  column: boolean;
  n: number | null; // its place among the template's columns, from 1; null for advice on the whole inventory
  quotes: Quote[];
}

export interface InventoryGroup {
  guide: GuideRef;
  head: string;
  where: string | null; // the place in the guide every row of the group comes from, when they share one
  doc: { url: string; retrievedAt: string } | null; // the document the group quotes
  scope: string | null; // "Written for Government of Canada departments..." where the action says so
  rows: InventoryRow[];
  actions: ActionRef[]; // In the Readiness Check
}

export interface InventoryModel {
  copy: Copy;
  common: Copy;
  lede: string;
  description: string;
  reads: Link[];
  asOf: string | null;
  start: { text: string; tag: string; scope: string | null; quotes: Quote[] }[];
  groups: InventoryGroup[];
  actions: ActionRef[]; // every action the groups draw on, once each
  columns: number;
  csv: { href: string; filename: string } | null;
  next: Link[];
  sources: SourceEntry[];
  method: string[];
}

// The Readiness Check actions the inventory draws on, in the order the page shows them.
export const INVENTORY_ACTIONS = ['ca-inventory-fields', 'ncsc-data-record', 'ncsc-approach', 'eu-inventory'];
export const APPROACH_ACTIONS = ['ncsc-approach'];

function readInventory(opts: LoadOptions) {
  return loadDataset(`${DIR}/inventory.json`, InventoryFileSchema, opts);
}
function readApproach(opts: LoadOptions) {
  return loadDataset(`${DIR}/approach.json`, ApproachFileSchema, opts);
}

/**
 * The template's column headers: each field's label, then its guide and where in the guide. The
 * Migration approach column also lists the values it takes: the NCSC's five options and its two
 * cases that need no choice, the same seven the approach page's worksheet offers (that page is
 * kept off the Atlas; the column stays, as a field of the inventory). They are separated by
 * semicolons, because the cases' own names hold a colon.
 */
export function inventoryHeaders(opts: LoadOptions = {}): string[] {
  const data = elementsData(opts);
  const file = readInventory(opts);
  const approach = readApproach(opts);
  const c = data.copy.inventory;
  const guides = new Map(data.readiness.frameworks.map((f) => [f.id, f]));
  const options = approach.options.map((o) => o.label);
  const cases = approach.notes.filter((n) => n.noChoice).map((n) => n.label ?? n.id);
  return file.fields
    .filter((f) => f.column && guides.has(f.source))
    .map((f) => {
      const guide = guides.get(f.source)!.shortLabel;
      const template = f.id === 'approach' && options.length ? c.csvApproach : c.csvHeader;
      return fill(template, {
        label: f.label,
        guide,
        locator: f.locator,
        options: options.join('; '),
        optionCount: countWord(options.length),
        cases: cases.join('; '),
        caseCount: countWord(cases.length),
      });
    });
}

/** The template itself: one header row, no example rows (they would be invented data). */
export function inventoryCsv(opts: LoadOptions = {}): string {
  return csvText([inventoryHeaders(opts)]);
}

/**
 * The CSV files this build generates under /prepare: the inventory template when the inventory
 * is shown, and nothing otherwise. src/pages/prepare/[file].csv.ts builds exactly these.
 */
export function csvFiles(opts: LoadOptions = {}): { file: string; path: string }[] {
  return builtFiles(opts)
    .filter((f) => f.path === TEMPLATE_PATH)
    .map((f) => ({ file: f.path.replace(/^\/prepare\//, '').replace(/\.csv$/, ''), path: f.path }));
}

export function inventoryModel(opts: LoadOptions = {}): InventoryModel {
  const data = elementsData(opts);
  const file = readInventory(opts);
  const c = data.copy.inventory;
  const { frameworks, actions } = data.readiness;
  const guides = new Map(frameworks.map((f) => [f.id, f]));

  // the inventory actions of one guide, and the scope line one of them states ("Written for
  // Government of Canada departments and agencies, for non-classified systems.")
  const ownActions = (id: string) =>
    INVENTORY_ACTIONS.map((a) => actions.find((x) => x.id === a)).filter((a): a is RdAction => Boolean(a) && a!.source === id);
  const scopeOf = (id: string) => ownActions(id).find((a) => a.audienceNote)?.audienceNote ?? null;

  // the template's columns, numbered in the order the CSV gives them (a guide whose only field is
  // advice on the inventory as a whole, as the EU roadmap's is, gives no column)
  const columnFields = file.fields.filter((x) => x.column && guides.has(x.source));
  const columnNo = new Map(columnFields.map((x, i) => [x.id, i + 1]));
  const columns = columnFields.length;
  const columnGuides = new Set(columnFields.map((x) => x.source)).size;

  // fields grouped by guide, in the order the file first names each guide
  const order: string[] = [];
  for (const f of file.fields) if (guides.has(f.source) && !order.includes(f.source)) order.push(f.source);
  const groups: InventoryGroup[] = order.map((id) => {
    const f = guides.get(id)!;
    const rows = file.fields
      .filter((x) => x.source === id)
      .map((x) => ({ id: x.id, label: x.label, record: x.record, locator: x.locator, column: x.column, n: columnNo.get(x.id) ?? null, quotes: quotesOf(x.provenance) }));
    const locators = new Set(rows.map((r) => r.locator));
    const first = rows[0]?.quotes[0] ?? null;
    return {
      guide: guideRef(f, opts),
      head: fill(c.groupHead, { guide: f.shortLabel }),
      where: locators.size === 1 ? [...locators][0] : null,
      doc: first ? { url: first.url, retrievedAt: first.retrievedAt } : null,
      scope: scopeOf(id),
      rows,
      actions: ownActions(id).map((a) => actionRef(a, frameworks, opts)),
    };
  });

  const href = pageHref(TEMPLATE_PATH, opts);
  const names = groups.map((g) => `the ${g.guide.shortLabel}`);
  // the advice the page opens with, tagged with its guide and the place in it, as a question is
  const start = file.notes
    .filter((n) => guides.has(n.source))
    .map((n) => {
      const quotes = quotesOf(n.provenance);
      const where = quotes[0]?.locator ?? null;
      const tag = `(${[guides.get(n.source)!.shortLabel, where].filter(Boolean).join(', ')})`;
      return { text: n.text, tag, scope: scopeOf(n.source), quotes };
    });
  const allQuotes = [...start.flatMap((s) => s.quotes), ...groups.flatMap((g) => g.rows.flatMap((r) => r.quotes))];
  const allActions = groups.flatMap((g) => g.actions).filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i);

  return {
    copy: c,
    common: data.copy.common,
    lede: fill(c.lede, { guides: countWord(groups.length), names: joinAnd(names) }),
    description: c.description,
    reads: [{ label: fill(c.reads, { columns, guides: columnGuides }), href: null }],
    asOf: latestVerifiedAt(file),
    start,
    groups,
    actions: allActions,
    columns,
    csv: href ? { href, filename: c.filename } : null,
    next: beyondMenu(
      [
        { label: c.nextGuide, href: pageHref('/prepare/guides/ca-roadmap', opts) },
        { label: c.nextCheck, href: link('readiness', { query: { theme: 'discovery' } }, opts) },
      ],
      opts,
    ),
    sources: sourcesFor(allQuotes, data.readiness),
    method: [c.method1, c.method2].filter(Boolean),
  };
}

// ---- the migration approach -------------------------------------------------------------
// Kept for its return: the page at /elsewhere/approach, built on Swann's machine only (site
// "elsewhere" in data/lab/tools.json), reads this model. No Atlas page links to it.

export interface ApproachItem {
  id: string;
  label: string;
  text: string; // the Atlas's plain summary
  quotes: Quote[];
}

export interface ApproachModel {
  copy: Copy;
  common: Copy;
  guide: GuideRef | null;
  lede: string;
  description: string;
  writtenFor: string | null;
  asOf: string | null;
  // the one source line: the guide's short name linked to its document, the place in it and the
  // day it was read; every option, case and note comes from that one section
  source: { name: string; where: string | null; url: string; retrievedAt: string } | null;
  intro: Quote[]; // the NCSC's "decide on an approach for each system"
  options: ApproachItem[];
  cases: ApproachItem[];
  legacy: ApproachItem[];
  // the worksheet's choices, grouped and ordered as the explanation above it: the two cases that
  // need no choice, then the five options, each group under the same head as in the explanation
  choices: { group: string; items: { id: string; label: string }[] }[];
  labels: Record<string, string>; // id to label, for the worksheet's CSV and print
  csvHeader: [string, string];
  actions: ActionRef[];
  inventoryHref: string | null;
  next: Link[];
  sources: SourceEntry[];
  method: string[];
}

export function approachModel(opts: LoadOptions = {}): ApproachModel {
  const data = elementsData(opts);
  const file = readApproach(opts);
  const c = data.copy.approach;
  const { frameworks, actions } = data.readiness;
  const ncsc = frameworks.find((f) => f.id === 'ncsc-timelines') ?? null;
  const guide = ncsc ? guideRef(ncsc, opts) : null;
  const own = APPROACH_ACTIONS.map((a) => actions.find((x) => x.id === a)).filter((a): a is RdAction => Boolean(a));
  const locator = file.options[0]?.provenance[0]?.locator ?? '';
  const where = locator.split(', ').pop() ?? locator;

  const options = file.options.map((o) => ({ id: o.id, label: o.label, text: o.summary, quotes: quotesOf(o.provenance) }));
  const cases = file.notes.filter((n) => n.noChoice).map((n) => ({ id: n.id, label: n.label ?? n.id, text: n.text, quotes: quotesOf(n.provenance) }));
  const legacy = file.notes.filter((n) => !n.noChoice).map((n) => ({ id: n.id, label: n.label ?? '', text: n.text, quotes: quotesOf(n.provenance) }));
  const intro = own.length ? quotesOf(own[0].provenance) : [];
  const labels = Object.fromEntries([...cases, ...options].map((o) => [o.id, o.label]));
  const allQuotes = [...intro, ...cases.flatMap((o) => o.quotes), ...options.flatMap((o) => o.quotes), ...legacy.flatMap((o) => o.quotes)];
  const first = options[0]?.quotes[0] ?? intro[0] ?? null;

  return {
    copy: c,
    common: data.copy.common,
    guide,
    lede: c.lede,
    description: c.description,
    writtenFor: ncsc?.audience ?? null,
    asOf: latestVerifiedAt(file),
    source: first ? { name: guide?.shortLabel ?? first.publisher ?? first.url, where: where || null, url: first.url, retrievedAt: first.retrievedAt } : null,
    intro,
    options,
    cases,
    legacy,
    choices: [
      { group: c.casesHead, items: cases.map((o) => ({ id: o.id, label: o.label })) },
      { group: c.optionsHead, items: options.map((o) => ({ id: o.id, label: o.label })) },
    ].filter((g) => g.items.length > 0),
    labels,
    csvHeader: [c.csvSystem, fill(c.csvRoute, { guide: guide?.shortLabel ?? '', locator: where })],
    actions: own.map((a) => actionRef(a, frameworks, opts)),
    inventoryHref: link('inventory', {}, opts),
    next: beyondMenu(
      [
        { label: c.nextInventory, href: link('inventory', {}, opts) },
        { label: c.nextGuide, href: pageHref('/prepare/guides/ncsc-timelines', opts) },
        { label: c.nextCheck, href: link('readiness', { query: { theme: 'planning' } }, opts) },
      ],
      opts,
    ),
    sources: sourcesFor(allQuotes, data.readiness),
    method: [c.method1, c.method2].filter(Boolean),
  };
}

// ---- the supplier letter -------------------------------------------------------------------

export const SUPPLIER_GROUP_ORDER = ['plans', 'inside', 'contracts', 'updates'] as const;

/**
 * The records the supplier letter's "Why ask your suppliers" paragraph (copy.suppliers.why) rests
 * on, in the order the paragraph uses them: the questions whose excerpts it draws on, then the
 * Readiness Check actions. Every statement in the paragraph is one of these excerpts in plain
 * words; the page shows the excerpts under the paragraph for review, and the test checks that
 * each id still resolves. Change the paragraph and this list together.
 */
export const WHY_EVIDENCE = {
  questions: ['ncsc-managed', 'cisa-embedded', 'anssi-renewal', 'cisa-signatures', 'cisa-cloud', 'cisa-cots', 'eu-roadmap', 'ncsc-updates', 'cisa-contracts'],
  actions: ['ca-procurement'],
};

export interface Question {
  id: string;
  action: ActionRef;
  guide: string; // the guide id: the letter's chooser filters on it
  group: string;
  label: string; // the question, with any {milestone:id} filled in
  tag: string; // "(CISA, NSA and NIST factsheet, p. 2)"
  quotes: Quote[];
  lang: string | null; // the language of the source's words
}

export interface SuppliersModel {
  copy: Copy;
  common: Copy;
  lede: string;
  description: string;
  reads: Link[];
  asOf: string | null;
  standingNote: string | null;
  guides: GuideRef[]; // the guides with at least one question, in the Check's order
  defaults: string[];
  chooserHint: string;
  groups: { id: string; head: string; questions: Question[] }[];
  count: number;
  why: { head: string; text: string; quotes: Quote[] } | null; // why ask suppliers at all
  intent: { text: string; tag: string; quotes: Quote[] } | null; // the NCSC's statement of intent, in plain words

  next: Link[];
  checkHref: string | null; // the Check's suppliers theme; the page carries the chosen guides in its hash
  sources: SourceEntry[];
  method: string[];
}

/** "{milestone:anssi-2030}" filled with that milestone's year; null when any milestone is missing. */
export function fillMilestones(label: string, frameworks: RdFramework[]): string | null {
  let missing = false;
  const out = label.replace(/\{milestone:([a-z0-9-]+)\}/g, (_m, id: string) => {
    for (const f of frameworks) {
      const m = f.milestones.find((x) => x.id === id);
      if (m) return String(m.year);
    }
    missing = true;
    return '';
  });
  return missing ? null : out;
}

/** Every question the letter can hold, in the Check's guide order and the file's order within a guide. */
export function supplierQuestions(opts: LoadOptions = {}): Question[] {
  const data = elementsData(opts);
  const { frameworks, actions } = data.readiness;
  const out: Question[] = [];
  for (const [actionId, list] of Object.entries(data.file.questions)) {
    const action = actions.find((a) => a.id === actionId);
    if (!action) continue; // a lead in production, or an id the Check no longer has
    const guide = frameworks.find((f) => f.id === action.source);
    if (!guide) continue;
    for (const q of list) {
      const label = fillMilestones(q.label, frameworks);
      if (label === null) continue;
      const quotes = quotesOf(q.provenance);
      out.push({
        id: q.id,
        action: actionRef(action, frameworks, opts),
        guide: guide.id,
        group: q.group,
        label,
        tag: `(${guide.shortLabel}, ${q.cite})`,
        quotes,
        lang: quotes[0]?.lang ?? null,
      });
    }
  }
  const rank = new Map(frameworks.map((f, i) => [f.id, i]));
  return out.map((q, i) => ({ q, i })).sort((a, b) => (rank.get(a.q.guide)! - rank.get(b.q.guide)!) || a.i - b.i).map((x) => x.q);
}

/** The questions the letter shows for a choice of guides (the server's mirror of the page's filter). */
export function questionsFor(chosen: string[], opts: LoadOptions = {}): Question[] {
  return supplierQuestions(opts).filter((q) => chosen.includes(q.guide));
}

export function suppliersModel(opts: LoadOptions = {}): SuppliersModel {
  const data = elementsData(opts);
  const c = data.copy.suppliers;
  const { frameworks } = data.readiness;
  const questions = supplierQuestions(opts);
  const withQuestions = new Set(questions.map((q) => q.guide));
  const guides = frameworks.filter((f) => withQuestions.has(f.id)).map((f) => guideRef(f, opts));
  const defaults = DEFAULT_SOURCES.filter((id) => withQuestions.has(id));
  const defaultNames = defaults.map((id) => `the ${frameworks.find((f) => f.id === id)!.shortLabel}`);
  const groups = SUPPLIER_GROUP_ORDER.map((id) => ({ id, head: data.copy.groups[id] ?? id, questions: questions.filter((q) => q.group === id) })).filter((g) => g.questions.length > 0);
  // the NCSC's statement of intent, in the Atlas's plain words, tagged with its guide and place
  const note = data.file.notes.find((n) => n.id === 'ncsc-intent');
  const intentQuotes = note ? quotesOf(note.provenance) : [];
  const intentDoc = intentQuotes[0] ? docName(intentQuotes[0], opts) : null;
  const intent = note && c.intentText ? { text: c.intentText, tag: `(${[intentDoc, note.cite].filter(Boolean).join(', ')})`, quotes: intentQuotes } : null;
  // why ask at all: the paragraph and the excerpts it rests on, each once
  const whyQuotes = [
    ...WHY_EVIDENCE.questions.flatMap((id) => questions.find((q) => q.id === id)?.quotes ?? []),
    ...WHY_EVIDENCE.actions.flatMap((id) => quotesOf(data.readiness.actions.find((a) => a.id === id)?.provenance ?? [])),
  ].filter((q, i, all) => all.findIndex((x) => x.text === q.text) === i);
  const why = c.why ? { head: c.whyHead, text: c.why, quotes: whyQuotes } : null;
  const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return {
    copy: c,
    common: data.copy.common,
    lede: fill(c.lede, { guides: countWord(guides.length) }),
    description: c.description,
    reads: [{ label: fill(c.reads, { questions: questions.length, guides: guides.length }), href: pageHref('/prepare/guides', opts) }],
    asOf: latestVerifiedAt(data.file.questions),
    standingNote: (data.readiness.copy.targetsNote as string | undefined) ?? null,
    guides,
    defaults,
    chooserHint: defaults.length ? fill(c.chooserHint, { guides: capital(joinAnd(defaultNames)) }) : '',
    groups,
    count: questions.length,
    why,
    intent,
    next: beyondMenu(
      [
        { label: c.nextCheck, href: link('readiness', { query: { theme: 'suppliers' } }, opts) },
        { label: c.nextGuides, href: pageHref('/prepare/guides', opts) },
        { label: c.nextInventory, href: link('inventory', {}, opts) },
      ],
      opts,
    ),
    checkHref: link('readiness', { query: { theme: 'suppliers' } }, opts),
    sources: sourcesFor([...questions.flatMap((q) => q.quotes), ...intentQuotes, ...whyQuotes], data.readiness),
    method: [c.method1, c.method2].filter(Boolean),
  };
}

// ---- the guides ------------------------------------------------------------------------------
// /prepare/guides and /prepare/guides/{id}: each guide's name, issuer and date, Status and
// Bindingness as two separate labels, who it is written for in one line, what it covers and a
// link to its document. No quoted words reach a visitor: who a guide is written for is the
// Readiness Check's plain audience, and the source's own words for it (the French in brackets
// for ANSSI) are kept apart for review.

/** A guide as the guides list and its own page show it. */
export interface GuideCard {
  id: string;
  href: string | null; // its own page, when built
  title: string; // in its own language
  lang: string | null; // "fr" for ANSSI
  shortLabel: string;
  issuer: string;
  dateLine: string; // "published 11 June 2025", or "publication date not recorded"
  status: string; // where the document stands: "Published"
  bindingness: string; // how far it binds anyone, a separate label: "Guidance"
  audience: string; // who it is written for, in the Atlas's plain words: "public and private organisations"
  writtenFor: string; // "Written for public and private organisations"
  ownWords: string | null; // the source's own words for its audience, for review only
  covers: string[]; // the themes of the actions Prepare draws from it, in the Check's order
  source: { url: string; title: string } | null; // its own document
}

export interface GuidesModel {
  copy: Copy;
  common: Copy;
  h1: string;
  lede: string;
  reads: Link[];
  asOf: string | null;
  guides: GuideCard[];
  sources: SourceEntry[];
  next: Link[];
}

/**
 * Who a guide is written for, split into the Atlas's plain words and the source's own: a guide in
 * another language gives its audience in English with its own words in brackets,
 * "public and private organisations (organisations publiques et privées)".
 */
export function splitAudience(audience: string, lang: string | null): { plain: string; own: string | null } {
  const m = lang ? /^(.*?)\s*\(([^()]+)\)\s*$/.exec(audience) : null;
  return m ? { plain: m[1], own: m[2] } : { plain: audience, own: null };
}

type RawReadiness = ReturnType<typeof readReadiness>;

/** Every document address quoted under a value of readiness.json, in the order first met. */
function urlsIn(value: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.url === 'string' && typeof o.excerpt === 'string' && !out.includes(o.url)) out.push(o.url);
      Object.values(o).forEach(visit);
    }
  };
  visit(value);
  return out;
}

/** The reference entries of About this view for some documents, in the order given. */
function sourcesAt(urls: string[], readiness: ReadinessData): SourceEntry[] {
  const known = new Map(readiness.sources.map((s) => [s.url, s]));
  return urls.map((u) => known.get(u)).filter((s): s is SourceEntry => Boolean(s));
}

/**
 * The documents a guide is quoted from: its own, its targets' and its actions'. The positions on
 * which the guides differ stay in readiness.json but are no longer shown (Swann, 4 October 2026),
 * so no page lists a document for them.
 */
function guideUrls(id: string, raw: RawReadiness): string[] {
  const f = raw.frameworks.find((x) => x.id === id);
  if (!f) return [];
  return urlsIn([f.provenance, f.milestones, raw.actions.filter((a) => a.source === id)]);
}

function guideCard(f: RdFramework, data: ElementsData, raw: RawReadiness, opts: LoadOptions): GuideCard {
  const c = data.copy.guides;
  const own = raw.frameworks.find((x) => x.id === f.id)?.provenance[0] ?? null;
  const lang = own ? langOf(own.url) : null;
  const audience = splitAudience(f.audience, lang);
  const acts = data.readiness.actions.filter((a) => a.source === f.id);
  return {
    id: f.id,
    href: pageHref(`/prepare/guides/${f.id}`, opts),
    title: f.label,
    lang,
    shortLabel: f.shortLabel,
    issuer: f.issuer,
    dateLine: f.published ? fill(c.published, { date: formatDate(f.published) }) : c.dateNone,
    status: data.copy.status[f.status] ?? f.status,
    bindingness: INSTRUMENT_STATUS_META[f.bindingness as InstrumentStatus]?.label ?? f.bindingness,
    audience: audience.plain,
    writtenFor: fill(c.writtenFor, { audience: audience.plain }),
    ownWords: audience.own,
    covers: data.readiness.domains.filter((d) => acts.some((a) => a.domain === d.id)).map((d) => d.label),
    source: own ? { url: own.url, title: own.title ?? f.label } : null,
  };
}

export function guidesModel(opts: LoadOptions = {}): GuidesModel {
  const data = elementsData(opts);
  const raw = readReadiness(opts);
  const c = data.copy.guides;
  const { frameworks, actions } = data.readiness;
  const guides = frameworks.map((f) => guideCard(f, data, raw, opts));
  const urls = urlsIn([raw.frameworks, raw.actions]);
  return {
    copy: c,
    common: data.copy.common,
    h1: c.h1,
    lede: fill(c.lede, { count: countWord(guides.length) }),
    reads: [
      { label: fill(c.factGuides, { n: guides.length }), href: null },
      { label: fill(c.factDocuments, { n: urls.length }), href: null },
      { label: fill(c.factActions, { n: actions.length }), href: link('readiness', {}, opts) },
    ],
    asOf: data.readiness.asOf,
    guides,
    sources: sourcesAt(urls, data.readiness),
    next: beyondMenu(
      [
        { label: c.nextCheck, href: link('readiness', {}, opts) },
        { label: c.nextDocuments, href: pageHref('/documents', opts) },
      ],
      opts,
    ),
  };
}

/** An action Prepare draws from a guide, as the guide's page lists it under What it covers. */
export interface GuideCovers {
  id: string;
  label: string; // the Atlas's plain label, as the Readiness Check gives it
  href: string | null; // the action in the Readiness Check
  group: string; // its theme
  target: string | null; // "target 2028": the earliest date this guide sets for it
  quotes: Quote[]; // the guide's words for it and for its target, for review only
}

export interface GuidePageModel {
  copy: Copy;
  common: Copy;
  labels: { status: string; bindingness: string; writtenFor: string; source: string };
  card: GuideCard;
  lede: string;
  reads: Link[];
  asOf: string | null;
  standingNote: string | null;
  mark: Link | null;
  quotes: Quote[]; // the guide's own words on what it is, who it is for and how far it binds, for review only
  covers: GuideCovers[];
  targetsNote: string | null; // "Its target dates are a recommendation, not a legal deadline."
  sources: SourceEntry[];
  next: Link[];
}

/** "December 2026" for a target that names its month, "2028" for one that does not. */
function targetWhen(m: Pick<RdMilestone, 'year' | 'month'>): string {
  return m.month ? formatDate(`${m.year}-${String(m.month).padStart(2, '0')}`) : String(m.year);
}

/** Everything one guide's page shows, or null for an id readiness.json does not hold. */
export function guidePageModel(id: string, opts: LoadOptions = {}): GuidePageModel | null {
  const data = elementsData(opts);
  const raw = readReadiness(opts);
  const c = data.copy.guide;
  const { frameworks, actions, domains } = data.readiness;
  const f = frameworks.find((x) => x.id === id);
  const rawF = raw.frameworks.find((x) => x.id === id);
  if (!f || !rawF) return null;
  const card = guideCard(f, data, raw, opts);
  const order = new Map(domains.map((d, i) => [d.id, i]));
  const label = new Map(domains.map((d) => [d.id, d.label]));
  const acts = actions.filter((a) => a.source === id).sort((a, b) => (order.get(a.domain) ?? 0) - (order.get(b.domain) ?? 0));

  const covers: GuideCovers[] = acts.map((a) => {
    const own = a.dueBy
      .filter((d) => d.framework === id)
      .map((d) => f.milestones.find((m) => m.id === d.milestone))
      .filter((m): m is RdMilestone => Boolean(m))
      .sort((x, y) => x.year * 13 + (x.month ?? 0) - (y.year * 13 + (y.month ?? 0)));
    return {
      id: a.id,
      label: a.label,
      href: link('readiness', { query: { action: a.id } }, opts),
      group: label.get(a.domain) ?? a.domain,
      target: own[0] ? fill(c.target, { when: targetWhen(own[0]) }) : null,
      quotes: [...quotesOf(a.provenance), ...quotesOf(own.flatMap((m) => m.provenance))],
    };
  });

  const phrase = (data.readiness.copy.statusPhrase as Record<string, string> | undefined)?.[id] ?? null;
  const hasTargets = covers.some((x) => x.target);
  const urls = guideUrls(id, raw);
  const mark = link('readiness', { hash: `f=${id}` }, opts);
  const profile = pageHref(`/countries/${f.jurisdiction.toLowerCase()}`, opts);
  const records = pageHref('/documents', opts)
    ? guideRecords(id, opts).map((doc, _i, all) => ({
        label: all.length === 1 ? c.record : fill(c.recordOf, { title: doc.title }),
        href: `/documents?country=${encodeURIComponent(doc.country)}#doc-${doc.id}`,
      }))
    : [];

  return {
    copy: c,
    common: data.copy.common,
    labels: { status: data.copy.guides.statusWord, bindingness: data.copy.guides.bindingnessWord, writtenFor: c.writtenForWord, source: c.sourceWord },
    card,
    lede: acts.length === 1 ? c.ledeOne : fill(c.lede, { n: countWord(acts.length) }),
    // the facts line: issuer, then the date printed on the document; the frame adds the as-of date
    reads: [
      { label: f.issuer, href: null },
      { label: card.dateLine, href: null },
      ...(urls.length > 1 ? [{ label: fill(c.docs, { n: urls.length }), href: null }] : []),
    ],
    asOf: latestVerifiedAt(rawF) ?? data.readiness.asOf,
    standingNote: hasTargets ? ((data.readiness.copy.targetsNote as string | undefined) ?? null) : null,
    mark: mark ? { label: c.mark, href: mark } : null,
    quotes: quotesOf(rawF.provenance),
    covers,
    targetsNote: hasTargets && phrase ? fill(c.targetsNote, { phrase }) : null,
    sources: sourcesAt(urls, data.readiness),
    next: beyondMenu(
      [
        { label: c.nextGuides, href: pageHref('/prepare/guides', opts) },
        { label: fill(c.issuedIn, { place: nameInSentence(placeName(f.jurisdiction, opts)) }), href: profile },
        ...records,
      ],
      opts,
    ),
  };
}
