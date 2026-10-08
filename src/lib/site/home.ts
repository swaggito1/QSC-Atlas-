// The census of the Atlas's records: how many profiles it holds and how they divide by
// coordination posture. The Countries list prints it (src/pages/countries/index.astro).
//
// Every number is counted from data when the site is built; nothing here is a count written by
// hand. The home page went back to its live version on 2 October 2026 (Swann: too much text), so
// the question rows, the purpose sentence and the globe's places that lived here are gone; the
// census stays because the Countries list reads it.
//
// Server code only.

import type { LoadOptions } from '../lab/load';
import { listCountries } from '../lab/atlas';
import { POSTURE_META, POSTURE_ORDER, postureMeta } from '../process';
import type { CoordinationPosture } from '../process';
import { joinAnd, nameInSentence } from './joins';
import { formatDay, latestDay } from './meta';

// ---- the census -------------------------------------------------------------------------------

/** One profile as the census reads it: the collection entry's fields, or a fixture. */
export interface CensusRecord {
  iso3: string;
  country?: string | null;
  coordinationPosture: string | null;
  lastUpdated?: string | null;
}

/** The three coordination blocs; "Engaged but unaligned" is a posture, never a bloc (spec 13). */
export const BLOC_POSTURES: readonly CoordinationPosture[] = POSTURE_ORDER.filter((k) => k !== 'engaged-unaligned');

export interface Census {
  records: number; // every profile, the EU and NATO included
  countries: number; // the records that are not supranational
  supranational: string[]; // as the line reads them: "the EU", "NATO"
  byPosture: Record<CoordinationPosture, number>;
  inBloc: number;
  unaligned: number;
  noPosture: number;
  asOf: string | null; // the latest profile update, an ISO day
}

// how a supranational record reads inside the census line; any other takes its own name
const CENSUS_NAME: Record<string, string> = { EUU: 'the EU' };

/** The ISO3 code of every record data/countries.json lists: the profiles the Atlas holds. */
export function expectedRecords(opts: LoadOptions = {}): string[] {
  return listCountries(opts.root ? { root: opts.root } : {}).map((c) => c.iso3.toUpperCase());
}

/**
 * Whether the census may be published: every record data/countries.json lists has its profile in
 * the collection. The Notion loader builds with whatever loaded when a request fails, so a partial
 * or empty collection would otherwise print counts that are not true ("0 countries on record").
 */
export function censusWhole(records: { iso3: string }[], expected: readonly string[]): boolean {
  if (!records.length || !expected.length) return false;
  const have = new Set(records.map((r) => r.iso3.toUpperCase()));
  return expected.every((iso3) => have.has(iso3.toUpperCase()));
}

/** The supranational records (the EU and NATO), from data/countries.json, by ISO3 with their names. */
export function supranationalRecords(opts: LoadOptions = {}): Map<string, string> {
  const rows = listCountries(opts.root ? { root: opts.root } : {});
  return new Map(rows.filter((c) => c.supranational).map((c) => [c.iso3.toUpperCase(), c.name]));
}

/**
 * Counts every record by posture. Inventory only: no score, no ranking, no percentage. A posture
 * the Atlas does not know counts as none, as the map draws it.
 */
export function census(records: CensusRecord[], supranational: ReadonlyMap<string, string> | ReadonlySet<string>): Census {
  const isSupra = (iso3: string) => supranational.has(iso3.toUpperCase());
  const byPosture = Object.fromEntries(POSTURE_ORDER.map((k) => [k, 0])) as Record<CoordinationPosture, number>;
  let noPosture = 0;
  const supraNames: string[] = [];
  for (const r of records) {
    const meta = postureMeta(r.coordinationPosture);
    if (meta) byPosture[meta.key] += 1;
    else noPosture += 1;
    if (isSupra(r.iso3)) {
      const code = r.iso3.toUpperCase();
      const name = supranational instanceof Map ? supranational.get(code) : undefined;
      supraNames.push(CENSUS_NAME[code] ?? nameInSentence(r.country || name || code));
    }
  }
  return {
    records: records.length,
    countries: records.filter((r) => !isSupra(r.iso3)).length,
    supranational: supraNames,
    byPosture,
    inBloc: BLOC_POSTURES.reduce((n, k) => n + byPosture[k], 0),
    unaligned: byPosture['engaged-unaligned'],
    noPosture,
    asOf: latestDay(records.map((r) => r.lastUpdated ?? null)),
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The census as separate items a page joins with middle dots:
 * "195 countries, the EU and NATO on record", "42 in a coordination bloc",
 * "8 engaged but unaligned", "data as of 25 June 2026". No records gives no line, never zeros.
 */
export function censusItems(c: Census): string[] {
  if (c.records === 0) return [];
  const on = c.supranational.length ? `${plural(c.countries, 'country', 'countries')}, ${joinAnd(c.supranational)} on record` : `${plural(c.countries, 'country', 'countries')} on record`;
  const items = [on, `${c.inBloc} in a coordination bloc`, `${c.unaligned} ${POSTURE_META['engaged-unaligned'].label.toLowerCase()}`];
  const day = formatDay(c.asOf);
  if (day) items.push(`data as of ${day}`);
  return items;
}
