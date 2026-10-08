// QSC Atlas Labs: dates and citations as a visitor reads them.
// British dates ("20 January 2026") and APA 7 reference entries.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-01-20" gives "20 January 2026"; "2026-01" gives "January 2026"; "2026" gives "2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (d) return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
  if (m) return `${MONTHS[Number(m) - 1]} ${y}`;
  return y;
}

/** One reference in the sources list. */
export interface SourceEntry {
  author: string; // "European Commission" or "Mosca, M., & Piani, M."
  date?: string | null; // ISO year, month or day; omitted gives "n.d."
  title: string;
  container?: string; // a journal or periodical: set in italics, and the title is then set plain
  site?: string; // the website a page belongs to, when it differs from the author
  details?: string; // after a container "16(5), 38 to 41"; otherwise a report number, "Special Report 19/2026"
  publisher?: string; // omitted when it is the same as the author
  url?: string;
  doi?: string; // "10.1109/MSP.2018.3761723"
  retrievedAt?: string; // for pages whose content is designed to change
}

/** The date part of an APA reference: "(2026, January 20)", "(2026)" or "(n.d.)". */
export function apaDate(iso: string | null | undefined): string {
  if (!iso) return '(n.d.)';
  const [y, m, d] = iso.split('-');
  if (d) return `(${y}, ${MONTHS[Number(m) - 1]} ${Number(d)})`;
  if (m) return `(${y}, ${MONTHS[Number(m) - 1]})`;
  return `(${y})`;
}

/** APA 7 orders references alphabetically by author, then by date. */
export function sortSources(entries: SourceEntry[]): SourceEntry[] {
  return [...entries].sort((a, b) =>
    a.author.localeCompare(b.author, 'en-GB') || String(a.date ?? '').localeCompare(String(b.date ?? '')),
  );
}

/** The link an entry resolves to: its DOI when it has one, else its URL. */
export function sourceHref(e: SourceEntry): string | null {
  if (e.doi) return `https://doi.org/${e.doi}`;
  return e.url ?? null;
}

/** One reference as text runs; `i` marks the run set in italics. */
export function apaParts(e: SourceEntry): { t: string; i?: boolean }[] {
  const stop = (s: string) => (/[.?!]$/.test(s) ? '' : '.');
  const out: { t: string; i?: boolean }[] = [{ t: `${e.author}${stop(e.author)} ${apaDate(e.date)}. ` }];
  if (e.container) {
    out.push({ t: `${e.title}${stop(e.title)} ` }, { t: e.container, i: true }, { t: `${e.details ? `, ${e.details}` : ''}. ` });
  } else {
    out.push({ t: e.title, i: true }, { t: e.details ? ` (${e.details}). ` : `${stop(e.title)} ` });
  }
  if (e.site && e.site !== e.author) out.push({ t: `${e.site}${stop(e.site)} ` });
  if (e.publisher && e.publisher !== e.author && e.publisher !== e.site) out.push({ t: `${e.publisher}${stop(e.publisher)} ` });
  if (e.retrievedAt && !e.doi) {
    const [y, m, d] = e.retrievedAt.split('-');
    out.push({ t: `Retrieved ${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}, from ` });
  }
  return out;
}
