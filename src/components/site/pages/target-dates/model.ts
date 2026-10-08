// Target dates (spec 6.3): the pure rules the page's island follows, with no file access, so the
// island can run them in the browser and the tests can run them against the real rows.
//
// The rows themselves come from datesFor() in src/lib/site/dates.ts at build time. Nothing here
// reads a label for a kind, a status or a bindingness: each row carries what its guide record or a
// confirmed annotation says, or null, which reads "not recorded". Places are always listed in
// alphabetical order; no rule here ranks, scores or counts countries against each other.

import type { DateRow, Kind } from '../../../../lib/site/dates';

/** The fixed axis of every date view in the Atlas: 2025 to 2036. */
export const AXIS_START = 2025;
export const AXIS_END = 2036;

/** The kinds of date, exactly the milestone kinds of readiness.json, plus "not recorded". */
export const KIND_KEYS = ['plan', 'priority', 'complete', 'procurement', 'other', 'none'] as const;
export type KindKey = (typeof KIND_KEYS)[number];

/** The three lanes: set in law, set in guidance, and not recorded. */
export const LANES = ['law', 'guidance', 'none'] as const;
export type Lane = (typeof LANES)[number];

/** One row as the island receives it: a DateRow without the fields only the build reads, plus a stable key. */
export type TdRow = Omit<DateRow, 'audience' | 'restated' | 'restates'> & { key: string };

export interface TdPosture {
  key: string;
  short: string; // POSTURE_META short label ("EU coordinated"), never written out here
  label: string;
  color: string;
}

/** A place the visitor can choose: every place with at least one recorded date, and the EU. */
export interface TdPlace {
  iso3: string;
  name: string;
  inSentence: string; // the name inside a sentence: "the European Union", "France"
  posture: TdPosture | null;
  member: boolean; // an EU Member State, from data/lab/shared/memberships.json
  aliases: string[]; // search aids only, never shown
  profile: string | null; // the profile page, when built
  exposure: string | null; // the Exposure Clock for this place, when shown and offered
  rules: string | null; // the Rulebook for an organisation established here, when shown
  guides: string[]; // the guides that reach the place: its own, then the EU roadmap for a member
}

/** The hrefs the island may use, all computed at build time through link() and pageHref(). */
export interface TdLinks {
  check: string | null; // the Readiness Check, or null when it is not shown
  countries: string | null;
  guidePages: Record<string, string | null>; // guide id to its page in Prepare, when built
}

export type TdCopy = Record<string, any>;

// ---- packing the rows for the island -------------------------------------------------------------

/**
 * The rows as the page sends them: each guide target once (the EU roadmap's three reach 27
 * members), each place's row as a reference to its target or as its own profile line, and no
 * empty field. unpackRows gives back exactly the rows packRows was given (a test checks it).
 */
export interface PackedRows {
  targets: Record<string, Partial<TdRow>>;
  rows: (Partial<TdRow> & { t?: string })[];
}

const DEFAULTS = {
  month: null,
  kind: null,
  status: null,
  bindingness: null,
  issuer: null,
  scope: null,
  sourceUrl: null,
  lead: false,
  guide: null,
  guideTitle: null,
  display: null,
} as const;
const PER_PLACE = new Set(['iso3', 'place', 'relation', 'lead', 'key']);

function compact(o: Record<string, unknown>, skip: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!skip.has(k) && v !== null && v !== undefined && v !== false) out[k] = v;
  return out;
}

export function packRows(rows: TdRow[]): PackedRows {
  const targets: Record<string, Partial<TdRow>> = {};
  const out: PackedRows['rows'] = [];
  for (const r of rows) {
    const shared = compact(r as unknown as Record<string, unknown>, PER_PLACE) as Partial<TdRow>;
    if (r.origin === 'guide' && r.guide) {
      const id = `${r.guide}|${r.year}|${r.month ?? ''}|${r.label}`;
      targets[id] ??= shared;
      out.push(compact({ t: id, iso3: r.iso3, relation: r.relation, lead: r.lead }, new Set()) as PackedRows['rows'][number]);
    } else {
      out.push(compact({ ...shared, iso3: r.iso3, relation: r.relation, lead: r.lead }, new Set()) as PackedRows['rows'][number]);
    }
  }
  return { targets, rows: out };
}

