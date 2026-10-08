// The Documents index (spec 9): pure functions shared by the page, its two downloads and the
// page's script in the browser.
//
// One list of rows feeds all three: documentRows() turns the included documents into rows with a
// stable id (docId, spec 16.4) and the place name the Atlas writes, sorted by place, then newest
// first, then title. The page renders the first PAGE_SIZE rows into its HTML with rowHtml(); the
// downloads serialise every row with documentsJson() and documentsCsv(), each carrying the as-of
// date; the browser loads the JSON for "Show 50 more" and for any filter, and draws its rows with
// the same rowHtml(). Filters live in the URL (?country= ?org= ?type= ?tier= ?year= ?q=), and
// ?org= goes through the issuer alias table, so "NCSC" and "National Cyber Security Centre" find
// the documents recorded under those names.
//
// A row's quiet notes (documentNotes, for the tools a build shows) link each standard and guide
// they name to its page, through linkNote() and hrefs the build hands over. The script's history
// rules are pure functions here too (searchChange, choiceChange, fromHistory), so the back button
// is tested without a browser.
//
// The search covers titles and summaries only, which is what the page says it does. Nothing here
// counts documents per country, ranks places or sorts them by any count.
//
// No Node imports: the page's script imports this module too.

import { docId, sha1Hex } from './docid';

export const PAGE_SIZE = 50;

