// QSC Atlas Labs: the Exposure Clock's logic, as pure functions.
//
// Mosca's inequality: with x the years data must stay secret, y the years a migration takes
// and z the years until a cryptographically relevant quantum computer exists, data is exposed
// when x + y > z. The tool never computes z: it shows the expert survey's ranges, reads them
// exactly at surveyed horizons, interpolates in a straight line between two surveyed horizons
// (and says so), and never extrapolates before the first or after the last.

export interface SurveyPoint {
  horizonYears: number;
  lower: number; // 0 to 1
  upper: number; // 0 to 1
}

export interface SurveyForClock {
  id: string;
  title: string;
  baseYear: number;
  published: string;
  points: SurveyPoint[]; // sorted by horizon
  verified: boolean; // false while any figure is still a lead
}

export interface ExposureInput {
  now: Date;
  shelfLifeYears: number; // x
  migrationYears: number; // y
  migrationStartYear?: number; // defaults to the current year
}

export interface ExposureResult {
  year: number; // the current calendar year
  migrationStart: number;
  migrationEnds: number; // start year plus migrationYears
  secrecyUntilForToday: number; // now year plus shelfLifeYears
  secrecyUntilForLast: number; // migrationEnds plus shelfLifeYears
  laterHorizon: number; // the later of the two secrecy horizons
}

export function computeExposure({ now, shelfLifeYears, migrationYears, migrationStartYear }: ExposureInput): ExposureResult {
  const year = now.getFullYear();
  const migrationStart = Math.max(year, migrationStartYear ?? year);
  const migrationEnds = migrationStart + migrationYears;
  const secrecyUntilForToday = year + shelfLifeYears;
  const secrecyUntilForLast = migrationEnds + shelfLifeYears;
  return {
    year,
    migrationStart,
    migrationEnds,
    secrecyUntilForToday,
    secrecyUntilForLast,
    laterHorizon: Math.max(secrecyUntilForToday, secrecyUntilForLast),
  };
}

export interface HorizonValue {
  horizonYears: number;
  lower: number;
  upper: number;
  interpolated: boolean;
}

/**
 * The survey's range at a calendar year: exact at a surveyed horizon, a straight line between
 * two surveyed horizons (interpolated: true), null before the first or after the last.
 * Never assumes zero probability at horizon zero.
 */
export function surveyHorizonAt(survey: Pick<SurveyForClock, 'baseYear' | 'points'>, year: number): HorizonValue | null {
  const h = year - survey.baseYear;
  const pts = [...survey.points].sort((a, b) => a.horizonYears - b.horizonYears);
  if (!pts.length || h < pts[0].horizonYears || h > pts[pts.length - 1].horizonYears) return null;
  const exact = pts.find((p) => p.horizonYears === h);
  if (exact) return { horizonYears: h, lower: exact.lower, upper: exact.upper, interpolated: false };
  const i = pts.findIndex((p) => p.horizonYears > h);
  const a = pts[i - 1];
  const b = pts[i];
  const t = (h - a.horizonYears) / (b.horizonYears - a.horizonYears);
  return { horizonYears: h, lower: a.lower + t * (b.lower - a.lower), upper: a.upper + t * (b.upper - a.upper), interpolated: true };
}

/** The nearest surveyed horizon at or before a year (never an interpolated one), for the readout. */
export function surveyedAtOrBefore(survey: Pick<SurveyForClock, 'baseYear' | 'points'>, year: number): SurveyPoint | null {
  const h = year - survey.baseYear;
  const pts = survey.points.filter((p) => p.horizonYears <= h).sort((a, b) => b.horizonYears - a.horizonYears);
  return pts[0] ?? null;
}

/** Where the later horizon falls against the survey: inside, beyond the last point, or before the first. */
export function surveyPosition(survey: Pick<SurveyForClock, 'baseYear' | 'points'>, year: number): 'within' | 'beyond' | 'before' | 'none' {
  if (!survey.points.length) return 'none';
  const first = survey.baseYear + Math.min(...survey.points.map((p) => p.horizonYears));
  const last = survey.baseYear + Math.max(...survey.points.map((p) => p.horizonYears));
  if (year > last) return 'beyond';
  if (year < first) return 'before';
  return 'within';
}

/** The x axis: the current year to the later of current year plus 40 and the last horizon plus 5. */
export function axisDomain(year: number, survey: Pick<SurveyForClock, 'baseYear' | 'points'> | null, laterHorizon = 0): [number, number] {
  const last = survey && survey.points.length ? survey.baseYear + Math.max(...survey.points.map((p) => p.horizonYears)) : year;
  return [year, Math.max(year + 40, last + 5, laterHorizon + 2)];
}

