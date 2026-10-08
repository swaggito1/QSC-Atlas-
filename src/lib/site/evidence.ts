// Across the Atlas: what the Atlas tools hold for one country (spec 7.2, contract 21.2).
//
// connectedEvidence() is a pure function of a profile's fields, the lab datasets and the registry.
// Its rules:
//   - a row exists only for a tool this build shows, only where the country has a record, and
//     only with at least one link;
//   - rows come in one fixed order, standards, dates, guidance, never sorted by volume;
//   - EU rules has left qscatlas.org (Swann, 2 October 2026): no row, no link and no "Read the
//     article" points to it, whatever the registry says;
//   - no row links to the standards list or to a standard's page; the Standards Cascade link
//     stays, and the standards are named in plain text;
//   - each row is "own" (the country's own record, a solid marker) or "membership" (a record that
//     reaches it through EU membership, an open marker, and the sentence says so first);
//   - guidance reaches a country only through the guide's issuing jurisdiction or EU membership,
//     never through a shared coordination posture: ANSSI's FAQ never "applies to" Italy;
//   - a standard that is not final carries the Cascade's own status words, and a document that
//     names an algorithm only by its earlier name says so, with that name;
//   - no total across rows or groups is returned, and nothing here counts tools, so the block
//     cannot read as a tally or a score;
//   - the EU roadmap's targets are said once: where the guidance row names them for a Member
//     State, that row carries the dates links and no membership dates row repeats them.
// Each row comes twice: as parts (plain text, counts and dates for the mono face, and inline
// links such as a keeping period's preset in the Exposure Clock), which the page renders, and as
// one plain sentence, the fallback for print and for anything that cannot render parts. links[]
// holds the verb links that follow the sentence, never a link already inline in the parts.
// The visible sentences are drafts for Swann's approval (decision 1).

import type { LoadOptions } from '../lab/load';
import { isProduction } from '../lab/load';
import { parseRegulation, parseTimeline } from '../parse';
import { deriveLegalStatus, instrumentStatusMeta, legalStatusMeta } from '../regulation';
import type { LegalStatus } from '../regulation';
import { link, pageHref, shown } from './gates';
import { datesFor, foldLines } from './dates';
import { dateAnnotation, instrumentAnnotation } from './annotations';
import type { Kind } from './annotations';
import {
  atlasDocuments,
  cascadeFiles,
  cascadeStatusWords,
  euMembers,
  exposurePlaces,
  guides,
  guidesForDocument,
  joinAnd,
  keepingPeriods,
  monthYear,
  nameInSentence,
  placeName,
  profilesByIso3,
  standardShortName,
} from './joins';
import { docId } from './docid';

export interface EvidenceInput {
  iso3: string;
  name: string;
  posture: string | null; // read for nothing here: posture never decides a row
  dataStatus: string | null;
  migrationTimeline: string | null;
  mainRegulation: string | null;
  standardFamilies: string | null;
  algorithms: string | null;
  lastUpdated?: string | null; // the profile's Updated date, for the dates row; else the JSON copy's
}

export type EvidenceGroup = 'standards' | 'dates' | 'guidance';

/**
 * One piece of a row's sentence: plain text, a count or date for the mono face, a link inline in
 * the sentence (a keeping period's preset), or a name kept whole on one line (a standard's short
 * name, which a reader copies and cites, so it never breaks at its hyphen or between its words).
 */
export type EvidencePart = { text: string } | { mono: string } | { text: string; href: string } | { text: string; whole: true };

/** A verb link after a row's sentence; hint, where set, completes its name for a screen reader. */
export interface EvidenceLink {
  label: string;
  href: string;
  hint?: string;
}

export interface EvidenceRow {
  tool: string;
  group: EvidenceGroup;
  relation: 'own' | 'membership';
  sentence: string; // the parts as one plain sentence
  parts: EvidencePart[]; // what the page renders
  count?: number; // shown in mono beside the sentence where it helps; never summed
  links: EvidenceLink[]; // the verb links after the sentence
  asOf: string | null; // the dataset's as-of date
}

export type EvidenceEmpty = 'absent' | 'no-record' | null;

/** The order of the groups on every profile. */
export const GROUP_ORDER: readonly EvidenceGroup[] = ['standards', 'dates', 'guidance'];

/**
 * The tools that can add a row, and the group each one feeds. No tool of another site is among
 * them, so not EU rules (the Rulebook), which has left qscatlas.org.
 */
export const EVIDENCE_TOOLS: Readonly<Record<string, EvidenceGroup>> = {
  cascade: 'standards',
  dates: 'dates',
  exposure: 'dates',
  readiness: 'guidance',
};

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const linksOf = (items: { label: string; href: string | null; hint?: string }[]) =>
  items.filter((l): l is EvidenceLink => typeof l.href === 'string');

// ---- parts -------------------------------------------------------------------------------------

type Part = EvidencePart;
const T = (text: string): Part => ({ text });
const M = (value: string | number): Part => ({ mono: String(value) });
const A = (text: string, href: string | null): Part => (href ? { text, href } : { text });
const W = (text: string): Part => ({ text, whole: true });
const partText = (p: Part) => ('mono' in p ? p.mono : p.text);
const isPlain = (p: Part): p is { text: string } => !('mono' in p) && !('href' in p) && !('whole' in p);

