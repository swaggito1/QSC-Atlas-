// QSC Atlas Labs: the Standards Cascade's orbit, laid out at build time.
//
// NIST is the small square at the centre. Concentric rings mark years from 2016 (centre) to
// the last year of the data (edge). Angle: one sector per coordination posture in
// POSTURE_ORDER, plus a narrow fifth for jurisdictions with no posture, each sized by its
// member count; members are ordered by first-edge date, then ISO3. Radius: the date of the
// jurisdiction's first verified document naming a NIST standard; with none, just outside the
// outer ring on an arc labelled "no NIST reference recorded".
//
// Lines: one per jurisdiction and kind of reference (cascade.ts), fanned so that none lies on
// another. Labels are placed where nothing else is: the year labels run along the widest empty
// lane between the lines, the sector names follow the ring, the names of the fork view sit by
// their markers, and each national standard (its square and its name, KpqC, NGCC, Kodieum) is a
// tag tied to its country by a hairline, set at the nearest spot that clears every marker, word
// and line. Every word is set at WORD orbit units, which reads at 0.8rem (12.8px) or more wherever
// the wide layout shows (an orbit 672px wide or wider). Below 720px the orbit's words are drawn
// twice as large (PHONE, lab-cascade.css), 0.8rem on a 390px phone, so the names, the tags and the
// year labels are placed a second time for that size, the tags' squares and ties with them; the
// countries' markers never move. Pure and deterministic: the same data gives the same coordinates
// on every build.

import { POSTURE_ORDER } from '../process';
import { FAN, bentCurve, linkOf, periodEnd } from './cascade';
import type { LinkEdge } from './cascade';

export const SIZE = 1000;
export const CENTRE = SIZE / 2;
export const START_YEAR = 2016;
const INNER = 56; // radius of the 2016 ring
const OUTER = 352; // radius of the current-year ring
export const OUTSIDE = OUTER + 28; // "no NIST reference recorded"
const SECTOR_GAP = 0.09; // radians between sectors
const SECTOR_ARC = OUTSIDE + 26; // the ink arc that groups a sector
// the orbit's words, in orbit units: 17 is 0.8rem on the 672px orbit, the narrowest that shows
// the wide layout (the viewBox is 888 units across); the phone size is twice that
export const WORD = 17;
export const PHONE = 2; // how much larger the orbit's words are drawn below 720px
// the sector names: above the middle of the ring their baseline is LABEL_TOP and the glyphs grow
// outward; below it the baseline is LABEL_BOTTOM and they grow inward, reading left to right. Both
// clear the sector arc and stay inside the view at either size.
const LABEL_TOP = SECTOR_ARC + 10;
const LABEL_BOTTOM = SECTOR_ARC + 27;
const FAN_ANGLE = [-0.14, -0.24, -0.34, -0.44]; // control-point angle of each kind of line (FAN order)
export const VIEW = { x: 56, y: 56, w: 888, h: 888 }; // the orbit's viewBox: the rings and their labels

export type Anchor = 'start' | 'end' | 'middle';
export interface LabelSpot {
  x: number;
  y: number; // the baseline
  anchor: Anchor;
}

export interface LayoutJurisdiction {
  iso3: string;
  name: string;
  posture: string | null; // coordination posture key
  role: string | null; // standards role key
  opacity: number; // confidenceOpacity
}

export type LayoutEdge = LinkEdge & { id: string };

export interface OrbitNode extends LayoutJurisdiction {
  x: number;
  y: number;
  angle: number;
  radius: number; // distance from the centre
  size: number; // marker radius, 4 to 7
  firstNistEdge: string | null; // ISO date of the first verified document naming a NIST standard
  sector: string;
  edgeCount: number;
  label: LabelSpot; // where its name goes when shown
  labelPhone: LabelSpot; // the same, at the phone size
}

export interface OrbitSector {
  key: string;
  start: number;
  end: number;
  count: number;
  arc: string; // the ink arc
  labelPath: string; // the path the sector's name follows
}

export interface OrbitRing {
  year: number;
  radius: number;
  // where its year is written, and at which sizes: every other year at the wide size, every
  // fourth at the phone size, and never where the year would touch the centre's label
  label: { x: number; y: number; wide: boolean; phone: boolean } | null;
}