/** The filters, in the order the URL writes them. */
export const FILTER_KEYS = ['country', 'org', 'type', 'tier', 'year', 'q'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type DocFilters = Record<FilterKey, string>;
export const NO_FILTERS: Readonly<DocFilters> = Object.freeze({ country: '', org: '', type: '', tier: '', year: '', q: '' });

/** ?year=none asks for the documents whose year is not recorded. */
export const YEAR_NONE = 'none';

/** What each tier means, in the words the page has always used. */
export const TIER_WORDS: Readonly<Record<string, string>> = {
  T1: 'primary institutional',
  T2: 'secondary official',
  T3: 'reputable third party',
  T4: 'academic or press',
};

/** The fields of a row, in the order both downloads write them. */
export const FIELDS = ['id', 'title', 'country', 'place', 'issuingOrg', 'year', 'docType', 'tier', 'url', 'summary'] as const;
/** The CSV columns: every field, then the as-of date on every line. */
export const CSV_COLUMNS = [...FIELDS, 'asOf'] as const;

/** A document as the collection holds it (Notion, or the JSON copy offline). */
export interface DocumentInput {
  title: string;
  country: string | null;
  issuingOrg: string | null;
  year: number | null;
  docType: string | null;
  tier: string | null;
  url: string | null;
  summary: string | null;
}

/** One row of the index, as the page, the downloads and the browser all read it. */
export interface DocumentRow {
  id: string; // docId(url), the #doc-{id} anchor
  title: string;
  country: string | null; // ISO3 in upper case, as the documents record it
  place: string | null; // the name the Atlas gives that code ("Germany", "European Union", "NATO")
  issuingOrg: string | null;
  year: number | null;
  docType: string | null;
  tier: string | null;
  url: string | null;
  summary: string | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The anchor id of a document: docId of its URL; a row with no URL gets one from its place and title. */
export function rowId(d: Pick<DocumentInput, 'url' | 'country' | 'title'>): string {
  const url = text(d.url);
  if (url) return docId(url);
  return 'd' + sha1Hex(`${(d.country ?? '').toUpperCase()}|${d.title.trim()}`).slice(0, 10);
}

/**
 * ISO3 to the name the Atlas gives it: the profile's own name first (the collection the profile
 * pages come from), then data/countries.json for a code no profile names.
 */
export function placeNames(
  profiles: { iso3: string; country?: string | null }[],
  countries: { iso3: string; name: string }[] = [],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of countries) if (c.iso3 && c.name) out.set(c.iso3.toUpperCase(), c.name);
  for (const p of profiles) {
    const name = text(p.country);
    if (p.iso3 && name) out.set(p.iso3.toUpperCase(), name);
  }
  return out;
}

/** By place name, then newest first (no year last), then title. Never by any count. */
export function compareRows(a: DocumentRow, b: DocumentRow): number {
  if (a.place !== b.place) {
    if (a.place === null) return 1;
    if (b.place === null) return -1;
    const byPlace = a.place.localeCompare(b.place, 'en', { sensitivity: 'base' });
    if (byPlace !== 0) return byPlace;
  }
  if (a.year !== b.year) {
    if (a.year === null) return 1;
    if (b.year === null) return -1;
    return b.year - a.year;
  }
  return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
}

/**
 * The rows of the index: one per document with a title, the first of any two that share an id
 * (the offline loader keeps the first too), with the place name from `names` (ISO3 to name),
 * sorted by compareRows.
 */
export function documentRows(docs: DocumentInput[], names: ReadonlyMap<string, string>): DocumentRow[] {
  const seen = new Set<string>();
  const rows: DocumentRow[] = [];
  for (const d of docs) {
    const title = text(d.title);
    if (!title) continue;
    const country = text(d.country)?.toUpperCase() ?? null;
    const row: DocumentRow = {
      id: rowId({ url: d.url, country, title }),
      title,
      country,
      place: country ? names.get(country) ?? country : null,
      issuingOrg: text(d.issuingOrg),
      year: int(d.year),
      docType: text(d.docType),
      tier: text(d.tier),
      url: text(d.url),
      summary: text(d.summary),
    };
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows.sort(compareRows);
}

/** Inventory for the lede: records, places that hold any, records at tier 3 or 4. No per-place counts. */
export function documentsCensus(rows: DocumentRow[]): { records: number; places: number; lowerTier: number } {
  return {
    records: rows.length,
    places: new Set(rows.map((r) => r.country).filter(Boolean)).size,
    lowerTier: rows.filter((r) => r.tier === 'T3' || r.tier === 'T4').length,
  };
}

// ---- the downloads ------------------------------------------------------------------------------

export interface DownloadMeta {
  asOf: string | null; // ISO day: the day the index was built from the Atlas records
  source: string; // the page's absolute URL
}

/** /data/documents.json: the as-of date, what the fields and tiers mean, and every row. */
export function documentsJson(rows: DocumentRow[], meta: DownloadMeta): string {
  const body = {
    name: 'QSC Atlas documents index',
    source: meta.source,
    asOf: meta.asOf,
    asOfMeaning: 'The day this file was built. It holds every document the Atlas included on that day.',
    rowLink: `${meta.source}#doc-{id}`,
    tiers: TIER_WORDS,
    fields: FIELDS,
    count: rows.length,
    documents: rows.map((r) => Object.fromEntries(FIELDS.map((f) => [f, r[f]]))),
  };
  return JSON.stringify(body);
}

/** One CSV cell: quoted when it holds a comma, a quote or a line break; quotes doubled. */
export function csvCell(v: string | number | null): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * /data/documents.csv: a header line, then one line per row with the as-of date in its last
 * column. UTF-8 with a byte order mark so spreadsheet programs read accented names correctly;
 * lines end in CRLF (RFC 4180).
 */
export function documentsCsv(rows: DocumentRow[], asOf: string | null): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) lines.push([...FIELDS.map((f) => csvCell(r[f])), csvCell(asOf)].join(','));
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** Reads CSV text back into rows of cells (RFC 4180: quoted cells, doubled quotes, CRLF or LF). */
export function parseCsv(input: string): string[][] {
  const s = input.startsWith('\uFEFF') ? input.slice(1) : input;
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      out.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

// ---- filters in the URL ---------------------------------------------------------------------------

/** Lower case, accents and repeated spaces removed: what matching compares. */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The filters a query string asks for; unknown keys are ignored, the country is upper-cased. */
export function readFilters(search: string | URLSearchParams): DocFilters {
  const p = typeof search === 'string' ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search) : search;
  const f = { ...NO_FILTERS };
  for (const k of FILTER_KEYS) f[k] = (p.get(k) ?? '').replace(/\s+/g, ' ').trim();
  f.country = f.country.toUpperCase();
  if (fold(f.year) === YEAR_NONE) f.year = YEAR_NONE;
  return f;
}

/** "?country=DEU&type=Guidance", in FILTER_KEYS order; "" when no filter is set. */
export function filterQuery(f: DocFilters): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) p.set(k, f[k]);
  const q = p.toString();
  return q ? `?${q}` : '';
}

export const hasFilters = (f: DocFilters): boolean => FILTER_KEYS.some((k) => f[k] !== '');

