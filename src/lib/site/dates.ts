// Which dated targets reach a set of places (spec 6.3, contract 21.2).
//
// One place's rows merge four records:
//   1. the lines of its profile's Migration Timeline (the JSON copy in data/profiles), each with
//      the kind, status and bindingness its annotation records, or null ("not recorded");
//   2. the milestones of every guide the place itself issues (readiness.json, by the guide's
//      jurisdiction: ANSSI's FAQ for France, the NCSC timelines for the United Kingdom);
//   3. for an EU Member State, the EU coordinated roadmap's milestones, as membership rows: they
//      reach the place through EU membership, never through its coordination posture;
//   4. nothing else. No kind or status is inferred from a label, and no year from a posture.
// A profile line whose confirmed annotation says it restates a guide is drawn once, as that
// guide's row (foldLines, which the evidence block uses too, so the two never disagree). An
// annotation that is still a lead never folds a line: in preview the line stays, marked as a lead
// and naming the guide it may repeat, so Swann sees each fold before he confirms it.
// In production, leads (verify: true) never reach a row: loadDataset drops them, and any row
// still marked as a lead is filtered out as well. The profile lines of a place in REREAD (the
// United States, spec 6.3) are leads too until a confirmed annotation covers them.

import type { LoadOptions } from '../lab/load';
import { isProduction } from '../lab/load';
import type { LifecycleStatus } from '../lab/types';
import type { InstrumentStatus } from '../regulation';
import { readReadiness } from '../lab/readiness-data';
import { KINDS, dateAnnotation } from './annotations';
import type { Kind } from './annotations';
import { euMembers, fileExists, guides, memo, placeName, profilesByIso3 } from './joins';
import type { Guide } from './joins';

const READINESS = 'data/lab/readiness/readiness.json';

/**
 * Places whose own profile lines stay leads until a confirmed annotation covers them, because
 * they have not been re-read at the primary source (spec 6.3: "US rows stay leads until re-read
 * at the primary"). In preview such a line is drawn dotted, as a lead; in production it is left
 * out, like every other lead. Confirming the line's annotation (verify false) lifts the rule for
 * that line only.
 */
export const REREAD: ReadonlySet<string> = new Set(['USA']);

export type { Kind };
export type Bindingness = InstrumentStatus;

export interface DateRow {
  iso3: string;
  place: string;
  year: number;
  month: number | null; // only where the source names one
  label: string;
  kind: Kind | null; // null reads "not recorded"
  status: LifecycleStatus | null; // lifecycle status of the instrument that sets the date
  bindingness: Bindingness | null; // a separate axis from status
  issuer: string | null;
  scope: string | null;
  sourceUrl: string | null;
  relation: 'own' | 'membership'; // solid marker, or open marker "Addressed to Member States"
  origin: 'profile' | 'guide' | 'extra'; // "extra" is reserved; no extra source is merged today
  lead: boolean; // rests on a record not yet confirmed; preview only
  guide?: string | null; // the guide id, for rows from a guide
  guideTitle?: string | null; // the guide's short name ("EU roadmap"), for rows from a guide
  audience?: string | null; // who the guide is written for, in its own words, for rows from a guide
  display?: string | null; // the year as the profile writes it, when it is a range such as "2024-2026"
  restated?: string | null; // the profile line this guide row stands in for, when a confirmed annotation says so
  restates?: string | null; // on a profile line that is not folded: the guide its annotation says it repeats (a lead, in preview)
}

/** The order of kinds for a tie on the same date: the readiness.json order. */
export const KIND_ORDER: readonly Kind[] = KINDS;

const EU_ROADMAP = 'eu-roadmap';

/**
 * The guides whose milestones reach a place: those it issues itself (own), then, for an EU Member
 * State, the EU coordinated roadmap (membership). Never decided by coordination posture.
 */
export function guidesReaching(iso3: string, opts: LoadOptions = {}): { guide: Guide; relation: 'own' | 'membership' }[] {
  const code = iso3.toUpperCase();
  const all = guides(opts);
  const out: { guide: Guide; relation: 'own' | 'membership' }[] = all.filter((g) => g.jurisdiction === code).map((guide) => ({ guide, relation: 'own' }));
  if (code !== 'EUU' && euMembers(opts).has(code)) {
    const eu = all.find((g) => g.id === EU_ROADMAP);
    if (eu) out.push({ guide: eu, relation: 'membership' });
  }
  return out;
}

/**
 * For each dated line of a place's timeline, the id of the guide whose row it folds into, or null.
 * A line folds only when its annotation is confirmed (verify false) and names a guide that reaches
 * the place, is itself verified (so its row survives a production build) and has a milestone in
 * that year; each milestone takes one line at most. Target dates and the evidence block both use
 * this rule, so a line is never dropped from one and kept in the other.
 */
