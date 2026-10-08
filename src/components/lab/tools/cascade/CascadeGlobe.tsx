// QSC Atlas: the Standards Cascade on a globe, drawn with the Atlas's own globe parts
// (globe.ts: HeroGlobe's constants, loader, base, rim, drag and keys). The keyboard turns it with
// the arrow keys once it has focus, and the country list under it selects without a pointer. An orthographic canvas, the real
// country shapes in ink on paper, a faint graticule and a hairline rim; flat fills, no shading,
// glow or spin. A jurisdiction takes its bloc's colour once a verified document names a NIST
// standard by the month shown (every other country is the one no-data grey); lines from NIST follow great circles, one per jurisdiction and
// kind of reference, trimmed at the horizon. The canvas draws only when something changes, and
// eases round to a selected jurisdiction (a single jump under reduced motion). Another standards
// body than NIST has no seat here (geo.nist null): no square, no name and no line, only the
// countries whose documents name its standards, coloured (geoLines, 5 October 2026).

import { useEffect, useMemo, useRef, useState } from 'react';
import { geoContains, geoPath } from 'd3-geo';
import { confidenceOpacity } from '../../../../lib/process';
import { FAN, LINK_ALPHA, bentArc, geoLines, linkWidth } from '../../../../lib/lab/cascade';
import { GLOBE, angleDelta, attachDrag, attachKeys, drawBase, drawRim, facing, fitCanvas, makeProjection, numericId, token } from '../../../../lib/lab/globe';
import type { CascadeNodeInfo, GeoView } from '../../../../lib/lab/cascade-data';
import { Tip, WorldState, tipPlace, useWorld } from './parts';
import type { Frame, TipData } from './parts';

interface Props {
  geo: GeoView;
  info: Record<string, CascadeNodeInfo>;
  atlas: Set<string>;
  frame: Frame;
  copy: Record<string, string>;
  tipFor: (iso3: string) => TipData;
  onSelect: (iso3: string | null) => void;
}

const START: [number, number] = [35, -35]; // the view opens over the North Atlantic: NIST, Europe and the lines between