/** How many of the five choices (not the search) are set: the phone's "Choose what to show (n)". */
export const choiceCount = (f: DocFilters): number => FILTER_KEYS.filter((k) => k !== 'q' && f[k] !== '').length;

/** Folded alias to the issuing organisations it stands for, as [issuingOrg, ISO3] pairs. */
export type IssuerTable = Record<string, [string, string][]>;

/** The alias table of data/lab/shared/issuer-aliases.json, keyed for lookup. */
export function issuerTable(aliases: { alias: string; issuingOrg: string; iso3: string }[]): IssuerTable {
  const out: IssuerTable = {};
  for (const a of aliases) {
    const key = fold(a.alias);
    const list = (out[key] ??= []);
    if (!list.some(([o, c]) => o === a.issuingOrg && c === a.iso3.toUpperCase())) list.push([a.issuingOrg, a.iso3.toUpperCase()]);
  }
  return out;
}

/**
 * Whether a row answers ?org=: its issuing organisation is recorded under that name, or the name
 * is an alias of that organisation in that country (the rule of resolveIssuer in joins.ts).
 */
export function matchesOrg(row: Pick<DocumentRow, 'issuingOrg' | 'country'>, org: string, table: IssuerTable): boolean {
  if (!row.issuingOrg) return false;
  const key = fold(org);
  const issuer = fold(row.issuingOrg);
  if (issuer === key) return true;
  return (table[key] ?? []).some(([o, c]) => fold(o) === issuer && c === row.country);
}

/**
 * The issuing organisations an alias stands for, when it is one and names others: for the status
 * line. With a country, only the organisations the table places in that country, so the line never
 * names one whose documents the view cannot hold.
 */
export function aliasTargets(org: string, table: IssuerTable, country?: string): string[] {
  const key = fold(org);
  const code = country?.toUpperCase();
  const pairs = (table[key] ?? []).filter(([, c]) => !code || c === code);
  return [...new Set(pairs.map(([o]) => o))].filter((o) => fold(o) !== key);
}

/**
 * Whether ?org= still finds anything once a country is chosen: an issuer recorded under that name
 * in that country, or an alias the table places there. With no country or no issuer, it fits.
 */
export function orgFits(org: string, country: string, issuers: readonly [string, string[]][], table: IssuerTable): boolean {
  if (!org || !country) return true;
  const key = fold(org);
  const code = country.toUpperCase();
  return issuers.some(([name, codes]) => fold(name) === key && codes.includes(code)) || (table[key] ?? []).some(([, c]) => c === code);
}

/** The words of a search: every one must appear in the title or the summary. */
export function searchTokens(q: string): string[] {
  return fold(q).split(' ').filter(Boolean);
}

const haystacks = new WeakMap<DocumentRow, string>();
function haystack(r: DocumentRow): string {
  let h = haystacks.get(r);
  if (h === undefined) {
    h = fold(`${r.title} ${r.summary ?? ''}`);
    haystacks.set(r, h);
  }
  return h;
}

/** Whether a row's title or summary holds every word of the search. */
export function matchesSearch(r: DocumentRow, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const h = haystack(r);
  return tokens.every((t) => h.includes(t));
}

/** The rows that answer every filter, in their order. */
export function filterRows(rows: DocumentRow[], f: DocFilters, table: IssuerTable): DocumentRow[] {
  const tokens = searchTokens(f.q);
  const country = f.country.toUpperCase();
  const type = fold(f.type);
  const tier = fold(f.tier);
  const year = f.year === YEAR_NONE ? null : f.year ? Number(f.year) : undefined;
  return rows.filter(
    (r) =>
      (!country || r.country === country) &&
      (!f.org || matchesOrg(r, f.org, table)) &&
      (!type || fold(r.docType ?? '') === type) &&
      (!tier || fold(r.tier ?? '') === tier) &&
      (year === undefined || r.year === year) &&
      matchesSearch(r, tokens),
  );
}

// ---- the choices the page offers --------------------------------------------------------------

export interface FilterOptions {
  places: [string, string][]; // [ISO3, name], by name
  issuers: [string, string[]][]; // [issuing organisation, ISO3 codes], by name
  types: string[];
  tiers: string[];
  years: number[]; // newest first
  yearUnknown: boolean; // some rows record no year
}

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' });

