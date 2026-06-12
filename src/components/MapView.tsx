import { useEffect, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';

// MapHero - the signature view. A real world choropleth (d3-geo Natural Earth)
// coloured by standards process. Hover gives a quiet tooltip; click opens the
// country's profile. Countries with no data recede in the faint no-data tone.
// Adapted from the QSC Atlas design system; fed from Notion at build time.

interface MapEntry {
  iso3: string;
  name: string;
  process: string;
}
interface Props {
  // keyed by ISO numeric code (no leading zeros), matching world-atlas topojson ids
  mapProcess: Record<string, MapEntry>;
}

const PROCESS_HEX: Record<string, string> = {
  NIST: '#2b4c7e',
  ETSI: '#2e7d6f',
  ISO: '#b07a2b',
  Sovereign: '#7a3b5e',
  Mixed: '#6b7280',
};
const NO_DATA = '#e7e5df';
const W = 980;
const H = 500;

const key = (id: unknown) => String(Number(id));

export default function MapView({ mapProcess }: Props) {
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<(MapEntry & { x: number; y: number }) | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const world = await res.json();
        if (!alive) return;
        const fc: any = feature(world, world.objects.countries);
        const feats = fc.features.filter((f: any) => String(f.id) !== '010'); // drop Antarctica
        const projection = geoNaturalEarth1().fitSize(
          [W, H],
          { type: 'FeatureCollection', features: feats } as any,
        );
        const gp = geoPath(projection as any);
        setPaths(feats.map((f: any) => ({ id: key(f.id), d: gp(f) || '' })));
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const metaFor = (id: string) => mapProcess[id] ?? null;
  const fillFor = (id: string) => {
    const meta = metaFor(id);
    return meta ? PROCESS_HEX[meta.process] ?? NO_DATA : NO_DATA;
  };

  return (
    <div style={{ position: 'relative' }}>
      {error && (
        <p
          style={{
            color: 'var(--ink-muted)',
            fontStyle: 'italic',
            padding: 'var(--space-8)',
            textAlign: 'center',
          }}
        >
          The map could not be loaded. Check your connection and try again.
        </p>
      )}
      {!error && !paths.length && (
        <div
          style={{
            height: 360,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--ink-faint)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
          }}
        >
          drawing the world&hellip;
        </div>
      )}
      {!!paths.length && (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="World map coloured by standards process"
          style={{ width: '100%', height: 'auto', display: 'block' }}
          onMouseLeave={() => setHover(null)}
        >
          <rect x="0" y="0" width={W} height={H} fill="transparent" />
          {paths.map((p, idx) => {
            const meta = metaFor(p.id);
            const dim = hover && meta && hover.iso3 !== meta.iso3;
            return (
              <path
                key={`${p.id}-${idx}`}
                d={p.d}
                fill={fillFor(p.id)}
                stroke={hover && meta && hover.iso3 === meta.iso3 ? '#1a1a1a' : '#f7f5f0'}
                strokeWidth={hover && meta && hover.iso3 === meta.iso3 ? 1.4 : 0.5}
                style={{ cursor: meta ? 'pointer' : 'default', transition: 'opacity 120ms' }}
                opacity={dim ? 0.82 : 1}
                onMouseMove={(e) => {
                  if (!meta) return;
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({
                    ...meta,
                    x: ((e.clientX - r.left) / r.width) * 100,
                    y: ((e.clientY - r.top) / r.height) * 100,
                  });
                }}
                onClick={() => meta && (window.location.href = `/countries/${meta.iso3.toLowerCase()}`)}
              />
            );
          })}
        </svg>
      )}
      {hover && (
        <div
          style={{
            position: 'absolute',
            left: `${hover.x}%`,
            top: `${hover.y}%`,
            transform: 'translate(-50%, -130%)',
            pointerEvents: 'none',
            background: 'var(--ink)',
            color: 'var(--paper)',
            padding: '6px 10px',
            borderRadius: 'var(--radius)',
            fontFamily: 'var(--font-instrument)',
            fontSize: 'var(--text-xs)',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            zIndex: 5,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: PROCESS_HEX[hover.process] ?? NO_DATA,
            }}
          />
          {hover.name}
          <span style={{ opacity: 0.7 }}>{hover.process}-aligned</span>
        </div>
      )}
    </div>
  );
}
