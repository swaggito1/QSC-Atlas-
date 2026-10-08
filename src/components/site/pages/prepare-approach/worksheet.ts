// The migration approach worksheet's state, kept after the # in the page's address and nowhere
// else (spec 5.2): "w=" and one entry per system, joined by commas. Each entry is the system's name,
// percent-encoded, then a colon and the id of the route chosen for it (empty when none is chosen
// yet). encodeURIComponent always encodes the comma and the colon, so a name holding either cannot
// break the format. Pure functions with no route strings and no storage: the page's script and
// src/lib/site/prepare-elements.test.ts both import them.

export interface WorksheetRow {
  name: string;
  route: string | null; // an option or case id from approach.json, or null when not chosen yet
}

export const MAX_ROWS = 60; // more systems than this belong in the inventory template
export const MAX_NAME = 120;

/** decodeURIComponent that gives null for a broken escape instead of throwing. */
function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** A name as the worksheet keeps it: no line breaks, single spaces, at most MAX_NAME characters. */
export function cleanName(name: string): string {
  return name.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').slice(0, MAX_NAME);
}

/**
 * The fragment for a worksheet, without the "#": "w=Payroll:in-place,HR%20portal:". A row with no
 * name and no route is left out; an unknown route is written as none. Gives "" for an empty sheet.
 */
export function encodeWorksheet(rows: WorksheetRow[], known: string[]): string {
  const kept = rows
    .map((r) => ({ name: cleanName(r.name).trim(), route: r.route && known.includes(r.route) ? r.route : null }))
    .filter((r) => r.name !== '' || r.route !== null)
    .slice(0, MAX_ROWS);
  if (!kept.length) return '';
  return 'w=' + kept.map((r) => `${encodeURIComponent(r.name)}:${r.route ?? ''}`).join(',');
}

/**
 * Read a fragment back. Gives null when there is no "w=" in it, so a page opened without a
 * worksheet starts with one empty row. An entry with a broken escape is dropped, and an unknown
 * route becomes "not chosen", so an old or hand-edited link never breaks the page.
 */
export function decodeWorksheet(hash: string, known: string[]): WorksheetRow[] | null {
  const raw = hash.replace(/^#/, '');
  const pair = raw.split('&').find((p) => p.startsWith('w='));
  if (pair === undefined) return null;
  const rows: WorksheetRow[] = [];
  for (const entry of pair.slice(2).split(',')) {
    if (!entry) continue;
    const at = entry.indexOf(':');
    const rawName = at >= 0 ? entry.slice(0, at) : entry;
    const rawRoute = at >= 0 ? entry.slice(at + 1) : '';
    const name = safeDecode(rawName);
    if (name === null) continue;
    const route = known.includes(rawRoute) ? rawRoute : null;
    const clean = cleanName(name).trim();
    if (clean === '' && route === null) continue;
    rows.push({ name: clean, route });
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

function csvCell(v: string): string {
  // a cell a spreadsheet would read as a formula is prefixed with an apostrophe
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 text with CRLF line ends and a byte-order mark, so spreadsheet programs read the accents. */
export function csvText(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** The worksheet as CSV: the header row, then one row per named or chosen system. */
export function worksheetCsv(rows: WorksheetRow[], labels: Record<string, string>, header: [string, string]): string {
  const body = rows
    .filter((r) => r.name.trim() !== '' || r.route !== null)
    .map((r) => [r.name.trim(), r.route ? (labels[r.route] ?? '') : '']);
  return csvText([header, ...body]);
}