// ---- the readout ------------------------------------------------------------------

const pct = (v: number) => String(Math.round(v * 100));

/** Fill "{name}" placeholders; unknown names stay visible so a missing value is caught in review. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export interface ReadoutCopy {
  readoutToday: string;
  readoutMigration: string;
  readoutWithin: string;
  readoutBeyond: string;
  readoutBefore: string;
  readoutNoSurvey: string;
  yearUnit?: string; // "year"
  yearsUnit?: string; // "years"
}

/** "1 year", "7 years": a number of years as a sentence says it. */
export function yearsText(n: number, copy: Pick<ReadoutCopy, 'yearUnit' | 'yearsUnit'> = {}): string {
  return `${n} ${n === 1 ? copy.yearUnit ?? 'year' : copy.yearsUnit ?? 'years'}`;
}

/** The three readout sentences, exactly as the copy file words them. */
export function readoutSentences(r: ExposureResult, input: { migrationYears: number }, survey: SurveyForClock | null, copy: ReadoutCopy): string[] {
  const one = fill(copy.readoutToday, { secrecyUntilForToday: r.secrecyUntilForToday });
  const two = fill(copy.readoutMigration, {
    migrationYears: input.migrationYears,
    migrationDuration: yearsText(input.migrationYears, copy),
    migrationEnds: r.migrationEnds,
    secrecyUntilForLast: r.secrecyUntilForLast,
  });
  if (!survey || !survey.points.length) return [one, two, copy.readoutNoSurvey];
  const pos = surveyPosition(survey, r.laterHorizon);
  const first = survey.baseYear + Math.min(...survey.points.map((p) => p.horizonYears));
  const last = survey.baseYear + Math.max(...survey.points.map((p) => p.horizonYears));
  let three: string;
  if (pos === 'beyond') three = fill(copy.readoutBeyond, { lastSurveyedYear: last, surveyTitle: survey.title });
  else if (pos === 'before') three = fill(copy.readoutBefore, { firstSurveyedYear: first, surveyTitle: survey.title });
  else {
    const p = surveyedAtOrBefore(survey, r.laterHorizon)!;
    three = fill(copy.readoutWithin, { surveyTitle: survey.title, h: p.horizonYears, baseYear: survey.baseYear, lower: pct(p.lower), upper: pct(p.upper) });
  }
  return [one, two, three];
}

/**
 * Every third sentence the readout can give for this survey: the range at each surveyed horizon,
 * beyond the last and before the first. The page keeps room for the longest, so the readout does
 * not change height while a slider moves.
 */
export function surveySentences(survey: SurveyForClock | null, copy: ReadoutCopy): string[] {
  if (!survey || !survey.points.length) return [copy.readoutNoSurvey];
  const first = survey.baseYear + Math.min(...survey.points.map((p) => p.horizonYears));
  const last = survey.baseYear + Math.max(...survey.points.map((p) => p.horizonYears));
  return [
    ...survey.points.map((p) => fill(copy.readoutWithin, { surveyTitle: survey.title, h: p.horizonYears, baseYear: survey.baseYear, lower: pct(p.lower), upper: pct(p.upper) })),
    fill(copy.readoutBeyond, { lastSurveyedYear: last, surveyTitle: survey.title }),
    fill(copy.readoutBefore, { firstSurveyedYear: first, surveyTitle: survey.title }),
  ];
}

// ---- target dates ---------------------------------------------------------------------
// The code keeps the word "deadline" in its names (mergeDeadlines, ClockDeadline) because the
// data file is deadlines-extra.json; nothing a visitor reads calls these dates deadlines. Every
// date here is a target unless a binding instrument sets it, and each one says what sets it
// where the Atlas has recorded that.

/** What kind of document a sourced extra comes from, as deadlines-extra.json records it. */
export type DocumentStatus = 'draft' | 'final' | 'recommendation';

/**
 * What sets a date, in the words of the Target dates view: set in law (binding law or binding by
 * market access), set in guidance (soft law or guidance), or null where the Atlas has recorded
 * neither ("not recorded"). It is the bindingness axis only: a document's lifecycle status (a
 * draft, a proposal) is a separate axis and never fills this slot. Read from records only, never
 * from a label.
 */
export type DateBasis = 'law' | 'guidance' | null;