/** "a", "a and b", "a, b and c", over runs of parts. */
function listParts(items: Part[][]): Part[] {
  const out: Part[] = [];
  items.forEach((item, i) => {
    if (i > 0) out.push(T(i === items.length - 1 ? ' and ' : ', '));
    out.push(...item);
  });
  return out;
}

/** A row from its parts: adjacent plain text merged, and the plain sentence beside it. */
function row(base: Omit<EvidenceRow, 'sentence' | 'parts'>, raw: Part[]): EvidenceRow {
  const parts: Part[] = [];
  for (const p of raw) {
    if (isPlain(p) && !p.text) continue;
    const last = parts[parts.length - 1];
    if (isPlain(p) && last && isPlain(last)) parts[parts.length - 1] = T(last.text + p.text);
    else parts.push(p);
  }
  return { ...base, sentence: parts.map(partText).join(''), parts };
}

/** Groups that may each hold "and": a serial comma before the last keeps them apart. */
function groupList(groups: Part[][]): Part[] {
  const joined = listParts(groups);
  const inner = groups.slice(0, -1).some((g) => g.some((p) => isPlain(p) && p.text.includes(' and ')));
  if (!inner || groups.length < 2) return joined;
  const at = joined.map(partText).lastIndexOf(' and ');
  return joined.map((p, i) => (i === at ? T(', and ') : p));
}

const noun = (n: number, one: string, many: string): Part[] => [M(n), T(` ${n === 1 ? one : many}`)];

/** "2026 to 2035", or "all in 2030" when the years are one. */
const yearSpan = (lo: number, hi: number): Part[] => (lo === hi ? [T('all in '), M(lo)] : [M(lo), T(' to '), M(hi)]);

// ---- dates of any precision --------------------------------------------------------------------

/** The start of an ISO date of any precision (YYYY, YYYY-MM, YYYY-MM-DD), for ordering. */
const periodStart = (d: string) => (d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);

/** The earliest of some ISO dates of any precision, by period start. */
function earliestDate(dates: string[]): string | null {
  return [...dates].sort((a, b) => periodStart(a).localeCompare(periodStart(b)))[0] ?? null;
}

// ---- standards [cascade] -----------------------------------------------------------------------

// relations in which a document names a standard; "participates" joins a body, not a standard
const NAMING = new Set(['adopts', 'references', 'profiles']);

const LATIN = /^[\x20-\x7E]+$/;

/**
 * The names a sentence gives a national process: its first name in Latin script ("KpqC", "NGCC"),
 * else the names its label gives in brackets (Kodieum, Shipovnik), else the label itself.
 */
function processNames(s: { label: string; synonyms: { text: string }[] }): string[] {
  const latin = s.synonyms.find((x) => LATIN.test(x.text));
  if (latin) return [latin.text];
  const inBrackets = /\(([^)]+)\)\s*$/.exec(s.label)?.[1];
  if (inBrackets && LATIN.test(inBrackets)) return inBrackets.split(',').map((x) => x.trim()).filter(Boolean);
  return [standardShortName(s.label)];
}

type CascadeData = ReturnType<typeof cascadeFiles>;
type CascadeEdge = CascadeData['edges'][number];
type CascadeStandard = CascadeData['standards'][number];

/**
 * The earlier name under which some documents name a standard's algorithm: the longest of the
 * standard's pre-standard names that their excerpts quote ("CRYSTALS-Kyber" before "Kyber"), else
 * its first pre-standard name, else null. Never a name the standards file does not record.
 */
function earlierName(s: CascadeStandard, edges: CascadeEdge[]): string | null {
  const names = s.synonyms.filter((x) => x.type === 'pre-standard').map((x) => x.text);
  if (!names.length) return null;
  const quoted = edges
    .flatMap((e) => e.provenance.map((p) => p.excerpt))
    .join(' ')
    .toLowerCase();
  return [...names].sort((a, b) => b.length - a.length).find((n) => quoted.includes(n.toLowerCase())) ?? names[0];
}

/** "the algorithm behind FIPS 205 under its earlier name, SPHINCS+" (names only when every one is known). */
function earlierNamesParts(standards: CascadeStandard[], edges: CascadeEdge[], label: (s: CascadeStandard) => Part[]): Part[] {
  const one = standards.length === 1;
  const names = standards.map((s) => earlierName(s, edges.filter((e) => e.to === s.id)));
  const known = names.every((n): n is string => n !== null);
  return [
    T(one ? 'the algorithm behind ' : 'the algorithms behind '),
    ...listParts(standards.map(label)),
    T(one ? ' under its earlier name' : ' under their earlier names'),
    ...(known ? [T(', '), T(joinAnd(names as string[]))] : []),
  ];
}

/** A standard's short name, followed by the Cascade's status words when it is not final. */
function withStatus(s: CascadeStandard, name: Part, words: { selected: string; draft: string }): Part[] {
  const status = s.standardStatus === 'selected' ? words.selected : s.standardStatus === 'draft' ? words.draft : null;
  return status ? [name, T(` (${status})`)] : [name];
}