/** The ink token (global.css --ink) at an opacity, for the canvas, which cannot read a CSS variable. */
function inkAt(alpha: number): string {
  const hex = token('--ink', '#202425').replace('#', '');
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(32,36,37,${alpha})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
const facingRotation = (ll: [number, number]): [number, number] => [-ll[0], Math.max(-60, Math.min(60, -ll[1]))];

export default function CascadeGlobe(props: Props) {
  const world = useWorld();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const projection = useMemo(() => makeProjection(), []);
  const size = useRef({ w: 0, h: 0 });
  const rot = useRef<[number, number]>(props.frame.sel && props.geo.lonlat[props.frame.sel] ? facingRotation(props.geo.lonlat[props.frame.sel]) : START);
  const target = useRef<[number, number] | null>(null);
  const raf = useRef(0);
  const hoverRef = useRef<string | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [tip, setTip] = useState<{ iso: string; x: number; y: number } | null>(null);
  const [grab, setGrab] = useState<'grab' | 'pointer'>('grab');

  // the lines' great circles, bowed apart by kind; computed once per line, not per frame
  const arcs = useMemo(() => {
    const out: Record<string, ReturnType<typeof bentArc>> = {};
    const seat = props.geo.nist;
    if (!seat) return out;
    for (const l of geoLines(props.frame.links, seat)) {
      const to = props.geo.lonlat[l.from];
      if (l.kind === 'own' || !to || out[l.path]) continue;
      out[l.path] = bentArc(seat, to, 0.06 + 0.06 * FAN[l.kind]);
    }
    return out;
  }, [props.frame.links.map((l) => l.path).join(' '), props.geo]);
  const arcsRef = useRef(arcs);
  arcsRef.current = arcs;

  const shapes = useMemo(() => new Set((world.feats ?? []).map((f) => props.geo.ccn3[numericId(f)]).filter(Boolean)), [world.feats, props.geo]);
  const pointOnly = useMemo(() => Object.keys(props.geo.lonlat).filter((iso) => props.atlas.has(iso) && !shapes.has(iso)), [shapes, props.geo, props.atlas]);
  const pointOnlyRef = useRef(pointOnly);
  pointOnlyRef.current = pointOnly;

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const feats = world.feats;
    if (!canvas || !ctx || !feats || !size.current.w) return;
    const { geo, info, atlas, frame, copy } = propsRef.current;
    const { w, h } = size.current;
    projection.rotate(rot.current);
    const path = geoPath(projection, ctx);
    const none = token('--process-none', '#e7e5df');
    const faint = token('--ink-faint', '#66696a');
    const faded = Number(token('--lab-faded', '0.18')) || 0.18;
    const styleOf = (iso: string | undefined) => {
      const i = iso ? info[iso] : undefined;
      if (!iso || !i || !atlas.has(iso)) return { fill: none, alpha: 1 };
      const k = frame.faded.has(iso) ? faded : 1;
      if (frame.lit.has(iso) && i.postureColor) return { fill: i.postureColor, alpha: confidenceOpacity(i.confidence) * k };
      return { fill: none, alpha: k };
    };

    drawBase(ctx, path, feats, (f) => styleOf(geo.ccn3[numericId(f)]), w, h);

    // a country with no posture has no colour to take once a document names the standards (only
    // another body's view has one today): it keeps the no-data grey and is marked open, by a
    // dashed ink edge, as the key says
    const isOpen = (iso: string | undefined) => !!iso && atlas.has(iso) && frame.lit.has(iso) && !!info[iso] && !info[iso].postureColor;
    for (const f of feats) {
      const iso = geo.ccn3[numericId(f)];
      if (!isOpen(iso)) continue;
      ctx.beginPath();
      path(f);
      ctx.globalAlpha = frame.faded.has(iso) ? faded : 1;
      ctx.lineWidth = 1;
      ctx.strokeStyle = inkAt(0.9);
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    // the selected and the hovered jurisdiction, outlined in ink over their neighbours
    const outlined = [frame.sel, hoverRef.current].filter(Boolean);
    for (const f of feats) {
      if (!outlined.includes(geo.ccn3[numericId(f)])) continue;
      ctx.beginPath();
      path(f);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = inkAt(0.95);
      ctx.stroke();
    }

    // lines from NIST, over the countries and under the rim
    for (const l of frame.links) {
      const geom = arcsRef.current[l.path];
      if (!geom || l.docs === 0) continue;
      ctx.beginPath();
      path(geom);
      ctx.globalAlpha = l.dim ? faded : 1;
      ctx.lineWidth = linkWidth(l.docs);
      ctx.strokeStyle = l.lead ? faint : inkAt(LINK_ALPHA[l.kind]);
      ctx.setLineDash(l.lead ? [1, 3] : l.pre ? [3, 3] : []);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // jurisdictions too small for the shapes at this scale, and the European Union, as points
    ctx.font = '400 13px "Spline Sans Mono", ui-monospace, monospace'; // 0.8rem at the least, as every label
    for (const iso of pointOnlyRef.current) {
      const ll = geo.lonlat[iso];
      if (!facing(projection, ll)) continue;
      const p = projection(ll);
      if (!p) continue;
      const s = styleOf(iso);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.fill;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = outlined.includes(iso) ? 1.4 : GLOBE.countryStroke;
      ctx.strokeStyle = inkAt(outlined.includes(iso) ? 0.95 : GLOBE.countryStrokeAlpha);
      ctx.stroke();
      if (iso === 'EUU') {
        // a paper edge keeps the label legible over a filled country, as the SVG labels have
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = token('--paper', '#f7f5f0');
        ctx.strokeText(copy.euShort, p[0] + 6, p[1] - 5);
        ctx.fillStyle = token('--ink', '#202425');
        ctx.fillText(copy.euShort, p[0] + 6, p[1] - 5);
      }
    }

    // the fork view rings the jurisdictions running a national process, in ink
    if (frame.fork) {
      for (const iso of frame.forkNodes) {
        const ll = geo.lonlat[iso];
        if (!ll || !facing(projection, ll)) continue;
        const p = projection(ll);
        if (!p) continue;
        for (const r of [7, 11]) {
          ctx.beginPath();
          ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx.lineWidth = 0.75;
          ctx.strokeStyle = inkAt(0.6);
          ctx.stroke();
        }
      }
    }

    // NIST: the small ink square at the centre of the orbit (another body has no seat here)
    if (geo.nist && facing(projection, geo.nist)) {
      const n = projection(geo.nist);
      if (n) {
        ctx.fillStyle = token('--ink', '#202425');
        ctx.fillRect(n[0] - 4.5, n[1] - 4.5, 9, 9);
        ctx.font = '400 13px "Spline Sans Mono", ui-monospace, monospace'; // mono is loaded at 400 only
        ctx.fillText(copy.nistCentre, n[0] + 8, n[1] + 4);
      }
    }
    drawRim(ctx, path);
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // size the canvas to its box, and again whenever the box changes
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !world.feats) return;
    const fit = () => {
      size.current = fitCanvas(canvas, ctx, projection);
      drawRef.current();
    };
    fit();
    // a canvas keeps the face it drew with: when the shapes arrive before the mono face, the
    // NIST and EU labels are drawn again once it has loaded
    let alive = true;
    document.fonts?.ready.then(() => {
      if (alive) drawRef.current();
    });
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [world.feats, projection]);

  // pointer: drag turns the globe, a click without a drag selects, hover names
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !world.feats) return;
    const feats = world.feats;
    const locate = (x: number, y: number): string | null => {
      const { geo, atlas } = propsRef.current;
      for (const iso of pointOnlyRef.current) {
        const ll = geo.lonlat[iso];
        const p = facing(projection, ll) ? projection(ll) : null;
        if (p && Math.hypot(p[0] - x, p[1] - y) < 9) return iso;
      }
      const ll = projection.invert?.([x, y]);
      if (!ll) return null;
      for (const f of feats) {
        if (geoContains(f, ll)) {
          const iso = geo.ccn3[numericId(f)];
          return iso && atlas.has(iso) ? iso : null;
        }
      }
      return null;
    };
    const setHover = (iso: string | null, x = 0, y = 0) => {
      const changed = iso !== hoverRef.current;
      hoverRef.current = iso;
      setGrab(iso ? 'pointer' : 'grab');
      const { w, h } = size.current;
      setTip(iso ? { iso, x: (x / w) * 100, y: (y / h) * 100 } : null);
      if (changed) drawRef.current();
    };
    // a touch that ends in a scroll is cancelled by the browser, and a cancel is never a click:
    // these listeners run before attachDrag's, which would otherwise treat it as one
    const cancelled = { current: false };
    const onDown = () => {
      cancelled.current = false;
    };
    const onCancel = () => {
      cancelled.current = true;
    };
    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointercancel', onCancel, true);
    const detach = attachDrag(canvas, {
      scale: () => projection.scale(),
      rotation: () => rot.current,
      rotate: (r) => {
        target.current = null;
        rot.current = r;
        if (hoverRef.current) setHover(null);
        drawRef.current();
      },
      click: (x, y) => {
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        const iso = locate(x, y);
        const { frame, onSelect } = propsRef.current;
        onSelect(iso && iso === frame.sel ? null : iso);
      },
      hover: (x, y) => setHover(locate(x, y), x, y),
      leave: () => setHover(null),
    });
    // the arrow keys turn it a step at a time, as a drag would; Home faces the opening view again
    const detachKeys = attachKeys(canvas, {
      rotation: () => rot.current,
      rotate: (r) => {
        target.current = null;
        rot.current = r;
        if (hoverRef.current) setHover(null);
        drawRef.current();
      },
      home: START,
    });
    return () => {
      detach();
      detachKeys();
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointercancel', onCancel, true);
    };
  }, [world.feats, projection]);

  // a new frame: draw once
  useEffect(() => {
    drawRef.current();
  }, [props.frame, pointOnly]);

  // a new selection: ease round to face it, or jump under reduced motion
  useEffect(() => {
    const ll = props.frame.sel ? props.geo.lonlat[props.frame.sel] : null;
    if (!ll) return;
    const goal = facingRotation(ll);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rot.current = goal;
      drawRef.current();
      return;
    }
    target.current = goal;
    const tick = () => {
      const t = target.current;
      if (!t) {
        raf.current = 0;
        return;
      }
      const [l, p] = rot.current;
      const dl = angleDelta(l, t[0]);
      const dp = t[1] - p;
      if (Math.abs(dl) < 0.3 && Math.abs(dp) < 0.3) {
        rot.current = t;
        target.current = null;
        raf.current = 0;
        drawRef.current();
        return;
      }
      rot.current = [l + dl * GLOBE.ease, p + dp * GLOBE.ease];
      drawRef.current();
      raf.current = requestAnimationFrame(tick);
    };
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  }, [props.frame.sel, props.geo]);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );

  return (
    <div className="cc-chart cc-chart--globe">
      <canvas ref={canvasRef} className="cc-globe-canvas" style={{ cursor: grab }} role="img" aria-label={props.copy.globeLabel} tabIndex={world.feats ? 0 : -1} />
      {!world.feats && <WorldState failed={world.failed} retry={world.retry} copy={props.copy} />}
      {tip && <Tip tip={props.tipFor(tip.iso)} style={tipPlace(tip.x, tip.y)} />}
    </div>
  );
}
