import { useEffect, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { POSTURE_META, postureMeta, POSTURE_ORDER, ROLE_META, roleMeta, ROLE_ORDER, confidenceOpacity } from '../lib/process';

// The flat map (the planisphere), reached from the globe. The real geoNaturalEarth1
// choropleth, countries filled by coordination bloc with dark borders so each is
// legible. Hover names a country; click opens its page.

type Entry = { iso3: string; name: string; posture: string; role: string | null; confidence: string | null };
interface Props {
  mapProcess: Record<string, Entry>;
}

const POSTURE_HEX: Record<string, string> = Object.fromEntries(Object.values(POSTURE_META).map((m) => [m.key, m.color]));
const ROLE_HEX: Record<string, string> = Object.fromEntries(Object.values(ROLE_META).map((m) => [m.key, m.color]));
const NO_DATA = 'var(--process-none)';
const NO_ROLE = 'var(--process-no-role)';
const W = 980;
const H = 500;
const key = (id: unknown) => String(Number(id));

export default function WorldMap({ mapProcess }: Props) {
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ iso3: string; name: string; posture: string; role: string | null; x: number; y: number } | null>(null);
  const [colorBy, setColorBy] = useState<'posture' | 'role'>('posture');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const world = await res.json();
        if (!alive) return;
        const fc: any = feature(world, world.objects.countries);
        const feats = fc.features.filter((f: any) => String(f.id) !== '010');
        const projection = geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: feats } as any);
        const gp = geoPath(projection as any);
        setPaths(feats.map((f: any) => ({ id: key(f.id), d: gp(f) || '' })));
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const fillFor = (m: Entry | null) => {
    if (!m) return NO_DATA;
    if (colorBy === 'role') return m.role ? ROLE_HEX[m.role] ?? NO_ROLE : NO_ROLE;
    return POSTURE_HEX[m.posture] ?? NO_DATA;
  };
  const legendItems = colorBy === 'role'
    ? ROLE_ORDER.map((k) => ({ color: ROLE_META[k].color, label: ROLE_META[k].label, outline: false }))
    : POSTURE_ORDER.map((k) => ({ color: POSTURE_META[k].color, label: POSTURE_META[k].label, outline: k === 'engaged-unaligned' }));

  return (
    <div className="wm">
      <div className="wm-controls">
        <div className="wm-coloredby">
          <span className="lbl">Coloured by</span>
          <button type="button" className={colorBy === 'posture' ? 'on' : ''} onClick={() => setColorBy('posture')} aria-pressed={colorBy === 'posture'}>coordination</button>
          <button type="button" className={colorBy === 'role' ? 'on' : ''} onClick={() => setColorBy('role')} aria-pressed={colorBy === 'role'}>standards role</button>
        </div>
        <ul className="wm-legend">
          {legendItems.map((it) => (
            <li key={it.label}><span className="sw" style={it.outline ? { background: 'transparent', border: '1px solid var(--ink)' } : { background: it.color }} aria-hidden="true" />{it.label}</li>
          ))}
          {colorBy === 'posture' && <li><span className="sw sw-none" aria-hidden="true" />No data</li>}
        </ul>
      </div>

      <div style={{ position: 'relative' }}>
        {error && <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic', padding: 'var(--space-8)', textAlign: 'center' }}>The map could not be loaded. Check your connection and try again.</p>}
        {!error && !paths.length && <div style={{ height: 360, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>drawing the world&hellip;</div>}
        {!!paths.length && (
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map. Countries coloured by the cryptographic bloc they coordinate with. Click a country to open its page." style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
            {paths.map((p, idx) => {
              const m = mapProcess[p.id] ?? null;
              const hovered = hover && m && hover.iso3 === m.iso3;
              return (
                <path key={`${p.id}-${idx}`} d={p.d}
                  fill={fillFor(m)} fillOpacity={m ? confidenceOpacity(m.confidence) : 1}
                  stroke={hovered ? 'var(--ink)' : 'rgba(26,26,26,0.45)'}
                  strokeWidth={hovered ? 1.4 : 0.4}
                  style={{ cursor: m ? 'pointer' : 'default' }}
                  onMouseMove={(e) => { if (!m) { setHover(null); return; } const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ iso3: m.iso3, name: m.name, posture: m.posture, role: m.role, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
                  onClick={() => m && (window.location.href = `/countries/${m.iso3.toLowerCase()}`)} />
              );
            })}
          </svg>
        )}
        {hover && (
          <div style={{ position: 'absolute', left: `${hover.x}%`, top: `${hover.y}%`, transform: 'translate(-50%, -140%)', pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', padding: '5px 9px', borderRadius: 'var(--radius)', fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7, zIndex: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorBy === 'role' ? (hover.role ? ROLE_HEX[hover.role] ?? NO_ROLE : NO_ROLE) : POSTURE_HEX[hover.posture] ?? NO_DATA }} />
            {hover.name}
            <span style={{ opacity: 0.7 }}>{colorBy === 'role' ? (hover.role ? roleMeta(hover.role)?.label ?? '' : 'No standards role') : postureMeta(hover.posture)?.short ?? ''}</span>
          </div>
        )}
      </div>

      <style>{`
        .wm { display: grid; gap: var(--space-5); }
        .wm-controls { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-3) var(--space-6); }
        .wm-coloredby { display: flex; align-items: baseline; gap: var(--space-3); font-family: var(--font-mono); font-size: var(--text-xs); }
        .wm-coloredby .lbl { color: var(--ink-faint); }
        .wm-coloredby button { font: inherit; background: none; border: none; padding: 0 0 2px; cursor: pointer; color: var(--ink-faint); border-bottom: 2px solid transparent; }
        .wm-coloredby button:hover { color: var(--ink-muted); }
        .wm-coloredby button.on { color: var(--ink); border-bottom-color: var(--ink); }
        .wm-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); font-family: var(--font-instrument); font-size: var(--text-sm); color: var(--ink-muted); }
        .wm-legend li { display: flex; align-items: center; gap: var(--space-2); }
        .wm-legend .sw { width: 0.85em; height: 0.85em; border-radius: var(--radius-sm); display: inline-block; flex: none; }
        .wm-legend .sw-none { background: var(--process-none); }
      `}</style>
    </div>
  );
}
