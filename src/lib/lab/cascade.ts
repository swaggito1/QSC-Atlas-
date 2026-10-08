// QSC Atlas Labs: the Standards Cascade's logic, as pure functions: time steps, which edges a
// frame draws and what it states, how edges gather into lines, a jurisdiction's evidence, the
// counter line, and the view kept in the query string. Shared by the build (cascade-layout.ts)
// and the island, so both draw the same lines.

export const RELATIONS = ['adopts', 'profiles', 'references', 'fork'] as const; // the "show" filters
export type RelationFilter = (typeof RELATIONS)[number];

export interface CascadeState {
  // the standards body shown (5 October 2026): an option id ("ietf", "etsi"); absent or "nist" is
  // NIST, the default, and is never written to the address
  body?: string;
  view: 'orbit' | 'map' | 'globe';
  std: string; // a standard id or "all"
  rel: RelationFilter[];
  group: 'all' | 'eu' | 'nato';
  t: string; // YYYY-MM, the slider month
  fork: boolean;
  sel: string | null; // selected ISO3
}

/** Every month from December 2016 to the given month, as YYYY-MM. */
export function months(end: string): string[] {
  const out: string[] = [];
  let [y, m] = [2016, 12];
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * The last day a date of any precision can stand for: a year runs to 31 December, a month to
 * its last day. Ordering by it never lets a year-only record count before the year has ended.
 */
export function periodEnd(date: string): string {
  if (/^\d{4}$/.test(date)) return `${date}-12-31`;
  if (/^\d{4}-\d{2}$/.test(date)) return `${date}-31`;
  return date;
}

/** The month a date of any precision counts from, as YYYY-MM: "2025" gives "2025-12". */
export const monthOf = (date: string) => periodEnd(date).slice(0, 7);

/** True when a date of any precision has ended by the end of month t ("2025" counts from December 2025). */
export const onOrBefore = (date: string, t: string) => monthOf(date) <= t;

/**
 * Date order for records of any precision, as the counter reads them: by the end of their
 * period, so a year-only record follows that year's dated ones; ties by id, so the order never
 * depends on the order of the file.
 */
export const byDate = (a: { date: string; id: string }, b: { date: string; id: string }) => periodEnd(a.date).localeCompare(periodEnd(b.date)) || a.id.localeCompare(b.id);

/** The relation filter an edge belongs to: fork covers both national-process relations. */
export function filterOf(relation: string): RelationFilter | null {
  if (relation === 'fork' || relation === 'parallel-interoperable') return 'fork';
  if (relation === 'adopts' || relation === 'profiles' || relation === 'references') return relation;
  return null;
}

// ---- lines: one per jurisdiction and kind of reference ------------------------------------
//
// A document can name several standards, so the data holds more edges than documents. The
// chart draws one line per jurisdiction and kind of reference, and its weight counts the
// distinct documents behind it. A lead (a record still being checked) always gets a line of
// its own, dotted, so it never thickens or lights anything verified.

export type LinkKind = 'references' | 'adopts' | 'profiles' | 'lead' | 'own';

/** The order the lines between NIST and one jurisdiction fan out in, so none lies on another. */
export const FAN: Record<Exclude<LinkKind, 'own'>, number> = { references: 0, adopts: 1, profiles: 2, lead: 3 };

/**
 * Ink opacity of each kind of line: naming is the faintest (0.5 keeps it at 3:1 on paper),
 * adding national requirements the darkest. A line to a national standard is full ink too, but
 * it runs to a square of its own, which is what tells it apart.
 */
export const LINK_ALPHA: Record<LinkKind, number> = { references: 0.5, adopts: 0.75, profiles: 1, lead: 1, own: 1 };

/** Stroke weight in pixels for a line carrying n documents: 1px for one, growing with the square root. */
export const linkWidth = (docs: number) => Math.round((1 + 0.7 * (Math.sqrt(Math.max(1, docs)) - 1)) * 100) / 100;

export interface LinkEdge {
  from: string;
  to: string;
  relation: string;
  date: string;
  preStandardOnly: boolean;
  verified?: boolean; // absent means verified
  documentUrl?: string;
  id?: string;
}

export interface LinkRef {
  key: string; // the line: jurisdiction and kind (and national standard for "own")
  path: string; // the geometry it is drawn on: a lead to a national standard shares its twin's
  from: string;
  kind: LinkKind;
  to: string | null; // the national standard, for "own"
}

/**
 * The line an edge is drawn on, or null when it is not drawn: a line runs from NIST only for a
 * standard NIST publishes (centreIds), and to a national standard for a national process.
 */
export function linkOf(e: LinkEdge, centreIds: Set<string>, nationalIds: Set<string>): LinkRef | null {
  const lead = e.verified === false;
  if (nationalIds.has(e.to)) {
    if (filterOf(e.relation) !== 'fork') return null;
    const path = `${e.from}|own:${e.to}`;
    return { key: lead ? `${path}|lead` : path, path, from: e.from, kind: 'own', to: e.to };
  }
  if (!centreIds.has(e.to)) return null;
  const f = filterOf(e.relation);
  if (!f || f === 'fork') return null;
  const key = lead ? `${e.from}|lead` : `${e.from}|${f}`;
  return { key, path: key, from: e.from, kind: lead ? 'lead' : f, to: null };
}

export interface Link extends LinkRef {
  docs: number; // distinct documents behind the line
  pre: boolean; // every one of them names only a pre-standard name
  lead: boolean;
}

/** Gather edges into lines. Order: first appearance in the input, so it is stable for rendering. */
export function aggregateLinks(edges: LinkEdge[], centreIds: Set<string>, nationalIds: Set<string>): Link[] {
  const out = new Map<string, Link & { urls: Set<string> }>();
  for (const e of edges) {
    const ref = linkOf(e, centreIds, nationalIds);
    if (!ref) continue;
    let l = out.get(ref.key);
    if (!l) {
      l = { ...ref, docs: 0, pre: true, lead: e.verified === false, urls: new Set() };
      out.set(ref.key, l);
    }
    l.urls.add(e.documentUrl ?? e.id ?? `${e.from}|${e.to}|${e.date}`);
    l.docs = l.urls.size;
    if (!e.preStandardOnly) l.pre = false;
  }
  return [...out.values()].map(({ urls: _urls, ...l }) => l);
}

/**
 * Jurisdictions lit at a frame: a verified document that adopts, profiles or names the chosen
 * standard (any NIST algorithm standard for "all"). It is the counter's first number and the
 * globe's and the map's colour. With "all" it is also the test that places a node on the orbit;
 * with one standard chosen, the orbit keeps every placed node and only its lines narrow.
 */
export function litSet(edges: LinkEdge[], std: string, nistIds: string[]): Set<string> {
  const named = (to: string) => (std === 'all' ? nistIds.includes(to) : to === std);
  return new Set(edges.filter((e) => e.verified !== false && named(e.to) && ['adopts', 'references', 'profiles'].includes(e.relation)).map((e) => e.from));
}

// ---- geometry shared by the views -----------------------------------------------------------

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A quadratic curve from a to b bending to the left of travel by `bend` times the chord. */
export function bentCurve(a: [number, number], b: [number, number], bend: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = (a[0] + b[0]) / 2 + dy * bend;
  const cy = (a[1] + b[1]) / 2 - dx * bend;
  return `M${r2(a[0])},${r2(a[1])}Q${r2(cx)},${r2(cy)} ${r2(b[0])},${r2(b[1])}`;
}

type Vec = [number, number, number];
const toVec = ([lon, lat]: [number, number]): Vec => {
  const l = (lon * Math.PI) / 180;
  const p = (lat * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};
const toLonLat = ([x, y, z]: Vec): [number, number] => [r2((Math.atan2(y, x) * 180) / Math.PI), r2((Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI)];
const norm = (v: Vec): Vec => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
function slerp(a: Vec, b: Vec, t: number): Vec {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const w = Math.acos(d);
  if (w < 1e-6) return a;
  const s = Math.sin(w);
  const ka = Math.sin((1 - t) * w) / s;
  const kb = Math.sin(t * w) / s;
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
}

/**
 * A great-circle arc from a to b, bowed sideways by `bend` (a share of the arc's length) so the
 * lines of one jurisdiction fan apart on the globe. bend 0 is the plain great circle. Returned
 * as a LineString in longitude and latitude, so the globe's projection trims it at the horizon.
 */
export function bentArc(a: [number, number], b: [number, number], bend: number, steps = 40) {
  const va = toVec(a);
  const vb = toVec(b);
  const mid = norm([va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]]);
  const side = norm([va[1] * vb[2] - va[2] * vb[1], va[2] * vb[0] - va[0] * vb[2], va[0] * vb[1] - va[1] * vb[0]]);
  const chord = Math.hypot(va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]);
  const c = norm([mid[0] + side[0] * bend * chord, mid[1] + side[1] * bend * chord, mid[2] + side[2] * bend * chord]);
  const coordinates = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return toLonLat(slerp(slerp(va, c, t), slerp(c, vb, t), t));
  });
  return { type: 'LineString' as const, coordinates };
}

