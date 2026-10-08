// QSC Atlas Labs: the Exposure Clock chart's geometry, as pure functions. layoutChart() turns the
// visitor's values into one frame: the axis domain, the height of each lane, every date mark and year
// label at its own year, and the chart's height. mixFrames() blends two frames, so the chart can
// move from one to the next instead of jumping; a lane, mark or label that only one of the two
// holds fades in or out where it stands.
//
// The chart's height depends only on the place and the width, never on a slider: each date lane
// keeps the room it would need at the widest axis the sliders can reach (furthestHorizon), so
// moving a slider never pushes the readout below it up or down.

import { axisDomain, furthestHorizon, labelRows, stackTiers } from '../../../../lib/lab/exposure';
import type { ClockDeadline, ExposureResult, SurveyForClock } from '../../../../lib/lab/exposure';

// date marks: a mark closer than TIER_GAP to another of its lane steps down by TIER_STEP; a year
// label is YEAR_W wide and a row of them ROW_H high
export const TIER_GAP = 9;
export const TIER_STEP = 9;
export const YEAR_W = 36;
export const ROW_H = 14;

export type LaneKey = 'migration' | 'today' | 'last' | 'targets' | 'standards';
export type DateLaneKey = 'targets' | 'standards';
const LANE_COPY: Record<LaneKey, string> = {
  migration: 'laneMigration',
  today: 'laneToday',
  last: 'laneLast',
  targets: 'laneTargets',
  standards: 'laneStandards',
};

/** What the width alone decides: phone or wide layout, the margins and the band's place. */
export interface Geometry {
  compact: boolean; // phones and the desktop column: lane labels above their lanes, the scale to the right
  W: number;
  L: number;
  R: number;
  bandTop: number;
  bandH: number;
  laneGap: number;
}

export function geometry(width: number, copy: Record<string, string>): Geometry {
  const compact = width < 520;
  // the lane label gutter holds the longest label (12.8px Schibsted is under 6.4px a character),
  // so no label runs past the chart's left edge, where the share image would cut it
  const longest = Math.max(...Object.values(LANE_COPY).map((k) => (copy[k] ?? '').length));
  return {
    compact,
    W: Math.max(300, width),
    // on a phone the left margin leaves room for half a year label at today's mark
    L: compact ? 16 : Math.ceil(longest * 6.4) + 22,
    R: compact ? 44 : 64,
    bandTop: compact ? 76 : 58,
    bandH: compact ? 108 : 156,
    laneGap: compact ? 68 : 46,
  };
}

export const laneLabel = (lane: LaneKey, copy: Record<string, string>) => copy[LANE_COPY[lane]] ?? '';

/** A lane: the y of its rule, its opacity, and how far its stepped marks reach below the rule. */
export interface LaneRow {
  key: LaneKey;
  y: number;
  o: number;
  depth: number;
}

/** A date mark at its own year, stepped down from its lane rule when it crowds another. */
export interface MarkRow {
  key: string; // the date's id
  lane: DateLaneKey;
  d: ClockDeadline;
  year: number;
  y: number;
  o: number;
}

/** A year label of a date lane. */
export interface YearRow {
  key: string; // lane and year
  lane: DateLaneKey;
  year: number;
  y: number;
  o: number;
}

/** Everything that moves. Years are on the time axis; y values are pixels. */
export interface Frame {
  d0: number;
  d1: number;
  migrationStart: number;
  migrationEnds: number;
  today: number; // data sent today stays secret until
  last: number; // the last data sent the old way stays secret until
  later: number; // the later of the two
  axisY: number;
  H: number;
  lanes: LaneRow[];
  marks: MarkRow[];
  years: YearRow[];
}

export const r2 = (v: number) => Math.round(v * 100) / 100;

/** The time axis as pixels, rounded so the server render and the browser agree to the digit. */
export function xScale(g: Geometry, d0: number, d1: number) {
  const k = (g.W - g.R - g.L) / (d1 - d0 || 1);
  return Object.assign((v: number) => r2(g.L + (v - d0) * k), { invert: (px: number) => d0 + (px - g.L) / k });
}

/** The band's 0 to 1 scale as pixels. */
export const yScale = (g: Geometry) => (v: number) => r2(g.bandTop + g.bandH - v * g.bandH);

interface DateLane {
  items: ClockDeadline[];
  xs: number[];
  tiers: number[];
  years: number[];
  rows: number[];
  depth: number;
  rowCount: number;
}

/** The lanes for one axis domain: which lanes there are, their marks' tiers and label rows. */
function lanesAt(g: Geometry, deadlines: ClockDeadline[], year: number, d0: number, d1: number) {
  const x = xScale(g, d0, d1);
  // the axis starts this year, so only dates still ahead are plotted; the list shows them all
  const upcoming = deadlines.filter((d) => d.year >= year && d.year <= d1);
  const own = upcoming.filter((d) => d.lane !== 'standards');
  const standards = upcoming.filter((d) => d.lane === 'standards');
  const lanes: LaneKey[] = ['migration', 'today', 'last', ...(own.length ? ['targets' as const] : []), ...(standards.length ? ['standards' as const] : [])];
  // each date lane at its own years: the tier of every mark, and the label row of every year
  const dateLane = (items: ClockDeadline[]): DateLane => {
    const xs = items.map((d) => x(d.year));
    const tiers = stackTiers(xs, TIER_GAP);
    const years = [...new Set(items.map((d) => d.year))].sort((a, b) => a - b);
    const rows = labelRows(years.map((yr) => x(yr)), YEAR_W, Math.max(1, years.length)) as number[];
    return { items, xs, tiers, years, rows, depth: Math.max(0, ...tiers) * TIER_STEP, rowCount: Math.max(0, ...rows) + 1 };
  };
  const laid: Partial<Record<DateLaneKey, DateLane>> = {
    ...(own.length ? { targets: dateLane(own) } : {}),
    ...(standards.length ? { standards: dateLane(standards) } : {}),
  };
  // room a lane needs beyond the usual gap: its stepped marks below the rule, and year labels
  // past the two rows the gap holds (below the marks on a phone, above the rule on a wide screen)
  const extraRows = (lane: LaneKey) => Math.max(0, (laid[lane as DateLaneKey]?.rowCount ?? 0) - 2) * ROW_H;
  const below = (lane: LaneKey) => (laid[lane as DateLaneKey]?.depth ?? 0) + (g.compact ? extraRows(lane) : 0);
  const above = (lane: LaneKey) => (g.compact ? 0 : extraRows(lane));
  return { lanes, laid, below, above };
}