function standardsRows(iso3: string, name: string, opts: LoadOptions): EvidenceRow[] {
  if (!shown('cascade', opts)) return [];
  const { edges, standards, spine, asOf } = cascadeFiles(opts);
  const words = cascadeStatusWords(opts);
  const rows: EvidenceRow[] = [];
  const order = new Map(standards.map((s, i) => [s.id, i]));
  const byId = new Map(standards.map((s) => [s.id, s]));
  // each standard is named in plain text: the standards list and the standards' own pages are
  // not for visitors, and the row's one link is the Standards Cascade
  const short = (id: string) => W(standardShortName(byId.get(id)!.label));

  // own: the documents in which the country names a standard
  const naming = edges.filter((e) => e.from === iso3 && NAMING.has(e.relation) && byId.has(e.to) && !byId.get(e.to)!.national);
  if (naming.length) {
    const ids = [...new Set(naming.map((e) => e.to))].sort((a, b) => order.get(a)! - order.get(b)!);
    const isFinal = (id: string) => byId.get(id)!.standardStatus === 'final';
    const finals = ids.filter(isFinal);
    // a selection or a draft is never called a standard: the Cascade's status words go with it,
    // grouped by status in the standards file's order
    const pending: Part[][] = (['selected', 'draft'] as const)
      .map((status) => ids.filter((id) => byId.get(id)!.standardStatus === status))
      .filter((group) => group.length)
      .map((group) => [...listParts(group.map((id) => [short(id)])), T(` (${words[byId.get(group[0])!.standardStatus as 'selected' | 'draft']})`)]);
    // the count is of the documents that name a final standard; with none, of every naming document
    const counted = finals.length ? naming.filter((e) => isFinal(e.to)) : naming;
    const docs = new Set(counted.map((e) => docId(e.documentUrl))).size;
    const parts: Part[] = finals.length
      ? [
          T('Names post-quantum standards in '),
          ...noun(docs, 'document', 'documents'),
          T(': '),
          ...listParts(finals.map((id) => [short(id)])),
          T('.'),
          ...(pending.length ? [T(' It also names '), ...groupList(pending), T('.')] : []),
        ]
      : [T('Names '), ...groupList(pending), T(' in '), ...noun(docs, 'document', 'documents'), T('.')];

    // the date stands apart from the list: the earliest counted document, and any algorithm it
    // names only by its earlier name (Kyber before FIPS 203 existed)
    const first = earliestDate(counted.map((e) => e.date));
    if (first) {
      // every edge of the earliest documents, including a selection they also name (FALCON)
      const firstDocs = new Set(counted.filter((e) => periodStart(e.date) === periodStart(first)).map((e) => docId(e.documentUrl)));
      const firstEdges = naming.filter((e) => firstDocs.has(docId(e.documentUrl)));
      const preIds = ids.filter((id) => {
        const at = firstEdges.filter((e) => e.to === id);
        return at.length > 0 && at.every((e) => e.preStandardOnly);
      });
      const lead = docs === 1 ? 'That document' : 'The earliest';
      parts.push(
        ...(preIds.length
          ? [
              T(` ${lead}, from `),
              M(monthYear(first)),
              T(', names '),
              // the status words were given once already, so the names stand alone here
              ...earlierNamesParts(preIds.map((id) => byId.get(id)!), firstEdges, (s) => [short(s.id)]),
              T('.'),
            ]
          : [T(` ${lead} dates from `), M(monthYear(first)), T('.')]),
      );
    }
    const links = linksOf([{ label: `See ${name} in the Standards Cascade`, href: link('cascade', { query: { sel: iso3 } }, opts) }]);
    if (links.length) rows.push(row({ tool: 'cascade', group: 'standards', relation: 'own', count: docs, links, asOf }, parts));
  }

  // own process: a national post-quantum scheme of the country's own, with the earliest dated
  // record the Atlas holds of it (a spine event or a document), and what that record concerns
  for (const s of standards.filter((x) => x.national === iso3)) {
    const records = [
      ...spine.filter((e) => e.date && e.standards.includes(s.id)).map((e) => ({ date: e.date as string, text: e.label })),
      ...edges.filter((e) => e.to === s.id && e.from === iso3).map((e) => ({ date: e.date, text: e.documentTitle })),
    ].sort((a, b) => periodStart(a.date).localeCompare(periodStart(b.date)));
    const first = records[0];
    if (!first) continue; // no dated, verified record of the process
    const names = processNames(s);
    // a process of several schemes whose earliest record names only some of them says which
    const named = names.length > 1 ? names.filter((n) => first.text.toLowerCase().includes(n.toLowerCase())) : [];
    const concerns = named.length > 0 && named.length < names.length ? named : null;
    const links = linksOf([{ label: `See ${name}'s own process in the Standards Cascade`, href: link('cascade', { query: { sel: iso3, fork: '1' } }, opts) }]);
    if (!links.length) continue;
    rows.push(
      row({ tool: 'cascade', group: 'standards', relation: 'own', links, asOf }, [
        T('Runs its own post-quantum process, '),
        T(joinAnd(names)),
        T('. The earliest Atlas record of it dates from '),
        M(monthYear(first.date)),
        ...(concerns ? [T(' and concerns '), T(joinAnd(concerns))] : []),
        T('.'),
      ]),
    );
  }
  return rows;
}

// ---- dates [dates, exposure] -------------------------------------------------------------------

/** Verb links that another group's row carries instead of a row of their own. */
type Carried = EvidenceLink[];

