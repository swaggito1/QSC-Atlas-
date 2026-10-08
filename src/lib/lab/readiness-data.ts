// QSC Atlas: the Readiness Check's data, assembled at build time for the page and the island.
// Reads data/lab/readiness/readiness.json and copy.json through loadDataset, so in production every
// record still marked verify: true is dropped before it reaches the page. The posture colour of each
// source comes from its appliesToPosture key through POSTURE_META, the Atlas's one colour role.

import { z } from 'zod';
import { CopyFileSchema, IsoDateSchema, PrecisionSchema, ProvenanceSchema, ReadinessFileSchema, checkedShape } from './schema';
import { latestVerifiedAt, loadDataset } from './load';
import type { LoadOptions } from './load';
import { postureMeta } from '../process';
import { INSTRUMENT_STATUS_META } from '../regulation';
import type { InstrumentStatus } from '../regulation';
import { formatDate } from './format';
import type { SourceEntry } from './format';
import { fillIn } from './readiness';
import type { RdAction, RdElementLink, RdFramework, RdProvenance } from './readiness';
import { link, pageHref } from '../site/gates';

// Three fields this tool reads beyond the shared ReadinessFileSchema in schema.ts, which strips
// keys it does not know. They are checked here at build time and by
// scripts/lab/invariants/readiness.mjs, until the shared schema carries them:
//   documents        the date printed on each source document, with the excerpt that shows it
//   milestone.recurs "yearly" for a deliverable the source asks for again every year
//   entry.outcome    yesProvenance and noProvenance, so each outcome quote carries its own locator
const FrameworkBase = ReadinessFileSchema.shape.frameworks.element;
const MilestoneBase = FrameworkBase.shape.milestones.element;
const EntryBase = ReadinessFileSchema.shape.entry.unwrap();

export const ReadinessToolSchema = ReadinessFileSchema.extend({
  frameworks: z.array(FrameworkBase.extend({ milestones: z.array(MilestoneBase.extend({ recurs: z.enum(['yearly']).nullable().optional() })) })),
  entry: EntryBase.extend({
    outcome: EntryBase.shape.outcome.extend({
      yesProvenance: z.array(ProvenanceSchema).min(1),
      noProvenance: z.array(ProvenanceSchema).min(1),
    }),
  }).nullable(),
  documents: z.array(z.object({ ...checkedShape, url: z.string().url(), date: IsoDateSchema, precision: PrecisionSchema })),
});

export type ReadinessFile = z.infer<typeof ReadinessToolSchema>;

export interface ReadinessData {
  copy: Record<string, any>;
  frameworks: RdFramework[];
  domains: { id: string; label: string; description: string }[];
  actions: RdAction[];
  // the positions on which the guides differ stay in readiness.json, validated, but no page shows
  // them since Where the guides differ left the site (Swann, 4 October 2026), so none is passed on
  entry: ReadinessFile['entry'];
  defaults: string[]; // the sources chosen when the page opens
  asOf: string | null;
  checked: { first: string; last: string } | null; // the earliest and latest day a record was checked at source
  today: string; // ISO day the page was built, replaced by the visitor's own date in the browser
  sources: SourceEntry[];
  documents: number; // distinct documents quoted in the file (the EU roadmap and its FAQ count as two)
}

const DIR = 'data/lab/readiness';

/** The two sources chosen when the page first opens: the EU roadmap and the NCSC timelines. */
export const DEFAULT_SOURCES = ['eu-roadmap', 'ncsc-timelines'];

/**
 * The question ?start=entry opens: the Dutch Handbook's "Work out whether you are an urgent or a
 * regular adopter", whose More holds what the Handbook's entry questions ask about.
 */
export const ENTRY_ACTION = 'nl-persona';

export function readReadiness(opts: LoadOptions = {}): ReadinessFile {
  return loadDataset(`${DIR}/readiness.json`, ReadinessToolSchema, opts);
}

