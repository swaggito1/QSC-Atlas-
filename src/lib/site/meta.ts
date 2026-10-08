// Page metadata for the layout shell: titles, canonical addresses, sharing tags, the dates in
// the footer and BreadcrumbList structured data. Pure functions so the tests can call them.

import { SITE_NAME, siteOrigin } from './config';

export const DEFAULT_DESCRIPTION = 'How governments are migrating to quantum-safe cryptography, country by country.';

/** The one sharing image: a monochrome card with the wordmark and the home title. */
export const OG_IMAGE = {
  path: '/og/qsc-atlas.png',
  width: 1200,
  height: 630,
  alt: 'QSC Atlas: the geopolitics of the post-quantum transition',
} as const;

export interface Crumb {
  label: string;
  href: string;
}

/** A path with no trailing slash, no index file and no .html ending; the root stays "/". */
export function cleanPath(pathname: string): string {
  let p = pathname.split(/[?#]/)[0] || '/';
  p = p.replace(/\/index(\.html)?$/, '/').replace(/\.html$/, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
}

/** The canonical address of a page: the site origin plus the clean path, never a trailing slash. */
export function canonicalUrl(pathname: string, origin: string = siteOrigin()): string {
  const base = origin.replace(/\/+$/, '');
  const p = cleanPath(pathname);
  return p === '/' ? base : base + p;
}

/** The document title: the page name, then the site name. */
export function pageTitle(title?: string | null): string {
  const t = (title ?? '').trim();
  return !t || t === SITE_NAME ? SITE_NAME : `${t} · ${SITE_NAME}`;
}

/** "25 June 2026" from an ISO day, or null when there is no usable date. */
export function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The latest ISO day in a list (the footer's "Data as of"), or null when none is recorded. */
export function latestDay(values: (string | null | undefined)[]): string | null {
  const days = values.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)).map((v) => v.slice(0, 10));
  return days.length ? days.sort().at(-1)! : null;
}

/** Today's ISO day, in UTC, for the "Site built" line. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** BreadcrumbList structured data (schema.org) as a JSON string for a script tag. */
export function breadcrumbJsonLd(crumbs: Crumb[], origin: string = siteOrigin()): string {
  const list = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.label,
      item: canonicalUrl(c.href, origin),
    })),
  };
  // "<" is escaped so a label can never close the script element early
  return JSON.stringify(list).replace(/</g, '\\u003c');
}

/** A mailto link for a correction, with the page named in the subject. */
export function reportHref(email: string, title: string, path: string): string {
  const subject = `Correction: ${title} (${cleanPath(path)})`;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

/** Adds the page to the subject of a bare mailto link (the footer's "Report an error"). */
export function withSubject(href: string, title: string, path: string): string {
  if (!href.startsWith('mailto:') || href.includes('?')) return href;
  return reportHref(href.slice('mailto:'.length), title, path);
}