export interface LayoutInput {
  width: number;
  result: ExposureResult;
  survey: SurveyForClock | null;
  deadlines: ClockDeadline[];
  copy: Record<string, string>;
}

/** The chart for these values: its geometry, and the frame it settles on. */
export function layoutChart({ width, result, survey, deadlines, copy }: LayoutInput): { g: Geometry; frame: Frame } {
  const g = geometry(width, copy);
  const [d0, d1] = axisDomain(result.year, survey, result.laterHorizon);
  const now = lanesAt(g, deadlines, result.year, d0, d1);
  // the same dates on the widest axis the sliders can reach, where they crowd the most: each
  // lane keeps the larger of the two rooms, so the lanes and the axis stay put while a slider moves
  const [, wideEnd] = axisDomain(result.year, survey, furthestHorizon(result.year));
  const wide = lanesAt(g, deadlines, result.year, d0, Math.max(d1, wideEnd));
  const lanes = wide.lanes; // the wide axis holds every lane the current one does
  const below = (lane: LaneKey) => Math.max(now.below(lane), wide.below(lane));
  const above = (lane: LaneKey) => Math.max(now.above(lane), wide.above(lane));
  const laneYs: number[] = [];
  lanes.forEach((lane, i) => {
    laneYs.push(i === 0 ? g.bandTop + g.bandH + 42 + (g.compact ? 14 : 0) : laneYs[i - 1] + g.laneGap + below(lanes[i - 1]) + above(lane));
  });
  const last = lanes.length - 1;
  const axisY = laneYs[last] + g.laneGap - (g.compact ? 10 : 14) + below(lanes[last]);

  const marks: MarkRow[] = [];
  const years: YearRow[] = [];
  for (const lane of ['targets', 'standards'] as const) {
    const i = lanes.indexOf(lane);
    const l = now.laid[lane];
    if (i < 0 || !l) continue;
    const ly = laneYs[i];
    l.items.forEach((d, k) => marks.push({ key: d.id, lane, d, year: d.year, y: ly + l.tiers[k] * TIER_STEP, o: 1 }));
    l.years.forEach((yr, k) =>
      years.push({ key: `${lane}-${yr}`, lane, year: yr, y: g.compact ? ly + l.depth + 20 + l.rows[k] * ROW_H : ly - 12 - l.rows[k] * ROW_H, o: 1 }),
    );
  }

  return {
    g,
    frame: {
      d0,
      d1,
      migrationStart: result.migrationStart,
      migrationEnds: result.migrationEnds,
      today: result.secrecyUntilForToday,
      last: result.secrecyUntilForLast,
      later: result.laterHorizon,
      axisY,
      H: axisY + 34,
      lanes: lanes.map((key, i) => ({ key, y: laneYs[i], o: 1, depth: key === 'targets' || key === 'standards' ? now.laid[key]?.depth ?? 0 : 0 })),
      marks,
      years,
    },
  };
}

// ---- moving from one frame to the next ---------------------------------------------------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Blend two lists keyed by `key`: an entry in both moves; one only in the target fades in where
 * it will stand; one only in the start fades out where it stood.
 */
function mixKeyed<T extends { key: string; o: number }>(a: T[], b: T[], t: number, nums: (keyof T)[]): T[] {
  const from = new Map(a.map((e) => [e.key, e]));
  const to = new Set(b.map((e) => e.key));
  const blend = (s: T, e: T) => {
    const out = { ...e };
    for (const k of nums) (out[k] as number) = lerp(s[k] as number, e[k] as number, t);
    out.o = lerp(s.o, e.o, t);
    return out;
  };
  const out = b.map((e) => blend(from.get(e.key) ?? { ...e, o: 0 }, e));
  for (const e of a) if (!to.has(e.key)) out.push(blend(e, { ...e, o: 0 }));
  return out.filter((e) => e.o > 0.004);
}

/** The frame a share t of the way from a to b (t from 0 to 1); at 1 it is b itself. */
export function mixFrames(a: Frame, b: Frame, t: number): Frame {
  if (t >= 1) return b;
  return {
    d0: lerp(a.d0, b.d0, t),
    d1: lerp(a.d1, b.d1, t),
    migrationStart: lerp(a.migrationStart, b.migrationStart, t),
    migrationEnds: lerp(a.migrationEnds, b.migrationEnds, t),
    today: lerp(a.today, b.today, t),
    last: lerp(a.last, b.last, t),
    later: lerp(a.later, b.later, t),
    axisY: lerp(a.axisY, b.axisY, t),
    H: lerp(a.H, b.H, t),
    lanes: mixKeyed(a.lanes, b.lanes, t, ['y', 'depth']),
    marks: mixKeyed(a.marks, b.marks, t, ['year', 'y']),
    years: mixKeyed(a.years, b.years, t, ['year', 'y']),
  };
}