// ---- the counter line -----------------------------------------------------------------------

export interface CounterEdge {
  from: string;
  to: string;
  relation: string;
  date: string;
  verified?: boolean;
}

/**
 * The counter line's numbers at month t: n jurisdictions with a document naming the standard
 * (or any NIST standard for "all"), m of them adding national requirements, and k running
 * their own process, whatever they name; kn of those k are among the n, so a sentence that
 * says "of these" about k is true only when kn equals k. Leads are never counted.
 */
export function counter(edges: CounterEdge[], t: string, std: string, nistIds: string[], group: Set<string> | null = null) {
  const inGroup = (iso: string) => !group || group.has(iso);
  const named = (e: CounterEdge) => (std === 'all' ? nistIds.includes(e.to) : e.to === std);
  const live = edges.filter((e) => e.verified !== false && onOrBefore(e.date, t) && inGroup(e.from));
  const n = new Set(live.filter((e) => named(e) && ['adopts', 'references', 'profiles'].includes(e.relation)).map((e) => e.from));
  const m = new Set(live.filter((e) => named(e) && e.relation === 'profiles').map((e) => e.from));
  const k = new Set(live.filter((e) => e.relation === 'fork' || e.relation === 'parallel-interoperable').map((e) => e.from));
  return { n: n.size, m: m.size, k: k.size, kn: [...k].filter((iso) => n.has(iso)).length };
}