// The dates row read from the profile's own timeline lines. The profile page draws that timeline
// itself, with the same two links under it (timelineLinks), so the page leaves this row out
// rather than say it twice; Target dates and the tests still read it. Kept in a WeakSet, so the
// row's own shape (and every snapshot of it) is unchanged.
const TIMELINE_ROWS = new WeakSet<EvidenceRow>();

/** True for the dates row that restates the profile's own migration timeline. */
export function isTimelineRow(r: EvidenceRow): boolean {
  return TIMELINE_ROWS.has(r);
}

/**
 * True when Target dates holds every one of these own lines in this build, so "Compare with other
 * places" never opens on less than the profile shows. A production build leaves out a line Target
 * dates holds only as a lead (an unconfirmed annotation, or a place still awaiting a re-read at the
 * primary source); a preview build keeps every line.
 */
function targetDatesHolds(iso3: string, own: { year: number; label: string }[], opts: LoadOptions): boolean {
  if (!isProduction(opts.env)) return true;
  const key = (year: number, label: string) => `${year}|${label.trim()}`;
  const kept = new Set(datesFor([iso3], opts).filter((r) => r.origin === 'profile').map((r) => key(r.year, r.label)));
  return own.every((m) => kept.has(key(m.year, m.label)));
}

/**
 * The dates rows, and the links of a Member State's roadmap dates when the guidance group already
 * carries the EU roadmap's membership row (euGuidance): that row names the same three targets, so
 * the block says them once and the guidance row takes the dates links.
 */
function datesRows(input: EvidenceInput, iso3: string, name: string, member: boolean, euGuidance: boolean, opts: LoadOptions): { rows: EvidenceRow[]; carried: Carried } {
  const datesOn = shown('dates', opts);
  const exposureOn = shown('exposure', opts);
  const carried: Carried = [];
  if (!datesOn && !exposureOn) return { rows: [], carried };
  const rows: EvidenceRow[] = [];
  const tool = datesOn ? 'dates' : 'exposure';
  const places = exposurePlaces(opts);
  const dateLinks = (j: string | null, compare = true) =>
    linksOf([
      { label: 'Compare with other places', href: datesOn && compare ? link('dates', { query: { in: iso3 } }, opts) : null },
      { label: 'Set against how long data must stay secret', href: exposureOn && j ? link('exposure', { query: { j } }, opts) : null },
    ]);
  const guideName = (id: string) => `the ${guides(opts).find((g) => g.id === id)?.shortLabel ?? id}`;

  // own: the profile's own timeline lines, counted from the page's own fields (spec 16.6). A line
  // whose confirmed annotation folds it into a guide's row is that guide's target, by the same
  // rule Target dates draws it once (foldLines), so it is not counted as the country's own.
  const lines = parseTimeline(input.migrationTimeline).filter((m): m is typeof m & { year: number } => typeof m.year === 'number');
  const folds = foldLines(iso3, lines, opts);
  const own = lines.filter((_, i) => !folds[i]);
  const compare = targetDatesHolds(iso3, own, opts);
  const folded = folds.filter((f): f is string => f !== null);
  let dated = false;
  if (own.length) {
    const years = own.map((m) => m.year);
    const links = dateLinks(places.has(iso3) ? iso3 : null, compare);
    if (links.length) {
      const span = yearSpan(Math.min(...years), Math.max(...years));
      const parts: Part[] =
        own.length === 1
          ? [M(1), T(folded.length ? ' date of its own on its migration timeline: ' : ' date on its migration timeline: '), M(years[0])]
          : [M(own.length), T(folded.length ? ' dates of its own on its migration timeline, ' : ' dates on its migration timeline, '), ...span];
      if (folded.length) {
        parts.push(T('; '), ...noun(folded.length, 'more repeats', 'more repeat'), T(` ${joinAnd([...new Set(folded)].map(guideName))}`));
      }
      parts.push(T('.'));
      const timelineRow = row(
        {
          tool: datesOn && compare ? 'dates' : 'exposure',
          group: 'dates',
          relation: 'own',
          count: own.length,
          links,
          asOf: input.lastUpdated ?? profilesByIso3(opts).get(iso3)?.lastUpdated ?? null,
        },
        parts,
      );
      TIMELINE_ROWS.add(timelineRow);
      rows.push(timelineRow);
      dated = true;
    }
  }

  // with no own line to show, the dated targets of guides that reach the place: the guides it
  // publishes itself (the EU's roadmap for the EU), else the EU roadmap for a Member State. These
  // are the rows Target dates draws for the place, so the block never says "no record" while
  // that page holds dates for it.
  if (!dated) {
    const fromGuides = datesFor([iso3], opts).filter((r) => r.origin === 'guide' && !r.lead);
    const mine = fromGuides.filter((r) => r.relation === 'own');
    const reach = mine.length ? mine : fromGuides.filter((r) => r.relation === 'membership');
    const ownGuides = mine.length > 0;
    const j = places.has(iso3) ? iso3 : (ownGuides && iso3 === 'EUU') || (!ownGuides && member) ? (places.has('EUU') ? 'EUU' : null) : null;
    const links = reach.length ? dateLinks(j) : [];
    const onlyRoadmap = reach.length > 0 && reach.every((r) => r.guide === EU_ROADMAP);
    if (links.length && !ownGuides && euGuidance && onlyRoadmap) {
      carried.push(...links);
    } else if (links.length) {
      const years = reach.map((r) => r.year);
      const names = joinAnd([...new Set(reach.map((r) => r.guide!))].map(guideName));
      const span = yearSpan(Math.min(...years), Math.max(...years));
      const count = noun(reach.length, 'target date', 'target dates');
      rows.push(
        row(
          {
            tool,
            group: 'dates',
            relation: ownGuides ? 'own' : 'membership',
            count: reach.length,
            links,
            asOf: latestOf(reach.map((r) => guides(opts).find((g) => g.id === r.guide)?.verifiedAt ?? null)),
          },
          ownGuides
            ? [...count, T(` in ${names} it publishes, `), ...span, T('.')]
            : [T(`As an EU Member State, ${name} is addressed by ${names}, with `), ...count, T(', '), ...span, T('.')],
        ),
      );
    }
  }

  // own: the periods the Exposure Clock has read for this country (confidentiality, closure or
  // retention, each with its basis in the Clock); each category links inline to its preset
  if (exposureOn) {
    const { periods, asOf } = keepingPeriods(iso3, opts);
    const j = places.has(iso3) ? iso3 : undefined;
    const items = periods
      .map((p) => ({ label: lowerFirst(p.label), href: link('exposure', { query: { c: p.preset, j } }, opts) }))
      .filter((p): p is { label: string; href: string } => p.href !== null);
    if (items.length) {
      rows.push(
        row({ tool: 'exposure', group: 'dates', relation: 'own', links: [], asOf }, [
          T(`Periods the Exposure Clock has read for ${name}: `),
          ...listParts(items.map((p) => [A(p.label, p.href)])),
          T('.'),
        ]),
      );
    }
  }
  return { rows, carried };
}