export function foldLines(iso3: string, lines: { year: number; label: string }[], opts: LoadOptions = {}): (string | null)[] {
  const reaching = new Map(guidesReaching(iso3, opts).map((r) => [r.guide.id, r.guide]));
  const room = new Map<string, number>(); // free milestones per guide and year
  for (const g of reaching.values()) for (const m of g.milestones) room.set(`${g.id}|${m.year}`, (room.get(`${g.id}|${m.year}`) ?? 0) + 1);
  return lines.map((line) => {
    const note = dateAnnotation(iso3, line.year, line.label, opts);
    if (!note?.restates || note.verify) return null;
    const g = reaching.get(note.restates);
    const key = `${note.restates}|${line.year}`;
    if (!g?.verified || !(room.get(key) ?? 0)) return null;
    room.set(key, room.get(key)! - 1);
    return g.id;
  });
}

/** Who each guide is written for, in the guide's own words (readiness.json), by guide id. */
function audiences(opts: LoadOptions): Map<string, string> {
  return memo('guide-audiences', [READINESS], opts, () =>
    fileExists(READINESS, opts) ? new Map(readReadiness(opts).frameworks.map((f) => [f.id, f.audience])) : new Map(),
  );
}

function placeRows(iso3: string, opts: LoadOptions): DateRow[] {
  const place = placeName(iso3, opts);
  const rows: DateRow[] = [];
  const audience = audiences(opts);

  // guide milestones: the place's own guides, then the EU roadmap for a Member State
  const guideRows: DateRow[] = guidesReaching(iso3, opts).flatMap(({ guide: g, relation }) =>
    g.milestones.map<DateRow>((m) => ({
      iso3,
      place,
      year: m.year,
      month: m.month,
      label: m.label,
      kind: m.kind,
      status: g.status as LifecycleStatus,
      bindingness: g.bindingness as Bindingness,
      issuer: g.issuer,
      scope: null,
      sourceUrl: m.provenance[0]?.url ?? null,
      relation,
      origin: 'guide',
      lead: !g.verified,
      guide: g.id,
      guideTitle: g.shortLabel,
      audience: audience.get(g.id) ?? null,
      display: null,
      restated: null,
    })),
  );

  // profile lines, each with its annotation; a line with a confirmed fold joins its guide's row
  const profile = profilesByIso3(opts).get(iso3);
  const lines = (profile?.timeline ?? []).filter((l): l is typeof l & { year: number } => typeof l.year === 'number'); // "Phased" carries no date
  const folds = foldLines(iso3, lines, opts);
  lines.forEach((line, i) => {
    const note = dateAnnotation(iso3, line.year, line.label, opts);
    const into = folds[i];
    if (into) {
      const target = guideRows.find((r) => r.guide === into && r.year === line.year && !r.restated)!;
      target.restated = line.label;
      return;
    }
    rows.push({
      iso3,
      place,
      year: line.year,
      month: null,
      label: line.label,
      kind: note?.kind ?? null,
      status: note?.status ?? null,
      bindingness: note?.bindingness ?? null,
      issuer: null,
      scope: note?.scope ?? null,
      // a profile line carries no address; an annotated line cites the source its row was read from
      sourceUrl: note?.provenance[0]?.url ?? null,
      relation: 'own',
      origin: 'profile',
      // a lead when its annotation is one, or, with no annotation, when the place awaits a re-read
      lead: note ? note.verify : REREAD.has(iso3),
      guide: null,
      guideTitle: null,
      audience: null,
      display: line.display !== String(line.year) ? line.display : null,
      restated: null,
      restates: note?.restates ?? null,
    });
  });
  rows.push(...guideRows);
  return rows.sort(byDate);
}

const kindIndex = (k: Kind | null) => (k ? KIND_ORDER.indexOf(k) : KIND_ORDER.length);

/** Date order: year, then month (a year with no month after the named months), then kind. */
export function byDate(a: DateRow, b: DateRow): number {
  return a.year - b.year || (a.month ?? 13) - (b.month ?? 13) || kindIndex(a.kind) - kindIndex(b.kind) || a.label.localeCompare(b.label, 'en-GB');
}

/**
 * Every dated target that reaches these places, grouped by place in the order given, each place's
 * rows in date order. Unknown codes give no rows. The rows are never ranked across places.
 */
export function datesFor(iso3s: string[], opts: LoadOptions = {}): DateRow[] {
  const production = isProduction(opts.env);
  const seen = new Set<string>();
  const out: DateRow[] = [];
  for (const raw of iso3s) {
    const iso3 = raw.trim().toUpperCase();
    if (!iso3 || seen.has(iso3)) continue;
    seen.add(iso3);
    for (const row of placeRows(iso3, opts)) {
      if (production && row.lead) continue;
      out.push(row);
    }
  }
  return out;
}

/** The earliest row by date, then by kind order; null for no rows. */
export function earliest(rows: DateRow[]): DateRow | null {
  return rows.length ? [...rows].sort(byDate)[0] : null;
}

/**
 * The places Target dates offers under "Where you operate": every place for which this build holds
 * at least one dated row (its own timeline lines, the guides it issues, or the EU roadmap through
 * membership), plus the EU, in alphabetical order of their names. Placeholder profiles with no
 * line and no membership have no row, so they are not offered.
 */
export function datePlaces(opts: LoadOptions = {}): { iso3: string; name: string }[] {
  const codes = new Set<string>(['EUU', ...profilesByIso3(opts).keys()]);
  return [...codes]
    .filter((c) => datesFor([c], opts).length > 0)
    .map((iso3) => ({ iso3, name: placeName(iso3, opts) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
}