/**
 * The counter's two sentences, from its numbers and the copy: the national processes are
 * counted "of these" only when every one of them is among the jurisdictions in the first
 * sentence; otherwise they are counted among all the jurisdictions checked.
 */
export function counterLines(c: ReturnType<typeof counter>, copy: Record<string, string>, vars: { month: string; standard: string }): [string, string] {
  const put = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  const line1 = put(c.n === 0 ? copy.counterNone : copy.counter, { ...vars, n: c.n });
  const own = c.k > 0 ? put(copy.counterOwnOnly, { k: c.k }) : '';
  if (c.n === 0) return [line1, own];
  if (c.kn === c.k) return [line1, put(copy.counterMore, { m: c.m, k: c.k })];
  return [line1, `${put(copy.counterRequirements, { m: c.m })} ${own}`];
}

/**
 * The counter's sentences for another standards body than NIST: the first as NIST's, and a second
 * only when a government added national requirements. The national processes belong to the NIST
 * view, so this view never counts them.
 */
export function counterLinesBody(c: ReturnType<typeof counter>, copy: Record<string, string>, vars: { month: string; standard: string }): [string, string] {
  const put = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
  const line1 = put(c.n === 0 ? copy.counterNone : copy.counter, { ...vars, n: c.n });
  return [line1, c.n > 0 && c.m > 0 ? put(copy.counterRequirements, { m: c.m }) : ''];
}

/**
 * The lines a geographic view (the globe, the map) draws: from NIST's seat, never to a national
 * standard. Another standards body has no seat there (seat null) and so no lines at all: where a
 * body is based says nothing about who cites it, and its view marks the citing countries only.
 */
export function geoLines<L extends { kind: LinkKind }>(links: L[], seat: [number, number] | null): L[] {
  return seat ? links.filter((l) => l.kind !== 'own') : [];
}

// ---- a frame: what is drawn and what is stated ----------------------------------------------
//
// The Show switches choose which lines are drawn. They never change what the page states: the
// counter, the chart descriptions and the colour of a country always count every kind of
// document, so turning a kind off never makes a sentence false.

export interface FrameFilter {
  rel: RelationFilter[];
  std: string;
  group: Set<string> | null;
  t: string;
}