/** The guide id an annotation names when a profile line restates the EU coordinated roadmap. */
export const EU_ROADMAP = 'eu-roadmap';

export interface ClockDeadline {
  id: string;
  year: number;
  display: string; // the year as written, e.g. "2024 to 2026" for a range
  label: string;
  issuer: string | null; // null for a profile line: the profile records no issuer
  documentStatus: DocumentStatus | null; // null for a profile line
  lane: 'jurisdiction' | 'roadmap' | 'standards';
  sourceUrl: string; // every date shown has one
  sourceLabel: string;
  verified: boolean; // false for an Unverified profile or a lead in preview
  opacity: number; // confidenceOpacity for profile lines
  // The issuer's posture colour, null for standards bodies. The chart draws every date as an
  // ink dot; the Atlas convention allows this colour on one marker at most, the latest date set
  // in law, and no date in the data is recorded as set in law yet, so none is coloured.
  postureColor: string | null;
  basis: DateBasis; // what sets the date, where recorded
  basisLead: boolean; // the basis rests on an annotation that is still a lead (preview only)
  // on a roadmap row: the profile line it stands in for, because that line's annotation says it
  // restates the roadmap; lead is true while the annotation is unconfirmed (preview only)
  restated: { label: string; lead: boolean } | null;
}

export interface ProfileTimelineLine {
  year: number | string;
  label: string;
  display: string;
}

export interface ExtraDeadline {
  id: string;
  date: string;
  label: string;
  issuer: string;
  lane: 'roadmap' | 'standards';
  appliesToPosture: string | null;
  documentStatus: DocumentStatus;
  sourceUrl: string | null;
  sourceLabel: string;
  verified: boolean;
}

/**
 * The annotation of one profile timeline line (data/lab/annotations, spec 16.1): matched by year
 * and a substring of the label. restates names the guide the line repeats; bindingness is the
 * InstrumentStatus vocabulary of src/lib/regulation.ts; lead is true while the row is unconfirmed.
 */
export interface LineAnnotation {
  year: number;
  match: string;
  restates: string | null;
  bindingness: string | null;
  lead: boolean;
}

export interface RoadmapDecision {
  id: string;
  year: number;
  action: 'added' | 'skipped' | 'folded';
  reason: string;
}

const mentionsRoadmap = (label: string) => /\bEU\b|coordinated roadmap/i.test(label);

/** The basis of a bindingness value: binding law or market access is law; soft law and guidance are guidance. */
export function basisOf(bindingness: string | null | undefined): DateBasis {
  if (bindingness === 'binding-law' || bindingness === 'binding-by-market-access') return 'law';
  if (bindingness === 'soft-law' || bindingness === 'guidance') return 'guidance';
  return null;
}

/**
 * Merge a place's profile timeline with the sourced extras.
 *
 * The EU coordinated roadmap is addressed to Member States, so its milestones reach a place
 * through EU membership (euMember), never through coordination posture. A profile line whose
 * annotation says it restates the roadmap is drawn once, as the roadmap's own row for that year,
 * which names its issuer and what sets it; the row then records the profile line it stands in
 * for. Without such an annotation, a roadmap milestone is left out when a profile line for the
 * same year mentions "EU" or "coordinated roadmap". Standards-body dates go in their own lane. A
 * date without a source never reaches the chart.
 */
