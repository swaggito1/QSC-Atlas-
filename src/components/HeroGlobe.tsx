import { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import { POSTURE_META, postureMeta, POSTURE_ORDER, ROLE_META, roleMeta, ROLE_ORDER, confidenceOpacity } from '../lib/process';

// The hero: a fast ink-on-paper globe of the real country shapes, filled by the
// cryptographic bloc each country coordinates with (the same colours as the flat map),
// with dark borders so every country is legible. It auto-spins gently. Click a country
// to open its page; click the ocean to open the full flat map. Click and drag to rotate
// the globe by hand (a drag never opens a country); on release it eases back to its
// original orientation and resumes the slow auto-spin.

type Entry = { iso3: string; name: string; posture: string; role: string | null; confidence: string | null };
interface Props {
  mapProcess: Record<string, Entry>; // keyed by ccn3 (matches the topojson ids)
}

const POSTURE_HEX: Record<string, string> = Object.fromEntries(Object.values(POSTURE_META).map((m) => [m.key, m.color]));
const ROLE_HEX: Record<string, string> = Object.fromEntries(Object.values(ROLE_META).map((m) => [m.key, m.color]));
const NO_DATA_FILL = '#eceae3';
const NO_ROLE_HEX = '#cfcdc7';
const key = (id: unknown) => String(Number(id));
const DRAG_THRESHOLD = 4; // px of movement before a press becomes a drag rather than a click
const HOME_PHI = -10; // the resting tilt the globe eases back to after a drag
const SPIN_RATE = 0.008; // degrees of longitude per millisecond
const RETURN_EASE = 0.06; // per-frame approach to the resting orientation (~1.5s glide)

// Shortest signed angular distance from a to b, in (-180, 180].
const angleDelta = (from: number, to: number) => (((to - from + 180) % 360) + 360) % 360 - 180;

export default function HeroGlobe({ mapProcess }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const featsRef = useRef<any[]>([]);
  const projRef = useRef<any>(null);
  const dispRef = useRef<[number, number]>([82, HOME_PHI]); // the rotation actually rendered
  const autoRef = useRef<number>(82); // the auto-spin longitude; frozen while the user holds the globe
  const renderRef = useRef<() => void>(() => {});
  const reduceRef = useRef(false);
  const colorByRef = useRef<'posture' | 'role'>('posture');
  // Interaction state machine: auto-spin, a stationary hold, an active drag, or easing home.
  const modeRef = useRef<'auto' | 'hold' | 'drag' | 'return'>('auto');
  const movedRef = useRef(false);
  const startPtRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastPtRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [colorBy, setColorBy] = useState<'posture' | 'role'>('posture');
  const [hover, setHover] = useState<{ name: string; posture: string; role: string | null; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  colorByRef.current = colorBy;

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    reduceRef.current = reduce;
    let W = 0, H = 0, R = 0, dpr = 1, raf = 0, alive = true;
    const projection = geoOrthographic().clipAngle(90).precision(0.5);
    projRef.current = projection;
    const grat = geoGraticule().step([30, 30])();
    let t0 = performance.now();
    let lastNow = 0;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.48;
      projection.scale(R).translate([W / 2, H / 2]);
    }

    // Paint one frame at the current rotation. Pure: callers decide when rotation changes.
    function render(now: number) {
      const eo = reduce ? 1 : Math.min(1, (now - t0) / 1100);
      projection.rotate(dispRef.current);
      const path = geoPath(projection as any, ctx as any);
      ctx.clearRect(0, 0, W, H);
      // ocean
      ctx.beginPath(); path({ type: 'Sphere' } as any); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
      // countries
      ctx.globalAlpha = eo;
      for (const f of featsRef.current) {
        const m = mapProcess[key(f.id)];
        let fill = NO_DATA_FILL;
        if (m) fill = colorByRef.current === 'role' ? (m.role ? ROLE_HEX[m.role] || NO_ROLE_HEX : NO_ROLE_HEX) : POSTURE_HEX[m.posture] || NO_DATA_FILL;
        ctx.beginPath(); path(f);
        ctx.globalAlpha = (m ? confidenceOpacity(m.confidence) : 1) * eo;
        ctx.fillStyle = fill; ctx.fill();
        ctx.globalAlpha = eo;
        ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(26,26,26,0.62)'; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // rim + graticule
      ctx.beginPath(); path({ type: 'Sphere' } as any); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(26,26,26,0.28)'; ctx.stroke();
      ctx.beginPath(); path(grat as any); ctx.lineWidth = 0.4; ctx.strokeStyle = `rgba(26,26,26,${0.05 * eo})`; ctx.stroke();
    }
    renderRef.current = () => render(performance.now());

    // The animation loop. The auto-spin longitude only advances in 'auto' mode, so the
    // globe always returns to the exact place it was grabbed from. 'drag' is driven by
    // the pointer handlers; 'return' eases the rendered rotation back toward that place.
    function frame(now: number) {
      if (!alive) return;
      const dt = lastNow ? now - lastNow : 16;
      lastNow = now;
      const mode = modeRef.current;
      if (mode === 'auto') {
        autoRef.current -= SPIN_RATE * dt;
        dispRef.current = [autoRef.current, HOME_PHI];
      } else if (mode === 'return') {
        const [lam, ph] = dispRef.current;
        const dLam = angleDelta(lam, autoRef.current);
        const dPhi = HOME_PHI - ph;
        if (Math.abs(dLam) < 0.4 && Math.abs(dPhi) < 0.4) {
          modeRef.current = 'auto';
          dispRef.current = [autoRef.current, HOME_PHI];
        } else {
          dispRef.current = [lam + dLam * RETURN_EASE, ph + dPhi * RETURN_EASE];
        }
      }
      // 'hold' and 'drag' leave dispRef as the pointer handlers set it.
      render(now);
      raf = requestAnimationFrame(frame);
    }

    (async () => {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const world = await res.json();
        if (!alive) return;
        const fc: any = feature(world, world.objects.countries);
        featsRef.current = fc.features.filter((f: any) => String(f.id) !== '010');
        setLoaded(true);
        resize();
        if (reduce) { t0 = performance.now() - 2000; render(performance.now()); }
        else { t0 = performance.now(); raf = requestAnimationFrame(frame); }
      } catch {
        /* leave the loading state */
      }
    })();
    const onResize = () => { if (!featsRef.current.length) return; resize(); render(performance.now()); };
    window.addEventListener('resize', onResize);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [mapProcess]);

  // Map a pointer position to the country (if any) under it, using the live rotation.
  const locate = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current, proj = projRef.current;
    if (!wrap || !proj) return null;
    const rect = wrap.getBoundingClientRect();
    const ll = proj.invert([clientX - rect.left, clientY - rect.top]);
    if (!ll) return { f: null, m: null }; // outside the sphere = ocean / space
    for (const f of featsRef.current) if (geoContains(f, ll)) return { f, m: mapProcess[key(f.id)] };
    return { f: null, m: null };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== undefined && e.button !== 0) return; // left button / touch only
    try { wrapRef.current?.setPointerCapture?.(e.pointerId); } catch { /* no live pointer */ }
    modeRef.current = 'hold'; // freeze the spin so a click resolves to a stable position
    movedRef.current = false;
    startPtRef.current = { x: e.clientX, y: e.clientY };
    lastPtRef.current = { x: e.clientX, y: e.clientY };
    setHover(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (modeRef.current === 'hold' || modeRef.current === 'drag') {
      // Below the threshold the press is still a potential click: don't move the globe.
      if (!movedRef.current) {
        if (Math.hypot(e.clientX - startPtRef.current.x, e.clientY - startPtRef.current.y) < DRAG_THRESHOLD) return;
        movedRef.current = true;
        modeRef.current = 'drag';
        setDragging(true);
        lastPtRef.current = { x: e.clientX, y: e.clientY };
      }
      const k = 75 / (projRef.current?.scale() || 300); // degrees per pixel
      const dx = e.clientX - lastPtRef.current.x;
      const dy = e.clientY - lastPtRef.current.y;
      lastPtRef.current = { x: e.clientX, y: e.clientY };
      const [lam, ph] = dispRef.current;
      dispRef.current = [lam + dx * k, Math.max(-90, Math.min(90, ph - dy * k))];
      if (reduceRef.current) renderRef.current(); // no loop under reduced motion
      return;
    }
    // Not interacting: surface the hover tooltip for the country under the cursor.
    const r = locate(e.clientX, e.clientY);
    if (r && r.m) {
      const rect = wrapRef.current!.getBoundingClientRect();
      setHover({ name: r.m.name, posture: r.m.posture, role: r.m.role, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else if (hover) setHover(null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try { wrapRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    const moved = movedRef.current;
    movedRef.current = false;
    if (moved) {
      // It was a drag: never navigate. Ease back to the resting orientation, then spin.
      setDragging(false);
      if (reduceRef.current) { dispRef.current = [autoRef.current, HOME_PHI]; modeRef.current = 'auto'; renderRef.current(); }
      else modeRef.current = 'return';
      return;
    }
    if (modeRef.current !== 'hold') return;
    const r = locate(e.clientX, e.clientY);
    if (r && r.m) window.location.href = `/countries/${r.m.iso3.toLowerCase()}`;
    else window.location.href = '/map';
  };

  const legendItems = colorBy === 'role'
    ? ROLE_ORDER.map((k) => ({ color: ROLE_META[k].color, label: ROLE_META[k].label, outline: false }))
    : POSTURE_ORDER.map((k) => ({ color: POSTURE_META[k].color, label: POSTURE_META[k].label, outline: false }));

  return (
    <div className="hg">
      <div
        className="hg-stage"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="A rotating globe of countries coloured by the cryptographic bloc they coordinate with. Click a country to open its page, click the ocean to open the full flat map, or drag to rotate the globe."
        style={{ cursor: dragging ? 'grabbing' : hover ? 'pointer' : 'grab' }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        {!loaded && <div className="hg-loading mono">composing the world&hellip;</div>}
        {hover && (
          <div className="hg-tip" style={{ left: hover.x, top: hover.y }}>
            <span className="d" style={{ background: colorBy === 'role' ? (hover.role ? ROLE_HEX[hover.role] || NO_ROLE_HEX : NO_ROLE_HEX) : POSTURE_HEX[hover.posture] || 'var(--ink-faint)' }} />
            {hover.name}
            <span className="m">{colorBy === 'role' ? (hover.role ? roleMeta(hover.role)?.label ?? '' : 'No standards role') : postureMeta(hover.posture)?.short ?? ''}</span>
          </div>
        )}
      </div>

      <div className="hg-controls">
        <div className="hg-coloredby">
          <span className="lbl">Coloured by</span>
          <button type="button" className={colorBy === 'posture' ? 'on' : ''} onClick={() => setColorBy('posture')} aria-pressed={colorBy === 'posture'}>coordination</button>
          <button type="button" className={colorBy === 'role' ? 'on' : ''} onClick={() => setColorBy('role')} aria-pressed={colorBy === 'role'}>standards role</button>
        </div>
        <ul className="hg-legend">
          {legendItems.map((it) => (
            <li key={it.label}><span className="sw" style={{ background: it.color }} aria-hidden="true" />{it.label}</li>
          ))}
        </ul>
      </div>

      <style>{`
        .hg { display: flex; flex-direction: column; gap: var(--space-4); width: 100%; height: 100%; }
        .hg-stage { position: relative; width: 100%; flex: 1 1 auto; min-height: 0; touch-action: none; }
        .hg-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--ink-faint); font-size: var(--text-sm); }
        .hg-tip { position: absolute; transform: translate(-50%, -150%); pointer-events: none; background: var(--ink); color: var(--paper); padding: 5px 9px; border-radius: var(--radius); font-family: var(--font-instrument); font-size: var(--text-xs); white-space: nowrap; display: flex; align-items: center; gap: 7px; z-index: 5; }
        .hg-tip .d { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .hg-tip .m { opacity: 0.7; }
        .hg-controls { flex: none; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-3) var(--space-6); }
        .hg-coloredby { display: flex; align-items: baseline; gap: var(--space-3); font-family: var(--font-mono); font-size: var(--text-xs); }
        .hg-coloredby .lbl { color: var(--ink-faint); }
        .hg-coloredby button { font: inherit; background: none; border: none; padding: 0 0 2px; cursor: pointer; color: var(--ink-faint); border-bottom: 2px solid transparent; }
        .hg-coloredby button:hover { color: var(--ink-muted); }
        .hg-coloredby button.on { color: var(--ink); border-bottom-color: var(--ink); }
        .hg-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); font-family: var(--font-instrument); font-size: var(--text-sm); color: var(--ink-muted); }
        .hg-legend li { display: flex; align-items: center; gap: var(--space-2); }
        .hg-legend .sw { width: 0.8em; height: 0.8em; border-radius: var(--radius-sm); display: inline-block; flex: none; }
        @media (max-width: 860px) {
          .hg { height: auto; }
          .hg-stage { flex: 0 0 auto; height: clamp(320px, 58vh, 520px); }
        }
      `}</style>
    </div>
  );
}