/** The edges a frame draws as lines: the Show switches, the standard and the group, by month t. */
export function drawnEdges<E extends CounterEdge>(edges: E[], f: FrameFilter): E[] {
  return edges.filter((e) => {
    const kind = filterOf(e.relation);
    if (!kind || !f.rel.includes(kind)) return false;
    if (f.std !== 'all' && e.to !== f.std && kind !== 'fork') return false;
    if (f.group && !f.group.has(e.from)) return false;
    return onOrBefore(e.date, f.t);
  });
}

/** What a frame states, whatever the Show switches: the counter's numbers and the lit set. */
export function frameFacts(edges: LinkEdge[], t: string, std: string, nistIds: string[], group: Set<string> | null = null) {
  const inFrame = edges.filter((e) => onOrBefore(e.date, t) && (!group || group.has(e.from)));
  return { counts: counter(edges, t, std, nistIds, group), lit: litSet(inFrame, std, nistIds) };
}

/**
 * The jurisdictions the fork view rings at month t: a sovereign developer by its profile role,
 * and a jurisdiction with a verified national-process event or document dated by t.
 */
export function forkSet(opts: {
  roles: { iso3: string; role: string | null }[];
  spine: { iso3: string | null; kind: string; date: string; verified: boolean }[];
  edges: CounterEdge[];
  t: string;
}): Set<string> {
  return new Set([
    ...opts.roles.filter((n) => n.role === 'sovereign-developer').map((n) => n.iso3),
    ...opts.spine.filter((s) => s.kind === 'sovereign' && s.iso3 && s.verified && onOrBefore(s.date, opts.t)).map((s) => s.iso3 as string),
    ...opts.edges.filter((e) => filterOf(e.relation) === 'fork' && e.verified !== false && onOrBefore(e.date, opts.t)).map((e) => e.from),
  ]);
}

// ---- a jurisdiction's evidence, document by document ----------------------------------------
//
// Each edge carries every passage that supports it, each with its own locator. Within one
// document, a passage contained in a longer one is the same place and is shown once, as the
// longer one; passages that support the same edges are shown together under one line of
// relations. The passages stay verbatim.

export interface Passage {
  excerpt: string;
  locator: string;
}

/**
 * A provenance list may give a later locator relative to the one before it ("Same page",
 * "Same section, Note 60", "Same slide"). Shown on its own, under a different quote, such a
 * locator would point at the wrong place, so it is spelled out from the one it refers to:
 * the parts of that locator up to the unit named (and the page it is on), then the rest.
 */
export function resolveLocators(locators: string[]): string[] {
  const out: string[] = [];
  const isPage = (p: string) => /\bp\.\s*\d/.test(p);
  locators.forEach((loc, i) => {
    const m = /^Same (\w+)\b,?\s*(.*)$/i.exec(loc);
    const prev = i > 0 ? out[i - 1] : '';
    if (!m || !prev) {
      out.push(loc);
      return;
    }
    const unit = m[1].toLowerCase();
    const parts = prev.split(', ');
    const k = unit === 'page' ? parts.findIndex(isPage) : parts.findIndex((p) => p.toLowerCase().startsWith(unit));
    if (k < 0) {
      out.push(`${prev}; ${loc[0].toLowerCase()}${loc.slice(1)}`);
      return;
    }
    const kept = unit === 'page' ? parts.slice(0, k + 1) : [...parts.slice(0, k + 1), ...parts.slice(k + 1).filter(isPage)];
    out.push([...kept, ...(m[2] ? [m[2]] : [])].join(', '));
  });
  return out;
}

export interface EvidenceEdge extends CounterEdge {
  id: string;
  preStandardOnly: boolean;
  documentUrl: string;
  documentTitle: string;
  issuingOrg: string;
  corpusOrg?: string | null;
  passages: Passage[];
}

export interface EvidenceGroup<E extends EvidenceEdge = EvidenceEdge> {
  edges: E[];
  passages: Passage[];
}

export interface EvidenceDoc<E extends EvidenceEdge = EvidenceEdge> {
  url: string;
  date: string;
  title: string;
  org: string;
  corpusOrg: string | null;
  groups: EvidenceGroup<E>[];
}