export function mergeDeadlines(opts: {
  jurisdictionName: string;
  iso3: string;
  posture: string | null;
  euMember?: boolean; // the place is an EU Member State, or the EU itself
  postureColor: string | null;
  profileLines: ProfileTimelineLine[];
  profileVerified: boolean;
  profileHref: string; // the place's profile, built at build time (pageHref)
  opacity: number;
  extras: ExtraDeadline[];
  roadmapColor: string | null;
  annotations?: LineAnnotation[];
  roadmapBindingness?: { bindingness: string | null; lead: boolean } | null; // readiness.json's record of the roadmap
}): { deadlines: ClockDeadline[]; decisions: RoadmapDecision[] } {
  const out: ClockDeadline[] = [];
  const decisions: RoadmapDecision[] = [];
  const annotations = opts.annotations ?? [];
  const yearOf = (e: ExtraDeadline) => Number(e.date.slice(0, 4));
  const applies = (e: ExtraDeadline) =>
    e.appliesToPosture === 'EU' ? Boolean(opts.euMember) : !e.appliesToPosture || e.appliesToPosture === opts.posture;
  const roadmap = opts.extras.filter((e) => e.lane === 'roadmap' && e.sourceUrl && applies(e));
  // the link text starts a sentence, so "the European Union" becomes "The European Union in the Atlas"
  const profileLabel = `${opts.jurisdictionName.charAt(0).toUpperCase()}${opts.jurisdictionName.slice(1)} in the Atlas`;

  // profile lines: a line annotated as restating the roadmap folds into the roadmap row of its
  // year, each roadmap row taking one line at most; every other dated line is drawn as it is
  const folded = new Map<string, { label: string; lead: boolean }>();
  const kept: ProfileTimelineLine[] = [];
  opts.profileLines.forEach((l, i) => {
    if (typeof l.year !== 'number') return; // "Phased" markers are listed in the profile, not plotted
    const year = l.year;
    const note = annotations.find((a) => a.year === year && l.label.includes(a.match)) ?? null;
    if (note?.restates === EU_ROADMAP) {
      const into = roadmap.find((e) => yearOf(e) === year && !folded.has(e.id));
      if (into) {
        folded.set(into.id, { label: l.label, lead: note.lead });
        decisions.push({ id: into.id, year, action: 'folded', reason: `the profile line "${l.label}" restates it, so the year is drawn once` });
        return;
      }
    }
    kept.push(l);
    out.push({
      id: `${opts.iso3}-${i}`,
      year,
      display: l.display.replace(/^(\d{4})\s*-\s*(\d{4})$/, '$1 to $2'),
      label: l.label,
      // the profile records no issuer: the line may be the government's own, an agency's, or the
      // EU roadmap's, so the page names none and links to the profile instead
      issuer: null,
      documentStatus: null,
      lane: 'jurisdiction',
      sourceUrl: opts.profileHref,
      sourceLabel: profileLabel,
      verified: opts.profileVerified,
      opacity: opts.opacity,
      postureColor: opts.postureColor,
      basis: basisOf(note?.bindingness),
      basisLead: Boolean(note?.bindingness && note.lead),
      restated: null,
    });
  });

  const roadmapBasis = basisOf(opts.roadmapBindingness?.bindingness);
  for (const e of opts.extras) {
    if (!e.sourceUrl) continue;
    const year = yearOf(e);
    if (e.lane === 'roadmap') {
      if (!applies(e)) continue;
      const restated = folded.get(e.id) ?? null;
      if (!restated) {
        const dup = kept.find((l) => l.year === year && mentionsRoadmap(l.label));
        if (dup) {
          decisions.push({ id: e.id, year, action: 'skipped', reason: `the profile already has "${dup.label}"` });
          continue;
        }
        decisions.push({ id: e.id, year, action: 'added', reason: 'no profile line for this year mentions the EU roadmap' });
      }
      out.push({
        id: e.id, year, display: String(year), label: e.label, issuer: e.issuer, documentStatus: e.documentStatus, lane: 'roadmap', sourceUrl: e.sourceUrl, sourceLabel: e.sourceLabel, verified: e.verified, opacity: 1, postureColor: opts.roadmapColor,
        basis: roadmapBasis, basisLead: Boolean(roadmapBasis && opts.roadmapBindingness?.lead), restated,
      });
    } else {
      out.push({
        id: e.id, year, display: String(year), label: e.label, issuer: e.issuer, documentStatus: e.documentStatus, lane: 'standards', sourceUrl: e.sourceUrl, sourceLabel: e.sourceLabel, verified: e.verified, opacity: 1, postureColor: null,
        // the extras record a document status (draft, final), which is lifecycle, not bindingness
        basis: null, basisLead: false, restated: null,
      });
    }
  }
  out.sort((a, b) => a.year - b.year || a.lane.localeCompare(b.lane));
  return { deadlines: out, decisions };
}

// ---- laying marks out on one line ------------------------------------------------------

const hundredths = (v: number) => Math.round(v * 100) / 100;

/** Positions sorted ascending, with each one's index in the input, ties kept in input order. */
const ascending = (xs: number[]) => xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x || a.i - b.i);

/**
 * Tiers for marks on one line. Every mark stays at its own position on the time axis; a mark
 * closer than `gap` to one already placed in a tier goes to the next tier, which the chart draws
 * a step away from the lane rule. Ties keep input order. The result is in input order: 0 for the
 * lane rule itself, 1 for the first step, and so on.
 */
export function stackTiers(xs: number[], gap: number): number[] {
  const last: number[] = [];
  const out = new Array<number>(xs.length).fill(0);
  for (const o of ascending(xs)) {
    let t = last.findIndex((v) => o.x - v >= gap - 1e-9);
    if (t < 0) t = last.length;
    last[t] = o.x;
    out[o.i] = t;
  }
  return out;
}