export function loadReadiness(opts: LoadOptions = {}, now: Date = new Date()): ReadinessData {
  const file = readReadiness(opts);
  const copy = loadDataset(`${DIR}/copy.json`, CopyFileSchema, opts).copy as Record<string, any>;
  // the date printed on each document, by address; a document without one is cited "(n.d.)"
  const printed = new Map(file.documents.map((d) => [d.url, d.date]));

  const frameworks: RdFramework[] = file.frameworks.map((f) => ({
    id: f.id,
    label: f.label,
    shortLabel: f.shortLabel,
    issuer: f.issuer,
    jurisdiction: f.jurisdiction,
    status: f.status,
    bindingness: f.bindingness,
    statusLabel: f.status,
    bindingnessLabel: (INSTRUMENT_STATUS_META[f.bindingness as InstrumentStatus]?.label ?? f.bindingness).toLowerCase(),
    published: printed.get(f.provenance[0]?.url ?? '') ?? null,
    audience: f.audience,
    posture: postureMeta(f.appliesToPosture),
    milestones: f.milestones.map((m) => ({ ...m, recurs: m.recurs ?? null, provenance: m.provenance })),
    verified: !f.verify,
  }));
  const ids = new Set(frameworks.map((f) => f.id));

  // an action whose source was dropped (a lead in production) goes with it
  const actions: RdAction[] = file.actions
    .filter((a) => ids.has(a.source))
    .map((a) => ({
      id: a.id,
      domain: a.domain,
      source: a.source,
      label: a.label,
      description: a.description,
      audienceNote: a.audienceNote,
      dueBy: a.dueBy.filter((d) => ids.has(d.framework)),
      provenance: a.provenance,
      verified: !a.verify,
    }));

  // one reference per document quoted anywhere in the file, plus the Task Force report the method cites
  const sources: SourceEntry[] = [];
  const seen = new Set<string>();
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      const p = v as Record<string, unknown>;
      if (typeof p.url === 'string' && typeof p.excerpt === 'string' && !seen.has(p.url)) {
        seen.add(p.url);
        sources.push({
          author: String(p.publisher ?? p.title),
          date: printed.get(p.url) ?? null,
          title: String(p.title ?? p.url),
          url: p.url,
          retrievedAt: String(p.retrievedAt),
        });
      }
      Object.values(p).forEach(visit);
    }
  };
  visit(file);
  // Read on 1 October 2026 in the published PDF (cover: "DECEMBER 2025"); cited in the method note
  // for the point that migration steps need not run in a strict sequence.
  sources.push({
    author: 'Pupillo, L., Ashworth, S., Ferreira, A., & Polito, C.',
    date: '2025-12',
    title: 'Strengthening the EU transition to a quantum-safe world: Technology, market, governance and policy challenges',
    details: 'Task Force report',
    publisher: 'Centre for European Policy Studies',
    url: 'https://cdn.ceps.eu/2025/12/2025-12-Quantum-TF-report-formatted.pdf',
  });

  return {
    copy,
    frameworks,
    domains: file.domains,
    actions,
    entry: file.entry && ids.has(file.entry.source) ? file.entry : null,
    defaults: DEFAULT_SOURCES.filter((id) => ids.has(id)),
    asOf: latestVerifiedAt(file),
    checked: verifiedSpan(file),
    today: now.toISOString().slice(0, 10),
    sources,
    documents: seen.size,
  };
}

// ---- the links the page carries -----------------------------------------------------------
// Every address is computed here at build time through link() and pageHref() (src/lib/site/gates),
// which give null for a page this build does not make. The island receives only the addresses
// that exist, so a hidden page is never named in the HTML or in the island's props.

/**
 * Which page does the job of which action (spec 5.2, and the Discovery attachments of 5.1): the
 * Exposure Clock for the two timing actions, the inventory template for the three recording
 * actions and the supplier letter for every action of the Suppliers group. The label of each is
 * copy.elements[key]. EU rules leave this website (Swann, 2 October 2026), Where the guides
 * differ leaves it (Swann, 4 October 2026), and the migration approach is taken off it (Swann,
 * 5 October 2026), so no action links to any of them.
 */
export const ELEMENT_RULES: { key: string; tool?: string; page?: string; actions?: string[]; domain?: string; carriesSources?: boolean }[] = [
  { key: 'exposure', tool: 'exposure', actions: ['nl-mosca', 'ncsc-data-record'] },
  { key: 'inventory', tool: 'inventory', actions: ['ca-inventory-fields', 'eu-inventory', 'ncsc-data-record'] },
  { key: 'suppliers', tool: 'suppliers', domain: 'suppliers', carriesSources: true },
];

export interface CheckLinks {
  guides: Record<string, string>; // guide id to its page
  elements: Record<string, RdElementLink[]>; // action id to the pages that do its job, in rule order
  guidesIndex: string | null; // /prepare/guides
  next: { label: string; href: string | null }[]; // Where to go next, nulls dropped by the frame
}