/** The values the rows hold, for the country, issuer, type, tier and year choices. */
export function filterOptions(rows: DocumentRow[]): FilterOptions {
  const places = new Map<string, string>();
  const issuers = new Map<string, Set<string>>();
  const types = new Set<string>();
  const tiers = new Set<string>();
  const years = new Set<number>();
  let yearUnknown = false;
  for (const r of rows) {
    if (r.country) places.set(r.country, r.place ?? r.country);
    if (r.issuingOrg) {
      const set = issuers.get(r.issuingOrg) ?? new Set<string>();
      if (r.country) set.add(r.country);
      issuers.set(r.issuingOrg, set);
    }
    if (r.docType) types.add(r.docType);
    if (r.tier) tiers.add(r.tier);
    if (r.year === null) yearUnknown = true;
    else years.add(r.year);
  }
  return {
    places: [...places].sort((a, b) => byName(a[1], b[1])),
    issuers: [...issuers].map(([o, set]): [string, string[]] => [o, [...set].sort()]).sort((a, b) => byName(a[0], b[0])),
    types: [...types].sort(byName),
    tiers: [...tiers].sort(byName),
    years: [...years].sort((a, b) => b - a),
    yearUnknown,
  };
}

/** A tier's option label: "T1, primary institutional". */
export const tierLabel = (tier: string): string => (TIER_WORDS[tier] ? `${tier}, ${TIER_WORDS[tier]}` : tier);

// ---- history --------------------------------------------------------------------------------------

/**
 * How a change reaches the browser's history, so the back button restores the previous filter
 * without a step for every letter typed: a choice always adds an entry; a search adds one when
 * it starts and then updates that entry while the visitor keeps typing.
 */
export function historyStep(source: 'choice' | 'search', typing: boolean): 'push' | 'replace' {
  return source === 'search' && typing ? 'replace' : 'push';
}

/** What the page's script holds between events: the filters, and whether a search is being typed. */
export interface ViewState {
  filters: DocFilters;
  typing: boolean;
}

/**
 * The search field changed: the new state and how it reaches history, or null when the words
 * are the same once spaces are tidied (nothing to do).
 */
export function searchChange(s: ViewState, text: string): { next: ViewState; step: 'push' | 'replace' } | null {
  const q = text.replace(/\s+/g, ' ').trim();
  if (q === s.filters.q) return null;
  return { next: { filters: { ...s.filters, q }, typing: true }, step: historyStep('search', s.typing) };
}

/**
 * A choice changed: always a new history entry, and it ends any search being typed. A new
 * country drops an issuer that has no document there (`fits`, from orgFits).
 */
export function choiceChange(
  s: ViewState,
  key: Exclude<FilterKey, 'q'>,
  value: string,
  fits: (org: string, country: string) => boolean,
): { next: ViewState; step: 'push' } {
  const filters = { ...s.filters, [key]: value };
  if (key === 'country' && !fits(filters.org, filters.country)) filters.org = '';
  return { next: { filters, typing: false }, step: 'push' };
}

/**
 * The back or forward button: the state the URL holds, and the words the search field must show.
 * The field is always rewritten, even while it has focus, so it never keeps words that no
 * longer filter anything.
 */
export function fromHistory(search: string): { next: ViewState; field: string } {
  const filters = readFilters(search);
  return { next: { filters, typing: false }, field: filters.q };
}

// ---- words ----------------------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The line over the rows: how many documents answer and which filters are set, in the order of
 * the controls. `places` maps ISO3 to name.
 */