/**
 * Pointer targets for marks on one line. Marks closer than `size` share one target that spans
 * them, so every target is at least `size` wide and no two overlap. Hovering a shared target
 * highlights all of its marks, and the list below names each of them.
 */
export function markerClusters(xs: number[], size = 44): { members: number[]; x: number; w: number }[] {
  const out: { members: number[]; left: number; right: number }[] = [];
  for (const o of ascending(xs)) {
    const last = out[out.length - 1];
    if (last && o.x - last.right < size) {
      last.members.push(o.i);
      last.right = o.x;
    } else out.push({ members: [o.i], left: o.x, right: o.x });
  }
  return out.map((c) => ({ members: c.members, x: hundredths(c.left - size / 2), w: hundredths(c.right - c.left + size) }));
}

/**
 * Rows for a line of short centred labels: each goes in the first row whose last label is at
 * least `width` to its left, or null when no row has room. Pass as many rows as labels and every
 * label gets one, which is how the chart uses it: a year is never dropped.
 */
export function labelRows(xs: number[], width: number, rows = 2): (number | null)[] {
  const ends = new Array<number>(rows).fill(-Infinity);
  const out = new Array<number | null>(xs.length).fill(null);
  for (const o of ascending(xs)) {
    const r = ends.findIndex((e) => o.x - e >= width);
    if (r < 0) continue;
    ends[r] = o.x;
    out[o.i] = r;
  }
  return out;
}

// ---- the period a kind of data starts the shelf life from -------------------------------------

/**
 * Which period a source sets: how long the information must stay secret (confidentiality), how
 * long access to it is barred (closure), or only how long a record is kept (retention), which is
 * never a period of secrecy and at most a lower bound for one.
 */
export type ShelfBasis = 'confidentiality' | 'closure' | 'retention';

/**
 * A period a source documents for one kind of data, as the island receives it. iso3 null is a
 * general value, for anywhere the Atlas holds nothing closer; euMembers carries an EU rule (iso3
 * "EUU") to each Member State without a period of its own. years null: the source sets no end.
 */
export interface ShelfPeriod {
  iso3: string | null;
  euMembers: boolean;
  years: number | null;
  basis: ShelfBasis;
  basisNote: string; // the Atlas's words for the rule
  sourceUrl: string;
  sourceName: string; // the source's own title, the link text
  verified: boolean;
  words: string[]; // the source's own words: empty unless the build may carry them
}

/** Where a period reaches the chosen place from: its own rule, an EU rule, or the general value. */
export type ShelfScope = 'place' | 'eu' | 'general';

/**
 * The period for a kind of data at a place: the place's own, else an EU rule that reaches a Member
 * State, else the general value; null when the Atlas documents none. "none" (no place chosen)
 * takes the general value only.
 */
export function periodFor(
  periods: ShelfPeriod[],
  place: string,
  euMember: (iso3: string) => boolean,
): { period: ShelfPeriod; scope: ShelfScope } | null {
  const chosen = place !== 'none';
  const own = chosen ? periods.find((p) => p.iso3 === place) : undefined;
  if (own) return { period: own, scope: 'place' };
  const eu = chosen && euMember(place) ? periods.find((p) => p.iso3 === 'EUU' && p.euMembers) : undefined;
  if (eu) return { period: eu, scope: 'eu' };
  const general = periods.find((p) => p.iso3 === null);
  return general ? { period: general, scope: 'general' } : null;
}

/** The years a period starts the slider at, before it is fitted to the slider: its own figure, or the slider's maximum when the source sets no end. */
export function startingYears(period: Pick<ShelfPeriod, 'years'> | null): number | null {
  if (!period) return null;
  return period.years ?? LIMITS.x[1];
}

/**
 * The places that hold a period for a kind of data, for the sentence that says so when the chosen
 * place has none: each place with a rule of its own, by name, and an EU rule that reaches the
 * Member States as one phrase in place of them. The chosen place is never named.
 */
export function placesWithPeriod(
  periods: ShelfPeriod[],
  except: string,
  name: (iso3: string) => string | null,
  euMember: (iso3: string) => boolean,
  euMembersPhrase: string,
): string[] {
  const reach = periods.some((p) => p.iso3 === 'EUU' && p.euMembers);
  const out: string[] = [];
  for (const p of periods) {
    if (p.iso3 === null || p.iso3 === except) continue;
    if (reach && (p.iso3 === 'EUU' || euMember(p.iso3))) continue;
    const n = name(p.iso3);
    if (n && !out.includes(n)) out.push(n);
  }
  if (reach && except !== 'EUU' && !euMember(except)) out.push(euMembersPhrase);
  return out;
}

