// QSC Atlas Labs: the shared parts of every lab globe, taken from the Atlas's HeroGlobe so a lab
// globe looks and behaves like the one on the home page. An orthographic canvas, the real country
// shapes, a faint graticule and a hairline rim; flat fills, no shading, glow or atmosphere; no
// auto-spin in a tool. The visitor drags to turn it, or turns it with the arrow keys once it has
// focus (attachKeys); a click that did not drag selects. Every export keeps its signature, since
// lab globes kept off the Atlas import them too: new parts are only ever added.
//
// Kept lab-local on purpose: HeroGlobe.tsx is live and is not changed from here.

import { geoGraticule, geoInterpolate, geoOrthographic } from 'd3-geo';
import type { GeoPath, GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';

/** HeroGlobe's values, so every lab globe draws in the same hand. */
export const GLOBE = {
  radius: 0.48, // of min(width, height)
  sphereFill: 'rgba(255,255,255,0.6)',
  countryStroke: 0.6,
  countryStrokeAlpha: 0.62,
  rimStroke: 1,
  rimAlpha: 0.28,
  graticuleStroke: 0.4,
  graticuleAlpha: 0.05,
  arcStroke: 1,
  arcAlpha: 0.3, // the orbit's .cc-edge
  dragThreshold: 4, // px before a press becomes a drag
  dragRate: 75, // degrees per pixel = dragRate / scale
  ease: 0.08, // share of the remaining turn covered per frame when easing to a country
} as const;

/** The ink token (--ink, CEPS charcoal #202425) as an RGB triple, for canvas strokes drawn with
 * their own alpha, where a CSS variable cannot reach. */
export const INK_RGB = '32,36,37';

/** A design token from global.css, read at draw time, with the value global.css sets as fallback. */
export function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** The shortest signed turn from one longitude to another, in degrees. */
export const angleDelta = (from: number, to: number) => ((((to - from + 180) % 360) + 360) % 360) - 180;

async function fetchJson(url: string, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.ok) return await res.json();
  } catch {
    /* aborted, offline, or a bad response */
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * The country shapes, loaded as HeroGlobe loads them: the bundled same-origin copy first, then
 * the CDN, a 6 second limit on each and two rounds, so no single network hop can leave a globe
 * stuck on its loading line. Antarctica is dropped. Resolves to null when every attempt fails.
 */
export async function loadWorld(): Promise<any[] | null> {
  const sources = ['/world-110m.json', 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'];
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of sources) {
      const world = await fetchJson(url, 6000);
      if (world?.objects?.countries) {
        const fc: any = feature(world, world.objects.countries);
        return fc.features.filter((f: any) => String(f.id) !== '010');
      }
    }
  }
  return null;
}

/** ISO 3166 numeric id of a world-atlas feature, without leading zeros ("040" becomes "40"). */
export const numericId = (f: any) => String(Number(f.id));

export function makeProjection(): GeoProjection {
  return geoOrthographic().clipAngle(90).precision(0.5);
}

/** Size the canvas for the device (ratio capped at 2) and fit the projection to it. */
export function fitCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, projection: GeoProjection) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  projection.scale(Math.min(w, h) * GLOBE.radius).translate([w / 2, h / 2]);
  return { w, h };
}

const GRATICULE = geoGraticule().step([30, 30])();

export interface CountryStyle {
  fill: string;
  alpha: number; // fill opacity; confidenceOpacity for a posture fill
  stroke?: number; // px, default GLOBE.countryStroke
  strokeAlpha?: number;
}

/** Sphere, countries and graticule. Draw arcs and markers after this, then drawRim. */
export function drawBase(
  ctx: CanvasRenderingContext2D,
  path: GeoPath<any, any>,
  feats: any[],
  style: (f: any) => CountryStyle,
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.fillStyle = GLOBE.sphereFill;
  ctx.fill();
  for (const f of feats) {
    const s = style(f);
    ctx.beginPath();
    path(f);
    ctx.globalAlpha = s.alpha;
    ctx.fillStyle = s.fill;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = s.stroke ?? GLOBE.countryStroke;
    ctx.strokeStyle = `rgba(${INK_RGB},${s.strokeAlpha ?? GLOBE.countryStrokeAlpha})`;
    ctx.stroke();
  }
  ctx.beginPath();
  path(GRATICULE);
  ctx.lineWidth = GLOBE.graticuleStroke;
  ctx.strokeStyle = `rgba(${INK_RGB},${GLOBE.graticuleAlpha})`;
  ctx.stroke();
}