export interface NationalMark {
  id: string;
  label: string;
  iso3: string;
  x: number;
  y: number;
  lx: number;
  ly: number;
  anchor: Anchor;
  phone: LabelSpot; // the label's place at the phone size
  phoneAt: { x: number; y: number }; // the square's place at the phone size
  since: string | null; // the first dated record of the national process; the mark is faded before it
}

export interface OrbitLayout {
  nodes: OrbitNode[];
  links: Record<string, string>; // path key (cascade.ts linkOf) to SVG path
  phoneLinks: Record<string, string>; // the lines to a national standard at the phone size, where its square moves
  sectors: OrbitSector[];
  rings: OrbitRing[];
  lane: number; // the angle the year labels run along
  centreLabel: LabelSpot;
  // the "none recorded" name and its tick; hidden where a sector of countries with no posture
  // takes the top of the ring (another body's view, 5 October 2026), whose name would cross it:
  // the key's rings note carries it there, as it does at the phone size
  noNist: { x: number; y: number; y1: number; y2: number; hidden?: boolean };
  national: NationalMark[];
  outside: number;
  endYear: number;
}

/** Years since 2016 as a fraction, from an ISO date of any precision (the middle of the period). */
export function yearFraction(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!m) return y + 0.5;
  if (!d) return y + (m - 0.5) / 12;
  return y + (m - 1) / 12 + (d - 0.5) / 365;
}

const round = (v: number) => Math.round(v * 100) / 100;
const TAU = 2 * Math.PI;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;
const at = (r: number, a: number): [number, number] => [round(CENTRE + r * Math.cos(a)), round(CENTRE + r * Math.sin(a))];

function arcPath(r: number, from: number, to: number, clockwise: boolean) {
  const [x1, y1] = at(r, from);
  const [x2, y2] = at(r, to);
  const large = Math.abs(to - from) > Math.PI ? 1 : 0;
  return `M${x1},${y1} A${r},${r} 0 ${large} ${clockwise ? 1 : 0} ${x2},${y2}`;
}

// ---- collision checks for label placement ----------------------------------------------------

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface Circle {
  x: number;
  y: number;
  r: number;
}
const MONO_CHAR = 0.61 * WORD; // the advance of one mono character at WORD, in orbit units
const NAME_CHAR = 0.6 * WORD; // the advance of one character of a semibold name at WORD

/** The box a mono label takes, from its anchor point and baseline, at size scale s. */
export function textBox(x: number, y: number, text: string, anchor: Anchor, s = 1): Box {
  const w = text.length * MONO_CHAR * s + 4;
  const x0 = anchor === 'start' ? x - 2 : anchor === 'end' ? x - w + 2 : x - w / 2;
  return { x0, y0: y - 0.95 * WORD * s, x1: x0 + w, y1: y + 0.29 * WORD * s };
}
/** The box a jurisdiction's name takes, at size scale s. */
export function nameBox(spot: LabelSpot, text: string, s = 1): Box {
  const w = text.length * NAME_CHAR * s + 4;
  const x0 = spot.anchor === 'start' ? spot.x - 2 : spot.anchor === 'end' ? spot.x - w + 2 : spot.x - w / 2;
  return { x0, y0: spot.y - 0.92 * WORD * s, x1: x0 + w, y1: spot.y + 0.25 * WORD * s };
}
/** The box a national standard's square takes. */
export const squareBox = (m: { x: number; y: number }): Box => ({ x0: m.x - 7, y0: m.y - 7, x1: m.x + 7, y1: m.y + 7 });
export const boxesMeet = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
function boxMeetsCircle(b: Box, c: Circle) {
  const dx = Math.max(b.x0 - c.x, 0, c.x - b.x1);
  const dy = Math.max(b.y0 - c.y, 0, c.y - b.y1);
  return dx * dx + dy * dy < c.r * c.r;
}
/** True when a box reaches into the ring band [r0, r1] around the centre. */
function boxMeetsBand(b: Box, r0: number, r1: number) {
  const near = Math.hypot(Math.max(b.x0 - CENTRE, 0, CENTRE - b.x1), Math.max(b.y0 - CENTRE, 0, CENTRE - b.y1));
  const far = Math.max(...[b.x0, b.x1].flatMap((x) => [b.y0, b.y1].map((y) => Math.hypot(x - CENTRE, y - CENTRE))));
  return near < r1 && far > r0;
}
const anchorFor = (dx: number): Anchor => (dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle');
/** The band the sector names take: their glyphs grow outward above the middle and inward below it. */
const sectorBand = (s: number): [number, number] => [SECTOR_ARC - 6, Math.max(LABEL_TOP + 0.72 * WORD * s, LABEL_BOTTOM + 0.21 * WORD * s) + 2];
/** True when a box lies inside the orbit's viewBox. */
export const inView = (b: Box) => b.x0 >= VIEW.x + 2 && b.x1 <= VIEW.x + VIEW.w - 2 && b.y0 >= VIEW.y + 2 && b.y1 <= VIEW.y + VIEW.h - 2;

/**
 * Spots all round a point, for a name set at size scale s: in sixteen directions and at each
 * distance given, the name's box is set just beyond the point in that direction (to its right,
 * left, above or below, or a corner between).
 */
function ringSpots(px: number, py: number, gaps: number[], s: number): LabelSpot[] {
  const f = WORD * s;
  const out: LabelSpot[] = [];
  for (const g of gaps) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU;
      const x = px + g * Math.cos(a);
      const y = py + g * Math.sin(a);
      const dy = Math.sin(a);
      out.push({ x, y: dy < -0.3 ? y - 0.25 * f : dy > 0.3 ? y + 0.92 * f : y + 0.33 * f, anchor: anchorFor(Math.cos(a)) });
    }
  }
  return out;
}