/**
 * The two links under a profile's migration timeline (spec 7.1, item 7), by the same rules as the
 * dates row: "Compare with other places" only when Target dates holds every own line in this
 * build, and the Exposure Clock only for a place it offers. Empty when the profile has no dated
 * line or neither tool is shown.
 */
export function timelineLinks(iso3: string, migrationTimeline: string | null | undefined, opts: LoadOptions = {}): EvidenceLink[] {
  const code = iso3.toUpperCase();
  const lines = parseTimeline(migrationTimeline).filter((m): m is typeof m & { year: number } => typeof m.year === 'number');
  if (!lines.length) return [];
  const folds = foldLines(code, lines, opts);
  const own = lines.filter((_, i) => !folds[i]);
  const compare = targetDatesHolds(code, own, opts);
  const j = exposurePlaces(opts).has(code) ? code : null;
  return linksOf([
    { label: 'Compare with other places', href: compare ? link('dates', { query: { in: code } }, opts) : null },
    { label: 'Set against how long data must stay secret', href: j ? link('exposure', { query: { j } }, opts) : null },
  ]);
}

/** The latest of some ISO days, or null. */
function latestOf(days: (string | null)[]): string | null {
  return days.filter((d): d is string => !!d).sort().pop() ?? null;
}

// ---- guidance [readiness] ----------------------------------------------------------------------

const EU_ROADMAP = 'eu-roadmap';

/**
 * The verb links of a guide's row. Two guide rows can sit one above the other (France: the ANSSI
 * FAQ and the EU roadmap), so each link carries the guide's name as a hint a screen reader reads
 * and the eye does not need.
 */
function guideLinks(g: { id: string; shortLabel: string; actions: number }, opts: LoadOptions): Carried {
  return linksOf([
    { label: 'Read the guide', href: pageHref(`/prepare/guides/${g.id}`, opts), hint: `: the ${g.shortLabel}` },
    { label: 'Mark these actions', href: g.actions ? link('readiness', { hash: `f=${g.id}` }, opts) : null, hint: ` from the ${g.shortLabel}` },
  ]);
}

/** The EU coordinated roadmap, when it gives a Member State a guidance row in this build. */
function euRoadmapGuide(member: boolean, opts: LoadOptions) {
  if (!member || !shown('readiness', opts)) return null;
  const eu = guides(opts).find((g) => g.id === EU_ROADMAP && g.verified);
  return eu && eu.milestones.length && guideLinks(eu, opts).length ? eu : null;
}

function guidanceRows(iso3: string, name: string, member: boolean, carried: Carried, opts: LoadOptions): EvidenceRow[] {
  if (!shown('readiness', opts)) return [];
  const all = guides(opts).filter((g) => g.verified);
  const rows: EvidenceRow[] = [];

  // own: guides the country itself issues, by the guide's jurisdiction and nothing else
  for (const g of all.filter((x) => x.jurisdiction === iso3)) {
    const links = guideLinks(g, opts);
    if (!links.length) continue;
    rows.push(
      row(
        { tool: 'readiness', group: 'guidance', relation: 'own', count: g.actions || undefined, links, asOf: g.verifiedAt },
        g.actions
          ? [T(`Publishes the ${g.shortLabel}, quoted in `), ...noun(g.actions, 'action', 'actions'), T(' of the Readiness Check.')]
          : [T(`Publishes the ${g.shortLabel}, one of the guides in Prepare.`)],
      ),
    );
  }

  // membership: the EU coordinated roadmap addresses every Member State; where the dates group
  // would repeat its targets, this row carries the dates links instead (datesRows)
  const eu = euRoadmapGuide(member, opts);
  if (eu) {
    const years = eu.milestones.map((m) => [M(m.year)]);
    const allEnd = eu.milestones.every((m) => m.month === 12);
    const when = [...(allEnd ? [T('end ')] : []), ...listParts(years)];
    const soft = eu.bindingness === 'soft-law' || eu.bindingness === 'guidance';
    rows.push(
      row(
        { tool: 'readiness', group: 'guidance', relation: 'membership', links: [...guideLinks(eu, opts), ...carried], asOf: eu.verifiedAt },
        soft
          ? [T(`As an EU Member State, ${name} is addressed by the EU coordinated roadmap; its targets for `), ...when, T(' are recommendations.')]
          : [T(`As an EU Member State, ${name} is addressed by the EU coordinated roadmap, with targets for `), ...when, T('.')],
      ),
    );
  }
  return rows;
}

