// QSC Atlas Labs: the Exposure Clock chart. One SVG: the expert survey band on top (its own
// 0 to 100 per cent scale), then the migration and the two secrecy lanes in ink, then the
// target dates. Dates follow the profile's migration timeline: 7px ink dots, open for a
// standards body, a dotted outline for a lead. The posture is named in words beside the list
// heading; no marker is coloured, because none of the dates is recorded as set in law.
// Dashed edges mean interpolation; open circles mark horizons; "today" is a dashed rule.
// Every date mark and its year label sit at the mark's own year on the time axis; marks of the
// same or a nearby year step down from the lane rule instead of moving along it, and year labels
// take as many rows as they need, so no year is moved or dropped.
// When a value changes, every mark glides to its new place (useGlide in motion.ts), drawn frame
// by frame in SVG attributes, so the share image always holds what the page shows. Nothing moves
// on load or under reduced motion. The parts are separate memoised pieces, so a frame redraws
// only what moved: dragging the migration slider leaves the band, the axis and the dates alone.
// The chart takes no keyboard focus: it is an image with a description, and the list under it
// is the keyboard path, each row ringing its mark here while the row has focus.

import { memo, useId, useMemo, useState } from 'react';
import { fill, markerClusters, surveyHorizonAt, surveyedAtOrBefore } from '../../../../lib/lab/exposure';
import type { ClockDeadline, ExposureResult, SurveyForClock } from '../../../../lib/lab/exposure';
import { laneLabel, layoutChart, mixFrames, r2, xScale, yScale } from './chart-layout';
import type { DateLaneKey, Frame, Geometry, LaneRow, MarkRow, YearRow } from './chart-layout';
import { useGlide } from './motion';

/** One date mark, shared by the chart and the list: solid ink, open, or dotted for a lead. */
export function DeadlineMark({ d }: { d: Pick<ClockDeadline, 'lane' | 'verified'> }) {
  // pathLength makes the dots of a lead's outline even all the way round
  if (!d.verified) return <circle className="xc-dot is-lead" r={3.5} pathLength={16} />;
  if (d.lane === 'standards') return <circle className="xc-dot is-open" r={3} />;
  return <circle className="xc-dot" r={3.5} />;
}

interface Props {
  width: number; // the width to lay the chart out at; presentation mode passes less, so it scales up
  result: ExposureResult;
  survey: SurveyForClock | null;
  deadlines: ClockDeadline[];
  copy: Record<string, string>;
  checking: boolean; // the survey is still a lead (preview only)
  onFocusDeadlines?: (ids: string[]) => void;
  focusedDeadlines?: string[];
  animate?: boolean; // glide to new values; off on load and under reduced motion
  // drawn before the island knows its width: the box holds the chart's own height, and the
  // drawing shrinks to a narrower box but never grows past its width, so nothing below it moves
  // when the measured chart replaces it
  fit?: boolean;
}

const NONE: string[] = [];
const pctLabel = (v: number) => String(Math.round(v * 100));
type X = ReturnType<typeof xScale>;

// ---- the band, its scale and the survey's own figures --------------------------------------

const BandTitle = memo(function BandTitle({ g, copy, checking }: { g: Geometry; copy: Record<string, string>; checking: boolean }) {
  const { compact, L, R, W, bandTop } = g;
  // two lines on a phone
  const words = copy.bandTitleShort.split(' ');
  const half = Math.ceil(words.length / 2);
  return (
    <>
      <text className="xc-band-title" x={L} y={bandTop - (compact ? 46 : 30)}>
        {compact ? (
          <>
            <tspan x={L}>{words.slice(0, half).join(' ')}</tspan>
            <tspan x={L} dy={15}>{words.slice(half).join(' ')}</tspan>
          </>
        ) : W - L - R < 600 ? (
          copy.bandTitleShort
        ) : (
          copy.bandTitle
        )}
      </text>
      {checking && (
        <g transform={`translate(${W - R}, ${bandTop - 38})`}>
          <rect className="xc-checking" x={-112} y={-2} width={112} height={20} rx={2} />
          <text className="xc-checking-text" x={-56} y={12.5} textAnchor="middle">{copy.bandChecking}</text>
        </g>
      )}
    </>
  );
});

