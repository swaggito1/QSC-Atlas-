import { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule, geoContains } from 'd3-geo';
import { feature } from 'topojson-client';
import { POSTURE_META, postureMeta, POSTURE_ORDER, ROLE_META, roleMeta, ROLE_ORDER, confidenceOpacity } from '../lib/process';

// The hero: a fast ink-on-paper globe of the real country shapes, filled by the
// cryptographic bloc each country coordinates with (the same colours as the flat map),
// with dark borders so every country is legible. Click a country to open its page;
// click the ocean to open the full flat map. No labels drawn on the globe.

type Entry = { iso3: string; name: string; posture: string; role: string | null; confidence: string | null };
interface Props {
  mapProcess: Record<string, Entry>; // keyed by ccn3 (matches the topojson ids)
}

const POSTURE_HEX: Record<string, string> = Object.fromEntries(Object.values(POSTURE_META).map((m) => [m.key, m.color]));
const ROLE_HEX: Record<string, string> = Object.fromEntries(Object.values(ROLE_META).map((m) => [m.key, m.color]));
const NO_DATA_FILL = '#eceae3';
const NO_ROLE_HEX = '#cfcdc7';
const key = (id: unknown) => String(Number(id));

export default function HeroGlobe({ mapProcess }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const featsRef = useRef<any[]>([]);
  const projRef = useRef<any>(null);
  const colorByRef = useRef<'posture' | 'role'>('posture');
  const [colorBy, setColorBy] = useState<'posture' | 'role'>('posture');
  const [hover, setHover] = useState<{ name: string; posture: string; role: string | null; x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  colorByRef.current = colorBy;

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, R = 0, dpr = 1, raf = 0, alive = true, lambda = 82;
    const phi = -10;
    const projection = geoOrthographic().clipAngle(90).precision(0.5);
    projRef.current = projection;
    const grat = geoGraticule().step([30, 30])();
    let t0 = performance.now();

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.48;
      projection.scale(R).translate([W / 2, H / 2]);
    }

    function draw(now: number) {
      const el = now - t0;
      const eo = Math.min(1, el / 1100);
      if (!reduce) lambda = 82 - el * 0.008; // twice the earlier speed
      projection.rotate([lambda, phi]);
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
      if (!reduce && alive) raf = requestAnimationFrame(draw);
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
        if (reduce) { t0 = performance.now() - 2000; draw(performance.now()); }
        else { t0 = performance.now(); raf = requestAnimationFrame(draw); }
      } catch {
        /* leave the loading state */
      }
    })();
    const onResize = () => { if (!featsRef.current.length) return; resize(); if (reduce) draw(performance.now()); };
    window.addEventListener('resize', onResize);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [mapProcess]);

  const locate = (e: React.MouseEvent) => {
    const wrap = wrapRef.current, proj = projRef.current;
    if (!wrap || !proj) return null;
    const rect = wrap.getBoundingClientRect();
    const ll = proj.invert([e.clientX - rect.left, e.clientY - rect.top]);
    if (!ll) return { f: null, m: null }; // outside the sphere = ocean / space
    for (const f of featsRef.current) if (geoContains(f, ll)) return { f, m: mapProcess[key(f.id)] };
    return { f: null, m: null };
  };
  const onMove = (e: React.MouseEvent) => {
    const r = locate(e);
    if (r && r.m) {
      const rect = wrapRef.current!.getBoundingClientRect();
      setHover({ name: r.m.name, posture: r.m.posture, role: r.m.role, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else if (hover) setHover(null);
  };
  const onClick = (e: React.MouseEvent) => {
    const r = locate(e);
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
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        role="img"
        aria-label="A rotating globe of countries coloured by the cryptographic bloc they coordinate with. Click a country to open its page, or click the ocean to open the full flat map."
        style={{ cursor: hover ? 'pointer' : 'default' }}
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
        .hg { display: flex; flex-direction: column; gap: var(--space-4); width: 100%; }
        .hg-stage { position: relative; width: 100%; height: clamp(360px, 56vh, 600px); }
        .hg-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--ink-faint); font-size: var(--text-sm); }
        .hg-tip { position: absolute; transform: translate(-50%, -150%); pointer-events: none; background: var(--ink); color: var(--paper); padding: 5px 9px; border-radius: var(--radius); font-family: var(--font-instrument); font-size: var(--text-xs); white-space: nowrap; display: flex; align-items: center; gap: 7px; z-index: 5; }
        .hg-tip .d { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .hg-tip .m { opacity: 0.7; }
        .hg-controls { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-3) var(--space-6); }
        .hg-coloredby { display: flex; align-items: baseline; gap: var(--space-3); font-family: var(--font-mono); font-size: var(--text-xs); }
        .hg-coloredby .lbl { color: var(--ink-faint); }
        .hg-coloredby button { font: inherit; background: none; border: none; padding: 0 0 2px; cursor: pointer; color: var(--ink-faint); border-bottom: 2px solid transparent; }
        .hg-coloredby button:hover { color: var(--ink-muted); }
        .hg-coloredby button.on { color: var(--ink); border-bottom-color: var(--ink); }
        .hg-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); font-family: var(--font-instrument); font-size: var(--text-sm); color: var(--ink-muted); }
        .hg-legend li { display: flex; align-items: center; gap: var(--space-2); }
        .hg-legend .sw { width: 0.8em; height: 0.8em; border-radius: var(--radius-sm); display: inline-block; flex: none; }
      `}</style>
    </div>
  );
}