/** The spot with the lowest score; ties go to the earlier spot. */
function bestSpot(spots: LabelSpot[], score: (spot: LabelSpot) => number): LabelSpot {
  let best = spots[0];
  let low = Infinity;
  for (const [i, spot] of spots.entries()) {
    const v = score(spot) + i * 0.001;
    if (v < low) {
      low = v;
      best = spot;
    }
  }
  return { x: round(best.x), y: round(best.y), anchor: best.anchor };
}

export function computeOrbit(opts: {
  jurisdictions: LayoutJurisdiction[];
  edges: LayoutEdge[];
  nistStandards: { id: string; label: string }[]; // the algorithm standards that place a node
  centreIds?: string[]; // every standard a line may run from NIST for (defaults to nistStandards)
  nationalStandards: { id: string; label: string; iso3: string; since?: string | null }[];
  endYear: number; // the last year of the data: the outer ring
  // the words the layout keeps clear of: the centre's label at its longest, and the arc's name
  // (NIST's by default; another standards body's view passes its own, 5 October 2026)
  centreLabel?: string;
  noneLabel?: string;
}): OrbitLayout {
  const { jurisdictions, edges, endYear } = opts;
  const centreWords = opts.centreLabel ?? 'NIST · FIPS 203';
  const noneWords = opts.noneLabel ?? 'no NIST reference recorded';
  const nistIds = new Set(opts.nistStandards.map((s) => s.id));
  const centreIds = new Set(opts.centreIds ?? [...nistIds]);
  const nationalIds = new Set(opts.nationalStandards.map((s) => s.id));
  const nistRelations = new Set(['adopts', 'references', 'profiles']);
  const radiusFor = (iso: string) => INNER + ((Math.min(yearFraction(iso), endYear + 1) - START_YEAR) / (endYear + 1 - START_YEAR)) * (OUTER - INNER);

  // every jurisdiction with a posture, plus any with an edge but no posture
  const byIso = new Map(jurisdictions.map((j) => [j.iso3, j]));
  for (const e of edges) if (!byIso.has(e.from)) byIso.set(e.from, { iso3: e.from, name: e.from, posture: null, role: null, opacity: 0.74 });
  const all = [...byIso.values()];

  // a lead never places a jurisdiction: only a verified document does; dates of different
  // precision are compared by the end of their period, as the counter and the slider read them
  const firstNist = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const e of edges) {
    counts.set(e.from, (counts.get(e.from) ?? 0) + 1);
    if (e.verified !== false && nistIds.has(e.to) && nistRelations.has(e.relation)) {
      const prev = firstNist.get(e.from);
      if (!prev || periodEnd(e.date) < periodEnd(prev)) firstNist.set(e.from, e.date);
    }
  }

  const sectorKeys = [...POSTURE_ORDER, 'none'];
  const members = sectorKeys.map((key) =>
    all
      .filter((j) => (j.posture ?? 'none') === key)
      .sort((a, b) => {
        const fa = firstNist.get(a.iso3) ?? '9999';
        const fb = firstNist.get(b.iso3) ?? '9999';
        return fa.localeCompare(fb) || a.iso3.localeCompare(b.iso3);
      }),
  );
  const present = sectorKeys.map((k, i) => ({ key: k, list: members[i] })).filter((s) => s.list.length > 0);
  const total = present.reduce((n, s) => n + s.list.length + 0.6, 0);
  const usable = TAU - SECTOR_GAP * present.length;

  const nodes: OrbitNode[] = [];
  const sectors: OrbitSector[] = [];
  let angle = -Math.PI / 2 + SECTOR_GAP / 2;
  for (const s of present) {
    const span = (usable * (s.list.length + 0.6)) / total;
    const start = angle;
    const end = angle + span;
    // the name follows the ring: clockwise above the middle, anticlockwise below, so it reads
    // left to right; the path runs past the sector's ends so a long name is never cut
    const mid = (start + end) / 2;
    const ext = 0.3;
    const below = Math.sin(mid) > 0.2;
    sectors.push({
      key: s.key,
      start: round(start),
      end: round(end),
      count: s.list.length,
      arc: arcPath(SECTOR_ARC, start, end, true),
      labelPath: below ? arcPath(LABEL_BOTTOM, end + ext, start - ext, false) : arcPath(LABEL_TOP, start - ext, end + ext, true),
    });
    s.list.forEach((j, i) => {
      const a = angle + (span * (i + 0.5)) / s.list.length;
      const first = firstNist.get(j.iso3) ?? null;
      const radius = first ? radiusFor(first) : OUTSIDE;
      nodes.push({
        ...j,
        angle: round(a),
        radius: round(radius),
        x: round(CENTRE + radius * Math.cos(a)),
        y: round(CENTRE + radius * Math.sin(a)),
        size: Math.min(7, 4 + (counts.get(j.iso3) ?? 0) * 0.75),
        firstNistEdge: first,
        sector: s.key,
        edgeCount: counts.get(j.iso3) ?? 0,
        label: { x: 0, y: 0, anchor: 'middle' },
        labelPhone: { x: 0, y: 0, anchor: 'middle' },
      });
    });
    angle += span + SECTOR_GAP;
  }
  const nodeOf = new Map(nodes.map((n) => [n.iso3, n]));

  // ---- the lines' paths, from NIST to a jurisdiction, fanned by kind --------------------------
  const refs = new Map<string, NonNullable<ReturnType<typeof linkOf>>>();
  for (const e of edges) {
    const ref = linkOf(e, centreIds, nationalIds);
    if (ref && nodeOf.has(ref.from) && !refs.has(ref.path)) refs.set(ref.path, ref);
  }
  const links: Record<string, string> = {};
  // points along every line from NIST, so a label is never set on top of the lines
  const linePoints: { x: number; y: number }[] = [];
  for (const ref of refs.values()) {
    if (ref.kind === 'own') continue; // drawn once the national marks are placed
    const n = nodeOf.get(ref.from)!;
    const ca = n.angle + FAN_ANGLE[FAN[ref.kind]];
    const c = 0.55 * n.radius;
    const [sx, sy] = at(16, n.angle);
    const [qx, qy] = [round(CENTRE + c * Math.cos(ca)), round(CENTRE + c * Math.sin(ca))];
    links[ref.path] = `M${sx},${sy}Q${qx},${qy} ${n.x},${n.y}`;
    for (let k = 1; k < 24; k++) {
      const t = k / 24;
      const u = 1 - t;
      linePoints.push({ x: u * u * sx + 2 * u * t * qx + t * t * n.x, y: u * u * sy + 2 * u * t * qy + t * t * n.y });
    }
  }

  // ---- the lane for the year labels: the middle of the widest empty angle ---------------------
  const busy: number[] = [];
  for (const ref of refs.values()) {
    if (ref.kind === 'own') continue;
    const n = nodeOf.get(ref.from)!;
    busy.push(wrap(n.angle), wrap(n.angle + FAN_ANGLE[FAN[ref.kind]]));
  }
  for (const n of nodes) if (n.radius < OUTSIDE) busy.push(wrap(n.angle));
  let lane = -Math.PI / 2;
  if (busy.length) {
    const sorted = [...new Set(busy.map(round))].sort((a, b) => a - b);
    let best = -1;
    sorted.forEach((a, i) => {
      const next = i === sorted.length - 1 ? sorted[0] + TAU : sorted[i + 1];
      if (next - a > best) {
        best = next - a;
        lane = a + (next - a) / 2;
      }
    });
  }
  lane = round(wrap(lane));
  const cos = Math.cos(lane);
  const sin = Math.sin(lane);

  const centreAnchor = anchorFor(cos);
  const centreLabel: LabelSpot = {
    x: round(CENTRE + 22 * cos),
    y: round(CENTRE + 22 * sin + (centreAnchor === 'middle' ? (sin < 0 ? 0 : 0.7 * WORD) : 0.35 * WORD)),
    anchor: centreAnchor,
  };
  // the year labels run along the lane, every other year at the wide size and every fourth at the
  // phone size (counted back from the last year, which is always named); a year that would touch
  // the centre's label (with a standard chosen, at its longest) or square at a size is left out at
  // that size (the key's rings note gives the scale from 2016)
  const centreAt = (s: number) => [textBox(centreLabel.x, centreLabel.y, centreWords, centreAnchor, s), { x0: CENTRE - 10, y0: CENTRE - 10, x1: CENTRE + 10, y1: CENTRE + 10 }];
  const rings: OrbitRing[] = [];
  for (let y = START_YEAR; y <= endYear; y++) {
    const radius = round(radiusFor(`${y}-01-01`));
    const x = round(CENTRE + radius * cos);
    const ly = round(CENTRE + radius * sin + 0.35 * WORD);
    const clear = (s: number) => !centreAt(s).some((b) => boxesMeet(b, textBox(x, ly, String(y), 'middle', s)));
    const wide = (y === endYear || ((y - START_YEAR) % 2 === 0 && endYear - y >= 2)) && clear(1);
    const phone = (endYear - y) % 4 === 0 && clear(PHONE);
    rings.push({ year: y, radius, label: wide || phone ? { x, y: ly, wide, phone } : null });
  }
  // the top of the ring is always a gap between sectors: the "none recorded" arc is named there
  const noNist = {
    x: CENTRE,
    y: round(CENTRE - OUTSIDE - 38),
    y1: round(CENTRE - OUTSIDE - 5),
    y2: round(CENTRE - OUTSIDE - 30),
    // the sector of countries with no posture comes last, against the top of the ring
    ...(present.some((x) => x.key === 'none') ? { hidden: true } : {}),
  };

  const circles: Circle[] = nodes.map((n) => ({ x: n.x, y: n.y, r: n.role === 'sovereign-developer' ? n.size + 10 : n.size + 4 }));
  const hits = (b: Box, others: Circle[], obstacles: Box[], s: number) =>
    others.filter((c) => boxMeetsCircle(b, c)).length + obstacles.filter((o) => boxesMeet(b, o)).length + (boxMeetsBand(b, ...sectorBand(s)) ? 1 : 0) + (inView(b) ? 0 : 3);
  /** How many points of the lines from NIST a box covers, at most `cap`. */
  const onLines = (b: Box, cap = 6) => Math.min(cap, linePoints.filter((p) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1).length);
  const ownCircle = (n: OrbitNode): Circle => ({ x: n.x, y: n.y, r: n.role === 'sovereign-developer' ? n.size + 10 : n.size + 2 });
  const othersOf = (n: OrbitNode) => [ownCircle(n), ...circles.filter((o) => o.x !== n.x || o.y !== n.y)];

  // the names shown in the fork view (the sovereign developers and the owners of a national
  // standard) are placed before anything else at each size, then the national standards, then
  // the name of any other country that may be selected
  const forkFirst = new Set([...nodes.filter((n) => n.role === 'sovereign-developer').map((n) => n.iso3), ...opts.nationalStandards.map((s) => s.iso3)]);
  const ordered = [...nodes].sort((a, b) => Number(forkFirst.has(b.iso3)) - Number(forkFirst.has(a.iso3)));

  /** The ten spots round a node the wide names try, in order. */
  const wideSpots = (n: OrbitNode): LabelSpot[] => {
    const c = Math.cos(n.angle);
    const sn = Math.sin(n.angle);
    const gap = n.size + (n.role === 'sovereign-developer' ? 14 : 8);
    const d = gap * 0.75;
    const cap = 0.8 * WORD; // a name's capital height, so a name under its node clears it
    const mid = 0.33 * WORD; // the baseline that centres a name on its node
    const radial = (g: number): LabelSpot => {
      const anchor = anchorFor(Math.sign(g) * c);
      const x = n.x + g * c;
      const y = n.y + g * sn;
      return { x, y: anchor === 'middle' ? (y < n.y ? y : y + cap) : y + mid, anchor };
    };
    return [
      radial(gap),
      radial(-gap),
      { x: n.x, y: n.y - gap, anchor: 'middle' },
      { x: n.x, y: n.y + gap + cap, anchor: 'middle' },
      { x: n.x + gap, y: n.y + mid, anchor: 'start' },
      { x: n.x - gap, y: n.y + mid, anchor: 'end' },
      { x: n.x + d, y: n.y - d, anchor: 'start' },
      { x: n.x - d, y: n.y - d, anchor: 'end' },
      { x: n.x + d, y: n.y + d + 0.66 * WORD, anchor: 'start' },
      { x: n.x - d, y: n.y + d + 0.66 * WORD, anchor: 'end' },
    ];
  };
  /** Every spot round a node, nearest first, for the phone size, where words are drawn twice as large. */
  const phoneSpots = (n: OrbitNode): LabelSpot[] => {
    const gap = n.size + (n.role === 'sovereign-developer' ? 12 : 6);
    return ringSpots(n.x, n.y, [gap, gap + 8, gap + 18, gap + 30, gap + 44], PHONE);
  };
  const placeName = (n: OrbitNode, s: number, obstacles: Box[]): LabelSpot => {
    const spots = s === 1 ? wideSpots(n) : phoneSpots(n);
    const others = othersOf(n);
    const near = s === 1 ? 0 : 0.0005; // at the phone size every spot round the node is tried, nearest first
    return bestSpot(spots, (sp) => hits(nameBox(sp, n.name, s), others, obstacles, s) + Math.hypot(sp.x - n.x, sp.y - n.y) * near);
  };

  /**
   * A national standard's square and name, placed as one tag tied to its country by a hairline:
   * the spot near the country that clears every marker, word and line already placed, whose tie
   * crosses no other marker and stays short. Inward along the country's own angle comes first,
   * where the orbit is emptiest, then outward and to either side; the name goes on whichever
   * side of the square is clear.
   */
  const placeNational = (s: { id: string; label: string }, n: OrbitNode, size: number, obstacles: Box[], ownName: Box | null) => {
    const others = circles.filter((o) => o.x !== n.x || o.y !== n.y);
    const own = ownCircle(n);
    // the tie may pass under its own country's name (the name's paper edge breaks it there, and
    // the row reads country, name, process); never under another word
    const crossable = obstacles.filter((o) => o !== ownName);
    let best: { x: number; y: number; label: LabelSpot; score: number } | null = null;
    let order = 0;
    for (const d of [-30, -42, -56, -72, -90, -110, -132, -156, -182, -210, 30, 42, 56]) {
      for (const da of [0, 0.05, -0.05, 0.1, -0.1, 0.16, -0.16, 0.24, -0.24]) {
        const a = n.angle + da;
        const [x, y] = at(n.radius + d, a);
        const square = squareBox({ x, y });
        if (boxMeetsCircle(square, own)) continue;
        // the tie: from the edge of the country's marker to the square, clear of other markers
        const len = Math.hypot(x - n.x, y - n.y);
        let crossed = 0;
        for (let t = own.r; t < len - 7; t += 4) {
          const px = n.x + ((x - n.x) * t) / len;
          const py = n.y + ((y - n.y) * t) / len;
          if (others.some((c) => Math.hypot(px - c.x, py - c.y) < c.r - 1) || crossable.some((o) => px > o.x0 && px < o.x1 && py > o.y0 && py < o.y1)) crossed++;
        }
        for (const anchor of ['start', 'end'] as const) {
          const label: LabelSpot = { x: round(anchor === 'start' ? x + 9 : x - 9), y: round(y + 0.35 * WORD * size), anchor };
          const text = textBox(label.x, label.y, s.label, anchor, size);
          const score =
            (hits(square, others, obstacles, size) + hits(text, [own, ...others], obstacles, size)) * 10 +
            crossed * 4 +
            (onLines(square) + onLines(text)) * 0.5 +
            len * 0.01 +
            order++ * 0.0001;
          if (!best || score < best.score) best = { x, y, label, score };
        }
      }
    }
    return best!;
  };

  const national: NationalMark[] = [];
  const nationalOwners = opts.nationalStandards.filter((s) => nodeOf.has(s.iso3));

  // ---- the wide size --------------------------------------------------------------------------
  const boxes: Box[] = [
    ...rings.filter((r) => r.label?.wide).map((r) => textBox(r.label!.x, r.label!.y, String(r.year), 'middle')),
    textBox(centreLabel.x, centreLabel.y, centreWords, centreAnchor),
    textBox(noNist.x, noNist.y, noneWords, 'middle'),
    { x0: CENTRE - 10, y0: CENTRE - 10, x1: CENTRE + 10, y1: CENTRE + 10 },
  ];
  const wideNames = new Map<string, Box>();
  for (const n of ordered.filter((x) => forkFirst.has(x.iso3))) {
    n.label = placeName(n, 1, boxes);
    wideNames.set(n.iso3, nameBox(n.label, n.name));
    boxes.push(wideNames.get(n.iso3)!);
  }
  for (const s of nationalOwners) {
    const n = nodeOf.get(s.iso3)!;
    const at1 = placeNational(s, n, 1, boxes, wideNames.get(n.iso3) ?? null);
    const m: NationalMark = {
      id: s.id,
      label: s.label,
      iso3: s.iso3,
      x: round(at1.x),
      y: round(at1.y),
      lx: at1.label.x,
      ly: at1.label.y,
      anchor: at1.label.anchor,
      phone: at1.label,
      phoneAt: { x: round(at1.x), y: round(at1.y) },
      since: s.since ?? null,
    };
    national.push(m);
    boxes.push(squareBox(m), textBox(m.lx, m.ly, m.label, m.anchor));
  }
  for (const n of ordered.filter((x) => !forkFirst.has(x.iso3))) n.label = placeName(n, 1, boxes);

  // ---- the phone size: every word twice as large --------------------------------------------------
  // (the "none recorded" name is hidden there, lab-cascade.css)
  const phoneBoxes: Box[] = [
    ...rings.filter((r) => r.label?.phone).map((r) => textBox(r.label!.x, r.label!.y, String(r.year), 'middle', PHONE)),
    textBox(centreLabel.x, centreLabel.y, centreWords, centreAnchor, PHONE),
    { x0: CENTRE - 10, y0: CENTRE - 10, x1: CENTRE + 10, y1: CENTRE + 10 },
  ];
  const phoneNames = new Map<string, Box>();
  for (const n of ordered.filter((x) => forkFirst.has(x.iso3))) {
    n.labelPhone = placeName(n, PHONE, phoneBoxes);
    phoneNames.set(n.iso3, nameBox(n.labelPhone, n.name, PHONE));
    phoneBoxes.push(phoneNames.get(n.iso3)!);
  }
  for (const m of national) {
    const n = nodeOf.get(m.iso3)!;
    const atP = placeNational(m, n, PHONE, phoneBoxes, phoneNames.get(n.iso3) ?? null);
    m.phoneAt = { x: round(atP.x), y: round(atP.y) };
    m.phone = atP.label;
    phoneBoxes.push(squareBox(m.phoneAt), textBox(m.phone.x, m.phone.y, m.label, m.phone.anchor, PHONE));
  }
  for (const n of ordered.filter((x) => !forkFirst.has(x.iso3))) n.labelPhone = placeName(n, PHONE, phoneBoxes);

  // ---- the lines to a national standard, at each size ---------------------------------------------
  const nationalOf = new Map(national.map((m) => [m.id, m]));
  const phoneLinks: Record<string, string> = {};
  for (const ref of refs.values()) {
    if (ref.kind !== 'own' || !ref.to) continue;
    const n = nodeOf.get(ref.from)!;
    const m = nationalOf.get(ref.to);
    if (!m) continue;
    links[ref.path] = bentCurve([n.x, n.y], [m.x, m.y], 0.18);
    phoneLinks[ref.path] = bentCurve([n.x, n.y], [m.phoneAt.x, m.phoneAt.y], 0.18);
  }

  return { nodes, links, phoneLinks, sectors, rings, lane, centreLabel, noNist, national, outside: OUTSIDE, endYear };
}