const Band = memo(function Band({ g, d0, d1, survey, checking }: { g: Geometry; d0: number; d1: number; survey: SurveyForClock | null; checking: boolean }) {
  const { compact, L, R, W } = g;
  const x = xScale(g, d0, d1);
  const y = yScale(g);
  const pts = survey?.points ?? [];
  const px = (h: number) => x(survey!.baseYear + h);
  const bandPath = pts.length
    ? `M${pts.map((p) => `${px(p.horizonYears)},${y(p.upper)}`).join('L')}L${[...pts].reverse().map((p) => `${px(p.horizonYears)},${y(p.lower)}`).join('L')}Z`
    : '';
  return (
    <>
      {/* band scale: solid hairlines at 0, 50 and 100 per cent; on a phone the figures sit to the right */}
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line className="xc-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} />
          <text className="xc-tick" x={compact ? W - R + 6 : L - 8} y={y(v) + 4} textAnchor={compact ? 'start' : 'end'}>
            {v * 100}%
          </text>
        </g>
      ))}
      {/* the survey band */}
      {pts.length > 0 && (
        <g className={checking ? 'xc-band is-checking' : 'xc-band'}>
          <path className="xc-band-fill" d={bandPath} />
          {pts.slice(1).map((p, i) => {
            const a = pts[i];
            return (
              <g key={p.horizonYears}>
                <line className="xc-band-edge" x1={px(a.horizonYears)} y1={y(a.upper)} x2={px(p.horizonYears)} y2={y(p.upper)} />
                <line className="xc-band-edge" x1={px(a.horizonYears)} y1={y(a.lower)} x2={px(p.horizonYears)} y2={y(p.lower)} />
              </g>
            );
          })}
          {pts.map((p) => (
            <g key={p.horizonYears} className="xc-surveyed">
              <line className="xc-rangebar" x1={px(p.horizonYears)} x2={px(p.horizonYears)} y1={y(p.lower)} y2={y(p.upper)} />
              <circle className="xc-open" cx={px(p.horizonYears)} cy={y(p.upper)} r={3.5} />
              <circle className="xc-open" cx={px(p.horizonYears)} cy={y(p.lower)} r={3.5} />
            </g>
          ))}
        </g>
      )}
    </>
  );
});

