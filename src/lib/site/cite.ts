// qscatlas.org: how to cite a page or a tool, and how to report an error in it.
//
// Every citation carries the authors, CEPS, the page or tool title, the as-of date of its data,
// the page's address on the Atlas (from siteOrigin(), so the domain move changes it in one place)
// and the archived dataset's DOI. No licence is stated until Swann and CEPS agree one.
//
// Authors (Swann's decision on citation, 1 October 2026): the creators of the Zenodo record, as
// the record lists them, plus CEPS, for every page and every tool. A tool's byline is shown
// beside the citation ("By Swann Ashworth, CEPS") and does not change who the citation names.
// Read from the record's own metadata in this session:
//   source https://zenodo.org/api/records/21262284, retrieved 2026-10-01, class: repository record
//   excerpt: "creators": [{"name": "Ashworth, S.", "affiliation": "Centre for European Policy Studies",
// The record also carries a licence; it is not repeated here (see above).

import { CORRECTIONS_EMAIL, ZENODO_DOI, siteOrigin } from './config';
import { formatDate } from '../lab/format';

/** The creators of the Zenodo record, as the record lists them. */
export const ZENODO_CREATORS: readonly string[] = ['Ashworth, S.'];

/** The institution every citation names beside the authors. */
export const CITE_INSTITUTION = 'CEPS';

/** The author part: the Zenodo creators, then CEPS, joined as APA joins a list. */
export function citeAuthors(): string {
  const names = [...ZENODO_CREATORS, CITE_INSTITUTION];
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
}

/** A clean site path: no query, no fragment, no trailing slash; the root stays "/". */
export function cleanSitePath(path: string): string {
  let p = (path || '/').split(/[?#]/)[0];
  if (!p.startsWith('/')) p = `/${p}`;
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/** The address a citation gives: the Atlas origin and the clean path. */
export function citeUrl(path: string, origin: string = siteOrigin()): string {
  const base = origin.replace(/\/+$/, '');
  const p = cleanSitePath(path);
  return p === '/' ? `${base}/` : `${base}${p}`;
}

export const DOI_URL = `https://doi.org/${ZENODO_DOI}`;

export interface CiteInput {
  title: string; // the page or tool name
  path: string; // the page's site path, such as /prepare/exposure
  asOf?: string | null; // ISO day of the page's data; null or omitted when nothing is verified yet
  origin?: string; // defaults to siteOrigin()
}

/**
 * The citation as one line of text:
 * "Ashworth, S., & CEPS. (2026). Exposure Clock. QSC Atlas, data as of 30 September 2026.
 *  https://qsc-atlas.vercel.app/prepare/exposure Dataset archived at https://doi.org/..."
 * The year is the as-of date's year, or "n.d." when the page has no as-of date. As in APA 7,
 * and as in the source list above it, no full stop follows an address, so a pasted citation
 * never carries one into the link.
 */
export function citeText(input: CiteInput): string {
  const title = input.title.trim().replace(/[.\s]+$/, '');
  const asOf = input.asOf && /^\d{4}/.test(input.asOf) ? input.asOf : null;
  const year = asOf ? asOf.slice(0, 4) : 'n.d.';
  const site = asOf ? `QSC Atlas, data as of ${formatDate(asOf)}.` : 'QSC Atlas.';
  return [`${citeAuthors()}.`, `(${year}).`, `${title}.`, site, citeUrl(input.path, input.origin), `Dataset archived at ${DOI_URL}`].join(' ');
}

/** The citation for a page that is not a tool. */
export function pageCitation(input: CiteInput): string {
  return citeText(input);
}

/** The citation for a tool, at its route unless a path is given. */
export function toolCitation(
  tool: { title: string; route: string },
  asOf: string | null | undefined,
  opts: { path?: string; origin?: string } = {},
): string {
  return citeText({ title: tool.title, path: opts.path ?? tool.route, asOf, origin: opts.origin });
}

/** A mailto link for a correction, with the page in the subject: "Correction: {title} ({path})". */
export function correctionHref(title: string, path: string, email: string = CORRECTIONS_EMAIL): string {
  const subject = `Correction: ${title.trim()} (${cleanSitePath(path)})`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}
