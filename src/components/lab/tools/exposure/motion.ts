// QSC Atlas Labs: the Exposure Clock's motion. useGlide() moves a value to a new target over
// GLIDE_MS (--dur-mid) on an ease-out curve, one React render per animation frame, and starts again from
// wherever it stands when the target changes mid-way, so a slider dragged across many steps
// glides without restarting from rest. It snaps at once when motion is off: on load, while the
// width changes, and when the visitor asks the system for reduced motion.

import { useEffect, useReducer, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

/** The glide's length: --dur-mid in global.css. */
export const GLIDE_MS = 240;

/** cubic-bezier(x1, y1, x2, y2) as a function of time, as CSS draws it. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Newton steps, then bisection if the slope is too flat to trust
    let u = t;
    for (let i = 0; i < 6; i++) {
      const e = sx(u) - t;
      const d = dx(u);
      if (Math.abs(e) < 1e-5) return sy(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0;
    let hi = 1;
    u = t;
    for (let i = 0; i < 24; i++) {
      const e = sx(u) - t;
      if (Math.abs(e) < 1e-5) break;
      if (e > 0) hi = u;
      else lo = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

/**
 * A cubic ease-out: quick at first, so a glide that restarts mid-way (a slider dragged across
 * many steps) never stalls, but gentler than --ease-out in global.css, whose first frame would
 * cover half the distance and read as a jump.
 */
export const easeOut = cubicBezier(0.33, 1, 0.68, 1);

/** True when the visitor's system asks for reduced motion; false on the server and in the first render. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const q = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!q) return;
    setReduce(q.matches);
    const on = () => setReduce(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return reduce;
}

/**
 * The value to draw on this render. A new target glides in from where the value stands, over
 * GLIDE_MS; with `animate` false it is drawn at once. `mix(a, b, t)` must return b itself at t = 1,
 * so a settled chart draws exactly the target's values. A change of `snapKey` (the chart's width)
 * is drawn at once too.
 */
export function useGlide<T>(target: T, mix: (a: T, b: T, t: number) => T, animate: boolean, snapKey: string | number = ''): T {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const g = useRef({ shown: target, from: target, to: target, start: -1, raf: 0, key: snapKey });
  const s = g.current;
  if (target !== s.to) {
    if (animate && s.key === snapKey && s.shown !== target) {
      s.from = s.shown;
      s.start = -1; // the clock starts on the next frame
    } else {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.from = s.shown = target;
    }
    s.to = target;
    s.key = snapKey;
  }
  useEffect(() => {
    if (s.raf || s.shown === s.to) return;
    const step = (now: number) => {
      // a frame's worth of progress on the first frame, so the motion starts at once
      if (s.start < 0) s.start = now - 16;
      const t = Math.min(1, (now - s.start) / GLIDE_MS);
      s.shown = t >= 1 ? s.to : mix(s.from, s.to, easeOut(t));
      s.raf = t >= 1 ? 0 : requestAnimationFrame(step);
      // drawn in this frame, before it is painted
      flushSync(tick);
    };
    s.raf = requestAnimationFrame(step);
  });
  useEffect(() => () => cancelAnimationFrame(g.current.raf), []);
  return s.shown;
}

/**
 * Calls fn with the latest value at most once per animation frame, inside the frame and before
 * it is painted. The browser can send many input events in one frame; the chart redraws once.
 */
export function useFrameCoalescer<T>(fn: (v: T) => void): (v: T) => void {
  const latest = useRef<{ v: T } | null>(null);
  const raf = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const [push] = useState(() => (v: T) => {
    latest.current = { v };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const next = latest.current;
      latest.current = null;
      if (next) flushSync(() => fnRef.current(next.v));
    });
  });
  return push;
}