// ---- the block ---------------------------------------------------------------------------------

/** True when this build shows at least one tool that can add a row. */
export function anyEvidenceTool(opts: LoadOptions = {}): boolean {
  return Object.keys(EVIDENCE_TOOLS).some((id) => shown(id, opts));
}

/**
 * The Across the Atlas rows for one profile, in the fixed group order, and the empty state:
 * "absent" when no evidence tool is shown or a Placeholder profile has no row (the block is not
 * rendered); "no-record" when some tool is shown but the Atlas tools hold nothing for this
 * country (one italic muted line); null when there are rows.
 */
export function connectedEvidence(input: EvidenceInput, opts: LoadOptions = {}): { rows: EvidenceRow[]; empty: EvidenceEmpty } {
  if (!anyEvidenceTool(opts)) return { rows: [], empty: 'absent' };
  const iso3 = input.iso3.toUpperCase();
  const name = nameInSentence(input.name || placeName(iso3, opts));
  const member = iso3 !== 'EUU' && euMembers(opts).has(iso3);
  // a Member State's roadmap dates ride on the roadmap's guidance row when that row is shown
  const dates = datesRows(input, iso3, name, member, euRoadmapGuide(member, opts) !== null, opts);
  const rows = [
    ...standardsRows(iso3, name, opts),
    ...dates.rows,
    ...guidanceRows(iso3, name, member, dates.carried, opts),
  ];
  if (rows.length) return { rows, empty: null };
  return { rows, empty: input.dataStatus === 'Placeholder' ? 'absent' : 'no-record' };
}

// ---- helpers for the profile and the documents page --------------------------------------------

function notesFor(docs: { id: string; url: string }[], opts: LoadOptions): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (id: string, note: string) => out.set(id, [...(out.get(id) ?? []), note]);
  if (shown('cascade', opts)) {
    const { edges, standards } = cascadeFiles(opts);
    const words = cascadeStatusWords(opts);
    const byId = new Map(standards.map((s) => [s.id, s]));
    const order = new Map(standards.map((s, i) => [s.id, i]));
    // per document: the edges by which it names each standard
    const named = new Map<string, Map<string, CascadeEdge[]>>();
    for (const e of edges) {
      if (e.relation === 'participates' || !byId.has(e.to)) continue;
      const id = docId(e.documentUrl);
      const byStandard = named.get(id) ?? new Map<string, CascadeEdge[]>();
      byStandard.set(e.to, [...(byStandard.get(e.to) ?? []), e]);
      named.set(id, byStandard);
    }
    const label = (s: CascadeStandard) => withStatus(s, T(standardShortName(s.label)), words);
    for (const d of docs) {
      const byStandard = named.get(d.id);
      if (!byStandard?.size) continue;
      const ids = [...byStandard.keys()].sort((a, b) => order.get(a)! - order.get(b)!);
      // a standard the document names only by its earlier name is said to be so, with that name
      const pre = ids.filter((x) => byStandard.get(x)!.every((e) => e.preStandardOnly));
      const official = ids.filter((x) => !pre.includes(x));
      const pieces: Part[][] = [];
      if (official.length) pieces.push(listParts(official.map((x) => label(byId.get(x)!))));
      if (pre.length) pieces.push(earlierNamesParts(pre.map((x) => byId.get(x)!), pre.flatMap((x) => byStandard.get(x)!), label));
      const text = pieces.map((p) => p.map(partText).join('')).join(', and ');
      add(d.id, `Named in the Standards Cascade: ${text}`);
    }
  }
  if (shown('readiness', opts)) {
    const short = new Map(guides(opts).filter((g) => g.verified).map((g) => [g.id, g.shortLabel]));
    for (const d of docs) {
      for (const g of guidesForDocument(d.url, opts)) {
        if (short.has(g)) add(d.id, `A guide in Prepare: ${short.get(g)}`);
      }
    }
  }
  return out;
}

/** Quiet notes for a country's documents, by docId, from the tools this build shows. */
export function documentNotes(iso3: string, opts: LoadOptions = {}): Map<string, string[]> {
  const code = iso3.toUpperCase();
  return notesFor(atlasDocuments(opts).filter((d) => d.country === code), opts);
}

/** The same notes for every included document, for the Documents page. */
export function allDocumentNotes(opts: LoadOptions = {}): Map<string, string[]> {
  return notesFor(atlasDocuments(opts), opts);
}