/** The addresses the Check links to, for the pages this build makes. */
export function checkLinks(data: Pick<ReadinessData, 'copy' | 'frameworks' | 'actions'>, opts: LoadOptions = {}): CheckLinks {
  const { copy } = data;
  const guides: Record<string, string> = {};
  for (const f of data.frameworks) {
    const href = pageHref(`/prepare/guides/${f.id}`, opts);
    if (href) guides[f.id] = href;
  }

  const labels = (copy.elements ?? {}) as Record<string, string>;
  const elements: Record<string, RdElementLink[]> = {};
  for (const rule of ELEMENT_RULES) {
    const href = rule.tool ? link(rule.tool, {}, opts) : rule.page ? pageHref(rule.page, opts) : null;
    const label = labels[rule.key];
    if (!href || !label) continue;
    const ids = rule.domain ? data.actions.filter((a) => a.domain === rule.domain).map((a) => a.id) : (rule.actions ?? []);
    for (const id of ids) {
      if (!data.actions.some((a) => a.id === id)) continue;
      (elements[id] ??= []).push({ href, label, carriesSources: Boolean(rule.carriesSources) });
    }
  }

  return {
    guides,
    elements,
    guidesIndex: pageHref('/prepare/guides', opts),
    next: [
      { label: copy.nextGuides, href: pageHref('/prepare/guides', opts) },
      { label: copy.nextExposure, href: link('exposure', {}, opts) },
    ],
  };
}

/** The earliest and the latest verifiedAt anywhere in a dataset. Null when nothing is verified. */
export function verifiedSpan(value: unknown): { first: string; last: string } | null {
  let first: string | null = null;
  let last: string | null = null;
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (k === 'verifiedAt' && typeof child === 'string' && child) {
          if (first === null || child < first) first = child;
          if (last === null || child > last) last = child;
        } else visit(child);
      }
    }
  };
  visit(value);
  return first && last ? { first, last } : null;
}

/**
 * The method note's sentence on when the source's words were checked: one day when every record
 * was checked on the same day, the first and last day otherwise, and no day when none is checked.
 */
export function checkedSentence(copy: Record<string, any>, span: { first: string; last: string } | null): string {
  if (!span) return copy.checkedNone;
  if (span.first === span.last) return fillIn(copy.checkedOn, { date: formatDate(span.first) });
  return fillIn(copy.checkedBetween, { first: formatDate(span.first), last: formatDate(span.last) });
}

/** The copy the island reads: everything but the strings only the server renders. */
export function islandCopy(copy: Record<string, any>): Record<string, any> {
  const server = new Set([
    'elements', 'question', 'lede', 'description', 'minutes', 'noscript', 'noscriptHead',
    'nextGuides', 'nextExposure', 'checkedOn', 'checkedBetween', 'checkedNone',
    // read by the guide pages, not by the island
    'statusPhrase', 'kindLabel',
  ]);
  return Object.fromEntries(Object.entries(copy).filter(([k]) => !server.has(k) && !/^method\d$/.test(k)));
}

/**
 * A provenance record as the island receives it: who said it, where, the address and the day it
 * was read, and the source's own words only in a build that may carry them (sourceWordsInBuild()
 * in src/lib/site/review-build.ts). A production build never puts an excerpt in the page.
 */
export function islandProvenance(p: RdProvenance, sourceWords: boolean): RdProvenance {
  const out: RdProvenance = { url: p.url, retrievedAt: p.retrievedAt };
  if (p.title) out.title = p.title;
  if (p.publisher) out.publisher = p.publisher;
  if (p.locator) out.locator = p.locator;
  if (sourceWords && p.excerpt) out.excerpt = p.excerpt;
  return out;
}

/**
 * The guides and actions as the island receives them. A milestone's provenance stays on the
 * server (the island shows no milestone's source), and an action's keeps its excerpt only when
 * the build may carry source words.
 */
export function islandData(
  data: Pick<ReadinessData, 'frameworks' | 'actions'>,
  sourceWords: boolean,
): { frameworks: RdFramework[]; actions: RdAction[] } {
  return {
    frameworks: data.frameworks.map((f) => ({ ...f, milestones: f.milestones.map((m) => ({ ...m, provenance: [] })) })),
    actions: data.actions.map((a) => ({ ...a, provenance: a.provenance.map((p) => islandProvenance(p, sourceWords)) })),
  };
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A count as the reading copy writes it: words up to ten, figures above. */
export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}