export function unpackRows(packed: PackedRows, places: TdPlace[]): TdRow[] {
  const names = new Map(places.map((p) => [p.iso3, p.name]));
  return packed.rows.map(({ t, ...own }, i) => {
    const r = { ...DEFAULTS, ...(t ? packed.targets[t] : {}), ...own } as TdRow;
    return { ...r, place: names.get(r.iso3) ?? r.iso3, key: `${r.iso3}-${i}` };
  });
}

// ---- small words -------------------------------------------------------------------------------

/** "{a} and {b}" templates: every {name} is replaced, unknown names are left as written. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The date as the source gives it: "December 2026", "2030", or the profile's own range "2024-2026" written "2024 to 2026". */
export function dateText(row: Pick<DateRow, 'year' | 'month' | 'display'>): string {
  if (row.display) {
    const range = /^(\d{4})\s*-\s*(\d{4})$/.exec(row.display);
    return range ? `${range[1]} to ${range[2]}` : row.display;
  }
  return row.month ? `${MONTHS[row.month - 1]} ${row.year}` : String(row.year);
}

/** A label as a table cell shows it: the first letter in capitals ("the First Steps" gives "The First Steps"). */
export function sentenceCase(label: string): string {
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : label;
}

export const kindKey = (k: Kind | null): KindKey => k ?? 'none';

/** Lifecycle statuses under which a binding instrument sets a date in law: never a proposal, nor a dead text. */
const LAW_LIVE: ReadonlySet<string> = new Set(['adopted', 'in-force', 'applies-from']);
/** Lifecycle statuses under which soft law or guidance sets a date: published or adopted, and not superseded. */
const GUIDANCE_LIVE: ReadonlySet<string> = new Set(['published', 'adopted', 'in-force', 'applies-from']);

/**
 * The lane of a row, from its bindingness and its lifecycle status together (two axes, never
 * merged into one label). Set in law: a binding instrument that is adopted, in force or applies
 * from a date. Set in guidance: soft law or guidance that is published or adopted. Anything else,
 * including a proposal, a withdrawn, repealed or superseded text, or a status not recorded, goes to
 * "Not recorded", so a proposal or a dead instrument is never drawn as law.
 */
export function laneOf(row: Pick<DateRow, 'bindingness' | 'status'>): Lane {
  const { bindingness: b, status: s } = row;
  if ((b === 'binding-law' || b === 'binding-by-market-access') && s && LAW_LIVE.has(s)) return 'law';
  if ((b === 'soft-law' || b === 'guidance') && s && GUIDANCE_LIVE.has(s)) return 'guidance';
  return 'none';
}

// ---- order -------------------------------------------------------------------------------------

const KIND_ORDER: readonly string[] = ['plan', 'priority', 'complete', 'procurement', 'other'];
const kindIndex = (k: Kind | null) => (k ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);

/** Date order, as byDate in dates.ts: year, then month (a year with no month after the named months), then kind. */
export function compareRows(a: DateRow, b: DateRow): number {
  return a.year - b.year || (a.month ?? 13) - (b.month ?? 13) || kindIndex(a.kind) - kindIndex(b.kind) || a.label.localeCompare(b.label, 'en-GB');
}

/** Places in alphabetical order of their names: the only order the page uses. */
export function byName<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
}

// ---- state in the address ----------------------------------------------------------------------

/**
 * The view's state. A filter with nothing ticked shows everything, and ticking a kind or a lane
 * narrows the view to it, so the default is no ticked chip at all and the address can always say
 * what is shown: an empty set and a full set mean the same thing.
 */
export interface TdState {
  places: string[]; // ISO3, in alphabetical order of the place names
  kinds: Set<KindKey>; // the kinds ticked; none ticked shows every kind
  lanes: Set<Lane>; // the lanes ticked; none ticked shows every lane
}

export const noKinds = () => new Set<KindKey>();
export const noLanes = () => new Set<Lane>();

/** How many narrowing choices are in force: the phone's "Choose what to show ({n})". */
export function narrowing(state: TdState): number {
  return (state.kinds.size < KIND_KEYS.length ? state.kinds.size : 0) + (state.lanes.size < LANES.length ? state.lanes.size : 0);
}

