// qscatlas.org: the Standards section's records (spec 8). The overview of standards at /standards
// and the page of each standard at /standards/{id}, computed at build time from the standards
// files: the bodies, the standards dictionary, the standards events (spine) and the edges, each a
// government's document naming a standard. Nothing is hard-coded that the data can give: which
// standards have a page, which governments cite each, the dates, the status words.
//
// Rules kept here:
//   - a preview or production build counts verified records only; a build on Swann's machine
//     also shows the leads on the overview, each marked as one (standardsOverviewModel);
//   - governments are listed in alphabetical order, never by how many documents they have, and
//     no count is given per government or per body, so nothing reads as a score or a tally;
//   - a standard's status is its body's own words (bodyStatus), a standards lifecycle kept apart
//     from the Atlas's legal lifecycle and its bindingness labels;
//   - every visible word comes from data/lab/cascade/copy.json or from the records themselves;
//   - every link goes through pageHref() or link(), so an unbuilt page is never named; the
//     standard pages are built wherever the Cascade is (8 October 2026, Swann; until then they
//     were kept to his machine), so a build names them exactly where it has them.
// Server code only: the Cascade island receives its links from cascadeLinks() as props.

import { CopyFileSchema } from '../lab/schema';
import { isLocalBuild, latestVerifiedAt, loadDataset } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { formatDate } from '../lab/format';
import type { SourceEntry } from '../lab/format';
import { link, pageHref } from './gates';
import { atlasDocuments, documentAt, fileExists, joinAnd, memo, monthYear, nameInSentence, placeName, standardShortName, standardsRecords, verifiedStandardsFiles } from './joins';
import { docId } from './docid';

const COPY = 'data/lab/cascade/copy.json';

// relations in which a document names a standard, in the order a government's groups are tied
// on date; "participates" joins a body, not a standard, and is never shown here
const NAMING = ['adopts', 'profiles', 'references'] as const;
const OWN = ['parallel-interoperable', 'fork'] as const;
const PHRASE: Record<string, string> = {
  adopts: 'relPhraseAdopts',
  profiles: 'relPhraseProfiles',
  references: 'relPhraseReferences',
  fork: 'relPhraseFork',
  'parallel-interoperable': 'relPhraseParallel',
};
const STATUS: Record<string, string> = {
  final: 'statusFinal',
  selected: 'statusSelected',
  draft: 'statusDraft',
  national: 'statusNational',
};

type Files = ReturnType<typeof verifiedStandardsFiles>;
type Std = Files['standards'][number];
type Edge = Files['edges'][number];
type Event = Files['spine'][number];

// ---- small helpers -----------------------------------------------------------------------------

/** Every string of the Standards section, from the Cascade's copy file. */
export function standardsCopy(opts: LoadOptions = {}): Record<string, string> {
  return memo('standards-copy', [COPY], opts, () => {
    if (!fileExists(COPY, opts)) return {};
    const raw = loadDataset(COPY, CopyFileSchema, opts).copy;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v;
    return out;
  });
}