const fold = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The page of a standard a profile names ("ML-KEM", "FIPS 203", "CRYSTALS-Kyber"), matched
 * against the Cascade's own names for it; null when the name is unknown or its page is not built.
 */
export function standardHref(name: string, opts: LoadOptions = {}): string | null {
  if (!shown('cascade', opts)) return null;
  const key = fold(name);
  if (!key) return null;
  const hit = cascadeFiles(opts).standards.find(
    (s) => fold(s.label) === key || fold(standardShortName(s.label)) === key || s.synonyms.some((x) => fold(x.text) === key),
  );
  return hit ? pageHref(`/standards/${hit.id.toLowerCase()}`, opts) : null;
}

// ---- the profile's own fields, read for its page (spec 7.1) ------------------------------------
//
// The rail, Rules that apply and the migration timeline read a profile's own fields against the
// annotations sidecar here, once, so the page and its tests agree. Nothing is inferred: a kind,
// status, bindingness or scope that the Atlas has not recorded is simply absent. In production
// the unconfirmed annotations (leads) never reach these readings, because loadDataset drops them.

/** The kinds of date, in the words a visitor reads (spec 13). */
export const KIND_WORDS: Readonly<Record<Kind, string>> = {
  plan: 'plan',
  priority: 'priority systems',
  complete: 'completion',
  procurement: 'procurement',
  other: 'other',
};

/** Lifecycle status, in the words a visitor reads; a separate axis from bindingness. */
export const STATUS_WORDS: Readonly<Record<string, string>> = {
  proposal: 'Proposal',
  adopted: 'Adopted',
  'in-force': 'In force',
  'applies-from': 'Applies from a later date',
  repealed: 'Repealed',
  withdrawn: 'Withdrawn',
  published: 'Published',
  superseded: 'Superseded',
};

/** "set in law" for a binding instrument, "set in guidance" for soft law and guidance, else null. */
export function laneWords(bindingness: string | null | undefined): 'set in law' | 'set in guidance' | null {
  const meta = instrumentStatusMeta(bindingness);
  return meta ? (meta.binding ? 'set in law' : 'set in guidance') : null;
}

export interface RuleLine {
  instrument: string;
  level: string | null;
  proposal: boolean; // "Proposal, not law", and no bindingness label
  status: string | null; // lifecycle status in words, where the annotations record it
  bindingness: { key: string; label: string; binding: boolean } | null; // never set on a proposal
  scope: string | null; // "names post-quantum cryptography" or "general cyber law", where recorded
  generalCyber: boolean;
}

/**
 * The regulation lines of a profile with Status and Bindingness as two separate labels. A line
 * whose instrument starts with "Proposal", or that the annotations mark as a proposal, is a
 * proposal: it carries no bindingness label and no status, whatever the profile field says.
 */
export function readRules(iso3: string, mainRegulation: string | null | undefined, opts: LoadOptions = {}): RuleLine[] {
  const code = iso3.toUpperCase();
  return parseRegulation(mainRegulation).map((r) => {
    const note = instrumentAnnotation(code, r.instrument, opts);
    const proposal = /^proposal\b/i.test(r.instrument) || note?.status === 'proposal';
    const meta = proposal ? null : instrumentStatusMeta(r.status);
    return {
      instrument: r.instrument,
      level: r.level,
      proposal,
      status: !proposal && note?.status ? (STATUS_WORDS[note.status] ?? null) : null,
      bindingness: meta ? { key: meta.key, label: meta.label, binding: meta.binding } : null,
      scope: note?.pqcScope === 'pqc-specific' ? 'names post-quantum cryptography' : note?.pqcScope === 'general-cyber' ? 'general cyber law' : null,
      generalCyber: note?.pqcScope === 'general-cyber',
    };
  });
}

const BINDING_WORDS: Readonly<Record<LegalStatus, string>> = {
  binding: 'Binding instruments recorded',
  'soft-only': 'Soft law and guidance only',
  none: 'None recorded',
};

/**
 * The rail's Bindingness, in words and never beside a year: from the profile's Legal Status, else
 * from its lines (proposals left out). The scope note "none names post-quantum cryptography"
 * appears only where the annotations record every binding instrument as general cyber law.
 */
export function bindingWords(legalStatus: string | null | undefined, rules: RuleLine[]): { words: string | null; scopeNote: string | null } {
  const counted = rules.filter((r) => !r.proposal);
  const key = legalStatusMeta(legalStatus)?.key ?? (counted.length ? deriveLegalStatus(counted.map((r) => r.bindingness?.key ?? null)) : null);
  const binding = counted.filter((r) => r.bindingness?.binding);
  const scopeNote = key === 'binding' && binding.length > 0 && binding.every((r) => r.generalCyber) ? 'none names post-quantum cryptography' : null;
  return { words: key ? BINDING_WORDS[key] : null, scopeNote };
}

export interface TimelineLine {
  year: number | string; // numeric when plottable; a range plots at its end year
  display: string; // the year as the profile writes it
  label: string;
  open: boolean; // a confirmed restatement of the EU coordinated roadmap, reaching the place through membership
  meta: string[]; // kind, bindingness, scope and origin words where recorded, "not recorded" where not
  lead: boolean; // the words rest on an annotation not yet confirmed (preview only)
  kind: Kind | null;
  bindingness: string | null;
  status: string | null;
}