export function statusText(
  f: DocFilters,
  counts: { matched: number; shown: number; total: number },
  places: Readonly<Record<string, string>>,
  table: IssuerTable,
): string {
  const { matched, shown, total } = counts;
  if (!hasFilters(f)) {
    const lead = shown >= total ? `Showing all ${total} ${plural(total, 'document', 'documents')}` : `Showing ${shown} of ${total} documents`;
    return `${lead}, by country, then newest first.`;
  }
  if (matched === 0) {
    if (choiceCount(f) === 0) return `No title or summary holds every word of “${f.q}”.`;
    return f.q ? 'No document matches these filters and words.' : 'No document matches these filters.';
  }
  const parts: string[] = [];
  if (f.country) parts.push(places[f.country] ?? f.country);
  if (f.org) {
    const others = aliasTargets(f.org, table, f.country || undefined);
    parts.push(others.length ? `issued by ${f.org} (recorded as ${joinOr(others)})` : `issued by ${f.org}`);
  }
  if (f.type) parts.push(f.type);
  if (f.tier) parts.push(`tier ${f.tier.replace(/^T/i, '')}`);
  if (f.year) parts.push(f.year === YEAR_NONE ? 'year not recorded' : f.year);
  if (f.q) parts.push(`“${f.q}” in the title or summary`);
  const lead = `${matched} of ${total} documents`;
  const more = shown < matched ? ` Showing the first ${shown}.` : '';
  return `${lead}: ${parts.join(' · ')}.${more}`;
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "Show 50 more", or "Show the last 12" when fewer remain. */
export function moreLabel(remaining: number, pageSize: number = PAGE_SIZE): string {
  if (remaining <= 0) return '';
  if (remaining <= pageSize) return remaining === 1 ? 'Show the last one' : `Show the last ${remaining}`;
  return `Show ${pageSize} more`;
}

// ---- a row as HTML --------------------------------------------------------------------------------

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text made safe for HTML content and attribute values. */
export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** A document's address when it is a web address (http or https), else null: no other scheme becomes a link. */
export function safeHref(url: string | null): string | null {
  if (!url) return null;
  const s = url.trim();
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

/** A piece of a quiet note: plain text, or [text, href] for a link to a standard's or a guide's page. */
export type NotePart = string | [string, string];
/** A quiet note: one plain sentence, or its parts with the names it links. */
export type Note = string | NotePart[];

const wordChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c);

/**
 * A note in parts, with each name in `links` ([name, href]: a standard's short name, a guide's
 * short label) made a link to its page, so "Named in the Standards Cascade: FIPS 203" leads to
 * FIPS 203. A name matches only whole ("FIPS 20" never inside "FIPS 203"), longer names first.
 */
export function linkNote(note: string, links: readonly [string, string | null][]): NotePart[] {
  const named = links.filter((l): l is [string, string] => !!l[0] && !!l[1]).sort((a, b) => b[0].length - a[0].length);
  const out: NotePart[] = [];
  let plain = '';
  let i = 0;
  while (i < note.length) {
    const hit = wordChar(note[i - 1]) ? undefined : named.find(([n]) => note.startsWith(n, i) && !wordChar(note[i + n.length]));
    if (hit) {
      if (plain) out.push(plain);
      plain = '';
      out.push([hit[0], hit[1]]);
      i += hit[0].length;
    } else {
      plain += note[i];
      i += 1;
    }
  }
  if (plain) out.push(plain);
  return out;
}

const noteHtml = (n: Note): string =>
  typeof n === 'string' ? esc(n) : n.map((p) => (typeof p === 'string' ? esc(p) : `<a href="${esc(p[1])}">${esc(p[0])}</a>`)).join('');

export interface RowContext {
  /** ISO3 to [name, profile href or null]; hrefs come from the build (pageHref), never from here. */
  places: Readonly<Record<string, [string, string | null]>>;
  /** docId to the quiet notes of the tools this build shows (documentNotes), with their links. */
  notes: Readonly<Record<string, Note[]>>;
}

/**
 * The name of a field for a screen reader, in front of its value. Under 900px the column heads
 * leave the page and each row becomes one line of values, so these labels say which value is
 * which; at wider widths the page's CSS removes them and the column heads do that work.
 */
const key = (name: string) => `<span class="dx-k">${name}: </span>`;

/** "not recorded", with the field's name in front on the one-line rows under 900px ("type not recorded"). */
const notRecorded = (field: string) => `<span class="dx-nr"><span class="dx-lbl" aria-hidden="true">${field} </span>not recorded</span>`;

/**
 * One row of the table. Under 900px the page's CSS sets each row as a block: the title, the
 * summary and the notes, then one line of place, issuer, year, type and tier.
 */
export function rowHtml(r: DocumentRow, ctx: RowContext): string {
  const href = safeHref(r.url);
  // every row is a link, so its title and its country are index links: ink words on a thin teal
  // underline (global.css .row-link), and the list keeps one teal mass
  const title = href ? `<a class="dx-title row-link" href="${esc(href)}">${esc(r.title)}</a>` : `<span class="dx-title">${esc(r.title)}</span>`;
  const summary = r.summary ? `<p class="dx-sum">${esc(r.summary)}</p>` : '';
  const notes = ctx.notes[r.id] ?? [];
  const noteList = notes.length ? `<ul class="dx-notes">${notes.map((n) => `<li>${noteHtml(n)}</li>`).join('')}</ul>` : '';
  const place = r.country ? ctx.places[r.country] : undefined;
  const placeName = place?.[0] ?? r.place ?? r.country;
  const placeCell = placeName
    ? place?.[1]
      ? `<a class="row-link" href="${esc(place[1])}">${esc(placeName)}</a>`
      : esc(placeName)
    : notRecorded('country');
  return (
    `<tr class="dx-row" id="doc-${esc(r.id)}">` +
    `<td class="dx-doc">${title}${summary}${noteList}</td>` +
    `<td class="dx-place">${key('Country')}${placeCell}</td>` +
    `<td class="dx-org">${key('Issuer')}${r.issuingOrg ? esc(r.issuingOrg) : notRecorded('issuer')}</td>` +
    `<td class="dx-year">${key('Year')}${r.year !== null ? String(r.year) : notRecorded('year')}</td>` +
    `<td class="dx-type">${key('Type')}${r.docType ? esc(r.docType) : notRecorded('type')}</td>` +
    `<td class="dx-tier">${key('Tier')}${r.tier ? esc(r.tier) : notRecorded('tier')}</td>` +
    `</tr>`
  );
}

// ---- the page --------------------------------------------------------------------------------

/** What the page hands its script, as JSON in the HTML: every href comes from the build. */
export interface DocumentsConfig {
  data: string | null; // /data/documents.json
  total: number;
  pageSize: number;
  places: Record<string, [string, string | null]>; // ISO3 to [name, profile href]
  notes: Record<string, Note[]>; // docId to the notes of the tools this build shows, with their links
  aliases: IssuerTable;
  issuers: [string, string[]][]; // issuing organisation to the ISO3 codes it publishes for
}

export interface PageInput {
  rows: DocumentRow[];
  profileHref: (iso3: string) => string | null; // pageHref of the profile, from the build
  notes: ReadonlyMap<string, string[]>; // documentNotes for the shown tools, by docId
  /** [name, href] of each standard and guide a note may name, hrefs from the build; null when its page is not built. */
  noteLinks?: readonly [string, string | null][];
  aliases: IssuerTable;
  dataHref: string | null; // pageHref('/data/documents.json')
}

/**
 * Everything the page draws before any script runs: the inventory for the lede, the choices,
 * the first PAGE_SIZE rows as HTML, the line over them, the "Show 50 more" label, and the config
 * (escaped for a script element) that the page's script reads.
 */
export function documentsPage(input: PageInput) {
  const { rows } = input;
  const census = documentsCensus(rows);
  const options = filterOptions(rows);
  const places: DocumentsConfig['places'] = Object.fromEntries(
    options.places.map(([iso3, name]) => [iso3, [name, input.profileHref(iso3)] as [string, string | null]]),
  );
  const ids = new Set(rows.map((r) => r.id));
  const links = input.noteLinks ?? [];
  const notes: DocumentsConfig['notes'] = Object.fromEntries(
    [...input.notes]
      .filter(([id, list]) => ids.has(id) && list.length > 0)
      .map(([id, list]) => [id, list.map((n): Note => (links.length ? linkNote(n, links) : n))]),
  );
  const first = rows.slice(0, PAGE_SIZE);
  const firstHtml = first.map((r) => rowHtml(r, { places, notes })).join('');
  const status = statusText(NO_FILTERS, { matched: rows.length, shown: first.length, total: rows.length }, {}, input.aliases);
  const config: DocumentsConfig = {
    data: input.dataHref,
    total: rows.length,
    pageSize: PAGE_SIZE,
    places,
    notes,
    aliases: input.aliases,
    issuers: options.issuers,
  };
  return {
    census,
    options,
    shown: first.length,
    firstHtml,
    status,
    more: moreLabel(rows.length - first.length),
    config,
    // "<" is escaped so no value can close the script element early
    configJson: JSON.stringify(config).replace(/</g, '\\u003c'),
  };
}

/** The anchor id a location hash points at ("#doc-d0123456789" gives "d0123456789"), or null. */
export function hashTarget(hash: string): string | null {
  const m = /^#doc-([A-Za-z0-9_-]{1,64})$/.exec(hash);
  return m ? m[1] : null;
}