/** "A", "A and B", "A, B and C". */
export function listText(items: string[], and = 'and'): string {
  if (items.length < 2) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

// ---- the shelf life when the visitor changes what or where -----------------------------------

/**
 * The shelf life after the visitor picks a category or a jurisdiction. A sourced period for the
 * new choice sets it. Leaving a sourced period the visitor had not changed returns them to the
 * last value they set themselves. Otherwise their value stays, and the page says the Atlas holds
 * no period for the new choice.
 */
export function shelfLifeAfterChoice(o: { x: number; before: number | null; after: number | null; userX: number }): number {
  const fit = (v: number) => clamp(Math.round(v), LIMITS.x[0], LIMITS.x[1]);
  if (o.after !== null) return fit(o.after);
  if (o.before !== null && o.x === fit(o.before)) return fit(o.userX);
  return o.x;
}

// ---- the URL state ------------------------------------------------------------------------

export interface ClockState {
  c: string; // preset id or "other"
  j: string; // ISO3 or "none"
  x: number; // shelf life, 1 to 100
  y: number; // migration, 1 to 20
  s: number | null; // migration start year
  view: 'all' | 'public-admin';
  present: boolean;
}

// the shelf life reaches 100 years because the longest sourced period does (FOIA 2000, s.63(4))
export const LIMITS = { x: [1, 100], y: [1, 20] } as const;
// the migration can start this many years after the current one at the latest
export const START_SPAN = 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The latest year the later secrecy horizon can reach from the sliders: the latest start, the
 * longest migration and the longest shelf life. The chart keeps the room it would need there, so
 * moving a slider never changes the page's length.
 */
export function furthestHorizon(year: number): number {
  return year + START_SPAN + LIMITS.y[1] + LIMITS.x[1];
}

export function parseState(search: string, defaults: ClockState, year: number): ClockState {
  const q = new URLSearchParams(search);
  const num = (k: string) => (q.has(k) && Number.isFinite(Number(q.get(k))) ? Math.round(Number(q.get(k))) : null);
  const s = num('s');
  return {
    c: q.get('c') ?? defaults.c,
    j: (q.get('j') ?? defaults.j).toUpperCase() === 'NONE' ? 'none' : (q.get('j') ?? defaults.j).toUpperCase(),
    x: clamp(num('x') ?? defaults.x, LIMITS.x[0], LIMITS.x[1]),
    y: clamp(num('y') ?? defaults.y, LIMITS.y[0], LIMITS.y[1]),
    s: s === null ? null : clamp(s, year, year + START_SPAN),
    view: q.get('view') === 'public-admin' ? 'public-admin' : 'all',
    present: q.get('present') === '1',
  };
}

/**
 * The view a visitor arrives at. A link that names what they protect and where (?c=&j=) but no
 * shelf life starts the slider at the Atlas's sourced period for that pair, as choosing them on
 * the page would, and keeps the default as the visitor's own value, so leaving the sourced choice
 * returns to it. An explicit ?x= always wins. userX is the value a later choice gives back.
 */
export function initialState(
  search: string,
  defaults: ClockState,
  year: number,
  sourcedYears: (c: string, j: string) => number | null,
): { state: ClockState; userX: number } {
  const state = parseState(search, defaults, year);
  const q = new URLSearchParams(search);
  const hasX = q.has('x') && Number.isFinite(Number(q.get('x')));
  const src = sourcedYears(state.c, state.j);
  const fit = src === null ? null : clamp(Math.round(src), LIMITS.x[0], LIMITS.x[1]);
  if (fit !== null && !hasX) return { state: { ...state, x: fit }, userX: defaults.x };
  return { state, userX: fit === null || state.x !== fit ? state.x : defaults.x };
}

export function stateToSearch(st: ClockState): string {
  const q = new URLSearchParams();
  q.set('c', st.c);
  q.set('j', st.j === 'none' ? 'none' : st.j);
  q.set('x', String(st.x));
  q.set('y', String(st.y));
  if (st.s !== null) q.set('s', String(st.s));
  if (st.view === 'public-admin') q.set('view', 'public-admin');
  if (st.present) q.set('present', '1');
  return '?' + q.toString();
}