function list(params: URLSearchParams, name: string): string[] {
  return (params.get(name) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read ?in=DEU,FRA,EUU (and ?kind= and ?lane= when the visitor narrowed them). Unknown codes are
 * dropped; codes are matched without regard to case. A malformed address gives the defaults.
 */
export function readState(search: string, places: TdPlace[]): TdState {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  const known = new Map(places.map((p) => [p.iso3, p]));
  const chosen = [...new Set(list(params, 'in').map((c) => c.toUpperCase()))].filter((c) => known.has(c));
  const kinds = list(params, 'kind').filter((k): k is KindKey => (KIND_KEYS as readonly string[]).includes(k));
  const lanes = list(params, 'lane').filter((l): l is Lane => (LANES as readonly string[]).includes(l));
  // a full set says no more than an empty one, so both read back as "nothing ticked"
  return {
    places: byName(chosen.map((c) => known.get(c)!)).map((p) => p.iso3),
    kinds: new Set(kinds.length < KIND_KEYS.length ? kinds : []),
    lanes: new Set(lanes.length < LANES.length ? lanes : []),
  };
}

/** The query string for a state: ?in= always first, ?kind= and ?lane= only when narrowed. Empty when nothing is set. */
export function writeState(state: TdState): string {
  const parts: string[] = [];
  if (state.places.length) parts.push(`in=${state.places.join(',')}`);
  if (state.kinds.size && state.kinds.size < KIND_KEYS.length) parts.push(`kind=${KIND_KEYS.filter((k) => state.kinds.has(k)).join(',')}`);
  if (state.lanes.size && state.lanes.size < LANES.length) parts.push(`lane=${LANES.filter((l) => state.lanes.has(l)).join(',')}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// ---- which rows show -----------------------------------------------------------------------------

/** Whether a row passes the kind and lane filters: a filter with nothing ticked lets every row through. */
export function passes(r: TdRow, state: Pick<TdState, 'kinds' | 'lanes'>): boolean {
  return (state.kinds.size === 0 || state.kinds.has(kindKey(r.kind))) && (state.lanes.size === 0 || state.lanes.has(laneOf(r)));
}

/** The rows of the chosen places (all places when none is chosen) that pass the kind and lane filters. */
export function visibleRows(rows: TdRow[], state: TdState): TdRow[] {
  const chosen = new Set(state.places);
  return rows.filter((r) => (chosen.size === 0 || chosen.has(r.iso3)) && passes(r, state));
}

/**
 * The muted line beside the lanes when no recorded date of these places (every place, when none is
 * chosen) is set in law, so an empty "In law" lane reads as what the records hold. Counted from
 * the rows before the filters, so it never depends on what the visitor has narrowed. Null when at
 * least one date is set in law.
 */
export function lawNote(rows: TdRow[], state: TdState, copy: TdCopy): string | null {
  const chosen = new Set(state.places);
  const mine = rows.filter((r) => chosen.size === 0 || chosen.has(r.iso3));
  if (!mine.length || mine.some((r) => laneOf(r) === 'law')) return null;
  return chosen.size ? copy.lawNoneChosen : copy.lawNoneAll;
}

/** Lower case, accents dropped, full stops and apostrophes removed, other punctuation as spaces: "U.K." gives "uk". */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Search the places by name, ISO3 code or alias, ignoring case, accents and full stops. The
 * closest come first: an exact name, code or alias; a name that starts with the query; a code or
 * alias that starts with it; a word that starts with it; and, from three letters, any name or
 * alias that contains it. Alphabetical within each step. An empty query gives every place.
 */
export function matchPlaces<T extends Pick<TdPlace, 'iso3' | 'name' | 'aliases'>>(places: T[], query: string): T[] {
  const q = foldName(query);
  if (!q) return places;
  const hits: [number, T][] = [];
  for (const p of places) {
    const name = foldName(p.name);
    const others = [p.iso3, ...p.aliases].map(foldName);
    const words = [name, ...others].flatMap((s) => s.split(' '));
    const rank =
      name === q || others.includes(q)
        ? 0
        : name.startsWith(q)
          ? 1
          : others.some((s) => s.startsWith(q))
            ? 2
            : words.some((w) => w.startsWith(q))
              ? 3
              : q.length > 2 && [name, ...others].some((s) => s.includes(q))
                ? 4
                : -1;
    if (rank >= 0) hits.push([rank, p]);
  }
  return hits.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name, 'en-GB')).map((h) => h[1]);
}

// ---- words for a row -----------------------------------------------------------------------------

export function kindLabel(row: Pick<DateRow, 'kind'>, copy: TdCopy): string {
  return copy.kind[kindKey(row.kind)];
}

export function statusLabel(row: Pick<DateRow, 'status'>, copy: TdCopy): string | null {
  return row.status ? (copy.status[row.status] ?? row.status) : null;
}

export function bindingLabel(row: Pick<DateRow, 'bindingness'>, copy: TdCopy): string | null {
  return row.bindingness ? (copy.bindingness[row.bindingness] ?? row.bindingness) : null;
}

/**
 * What a row says about itself beside its label, always in this order: its kind, its lifecycle
 * status and its bindingness (two labels, never one, each "not recorded" where the Atlas holds
 * nothing), then whether it reaches the place through EU membership and whether it is a lead.
 */
export function rowMeta(r: TdRow, copy: TdCopy): string[] {
  return [
    copy.kind[kindKey(r.kind)],
    statusLabel(r, copy) ?? copy.statusNotRecorded,
    bindingLabel(r, copy) ?? copy.bindingNotRecorded,
    r.relation === 'membership' ? copy.membership : null,
    r.lead ? copy.readoutLead : null,
  ].filter((x): x is string => Boolean(x));
}

/**
 * What one chart mark says, to a screen reader and in its tooltip: the date, the place and the
 * label, then the lane it is drawn in and the row's own words. The lane names a proposal or a
 * dead text as not set in law, and its status says why, so a binding instrument that is only a
 * proposal is never announced as law.
 */
export function markText(r: TdRow, copy: TdCopy): string {
  return `${dateText(r)}, ${r.place}: ${sentenceCase(r.label)} (${[copy.laneMark[laneOf(r)], ...rowMeta(r, copy)].join('; ')})`;
}

/** Who sets the date: the issuer of a guide, or the place's own profile for a profile line. */
export function sourceName(row: Pick<DateRow, 'issuer' | 'place'>, copy: TdCopy): string {
  return row.issuer ?? fill(copy.profileSource, { place: row.place });
}

/**
 * The scope cell: the annotation's scope, "Addressed to Member States" for a membership row, else
 * who the guide is written for, in its own words (audiences: guide id to audience, sent once).
 */
export function scopeText(row: Pick<DateRow, 'scope' | 'relation' | 'guide'>, copy: TdCopy, audiences: Record<string, string> = {}): string | null {
  if (row.scope) return row.scope;
  if (row.relation === 'membership') return copy.membership;
  const audience = row.guide ? audiences[row.guide] : null;
  if (audience) return fill(copy.writtenFor, { audience });
  return null;
}

// ---- the readout -----------------------------------------------------------------------------------

/**
 * The one sentence near the view. It names the earliest date from 2025 on among the chosen places,
 * with who sets it, its kind and its bindingness, each reading "not recorded" where the Atlas has
 * not recorded it. It says "target" only when the kind of date is recorded. The earliest date
 * drawn before 2025 is left to the table, so the sentence and the axis always agree.
 */
export function readout(rows: TdRow[], state: TdState, places: TdPlace[], copy: TdCopy): string {
  if (!state.places.length) return copy.readoutChoose;
  const chosen = new Set(state.places);
  const mine = rows.filter((r) => chosen.has(r.iso3));
  if (!mine.length) return copy.readoutNone;
  const shown = visibleRows(mine, state);
  if (!shown.length) return copy.readoutFiltered;
  const onAxis = shown.filter((r) => r.year >= AXIS_START);
  if (!onAxis.length) return fill(copy.readoutEarlier, { start: AXIS_START });
  // on the same date a confirmed row is named before a lead that says the same thing
  const first = [...onAxis].sort((a, b) => a.year - b.year || (a.month ?? 13) - (b.month ?? 13) || Number(a.lead) - Number(b.lead) || compareRows(a, b))[0];

  // The same target reaching several chosen places is named once: one guide milestone (the EU
  // roadmap's, for instance), or the same line in several profiles with the same record, in
  // which case each profile is cited as the source.
  const same = onAxis.filter((r) =>
    first.origin === 'guide'
      ? r.origin === 'guide' && r.guide === first.guide && r.year === first.year && r.month === first.month && r.label === first.label
      : r.origin === 'profile' &&
        r.year === first.year &&
        r.month === first.month &&
        r.display === first.display &&
        r.label === first.label &&
        r.kind === first.kind &&
        r.status === first.status &&
        r.bindingness === first.bindingness &&
        r.lead === first.lead,
  );
  const byCode = new Map(places.map((p) => [p.iso3, p]));
  const placesReached = byName([...new Set(same.map((r) => r.iso3))].map((c) => byCode.get(c) ?? { iso3: c, name: c, inSentence: c }));
  const reached = placesReached.map((p) => p.inSentence);

  const details = [
    first.relation === 'membership' && first.issuer
      ? `${first.issuer}, ${copy.membershipLower}`
      : first.origin === 'profile' && placesReached.length > 1
        ? joinAnd(placesReached.map((p) => fill(copy.profileSource, { place: p.name })))
        : sourceName(first, copy),
    first.kind ? copy.kindWord[first.kind] : copy.kindWord.none,
    first.bindingness ? (copy.bindingness[first.bindingness] ?? first.bindingness).toLowerCase() : copy.bindingNotRecorded,
  ];
  if (same.some((r) => r.lead)) details.push(copy.readoutLead);
  const one = state.places.length === 1 ? byCode.get(state.places[0]) : null;
  const template = one ? (first.kind ? copy.readoutTargetOne : copy.readoutDateOne) : first.kind ? copy.readoutTarget : copy.readoutDate;
  return fill(template, {
    start: AXIS_START,
    place: one?.inSentence ?? '',
    date: dateText(first),
    for: one ? '' : fill(copy.readoutFor, { places: joinAnd(reached) }),
    label: first.label,
    details: details.join('; '),
  });
}

// ---- where to go next --------------------------------------------------------------------------------

/**
 * "Where to go next": at most three links, always one of them back into the evidence (a profile,
 * or the Countries list when several places or none are chosen). Every href was computed at build
 * time; a destination that is not built is null and never offered.
 */
export function nextLinks(state: TdState, places: TdPlace[], links: TdLinks, copy: TdCopy): { label: string; href: string }[] {
  const byCode = new Map(places.map((p) => [p.iso3, p]));
  const chosen = state.places.map((c) => byCode.get(c)).filter((p): p is TdPlace => Boolean(p));
  const one = chosen.length === 1 ? chosen[0] : null;
  const tools: { label: string; href: string | null }[] = [];

  tools.push({ label: copy.nextExposure, href: one?.exposure ?? null });
  const guides: string[] = [];
  for (const p of chosen) for (const g of p.guides) if (!guides.includes(g)) guides.push(g);
  // with places chosen, the Check opens on the guides that reach them; with none, on every guide
  const check = !links.check ? null : guides.length ? `${links.check}#f=${guides.join(',')}` : chosen.length ? null : links.check;
  tools.push({ label: copy.nextCheck, href: check });
  tools.push({ label: copy.nextRules, href: one?.member ? one.rules : null });

  const evidence = one?.profile
    ? { label: fill(copy.nextProfile, { place: one.name }), href: one.profile }
    : { label: copy.nextCountries, href: links.countries };

  const out = tools.filter((t): t is { label: string; href: string } => Boolean(t.href)).slice(0, evidence.href ? 2 : 3);
  if (evidence.href) out.push(evidence as { label: string; href: string });
  return out;
}

// ---- the table and the CSV -----------------------------------------------------------------------------

/** Rows grouped by place, places in alphabetical order, each place's rows in date order. */
export function groupByPlace(rows: TdRow[], places: TdPlace[]): { place: TdPlace; rows: TdRow[] }[] {
  const byCode = new Map<string, TdRow[]>();
  for (const r of rows) byCode.set(r.iso3, [...(byCode.get(r.iso3) ?? []), r]);
  return byName(places)
    .filter((p) => byCode.has(p.iso3))
    .map((p) => ({ place: p, rows: [...byCode.get(p.iso3)!].sort(compareRows) }));
}

/**
 * What makes two rows one target in a list: the same guide milestone reaching several places, or
 * the same profile line, word for word and with the same record, in several profiles.
 */
export function targetKey(r: TdRow): string {
  return r.origin === 'guide'
    ? ['g', r.guide, r.year, r.month ?? '', r.label].join('|')
    : ['p', r.year, r.month ?? '', r.display ?? '', r.label, r.kind ?? '', r.status ?? '', r.bindingness ?? '', r.lead ? 1 : 0].join('|');
}

/**
 * Rows grouped by year, years in order. Within a year each target is one item that names every
 * place it reaches (each place keeps its own mark: solid, open or dotted), items in date order,
 * places in alphabetical order.
 */
export function groupByYear(rows: TdRow[]): { year: number; items: { key: string; rows: TdRow[] }[] }[] {
  const years = [...new Set(rows.map((r) => r.year))].sort((a, b) => a - b);
  return years.map((year) => {
    const items = new Map<string, TdRow[]>();
    for (const r of rows.filter((x) => x.year === year)) items.set(targetKey(r), [...(items.get(targetKey(r)) ?? []), r]);
    return {
      year,
      items: [...items.entries()]
        .map(([key, rs]) => ({ key, rows: [...rs].sort((a, b) => a.place.localeCompare(b.place, 'en-GB')) }))
        .sort((a, b) => compareRows(a.rows[0], b.rows[0]) || a.rows[0].place.localeCompare(b.rows[0].place, 'en-GB')),
    };
  });
}

/**
 * What one target in the list by year says about itself, in the order rowMeta keeps: its kind,
 * its lifecycle status and its bindingness ("not recorded" where the Atlas holds nothing), then
 * whether it reaches a place through EU membership and whether it is a lead (null where not).
 */
function itemParts(rs: TdRow[], copy: TdCopy): (string | null)[] {
  const first = rs[0];
  return [
    copy.kind[kindKey(first.kind)],
    statusLabel(first, copy) ?? copy.statusNotRecorded,
    bindingLabel(first, copy) ?? copy.bindingNotRecorded,
    rs.some((r) => r.relation === 'membership') ? copy.membership : null,
    rs.some((r) => r.lead) ? copy.readoutLead : null,
  ];
}

/**
 * The muted lines of the list by year, said once where every target shares them (the épuré pass,
 * labs/review/epure-audit.md finding 15). A part that every target of the list shares, word for
 * word, is said once above the list ("shared"); each target keeps its date, when the source names
 * a month or a range, and the parts in which it differs ("rows", by targetKey). With one target
 * there is nothing said twice, so nothing moves. The words are the rows' own; none is added.
 */
export function yearListMeta(groups: { items: { key: string; rows: TdRow[] }[] }[], copy: TdCopy): { shared: string; rows: Map<string, string> } {
  const items = groups.flatMap((g) => g.items);
  const parts = items.map((i) => itemParts(i.rows, copy));
  const same = parts[0]?.map((p, n) => items.length > 1 && p !== null && parts.every((q) => q[n] === p)) ?? [];
  const rows = new Map<string, string>();
  items.forEach((item, i) => {
    const first = item.rows[0];
    const own = [first.month || first.display ? dateText(first) : null, ...parts[i].filter((_, n) => !same[n])].filter(Boolean);
    rows.set(item.key, own.join(' · '));
  });
  const shared = (parts[0] ?? []).filter((p, n): p is string => same[n] && p !== null);
  return { shared: sentenceCase(shared.join(' · ')), rows };
}

/** The CSV of the rows shown: one line per row, with "not recorded" wherever the table says so. */
export function csvTable(rows: TdRow[], places: TdPlace[], copy: TdCopy, audiences: Record<string, string> = {}): { header: string[]; rows: (string | number | null)[][] } {
  const h = copy.csv;
  const leads = rows.some((r) => r.lead);
  const header = [h.place, h.iso3, h.when, h.year, h.month, h.kind, h.label, h.issuer, h.scope, h.status, h.bindingness, h.lane, h.relation, h.source];
  if (leads) header.push(h.lead);
  const nr = copy.notRecorded;
  const out = groupByPlace(rows, places).flatMap(({ rows: rs }) =>
    rs.map((r) => {
      const line: (string | number | null)[] = [
        r.place,
        r.iso3,
        dateText(r),
        r.year,
        r.month,
        r.kind ? copy.kindWord[r.kind] : nr,
        sentenceCase(r.label),
        r.issuer ?? nr,
        scopeText(r, copy, audiences) ?? '',
        statusLabel(r, copy) ?? nr,
        bindingLabel(r, copy) ?? nr,
        copy.lane[laneOf(r)],
        r.relation === 'membership' ? copy.membership : copy.relationOwn,
        r.sourceUrl ?? '',
      ];
      if (leads) line.push(r.lead ? copy.csvLeadYes : '');
      return line;
    }),
  );
  return { header, rows: out };
}