/** "{n} governments" with its values put in; an unknown key comes back as the key, never blank. */
export function fill(template: string | undefined, vars: Record<string, string | number> = {}): string {
  return (template ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** The start of an ISO date of any precision, for ordering by the earliest. */
const periodStart = (d: string) => (d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);
const byStart = (a: string, b: string) => periodStart(a).localeCompare(periodStart(b));

/** The page path of a standard, by id: "FIPS-203" gives "/standards/fips-203". */
export const standardPath = (id: string) => `/standards/${id.toLowerCase()}`;

/** A place's possessive as a link reads it: "France’s", "The Netherlands’", "The European Union’s". */
export function possessive(name: string): string {
  const inSentence = nameInSentence(name);
  const head = inSentence[0].toUpperCase() + inSentence.slice(1);
  return /s$/i.test(name) ? `${head}’` : `${head}’s`;
}

/** The Atlas documents page filtered to one country, at one document's row when given. */
function documentsHref(iso3: string, url: string | null, opts: LoadOptions): string | null {
  const id = url ? docId(url) : null;
  return pageHref(`/documents?country=${iso3.toUpperCase()}${id ? `#doc-${id}` : ''}`, opts);
}

/** The countries the Atlas holds at least one included document for. */
function countriesWithDocuments(opts: LoadOptions): Set<string> {
  return memo('standards-doc-countries', ['data/results'], opts, () => new Set(atlasDocuments(opts).map((d) => d.country)));
}

/** The words a status reads as, from the copy ("final", "selected, not yet published"). */
function statusWords(s: Std, copy: Record<string, string>): string {
  return copy[STATUS[s.standardStatus]] ?? s.standardStatus;
}

/** The relations that count for a standard: naming for a body's standard, its own process for a national one. */
function counts(s: Std, e: Edge): boolean {
  if (e.to !== s.id) return false;
  return s.national ? (OWN as readonly string[]).includes(e.relation) && e.from === s.national : (NAMING as readonly string[]).includes(e.relation);
}

/**
 * The standards event that gives a body's standard its status date: the latest event of its own
 * body naming it (the publication of a final standard, the selection of a selected one, the
 * release of a draft). Null when the Atlas records none, which the page states as "not recorded",
 * and always null for a national process: its earliest record is not when it began, so it is
 * given as a first record instead (statusFacts).
 */
export function statusEvent(s: Std, spine: Event[]): Event | null {
  if (s.national) return null;
  const own = spine.filter((e) => e.date && e.kind === 'nist' && e.standards.includes(s.id));
  if (!own.length) return null;
  return [...own].sort((a, b) => byStart(a.date as string, b.date as string))[own.length - 1];
}

/**
 * The events that belong on a standard's records: a standards body's own (NIST's publications
 * and selections, a national process's rounds). A coordination event (a migration timeline, an
 * EU recommendation) may cite a standard, but it is not an event of the standard itself.
 */
const isStandardsEvent = (e: Event) => Boolean(e.date) && e.kind !== 'coordination';

/** The earliest record of a national process: its first standards event or verified document. */
function firstRecordOf(s: Std, spine: Event[], edges: Edge[]): string | null {
  const records = [
    ...spine.filter((e) => isStandardsEvent(e) && e.standards.includes(s.id)).map((e) => e.date as string),
    ...edges.filter((e) => counts(s, e)).map((e) => e.date),
  ].sort(byStart);
  return records[0] ?? null;
}

/** Other names in muted mono under the official one: earlier names for a body's standard, the rest for a national one. */
function otherNames(s: Std, copy: Record<string, string>): string | null {
  const shown = (t: string) => t === s.label || t === standardShortName(s.label) || s.label.includes(t);
  const names = (s.national ? s.synonyms : s.synonyms.filter((x) => x.type === 'pre-standard' || x.type === 'draft-name')).map((x) => x.text).filter((t) => !shown(t));
  if (!names.length) return null;
  return fill(copy[s.national ? 'alsoNamed' : 'earlierNames'], { names: names.join(', ') });
}

/**
 * The name a document used before the standard renamed it: the longest of the standard's
 * pre-standard names (or, for an RFC, the names of the Internet-Drafts it was published from)
 * that the passages quote ("CRYSTALS-Kyber" before "Kyber"), else its first such name, else
 * null. Never a name the standards file does not record.
 */
function earlierName(s: Std, edges: Edge[]): string | null {
  const names = s.synonyms.filter((x) => x.type === 'pre-standard' || x.type === 'draft-name').map((x) => x.text);
  if (!names.length) return null;
  const quoted = edges
    .flatMap((e) => e.provenance.map((p) => p.excerpt))
    .join(' ')
    .toLowerCase();
  return [...names].sort((a, b) => b.length - a.length).find((n) => quoted.includes(n.toLowerCase())) ?? names[0];
}

/** A date as recorded, at its own precision: "13 August 2024", "March 2021", "2022". */
export const recordedDate = (iso: string) => formatDate(iso);

// ---- the overview (/standards) -------------------------------------------------------------------
//
// The Standards section's front page (5 October 2026): every standard the Atlas records, grouped
// by the body that publishes it, in a fixed order of bodies, each row with its kind, its status
// in the body's own words and the date of that status, what it builds on, and the governments
// whose documents cite it. The documents themselves are one step away, behind a disclosure.
//
// What a build shows: a preview or production build shows verified records only (standards and
// edges with verify: false); a build on Swann's machine also shows the leads, each marked as one.
// A body with nothing to show is left out rather than shown empty. A document of a standards
// body itself (ETSI's own report, filed under the EU in the corpus) is not a government citing a
// standard, so it is not counted for any government here (plan of 5 October 2026).

type Records = ReturnType<typeof standardsRecords>;
type RecStd = Records['standards'][number];
type RecEdge = Records['edges'][number];

// the order of the bodies on the page (labs/review/standards-beyond-nist.md, option c); a body
// not named here follows ANSI X9 and CEN-CENELEC in the order of bodies.json, and the national
// processes close the page. The Cascade's choice of standards body follows the same order
// (cascadeBodyOptions).
export const SECTIONS: { id: string; bodies: string[]; headKey?: string }[] = [
  { id: 'nist', bodies: ['nist'] },
  { id: 'ietf', bodies: ['ietf', 'irtf'], headKey: 'overviewIetfHead' },
  { id: 'etsi', bodies: ['etsi'] },
  { id: 'iso-iec', bodies: ['iso-iec'] },
  { id: 'itu-t', bodies: ['itu-t'] },
  { id: 'x9', bodies: ['x9'] },
  { id: 'cen-cenelec', bodies: ['cen-cenelec'] },
];

// the kind of document, in plain words, so a report never reads as a specification
const KIND: Record<string, string> = {
  fips: 'kindFips',
  'nist-sp': 'kindNistSp',
  'nist-ir': 'kindNistIr',
  rfc: 'kindRfc',
  'internet-draft': 'kindInternetDraft',
  'etsi-ts': 'kindEtsiTs',
  'etsi-tr': 'kindEtsiTr',
  'etsi-gr': 'kindEtsiGr',
  'iso-is': 'kindIsoIs',
  'iso-amd': 'kindIsoAmd',
  'itu-rec': 'kindItuRec',
  '3gpp-tr': 'kind3gppTr',
  'x9-standard': 'kindX9Standard',
  'x9-tr': 'kindX9Tr',
  'ieee-par': 'kindIeeePar',
  'cen-wi': 'kindCenWi',
  'cen-tr': 'kindCenTr',
  national: 'kindNational',
};
// deliverables whose own name already says the work is unfinished
const UNFINISHED_BY_NAME = new Set(['internet-draft', 'cen-wi', 'ieee-par']);

export interface OverviewFact {
  text: string; // words in the interface face
  mono?: string; // a date or a version after the words, in mono
}

export interface OverviewDoc {
  key: string;
  title: string;
  url: string;
  issuer: string;
  country: string;
  dateText: string | null; // null: the Atlas records no date for it yet
  writtenAs: string | null; // the identifier as the document wrote it, where it differs from the standard's name
  lead: boolean;
  passages: { excerpt: string; locator: string | null }[];
}

export interface OverviewRow {
  id: string;
  anchor: string; // "std-fips-203"
  label: string;
  href: string | null; // the standard's own page, where the build has it (wherever the Cascade is)
  lead: boolean;
  facts: OverviewFact[]; // kind, the body's status words, the date of that status
  buildsOn: { label: string; href: string | null }[];
  cited: string; // "Cited by France, Germany and Italy", or the national process's own line
  note: string | null; // the body that runs a national process
  docs: OverviewDoc[];
  docsLabel: string;
}

export interface OverviewBody {
  id: string;
  name: string;
  description: string | null;
  lead: boolean;
}

export interface OverviewSection {
  id: string;
  heading: string;
  bodies: OverviewBody[];
  intro: string | null;
  rows: OverviewRow[];
  cascade: { label: string; href: string } | null; // the Cascade on this body, where it offers the body
}

export interface StandardsOverviewModel {
  copy: Record<string, string>;
  lede: string;
  note: string;
  reads: { label: string; href: string | null }[];
  asOf: string | null;
  sections: OverviewSection[];
  sources: SourceEntry[];
  next: { label: string; href: string | null }[];
  leadsShown: boolean;
}

// a name compared without case, spacing or punctuation: "RFC9370" and "RFC 9370" are one name
export const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The names of the standards bodies that are not governments: their own documents cite no standard for any government. */
export function standardsBodyIssuers(opts: LoadOptions = {}): Set<string> {
  // read with the leads kept: this only decides what to leave out, and nothing here is shown
  const env = { ...(opts.env ?? process.env), VERCEL_ENV: 'preview' };
  const bodies = standardsRecords({ ...opts, env }).bodies;
  return new Set(bodies.filter((b) => b.kind !== 'national-agency').flatMap((b) => [b.name, b.shortName]).map((n) => plain(n)));
}

// ---- the Cascade's choice of standards body (Swann, 5 October 2026) ---------------------------
//
// The Standards Cascade shows NIST by default. Its "Standards body" choice offers every other body
// the overview groups (the IETF and the IRTF together, as their heading does) once verified
// documents of at least two governments name its verified standards: an orbit with a single
// government reads as a scoreboard, so such a body stays on the overview only (Swann, 5 October
// 2026). The rules are the overview's: a lead (verify: true) never counts, in any build, and a
// standards body's own document is never a government citing it.

/** The fewest citing governments a body other than NIST needs to be offered in the Cascade. */
export const CASCADE_MIN_GOVERNMENTS = 2;

export interface CascadeBodyOption {
  id: string; // the overview's section id, and the Cascade's ?body= value: "nist", "ietf", "etsi"
  bodyIds: string[]; // the bodies.json ids it covers: ["ietf", "irtf"] for the IETF and IRTF
  label: string; // the overview's heading: "NIST", "IETF and IRTF", "ISO/IEC"
  labelOr: string; // the same names for a sentence about any of them: "IETF or IRTF"
}

/**
 * The verified edges in which a government's own document names one of the given standards: a
 * naming relation (adopts, profiles, references), dated, never a lead and never a document of a
 * standards body itself (ETSI's own report, filed under the EU in the corpus).
 */
export function governmentCitations(standardIds: Set<string>, opts: LoadOptions = {}): RecEdge[] {
  const notGovernment = standardsBodyIssuers(opts);
  return standardsRecords(opts).edges.filter(
    (e) => !e.verify && e.date !== null && e.precision !== null && standardIds.has(e.to) && (NAMING as readonly string[]).includes(e.relation) && !notGovernment.has(plain(e.issuingOrg)),
  );
}

/**
 * The Cascade's standards bodies, NIST first (the default), then the overview's order: each body
 * whose verified standards are named in verified documents of at least two governments. A national process is
 * never one: it belongs to the NIST view's own layer.
 */
export function cascadeBodyOptions(opts: LoadOptions = {}): CascadeBodyOption[] {
  return memo('cascade-body-options', ['data/lab/cascade/edges.json', 'data/lab/cascade/standards.json', 'data/lab/cascade/bodies.json', COPY], opts, () => {
    const copy = standardsCopy(opts);
    const { standards, bodies } = standardsRecords(opts);
    const bodyOf = new Map(bodies.filter((b) => !b.verify).map((b) => [b.id, b]));
    const listed = new Set(SECTIONS.flatMap((x) => x.bodies));
    const extra = bodies.filter((b) => !listed.has(b.id) && !standards.some((s) => s.bodyId === b.id && s.national)).map((b) => ({ id: b.id, bodies: [b.id] }) as (typeof SECTIONS)[number]);
    const out: CascadeBodyOption[] = [];
    for (const sec of [...SECTIONS, ...extra]) {
      const own = standards.filter((s) => !s.verify && !s.national && sec.bodies.includes(s.bodyId));
      const present = sec.bodies.filter((id) => bodyOf.has(id) && own.some((s) => s.bodyId === id));
      if (!present.length) continue;
      if (sec.id !== 'nist' && new Set(governmentCitations(new Set(own.map((s) => s.id)), opts).map((e) => e.from)).size < CASCADE_MIN_GOVERNMENTS) continue;
      const names = present.map((id) => bodyOf.get(id)!.shortName);
      out.push({
        id: sec.id,
        bodyIds: sec.bodies,
        label: (sec.headKey && copy[sec.headKey]) || joinAnd(names),
        labelOr: names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`,
      });
    }
    // NIST is the default view, whatever the order above says
    return out.sort((a, b) => Number(b.id === 'nist') - Number(a.id === 'nist'));
  });
}

/** The address of the Cascade on one body: no parameter for NIST, the default; null where the Cascade is not built. */
export function cascadeBodyHref(id: string, opts: LoadOptions = {}): string | null {
  return link('cascade', id === 'nist' ? {} : { query: { body: id } }, opts);
}

/** The relations that count on the overview: naming for a body's standard, its own process for a national one. */
function countsOnOverview(s: RecStd, e: RecEdge): boolean {
  if (e.to !== s.id) return false;
  return s.national ? (OWN as readonly string[]).includes(e.relation) && e.from === s.national : (NAMING as readonly string[]).includes(e.relation);
}

/** "Technical Report", "Standard, in development", "Federal Information Processing Standard, not yet published". */
function kindWords(s: RecStd, copy: Record<string, string>): string {
  const kind = copy[KIND[s.deliverable]] ?? s.deliverable;
  if (s.standardStatus === 'selected') return fill(copy.kindNotYetPublished, { kind });
  if (s.standardStatus === 'in-development' && !UNFINISHED_BY_NAME.has(s.deliverable)) return fill(copy.kindInDevelopment, { kind });
  return kind;
}

/**
 * A row's facts line: the kind of document, its version where the record gives one, the body's
 * own status words, and the date of that status. The kind is left out where the status words open with it ("RFC, Proposed Standard"
 * after "RFC"). With no status date of its own, a NIST record takes the date of its verified
 * standards event (the publication or selection the Cascade records), and a national process its
 * first record, which is never given as the date it began.
 */
function rowFacts(s: RecStd, spine: Records['spine'], edges: RecEdge[], copy: Record<string, string>): OverviewFact[] {
  const facts: OverviewFact[] = [];
  const kind = kindWords(s, copy);
  const status = s.bodyStatus;
  // the status words open with the kind already: "RFC, Proposed Standard", "International Standard
  // published [60.60]", "Active Internet-Draft, ..."
  const base = (copy[KIND[s.deliverable]] ?? s.deliverable).toLowerCase();
  const named = status ? [base, `active ${base}`].some((k) => status.toLowerCase().startsWith(k)) : false;
  if (!named) facts.push({ text: kind });
  if (s.version) facts.push({ text: '', mono: s.version });
  if (status) facts.push({ text: status });
  const verifiedSpine = spine.filter((e) => !e.verify);
  if (s.statusDate) {
    const date = formatDate(s.statusDate);
    facts.push(s.deliverable === 'internet-draft' ? { text: copy.statusRevision, mono: date } : { text: '', mono: date });
  } else if (s.national) {
    const first = firstRecordOf(s as Std, verifiedSpine as Event[], edges.filter((e): e is Edge => !e.verify && e.date !== null) as Edge[]);
    if (first) facts.push({ text: copy.statusFirstRecord, mono: monthYear(first) });
  } else {
    const event = statusEvent(s as Std, verifiedSpine as Event[]);
    if (event?.date) facts.push({ text: '', mono: monthYear(event.date) });
  }
  return facts;
}

/** The overview of every standard the build shows, by body (see the note above). */
export function standardsOverviewModel(opts: LoadOptions = {}): StandardsOverviewModel {
  const copy = standardsCopy(opts);
  const env = opts.env ?? process.env;
  const leadsShown = isLocalBuild(env);
  const records = standardsRecords(opts);
  const shown = <T extends { verify: boolean }>(r: T) => leadsShown || !r.verify;
  const notGovernment = standardsBodyIssuers(opts);

  const standards = records.standards.filter(shown);
  const shownIds = new Set(standards.map((s) => s.id));
  const edges = records.edges.filter((e) => shown(e) && shownIds.has(e.to));
  const bodies = new Map(records.bodies.map((b) => [b.id, b]));
  const short = (s: RecStd) => standardShortName(s.label);
  const byId = new Map(standards.map((s) => [s.id, s]));

  // the edges that count for each standard: a government's documents, never a standards body's own
  const citing = (s: RecStd) => edges.filter((e) => countsOnOverview(s, e) && (s.national || !notGovernment.has(plain(e.issuingOrg))));

  const docOf = (s: RecStd, e: RecEdge): OverviewDoc => ({
    key: `${e.id}`,
    title: e.documentTitle,
    url: e.documentUrl,
    issuer: e.issuingOrg,
    country: placeName(e.from, opts),
    dateText: e.date ? formatDate(e.date) : null,
    writtenAs: e.namedAs && plain(e.namedAs) !== plain(short(s)) ? e.namedAs : null,
    lead: e.verify,
    passages: e.provenance.map((p) => ({ excerpt: p.excerpt, locator: p.locator ?? null })),
  });

  const rowOf = (s: RecStd): OverviewRow => {
    const mine = citing(s).sort((a, b) => (a.date && b.date ? byStart(a.date, b.date) : a.date ? -1 : b.date ? 1 : 0) || a.documentTitle.localeCompare(b.documentTitle, 'en'));
    const govs = [...new Set(mine.map((e) => e.from))].map((iso3) => placeName(iso3, opts)).sort((a, b) => a.localeCompare(b, 'en'));
    const body = bodies.get(s.bodyId);
    const cited = s.national
      ? `${placeName(s.national, opts)} ${copy.runsOwn}`
      : govs.length
        ? fill(copy.citedBy, { names: joinAnd(govs) })
        : copy.citedByNone;
    return {
      id: s.id,
      anchor: `std-${s.id.toLowerCase()}`,
      label: s.label,
      href: pageHref(standardPath(s.id), opts),
      lead: s.verify,
      facts: rowFacts(s, records.spine, edges, copy),
      buildsOn: s.buildsOn.map((id) => {
        const target = byId.get(id);
        return { label: target ? short(target) : id, href: target ? `#std-${id.toLowerCase()}` : null };
      }),
      cited,
      note: s.national && body && shown(body) ? body.description : null,
      docs: mine.map((e) => docOf(s, e)),
      docsLabel: s.national ? copy.evidenceOwn : mine.length === 1 ? copy.evidenceOne : copy.evidenceMany,
    };
  };

  const bodyOf = (id: string): OverviewBody | null => {
    const b = bodies.get(id);
    if (!b || !shown(b)) return null;
    return { id: b.id, name: b.shortName, description: b.description, lead: b.verify };
  };
  const headingOf = (ids: string[], rows: RecStd[], headKey?: string) => {
    if (headKey && copy[headKey]) return copy[headKey];
    const b = bodies.get(ids[0]);
    return b && shown(b) ? b.shortName : rows[0].body;
  };

  // each body the Cascade offers links to the Cascade on that body (NIST: the Cascade as it opens)
  const inCascade = new Set(cascadeBodyOptions(opts).map((o) => o.id));
  const cascadeOf = (id: string) => {
    const href = inCascade.has(id) ? cascadeBodyHref(id, opts) : null;
    return href ? { label: copy.overviewCascadeLink, href } : null;
  };

  const sections: OverviewSection[] = [];
  const listed = new Set(SECTIONS.flatMap((x) => x.bodies));
  const extra = records.bodies.filter((b) => !listed.has(b.id) && !standards.some((s) => s.bodyId === b.id && s.national)).map((b) => ({ id: b.id, bodies: [b.id] }));
  for (const sec of [...SECTIONS, ...extra]) {
    const rows = standards.filter((s) => !s.national && sec.bodies.includes(s.bodyId));
    if (!rows.length) continue;
    const present = sec.bodies.filter((id) => rows.some((s) => s.bodyId === id));
    sections.push({
      id: sec.id,
      heading: headingOf(present, rows, (sec as { headKey?: string }).headKey),
      bodies: present.map(bodyOf).filter((b): b is OverviewBody => b !== null),
      intro: null,
      rows: rows.map(rowOf),
      cascade: cascadeOf(sec.id),
    });
  }
  // a standard of a body the page does not group (a body missing from bodies.json) still shows
  const placed = new Set(sections.flatMap((x) => x.rows.map((r) => r.id)));
  const orphans = standards.filter((s) => !s.national && !placed.has(s.id));
  for (const s of orphans) sections.push({ id: s.bodyId, heading: s.body, bodies: [], intro: null, rows: [rowOf(s)], cascade: null });
  const national = standards.filter((s) => s.national);
  if (national.length) sections.push({ id: 'national', heading: copy.nationalHead, bodies: [], intro: copy.overviewNationalLede, rows: national.map(rowOf), cascade: null });

  const counted = standards.flatMap((s) => citing(s));
  const docs = new Set(counted.map((e) => docId(e.documentUrl))).size;
  const govs = new Set(counted.map((e) => e.from)).size;
  const shownEvents = records.spine.filter((e) => !e.verify && isStandardsEvent(e as Event) && e.standards.some((id) => shownIds.has(id)));
  return {
    copy,
    lede: copy.overviewLede,
    note: copy.overviewNote,
    reads: [{ label: fill(copy.listReads, { docs, govs }), href: pageHref('/documents', opts) }],
    asOf: latestVerifiedAt({ standards: standards.filter((s) => !s.verify), edges: counted.filter((e) => !e.verify) }),
    sections,
    sources: standardsSources(
      standards.map((s) => ({ ...s, body: bodies.get(s.bodyId)?.shortName ?? s.body })) as Std[],
      shownEvents as Event[],
    ),
    next: [
      { label: copy.title, href: link('cascade', {}, opts) },
      { label: copy.nextDocumentsPages, href: pageHref('/documents', opts) },
      { label: copy.nextCountries, href: pageHref('/countries', opts) },
    ],
    leadsShown,
  };
}

/** The standards whose pages are built: those with at least one verified document naming them. */
export function standardsWithPages(opts: LoadOptions = {}): string[] {
  const { standards, edges } = verifiedStandardsFiles(opts);
  return standards.filter((s) => edges.some((e) => e.to === s.id)).map((s) => s.id);
}

/** About this view's sources: each standard's own publication page and each event's source, once each. */
function standardsSources(standards: Std[], spine: Event[]): SourceEntry[] {
  const out: SourceEntry[] = [];
  const seen = new Set<string>();
  for (const s of standards) {
    const p = s.provenance[0];
    if (!p || seen.has(p.url)) continue;
    seen.add(p.url);
    out.push({ author: s.body, title: p.title ?? s.label, url: p.url, retrievedAt: p.retrievedAt });
  }
  for (const e of spine) {
    const p = e.provenance[0];
    if (!p || seen.has(p.url)) continue;
    seen.add(p.url);
    out.push({ author: e.body, date: e.date, title: p.title ?? e.label, url: p.url, retrievedAt: p.retrievedAt });
  }
  return out;
}

// ---- one standard (/standards/{id}) -------------------------------------------------------

export interface PageDoc {
  url: string;
  date: string; // as recorded
  dateText: string; // at its own precision
  title: string;
  issuer: string;
  href: string | null; // the document's row on the Atlas documents page
}

export interface RelationGroup {
  phrase: string; // "adopts FIPS 203", "names FIPS 203 under its earlier name, CRYSTALS-Kyber"
  docs: PageDoc[]; // in date order
}

export interface Namer {
  iso3: string;
  name: string;
  first: string; // as recorded
  firstText: string; // "first named March 2021"
  groups: RelationGroup[]; // in order of their first document
  profileHref: string | null;
  documentsHref: string | null;
  profileLabel: string;
  documentsLabel: string;
}

export interface PageEvent {
  id: string;
  date: string;
  dateText: string;
  label: string;
  body: string;
  url: string | null;
}

export interface StandardPageModel {
  copy: Record<string, string>;
  id: string;
  label: string;
  short: string;
  question: string; // the H1: the standard's own name
  lede: string;
  facts: string[];
  asOf: string | null;
  others: string | null;
  national: boolean;
  namedByHead: string; // "Named by", or "Run by" for a national process
  namedByIntro: string;
  namers: Namer[];
  cascade: { label: string; href: string | null };
  events: PageEvent[];
  eventsNone: string;
  sources: SourceEntry[];
  next: { label: string; href: string | null }[];
}

/**
 * The status half of a standard's facts line, with its date set beside the verb it dates: "final
 * since August 2024", "selected July 2022, not yet published", "initial public draft, November
 * 2024". A national process gives its first record, never a start date the sources do not give:
 * "national process" and "first record January 2025". With no standards event, the status alone.
 */
export function statusFacts(s: Std, spine: Event[], edges: Edge[], copy: Record<string, string>): string[] {
  // a standard of another body than the Cascade's: its body's own status words and their date
  if (!s.cascade && s.bodyStatus) return [s.statusDate ? `${s.bodyStatus}, ${formatDate(s.statusDate)}` : s.bodyStatus];
  const status = statusWords(s, copy);
  if (s.national) {
    const first = firstRecordOf(s, spine, edges);
    return first ? [status, fill(copy.firstRecord, { date: monthYear(first) })] : [status];
  }
  const event = statusEvent(s, spine);
  if (!event) return [status];
  const date = monthYear(event.date as string);
  if (s.standardStatus === 'selected') return [fill(copy.pageSinceSelected, { date })];
  if (s.standardStatus === 'draft') return [fill(copy.pageSinceDraft, { date })];
  return [fill(copy.pageSince, { status, date })];
}

/** The page of one standard, or null when the Atlas holds no verified document naming it. */
export function standardPageModel(id: string, opts: LoadOptions = {}): StandardPageModel | null {
  const copy = standardsCopy(opts);
  const { standards, edges, spine, asOf } = verifiedStandardsFiles(opts);
  const s = standards.find((x) => x.id === id);
  if (!s) return null;
  const own = edges.filter((e) => e.to === s.id);
  if (!own.length) return null;
  const short = s.national ? (s.synonyms.find((x) => /^[\x20-\x7E]+$/.test(x.text))?.text ?? standardShortName(s.label)) : standardShortName(s.label);
  const withDocs = countriesWithDocuments(opts);

  const isos = [...new Set(own.filter((e) => counts(s, e)).map((e) => e.from))];
  const namersList: Namer[] = isos
    .map((iso3) => {
      const name = placeName(iso3, opts);
      const mine = own.filter((e) => e.from === iso3 && counts(s, e));
      // one group per relation and naming: a document that names the standard only by an earlier
      // name is grouped apart, and says which name it used
      const groups = new Map<string, { relation: string; pre: boolean; edges: Edge[] }>();
      for (const e of mine) {
        const key = `${e.relation}|${e.preStandardOnly}`;
        const g = groups.get(key) ?? { relation: e.relation, pre: e.preStandardOnly, edges: [] };
        g.edges.push(e);
        groups.set(key, g);
      }
      const relationGroups: RelationGroup[] = [...groups.values()]
        .map((g) => {
          const base = fill(copy[PHRASE[g.relation]] ?? copy.relPhraseReferences, { standard: short });
          const earlier = g.pre ? earlierName(s, g.edges) : null;
          const phrase = g.pre ? `${base} ${earlier ? fill(copy.underEarlierName, { name: earlier }) : copy.preStandard}` : base;
          const docs = new Map<string, PageDoc>();
          for (const e of [...g.edges].sort((a, b) => byStart(a.date, b.date) || a.id.localeCompare(b.id))) {
            if (docs.has(e.documentUrl)) continue;
            const atlas = documentAt(e.documentUrl, opts);
            docs.set(e.documentUrl, {
              url: e.documentUrl,
              date: e.date,
              dateText: recordedDate(e.date),
              title: e.documentTitle,
              issuer: e.issuingOrg,
              href: atlas ? documentsHref(atlas.country, e.documentUrl, opts) : null,
            });
          }
          return { phrase, docs: [...docs.values()], order: g.relation };
        })
        .sort(
          (a, b) =>
            byStart(a.docs[0].date, b.docs[0].date) ||
            [...NAMING, ...OWN].indexOf(a.order as never) - [...NAMING, ...OWN].indexOf(b.order as never),
        )
        .map(({ phrase, docs }) => ({ phrase, docs }));
      const first = mine.map((e) => e.date).sort(byStart)[0];
      return {
        iso3,
        name,
        first,
        firstText: fill(copy[s.national ? 'firstRecord' : 'firstNamed'], { date: monthYear(first) }),
        groups: relationGroups,
        profileHref: pageHref(`/countries/${iso3.toLowerCase()}`, opts),
        documentsHref: withDocs.has(iso3) ? documentsHref(iso3, null, opts) : null,
        profileLabel: fill(copy.profileOf, { name }),
        documentsLabel: fill(copy.documentsOf, { name: nameInSentence(name) }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const facts = [s.body, ...statusFacts(s, spine, edges, copy)];

  // the Cascade opens on this standard in the view of its body: NIST's, the default, with the
  // standard chosen (?std=FIPS-203), or another body the Cascade offers (cascadeBodyOptions), on
  // that body with the standard chosen (?body=ietf&std=RFC-10024, 8 October 2026); and on the
  // government's own process for a national one. A body the Cascade does not offer has no view
  // there, so the page of its standard offers no way in.
  const option = s.national ? null : (cascadeBodyOptions(opts).find((o) => o.bodyIds.includes(s.bodyId)) ?? null);
  const cascade = s.national
    ? { label: fill(copy.inCascadeNational, { name: nameInSentence(placeName(s.national, opts)) }), href: link('cascade', { query: { sel: s.national, fork: '1' } }, opts) }
    : { label: copy.inCascade, href: option ? link('cascade', { query: option.id === 'nist' ? { std: s.id } : { body: option.id, std: s.id } }, opts) : null };

  const events: PageEvent[] = spine
    .filter((e) => isStandardsEvent(e) && e.standards.includes(s.id))
    .sort((a, b) => byStart(a.date as string, b.date as string))
    .map((e) => ({ id: e.id, date: e.date as string, dateText: recordedDate(e.date as string), label: e.label, body: e.body, url: e.provenance[0]?.url ?? null }));

  const n = namersList.length;
  return {
    copy,
    id: s.id,
    label: s.label,
    short,
    question: s.label,
    lede: fill(copy[s.national ? 'pageLedeNational' : 'pageLede'], { short }),
    facts,
    asOf,
    others: otherNames(s, copy),
    national: Boolean(s.national),
    namedByHead: s.national ? copy.runByHead : copy.namedByHead,
    namedByIntro: n === 1 ? copy.namedByIntroOne : fill(copy.namedByIntroMany, { n }),
    namers: namersList,
    cascade,
    events,
    eventsNone: fill(copy.eventsNone, { short }),
    sources: standardsSources([s], spine.filter((e) => isStandardsEvent(e) && e.standards.includes(s.id))),
    // the way into the Cascade stands under the list of governments, so it is not repeated here
    next: [
      { label: copy.nextList, href: pageHref('/standards', opts) },
      { label: copy.nextDocumentsPages, href: pageHref('/documents', opts) },
      { label: copy.nextCountries, href: pageHref('/countries', opts) },
    ],
  };
}

// ---- links for the Cascade island ------------------------------------------------------------

export interface CascadeCountryLinks {
  profile: string | null;
  profileLabel: string;
  documents: string | null; // the documents page filtered to the country, when it has documents
  documentsLabel: string;
}

/**
 * The links the Cascade panel offers, computed at build time so the island holds no route
 * strings: each drawn country's profile and documents, and each cited document's Atlas row.
 */
export function cascadeLinks(
  iso3s: { iso3: string; name: string }[],
  documentUrls: string[],
  opts: LoadOptions = {},
): { countries: Record<string, CascadeCountryLinks>; records: Record<string, string> } {
  const copy = standardsCopy(opts);
  const withDocs = countriesWithDocuments(opts);
  const countries: Record<string, CascadeCountryLinks> = {};
  for (const { iso3, name } of iso3s) {
    countries[iso3] = {
      profile: pageHref(`/countries/${iso3.toLowerCase()}`, opts),
      profileLabel: fill(copy.detailProfile, { name }),
      documents: withDocs.has(iso3) ? documentsHref(iso3, null, opts) : null,
      documentsLabel: fill(copy.detailCountryDocs, { possessive: possessive(name) }),
    };
  }
  const records: Record<string, string> = {};
  for (const url of new Set(documentUrls)) {
    const atlas = documentAt(url, opts);
    const href = atlas ? documentsHref(atlas.country, url, opts) : null;
    if (href) records[url] = href;
  }
  return { countries, records };
}