/** The survey's own figures, each on a paper ground so no edge or gridline runs through the digits. */
const SurveyFigures = memo(function SurveyFigures(props: {
  g: Geometry;
  d0: number;
  d1: number;
  survey: SurveyForClock;
  year: number;
  later: number; // where the horizon rule stands now
  laterYear: number; // the year it is going to
  copy: Record<string, string>;
}) {
  const { g, d0, d1, survey, year, later, laterYear, copy } = props;
  const { compact, W, R } = g;
  const x = xScale(g, d0, d1);
  const y = yScale(g);
  const pts = survey.points;
  const px = (h: number) => x(survey.baseYear + h);
  /** The band's upper edge at a pixel column, held level beyond the first and last points. */
  const upperEdgeAt = (xpx: number) => {
    const xs = pts.map((p) => px(p.horizonYears));
    if (xpx <= xs[0]) return y(pts[0].upper);
    if (xpx >= xs[xs.length - 1]) return y(pts[pts.length - 1].upper);
    const i = xs.findIndex((v) => v >= xpx);
    const t = (xpx - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
    return y(pts[i - 1].upper + t * (pts[i].upper - pts[i - 1].upper));
  };
  // the surveyed point the horizon label reads (the nearest at or before it), when the horizon
  // meets the band
  const read = surveyHorizonAt(survey, laterYear) ? surveyedAtOrBefore(survey, laterYear) : null;
  const lastX = px(pts[pts.length - 1].horizonYears);
  // the one the horizon label reads is left out, because that label gives the same range, and
  // so is one that would cover a figure already placed (a long axis crowds them; the table and
  // the hover still give every figure)
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  return (
    <g>
      {!compact &&
        pts.map((p) => {
          if (read && p.horizonYears === read.horizonYears) return null;
          const text = `${pctLabel(p.lower)} to ${pctLabel(p.upper)}%`;
          // the figure is set at 0.8rem (12.8px) in the mono face, under 7.8px a character
          const w = r2(text.length * 7.8 + 6);
          // centred over its point, unless the today rule or the horizon rule would run
          // through it: then it steps just clear of that rule, on the point's side
          let cx = px(p.horizonYears);
          for (const rx of [x(year), x(later)]) {
            if (Math.abs(rx - cx) < w / 2 + 3) cx = rx <= cx ? rx + w / 2 + 4 : rx - w / 2 - 4;
          }
          cx = r2(cx);
          // lifted clear of the band's upper edge across the label's whole width, so the
          // paper ground never bites into the band where it rises beside the point
          const top = Math.min(y(p.upper), upperEdgeAt(cx - w / 2), upperEdgeAt(cx + w / 2));
          const base = r2(top - 9);
          const box = { x0: cx - w / 2, x1: cx + w / 2, y0: base - 11, y1: base + 4 };
          if (placed.some((b) => box.x0 < b.x1 + 2 && b.x0 < box.x1 + 2 && box.y0 < b.y1 + 1 && b.y0 < box.y1 + 1)) return null;
          placed.push(box);
          return (
            <g key={p.horizonYears}>
              <rect className="xc-knock" x={r2(box.x0)} y={r2(box.y0)} width={w} height={15} />
              <text className="xc-range-label" x={cx} y={base} textAnchor="middle">
                {text}
              </text>
            </g>
          );
        })}
      <text className="xc-stops" x={r2(lastX + 8)} y={y(pts[pts.length - 1].upper) + 4} display={lastX > W - R - 125 ? 'none' : undefined} paintOrder="stroke">
        {copy.surveyStops}
      </text>
    </g>
  );
});

// ---- the rules and lanes ---------------------------------------------------------------------

/** "today": a dashed rule from the band to the axis, labelled at its top as on the profile's timeline. */
const TodayRule = memo(function TodayRule({ g, at, axisY, label }: { g: Geometry; at: number; axisY: number; label: string }) {
  return (
    <g transform={`translate(${at}, 0)`}>
      <line className="xc-today" x1={0} x2={0} y1={g.bandTop - 5} y2={r2(axisY)} />
      <text className="xc-today-label" x={0} y={g.bandTop - 10} textAnchor={g.compact ? 'start' : 'middle'}>{label}</text>
    </g>
  );
});

/** The later secrecy horizon, rising through the band, with the survey's range where it meets it. */
const Horizon = memo(function Horizon(props: { g: Geometry; at: number; bottom: number; survey: SurveyForClock | null; laterYear: number; copy: Record<string, string> }) {
  const { g, at, bottom, survey, laterYear, copy } = props;
  const y = yScale(g);
  const atLater = survey ? surveyHorizonAt(survey, laterYear) : null;
  const label = horizonLabel(survey, laterYear, copy);
  const nearRight = at > g.W - g.R - 150;
  return (
    <g transform={`translate(${at}, 0)`}>
      <line className="xc-horizon" x1={0} x2={0} y1={g.bandTop} y2={r2(bottom)} />
      {/* a dot where the horizon crosses the band's middle, and under the band the surveyed range the readout gives, where no surveyed figure can sit under it */}
      {atLater && <circle className="xc-horizon-dot" cx={0} cy={y((atLater.lower + atLater.upper) / 2)} r={3} />}
      {label && (
        <text
          className="xc-horizon-label"
          x={nearRight ? -8 : 8}
          y={g.bandTop + g.bandH + 18}
          textAnchor={nearRight ? 'end' : 'start'}
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </g>
  );
});

/**
 * The survey's range at the later horizon, in the chart's words: the same surveyed figure the
 * readout gives (the nearest surveyed horizon at or before it), with that horizon's year, never a
 * figure interpolated between two surveyed horizons; the hover gives those, and says so.
 */
function horizonLabel(survey: SurveyForClock | null, later: number, copy: Record<string, string>): string {
  const atLater = survey ? surveyHorizonAt(survey, later) : null;
  const read = survey && atLater ? surveyedAtOrBefore(survey, later) : null;
  if (survey && read) return fill(copy.horizonRange, { lower: pctLabel(read.lower), upper: pctLabel(read.upper), year: survey.baseYear + read.horizonYears });
  const pts = survey?.points ?? [];
  if (!survey || !pts.length) return '';
  return later > survey.baseYear + pts[pts.length - 1].horizonYears ? copy.beyondSurvey : copy.beforeSurvey;
}

/** Lane labels; on a phone they sit above their lanes, clear of the today rule. */
const LaneLabels = memo(function LaneLabels({ g, lanes, copy }: { g: Geometry; lanes: LaneRow[]; copy: Record<string, string> }) {
  const { compact, L } = g;
  return (
    <>
      {lanes.map((lane) => (
        <text
          key={lane.key}
          className="xc-lane-label"
          x={compact ? L + 6 : L - 14}
          y={r2(compact ? lane.y - 16 : lane.y + 4)}
          textAnchor={compact ? 'start' : 'end'}
          paintOrder="stroke"
          opacity={lane.o < 1 ? r2(lane.o) : undefined}
        >
          {laneLabel(lane.key, copy)}
        </text>
      ))}
    </>
  );
});

/** A year at the end of a lane, flipped to the left near the chart's right edge. */
function EndLabel({ g, at, ly, text }: { g: Geometry; at: number; ly: number; text: string }) {
  const flip = at > g.W - g.R - 8;
  return (
    <g transform={`translate(${at}, 0)`}>
      <text className="xc-year" x={flip ? -10 : 10} y={4} textAnchor={flip ? 'end' : 'start'} transform={`translate(0, ${r2(ly)})`}>
        {text}
      </text>
    </g>
  );
}

/** The migration bar and the two secrecy lanes: hairlines to open circles, with their end years. */
const Lanes = memo(function Lanes(props: {
  g: Geometry;
  now: number; // where today stands
  start: number;
  ends: number;
  today: number;
  last: number;
  y0: number;
  y1: number;
  y2: number;
  endsYear: string; // the end years as the readout gives them
  todayYear: string;
  lastYear: string;
}) {
  const { g, now, start, ends, today, last, endsYear, todayYear, lastYear } = props;
  const [y0, y1, y2] = [props.y0, props.y1, props.y2].map(r2);
  return (
    <>
      {/* migration: a solid bar */}
      <g transform={`translate(${start}, ${y0})`}>
        <rect className="xc-bar" x={0} y={-5} height={10} rx={1} width={r2(Math.max(2, ends - start))} />
      </g>
      <EndLabel g={g} at={ends} ly={y0} text={endsYear} />

      {/* data sent today: a hairline to an open circle */}
      <g transform={`translate(${now}, ${y1})`}>
        <rect className="xc-hair" x={0} y={-0.75} height={1.5} width={r2(Math.max(0, today - now))} />
      </g>
      <g transform={`translate(${today}, ${y1})`}>
        <circle className="xc-end" r={4.5} />
      </g>
      <EndLabel g={g} at={today} ly={y1} text={todayYear} />

      {/* last data sent the old way */}
      <g transform={`translate(${ends}, ${y2})`}>
        <rect className="xc-hair" x={0} y={-0.75} height={1.5} width={r2(Math.max(0, last - ends))} />
        <line className="xc-start-tick" x1={0} x2={0} y1={-5} y2={5} />
      </g>
      <g transform={`translate(${last}, ${y2})`}>
        <circle className="xc-end" r={4.5} />
      </g>
      <EndLabel g={g} at={last} ly={y2} text={lastYear} />
    </>
  );
});

/**
 * Dates: ink dots at their own year, open for standards bodies, dotted for leads; a mark near
 * another of its lane steps down from the rule. Dots closer than 44px share one pointer target,
 * which rings them all and their rows in the list.
 */
const DateLanes = memo(function DateLanes(props: {
  g: Geometry;
  d0: number;
  d1: number;
  lanes: LaneRow[];
  marks: MarkRow[];
  years: YearRow[];
  focused: string[];
  onFocus?: (ids: string[]) => void;
}) {
  const { g, d0, d1, lanes, marks, years, focused, onFocus } = props;
  const x = xScale(g, d0, d1);
  const { compact, L, W, R } = g;
  return (
    <>
      {(['targets', 'standards'] as DateLaneKey[]).map((key) => {
        const lane = lanes.find((l) => l.key === key);
        if (!lane) return null;
        const ly = r2(lane.y);
        const own = marks.filter((m) => m.lane === key);
        // pointer targets only for the marks that stay, at the places they are going to
        const settled = own.filter((m) => m.o >= 1);
        const clusters = markerClusters(settled.map((m) => x(m.year)));
        return (
          <g key={key} opacity={lane.o < 1 ? r2(lane.o) : undefined}>
            <line className="xc-lane-rule" x1={L} x2={W - R} y1={ly} y2={ly} />
            {years
              .filter((yr) => yr.lane === key)
              .map((yr) => (
                <text
                  key={yr.key}
                  className="xc-date-year"
                  data-year={yr.year}
                  x={x(yr.year)}
                  y={r2(yr.y)}
                  textAnchor="middle"
                  paintOrder="stroke"
                  opacity={yr.o < 1 ? r2(yr.o) : undefined}
                >
                  {yr.year}
                </text>
              ))}
            {clusters.map((c) => {
              const ids = c.members.map((k) => settled[k].key);
              return (
                <rect
                  key={ids.join(' ')}
                  className="xc-hit"
                  x={c.x}
                  y={ly - 22}
                  width={c.w}
                  height={r2(44 + lane.depth)}
                  onPointerEnter={() => onFocus?.(ids)}
                  onPointerLeave={() => onFocus?.([])}
                />
              );
            })}
            {own.map((m) => (
              <g
                key={m.key}
                className={`xc-marker${focused.includes(m.key) ? ' is-active' : ''}`}
                data-year={m.year}
                transform={`translate(${x(m.year)}, ${r2(m.y)})`}
                opacity={m.o < 1 ? r2(m.o) : undefined}
              >
                <circle className="xc-ring" r={7} />
                <DeadlineMark d={m.d} />
              </g>
            ))}
          </g>
        );
      })}
    </>
  );
});

const Axis = memo(function Axis({ g, d0, d1, axisY, every }: { g: Geometry; d0: number; d1: number; axisY: number; every: number }) {
  const x = xScale(g, d0, d1);
  const ticks: number[] = [];
  for (let t = Math.ceil(d0 / 5) * 5; t <= d1 + 1e-6; t += 5) ticks.push(t);
  const ay = r2(axisY);
  return (
    <>
      <line className="xc-axis" x1={g.L} x2={g.W - g.R} y1={ay} y2={ay} />
      {ticks.map((t) =>
        // every other tick on a phone when the axis is long; counted from the first, so the
        // ticks shown stay the same while the axis grows
        (t - ticks[0]) % (5 * every) === 0 ? (
          <g key={t} transform={`translate(${x(t)}, ${ay})`}>
            <line className="xc-axis" y1={0} y2={5} />
            <text className="xc-tick" y={20} textAnchor="middle">{t}</text>
          </g>
        ) : null,
      )}
    </>
  );
});

/** Hover over the band: a quiet crosshair with the band's value at that year. */
const HoverLayer = memo(function HoverLayer({ g, d0, d1, survey, copy }: { g: Geometry; d0: number; d1: number; survey: SurveyForClock | null; copy: Record<string, string> }) {
  const [hover, setHover] = useState<number | null>(null);
  const { L, R, W, bandTop, bandH } = g;
  const x = xScale(g, d0, d1);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const mx = ((e.clientX - box.left) / box.width) * W;
    const yr = Math.round(x.invert(mx));
    setHover(yr >= d0 && yr <= d1 ? yr : null);
  };
  const value = hover !== null && survey ? surveyHorizonAt(survey, hover) : null;
  const flip = hover !== null && x(hover) > W - R - 170;
  return (
    <>
      {hover !== null && (
        <g className="xc-crosshair" transform={`translate(${x(hover)}, 0)`} aria-hidden="true">
          <line x1={0} x2={0} y1={bandTop} y2={bandTop + bandH} />
          <text className="xc-cross-label" x={flip ? -8 : 8} y={bandTop + 12} textAnchor={flip ? 'end' : 'start'} paintOrder="stroke">
            {fill(copy.hoverYear, { year: hover })}:{' '}
            {value
              ? fill(value.interpolated ? copy.hoverBandInterpolated : copy.hoverBand, { lower: pctLabel(value.lower), upper: pctLabel(value.upper) })
              : copy.hoverNoBand}
          </text>
        </g>
      )}
      <rect className="xc-hover-zone" x={L} y={bandTop} width={W - L - R} height={bandH} onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
    </>
  );
});

export default memo(function ExposureChart(props: Props) {
  const { width, result, survey, deadlines, copy, checking, onFocusDeadlines, focusedDeadlines = NONE, animate = false, fit = false } = props;
  const uid = useId();
  // the frame these values settle on; computed once per change, never per animation frame
  const target = useMemo(() => layoutChart({ width, result, survey, deadlines, copy }), [width, result, survey, deadlines, copy]);
  const g = target.g;
  // the frame to draw now: a change of value glides there, a change of width is drawn at once
  const f: Frame = useGlide(target.frame, mixFrames, animate, g.W);
  const x = xScale(g, f.d0, f.d1);
  const H = r2(f.H);
  const later = result.laterHorizon;
  const lane = (k: string) => f.lanes.find((l) => l.key === k)?.y ?? 0;
  // the axis's tick spacing follows where the axis is going, so it changes once, not mid-glide
  const ticks = Math.floor((target.frame.d1 - target.frame.d0) / 5) + 1;
  const every = g.compact && ticks > 7 ? 2 : 1;

  const atLater = survey ? surveyHorizonAt(survey, later) : null;
  const laterLabel = horizonLabel(survey, later, copy);
  const bandSummary = atLater ? `The nearest surveyed range at or before ${later} is ${laterLabel}.` : laterLabel ? `${later} is ${laterLabel}.` : '';

  return (
    <svg
      className="xc-svg"
      viewBox={`0 0 ${g.W} ${H}`}
      width="100%"
      height={fit ? H : undefined}
      preserveAspectRatio={fit ? 'xMinYMin meet' : undefined}
      role="img"
      aria-labelledby={`${uid}-t ${uid}-d`}
    >
      <title id={`${uid}-t`}>{copy.chartTitle}</title>
      <desc id={`${uid}-d`}>
        {fill(copy.chartDesc, {
          secrecyUntilForToday: result.secrecyUntilForToday,
          migrationEnds: result.migrationEnds,
          secrecyUntilForLast: result.secrecyUntilForLast,
          bandSummary,
        })}
      </desc>

      <BandTitle g={g} copy={copy} checking={checking} />
      <Band g={g} d0={f.d0} d1={f.d1} survey={survey} checking={checking} />
      <TodayRule g={g} at={x(result.year)} axisY={f.axisY} label={copy.todayLabel} />
      <Horizon g={g} at={x(f.later)} bottom={lane('last')} survey={survey} laterYear={later} copy={copy} />
      {survey && survey.points.length > 0 && (
        <SurveyFigures g={g} d0={f.d0} d1={f.d1} survey={survey} year={result.year} later={f.later} laterYear={later} copy={copy} />
      )}
      <LaneLabels g={g} lanes={f.lanes} copy={copy} />
      <Lanes
        g={g}
        now={x(result.year)}
        start={x(f.migrationStart)}
        ends={x(f.migrationEnds)}
        today={x(f.today)}
        last={x(f.last)}
        y0={lane('migration')}
        y1={lane('today')}
        y2={lane('last')}
        endsYear={String(result.migrationEnds)}
        todayYear={String(result.secrecyUntilForToday)}
        lastYear={String(result.secrecyUntilForLast)}
      />
      <DateLanes g={g} d0={f.d0} d1={f.d1} lanes={f.lanes} marks={f.marks} years={f.years} focused={focusedDeadlines} onFocus={onFocusDeadlines} />
      <Axis g={g} d0={f.d0} d1={f.d1} axisY={f.axisY} every={every} />
      <HoverLayer g={g} d0={f.d0} d1={f.d1} survey={survey} copy={copy} />
    </svg>
  );
});