export function drawRim(ctx: CanvasRenderingContext2D, path: GeoPath<any, any>) {
  ctx.beginPath();
  path({ type: 'Sphere' });
  ctx.lineWidth = GLOBE.rimStroke;
  ctx.strokeStyle = `rgba(${INK_RGB},${GLOBE.rimAlpha})`;
  ctx.stroke();
}

/** A great-circle arc as a LineString, so the projection trims it at the horizon. */
export function arc(from: [number, number], to: [number, number], steps = 40) {
  const interp = geoInterpolate(from, to);
  return { type: 'LineString' as const, coordinates: Array.from({ length: steps + 1 }, (_, i) => interp(i / steps)) };
}

/** True when a point faces the viewer (within 90 degrees of the centre of the view). */
export function facing(projection: GeoProjection, lonlat: [number, number]) {
  const r = projection.rotate();
  const centre: [number, number] = [-r[0], -r[1]];
  const toRad = Math.PI / 180;
  const [l1, p1] = [centre[0] * toRad, centre[1] * toRad];
  const [l2, p2] = [lonlat[0] * toRad, lonlat[1] * toRad];
  const cos = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(l2 - l1);
  return cos > 0;
}

/**
 * Pointer handling shared by every lab globe: a press past the threshold turns the globe; a
 * press that did not move is a click. Returns a function that removes the listeners.
 */
export function attachDrag(
  canvas: HTMLCanvasElement,
  opts: {
    scale: () => number;
    rotation: () => [number, number];
    rotate: (r: [number, number]) => void;
    click: (x: number, y: number) => void;
    hover?: (x: number, y: number) => void;
    leave?: () => void;
  },
) {
  let down = false;
  let moved = false;
  let start = { x: 0, y: 0 };
  let last = { x: 0, y: 0 };
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent) => {
    down = true;
    moved = false;
    start = last = local(e);
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const p = local(e);
    if (!down) {
      opts.hover?.(p.x, p.y);
      return;
    }
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) < GLOBE.dragThreshold) return;
    moved = true;
    const k = GLOBE.dragRate / opts.scale();
    const [l, f] = opts.rotation();
    opts.rotate([l + (p.x - last.x) * k, Math.max(-90, Math.min(90, f - (p.y - last.y) * k))]);
    last = p;
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    down = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (!moved) {
      const p = local(e);
      opts.click(p.x, p.y);
    }
  };
  const onLeave = () => {
    if (!down) opts.leave?.();
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('pointerleave', onLeave);
  };
}

/**
 * The keyboard's way to turn a lab globe: with the canvas focused, the arrow keys turn it as a
 * drag in that direction would, by `step` degrees (three times as far with Shift); Home brings it
 * back to `home`. Each press is one step, so nothing moves on its own. Returns a function that
 * removes the listener.
 */
export function attachKeys(
  canvas: HTMLElement,
  opts: {
    rotation: () => [number, number];
    rotate: (r: [number, number]) => void;
    home?: [number, number];
    step?: number;
  },
) {
  const onKey = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const step = (opts.step ?? 10) * (e.shiftKey ? 3 : 1);
    const [l, f] = opts.rotation();
    const clamp = (v: number) => Math.max(-90, Math.min(90, v));
    const next: Record<string, [number, number] | undefined> = {
      ArrowLeft: [l - step, f],
      ArrowRight: [l + step, f],
      ArrowUp: [l, clamp(f + step)],
      ArrowDown: [l, clamp(f - step)],
      Home: opts.home,
    };
    const r = next[e.key];
    if (!r) return;
    e.preventDefault();
    opts.rotate(r);
  };
  canvas.addEventListener('keydown', onKey);
  return () => canvas.removeEventListener('keydown', onKey);
}