/** What the timeline says where the Atlas has recorded neither a kind nor a bindingness. */
export const NOT_RECORDED = {
  both: 'kind and bindingness not recorded',
  kind: 'kind not recorded',
  bindingness: 'bindingness not recorded',
} as const;

/**
 * The lines of a profile's migration timeline, each with the kind, bindingness and scope its
 * annotation records, and "not recorded" for what it does not record (spec 1: never an inference).
 * A line that restates the EU coordinated roadmap reads "From the EU coordinated roadmap,
 * addressed to Member States"; it takes the open marker only when foldLines folds it into the
 * roadmap, the one rule Across the Atlas and Target dates also follow, so an unconfirmed lead
 * keeps the solid marker of the country's own line and says it is unconfirmed.
 */
export function readTimeline(iso3: string, migrationTimeline: string | null | undefined, member: boolean, opts: LoadOptions = {}): TimelineLine[] {
  const code = iso3.toUpperCase();
  const all = guides(opts);
  const parsed = parseTimeline(migrationTimeline);
  const dated = parsed.filter((m): m is typeof m & { year: number } => typeof m.year === 'number');
  const folds = new Map(foldLines(code, dated, opts).map((f, i) => [dated[i], f]));
  return parsed.map((m) => {
    const note = typeof m.year === 'number' ? dateAnnotation(code, m.year, m.label, opts) : null;
    const restated = note?.restates ? (all.find((g) => g.id === note.restates) ?? null) : null;
    const open = member && folds.get(m as (typeof dated)[number]) === EU_ROADMAP;
    const meta: string[] = [];
    const lane = note?.status === 'proposal' ? 'in a proposal, not law' : laneWords(note?.bindingness);
    if (note?.kind && lane) meta.push(KIND_WORDS[note.kind], lane);
    else if (note?.kind) meta.push(KIND_WORDS[note.kind], NOT_RECORDED.bindingness);
    else if (lane) meta.push(NOT_RECORDED.kind, lane);
    else meta.push(NOT_RECORDED.both);
    if (note?.scope) meta.push(note.scope);
    if (restated) meta.push(restated.id === EU_ROADMAP && member ? 'From the EU coordinated roadmap, addressed to Member States' : `From the ${restated.shortLabel}`);
    return {
      year: m.year,
      display: m.display,
      label: m.label,
      open,
      meta,
      lead: !!note?.verify,
      kind: note?.kind ?? null,
      bindingness: note?.bindingness ?? null,
      status: note?.status ?? null,
    };
  });
}

export interface TimelineMetaFold {
  shared: string[]; // the meta words every line carries, said once above the list
  lead: boolean; // every line rests on an unconfirmed annotation, said once above the list
  rows: { meta: string[]; lead: boolean }[]; // what each line still says for itself, in order
}

/**
 * What every line of a timeline says alike, said once (the minimal pass, 2 October 2026): the
 * meta words all the lines share, and whether all of them are unconfirmed, come out of the rows
 * so the timeline says them in one line above its list, and each row keeps only what is its
 * own. A timeline of one line keeps its words in its row, since there is nothing to repeat.
 * Nothing is added or inferred: the words are the ones readTimeline gave each line.
 */
export function foldTimelineMeta(lines: TimelineLine[]): TimelineMetaFold {
  if (lines.length < 2) return { shared: [], lead: false, rows: lines.map((l) => ({ meta: [...l.meta], lead: l.lead })) };
  const shared = lines[0].meta.filter((w) => lines.every((l) => l.meta.includes(w)));
  const lead = lines.every((l) => l.lead);
  return {
    shared,
    lead,
    rows: lines.map((l) => ({ meta: l.meta.filter((w) => !shared.includes(w)), lead: l.lead && !lead })),
  };
}

export interface TimelineSpan {
  dates: number; // dated lines on the timeline, for "4 dates"
  from: number;
  to: number;
  latest: { year: string; words: string; lead: boolean } | null; // only where the latest line is annotated
}

/**
 * The rail's Timeline: how many dated lines, from which year to which, and, where the latest line
 * is annotated, its kind and lane: "2035: completion, in guidance (not a legal deadline)". Null
 * when the profile has no dated line.
 */
export function timelineSpan(lines: TimelineLine[]): TimelineSpan | null {
  const dated = lines.filter((l): l is TimelineLine & { year: number } => typeof l.year === 'number');
  if (!dated.length) return null;
  const years = dated.map((l) => l.year);
  const from = Math.min(...years);
  const to = Math.max(...years);
  const last = dated.find((l) => l.year === to && (l.kind || l.bindingness || l.status)) ?? null;
  let latest: TimelineSpan['latest'] = null;
  if (last) {
    const words: string[] = [];
    if (last.kind) words.push(KIND_WORDS[last.kind]);
    if (last.status === 'proposal') words.push('in a proposal, not law');
    else if (laneWords(last.bindingness) === 'set in law') words.push('set in law');
    else if (laneWords(last.bindingness) === 'set in guidance') words.push('in guidance (not a legal deadline)');
    if (words.length) latest = { year: last.display, words: words.join(', '), lead: last.lead };
  }
  return { dates: dated.length, from, to, latest };
}
