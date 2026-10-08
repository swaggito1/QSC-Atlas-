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
//
// Fixes kept from later work, with the look and behaviour of the live globe unchanged: a
// country with a profile but no posture opens its profile too (it keeps the pale fill); a press
// outside the disc counts as ocean, never as the country on the rim; on touch the page keeps
// vertical swipes (touch-action: pan-y), so a swipe that starts on the globe scrolls; the spin
// does not jump after the tab has been in the background; and only the canvas carries the image
// role, so the retry button stays reachable by a screen reader.

type Entry = { iso3: string; name: string; posture: string | null; role: string | null; confidence: string | null };
interface Props {
  mapProcess: Record<string, Entry>; // keyed by ccn3 (matches the topojson ids)
}

const POSTURE_HEX: Record<string, string> = Object.fromEntries(Object.values(POSTURE_META).map((m) => [m.key, m.color]));
const ROLE_HEX: Record<string, string> = Object.fromEntries(Object.values(ROLE_META).map((m) => [m.key, m.color]));
const NO_DATA_FILL = '#eceae3';
// the ink token (--ink, CEPS charcoal #202425) as an RGB triple, for canvas strokes with their own alpha
const INK_RGB = '32,36,37';
const NO_ROLE_HEX = '#cfcdc7';
const key = (id: unknown) => String(Number(id));
const DRAG_THRESHOLD = 4; // px of movement before a press becomes a drag rather than a click
const HOME_PHI = -10; // the resting tilt the globe eases back to after a drag
const SPIN_RATE = 0.008; // degrees of longitude per millisecond
const RETURN_EASE = 0.06; // per-frame approach to the resting orientation (~1.5s glide)
const MAX_STEP = 64; // ms: the longest step one frame may take, so a tab back from the background does not jump

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
  const [hover, setHover] = useState<{ name: string; posture: string | null; role: string | null; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
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
      // countries: a profile with no posture keeps the plain pale fill, at full strength
      ctx.globalAlpha = eo;
      for (const f of featsRef.current) {
        const m = mapProcess[key(f.id)];
        const placed = m && m.posture ? m : null;
        let fill = NO_DATA_FILL;
        if (placed) fill = colorByRef.current === 'role' ? (placed.role ? ROLE_HEX[placed.role] || NO_ROLE_HEX : NO_ROLE_HEX) : POSTURE_HEX[placed.posture as string] || NO_DATA_FILL;
        ctx.beginPath(); path(f);
        ctx.globalAlpha = (placed ? confidenceOpacity(placed.confidence) : 1) * eo;
        ctx.fillStyle = fill; ctx.fill();
        ctx.globalAlpha = eo;
        ctx.lineWidth = 0.6; ctx.strokeStyle = `rgba(${INK_RGB},0.62)`; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // rim + graticule
      ctx.beginPath(); path({ type: 'Sphere' } as any); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${INK_RGB},0.28)`; ctx.stroke();
      ctx.beginPath(); path(grat as any); ctx.lineWidth = 0.4; ctx.strokeStyle = `rgba(${INK_RGB},${0.05 * eo})`; ctx.stroke();
    }
    renderRef.current = () => render(performance.now());

    // The animation loop. The auto-spin longitude only advances in 'auto' mode, so the
    // globe always returns to the exact place it was grabbed from. 'drag' is driven by
    // the pointer handlers; 'return' eases the rendered rotation back toward that place.
    function frame(now: number) {
      if (!alive) return;
      const dt = lastNow ? Math.min(MAX_STEP, now - lastNow) : 16;
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

    // Load the country shapes from the bundled same-origin copy first (always available in
    // production), then the CDN as a fallback, with one retry each. No single network hop can
    // leave the globe stuck on the loading state.
    async function fetchJson(url: string, ms: number) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), ms);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.ok) return await res.json();
      } catch { /* aborted, offline, or bad response */ } finally {
        clearTimeout(timer);
      }
      return null;
    }
    async function loadWorld() {
      const sources = ['/world-110m.json', 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'];
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const url of sources) {
          const json = await fetchJson(url, 6000); // a stalled source can never hang the globe
          if (json?.objects?.countries) return json;
        }
      }
      return null;
    }

    (async () => {
      const world = await loadWorld();
      if (!alive) return;
      if (!world?.objects?.countries) { setFailed(true); return; }
      const fc: any = feature(world, world.objects.countries);
      featsRef.current = fc.features.filter((f: any) => String(f.id) !== '010');
      setFailed(false);
      setLoaded(true);
      resize();
      if (reduce) { t0 = performance.now() - 2000; render(performance.now()); }
      else { t0 = performance.now(); raf = requestAnimationFrame(frame); }
    })();
    const onResize = () => { if (!featsRef.current.length) return; resize(); render(performance.now()); };
    window.addEventListener('resize', onResize);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [mapProcess, reloadKey]);

  // Map a pointer position to the country (if any) under it, using the live rotation.
  const locate = (clientX: number, clientY: number) => {
    const wrap = wrapRef.current, proj = projRef.current;
    if (!wrap || !proj) return null;
    const rect = wrap.getBoundingClientRect();
    // The stage is CSS-scaled by the scroll choreography, so the visual rect differs from the
    // layout size the projection draws at. Divide back to layout pixels before inverting.
    const sx = rect.width / (wrap.clientWidth || rect.width);
    const sy = rect.height / (wrap.clientHeight || rect.height);
    const x = (clientX - rect.left) / sx;
    const y = (clientY - rect.top) / sy;
    // Outside the disc is ocean or space: invert would clamp the point onto the rim and find
    // the country drawn there.
    const [cx, cy] = proj.translate();
    if (Math.hypot(x - cx, y - cy) > proj.scale()) return { f: null, m: null };
    const ll = proj.invert([x, y]);
    if (!ll) return { f: null, m: null };
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

  // A drag that ends, or a press the browser takes over, eases back to the resting orientation.
  const settle = () => {
    setDragging(false);
    if (reduceRef.current) { dispRef.current = [autoRef.current, HOME_PHI]; modeRef.current = 'auto'; renderRef.current(); }
    else modeRef.current = 'return';
  };

  const onPointerUp = (e: React.PointerEvent) => {
    try { wrapRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    const moved = movedRef.current;
    movedRef.current = false;
    if (moved) {
      // It was a drag: never open a page. Ease back to the resting orientation, then spin.
      settle();
      return;
    }
    if (modeRef.current !== 'hold') return;
    const r = locate(e.clientX, e.clientY);
    if (r && r.m) window.location.href = `/countries/${r.m.iso3.toLowerCase()}`;
    else window.location.href = '/map';
  };

  // The browser took the gesture (a vertical swipe on touch scrolls the page): let go, open nothing.
  const onPointerCancel = () => {
    const moved = movedRef.current;
    movedRef.current = false;
    if (moved) settle();
    else if (modeRef.current === 'hold') modeRef.current = 'auto';
  };

  const legendItems = colorBy === 'role'
    ? ROLE_ORDER.map((k) => ({ color: ROLE_META[k].color, label: ROLE_META[k].label, outline: false }))
    : POSTURE_ORDER.map((k) => ({ color: POSTURE_META[k].color, label: POSTURE_META[k].label, outline: false }));

  const hoverDot = hover
    ? colorBy === 'role'
      ? hover.role ? ROLE_HEX[hover.role] || NO_ROLE_HEX : NO_ROLE_HEX
      : (hover.posture && POSTURE_HEX[hover.posture]) || 'var(--ink-faint)'
    : '';

  return (
    <div className="hg">
      <div
        className="hg-stage"
        ref={wrapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={() => setHover(null)}
        style={{ cursor: dragging ? 'grabbing' : hover ? 'pointer' : 'grab' }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="A rotating globe of countries coloured by the cryptographic bloc they coordinate with. Click a country to open its page, click the ocean to open the full flat map, or drag to rotate the globe."
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
        {!loaded && !failed && <div className="hg-loading mono">composing the world&hellip;</div>}
        {failed && (
          <div className="hg-loading mono">
            couldn&rsquo;t load the map.{' '}
            <button
              type="button"
              className="hg-retry"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setFailed(false); setLoaded(false); setReloadKey((k) => k + 1); }}
            >retry</button>
          </div>
        )}
        {hover && (
          <div className="hg-tip" style={{ left: hover.x, top: hover.y }}>
            <span className="d" style={{ background: hoverDot }} />
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
        .hg-stage { position: relative; width: 100%; flex: 1 1 auto; min-height: 0; touch-action: pan-y pinch-zoom; }
        .hg-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--ink-faint); font-size: var(--text-sm); }
        .hg-retry { font: inherit; color: var(--accent); background: none; border: none; padding: 0 0 2px; margin-left: 2px; cursor: pointer; border-bottom: 1px solid var(--accent); }
        .hg-retry:hover { color: var(--accent-strong); border-bottom-color: var(--accent-strong); }
        .hg-tip { position: absolute; transform: translate(-50%, -150%); pointer-events: none; background: var(--ink); color: var(--paper); padding: 5px 9px; border-radius: var(--radius); font-family: var(--font-instrument); font-size: var(--text-xs); white-space: nowrap; display: flex; align-items: center; gap: 7px; z-index: 5; }
        .hg-tip .d { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .hg-tip .m { opacity: 0.7; }
        .hg-controls { flex: none; display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-3) var(--space-6); max-width: 100%; }
        .hg-coloredby { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-3); font-family: var(--font-instrument); font-size: var(--text-label); min-width: 0; }
        .hg-coloredby .lbl { color: var(--ink-muted); }
        .hg-coloredby button { font: inherit; background: none; border: none; padding: 0 0 2px; cursor: pointer; color: var(--ink-muted); border-bottom: 2px solid transparent; }
        .hg-coloredby button:hover { color: var(--ink); }
        .hg-coloredby button.on { color: var(--ink); font-weight: var(--weight-semibold); border-bottom-color: var(--accent); }
        /* the legend wraps inside its box at any width: no item may hold the line wider than the box */
        .hg-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); min-width: 0; max-width: 100%; font-family: var(--font-instrument); font-size: var(--text-sm); color: var(--ink-muted); }
        .hg-legend li { display: flex; align-items: center; gap: var(--space-2); min-width: 0; overflow-wrap: anywhere; }
        .hg-legend .sw { width: 0.8em; height: 0.8em; border-radius: var(--radius-sm); display: inline-block; flex: none; }
        @media (max-width: 860px) {
          .hg { height: auto; }
          .hg-stage { flex: 0 0 auto; height: clamp(320px, 58vh, 520px); }
        }
      `}</style>
    </div>
  );
}