export function documentEvidence<E extends EvidenceEdge>(edges: E[]): EvidenceDoc<E>[] {
  const sorted = [...edges].sort(byDate);
  const docs = new Map<string, { head: Omit<EvidenceDoc<E>, 'groups'>; passages: (Passage & { edges: E[] })[] }>();
  for (const e of sorted) {
    let d = docs.get(e.documentUrl);
    if (!d) {
      d = { head: { url: e.documentUrl, date: e.date, title: e.documentTitle, org: e.issuingOrg, corpusOrg: e.corpusOrg ?? null }, passages: [] };
      docs.set(e.documentUrl, d);
    }
    for (const p of e.passages) {
      if (!p.excerpt) continue;
      // the same words at the same place, or with one locator a narrower form of the other:
      // one passage, under the broader locator, which is true of both
      let q = d.passages.find((x) => x.excerpt === p.excerpt && (x.locator.startsWith(p.locator) || p.locator.startsWith(x.locator)));
      if (!q) {
        q = { excerpt: p.excerpt, locator: p.locator, edges: [] };
        d.passages.push(q);
      } else if (p.locator.length < q.locator.length) q.locator = p.locator;
      if (!q.edges.includes(e)) q.edges.push(e);
    }
  }
  return [...docs.values()].map(({ head, passages }) => {
    const inside = (p: Passage, q: Passage) => q !== p && q.excerpt.length > p.excerpt.length && q.excerpt.includes(p.excerpt);
    const kept = passages.filter((p) => !passages.some((q) => inside(p, q)));
    for (const p of passages) {
      if (kept.includes(p)) continue;
      const host = kept.find((q) => inside(p, q))!;
      for (const e of p.edges) if (!host.edges.includes(e)) host.edges.push(e);
      if (!host.locator) host.locator = p.locator;
    }
    const groups = new Map<string, EvidenceGroup<E>>();
    for (const p of kept) {
      const es = sorted.filter((e) => p.edges.includes(e));
      const key = es.map((e) => e.id).join(' ');
      const g = groups.get(key) ?? { edges: es, passages: [] };
      g.passages.push({ excerpt: p.excerpt, locator: p.locator });
      groups.set(key, g);
    }
    return { ...head, groups: [...groups.values()] };
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (t: string) => `${MONTHS[Number(t.slice(5, 7)) - 1]} ${t.slice(0, 4)}`;

/**
 * The view a query string names. Unknown values fall back to the defaults; the kinds shown are
 * kept in RELATIONS order without repeats, so a link that lists them differently writes back the
 * same canonical query.
 */
export function parseCascadeState(search: string, defaults: CascadeState, allMonths: string[]): CascadeState {
  const q = new URLSearchParams(search);
  const rel = q.get('rel');
  const t = q.get('t');
  const listed = rel === null ? null : rel.split(',');
  const body = q.get('body')?.trim().toLowerCase() || defaults.body;
  return {
    ...(body !== undefined ? { body } : {}),
    view: q.get('view') === 'map' ? 'map' : q.get('view') === 'globe' ? 'globe' : 'orbit',
    std: q.get('std') || defaults.std,
    rel: listed === null ? defaults.rel : RELATIONS.filter((r) => listed.includes(r)),
    group: q.get('group') === 'eu' ? 'eu' : q.get('group') === 'nato' ? 'nato' : 'all',
    t: t && allMonths.includes(t) ? t : defaults.t,
    fork: q.get('fork') === '1',
    sel: q.get('sel')?.toUpperCase() || null,
  };
}

export function cascadeStateToSearch(st: CascadeState, defaults: CascadeState): string {
  const q = new URLSearchParams();
  // the body first, since it changes what every other choice means; NIST, the default, is never written
  if (st.body && st.body !== 'nist') q.set('body', st.body);
  if (st.view !== 'orbit') q.set('view', st.view);
  if (st.std !== 'all') q.set('std', st.std);
  if (st.rel.join(',') !== defaults.rel.join(',')) q.set('rel', st.rel.join(','));
  if (st.group !== 'all') q.set('group', st.group);
  // the month is always written: the latest month moves on when the data does, and a copied
  // link must still open the month it was copied at
  q.set('t', st.t);
  if (st.fork) q.set('fork', '1');
  if (st.sel) q.set('sel', st.sel);
  return `?${q.toString()}`;
}
