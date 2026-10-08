// QSC Atlas Labs: the Standards Cascade on a flat map, drawn as the Atlas's own map is: the
// country shapes on Natural Earth, borders 0.4px at 0.45, a jurisdiction filled in its bloc's
// colour (at its confidence) once a verified document names a NIST standard by the month shown;
// every other country is the one no-data grey, as on the Atlas map.
// Lines run from NIST as flat curves, one per jurisdiction and kind of reference; a flat curve
// never breaks at the map's edge as a great circle would. The shapes load in the browser.
// Another standards body than NIST has no seat here (geo.nist null): no square, no name and no
// line, only the countries whose documents name its standards, coloured (geoLines, 5 October 2026).

import { useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { confidenceOpacity } from '../../../../lib/process';
import { FAN, bentCurve, geoLines } from '../../../../lib/lab/cascade';
import { numericId } from '../../../../lib/lab/globe';
import type { CascadeNodeInfo, GeoView } from '../../../../lib/lab/cascade-data';
import { LinkPath } from './CascadeOrbit';
import { Tip, WorldState, tipPlace, useWorld } from './parts';
import type { Frame, TipData } from './parts';

const W = 980;
const H = 500;

interface Props {
  geo: GeoView;
  info: Record<string, CascadeNodeInfo>;
  atlas: Set<string>; // the jurisdictions the Cascade tracks (a posture, or a line)
  frame: Frame;
  copy: Record<string, string>;
  title: string;
  desc: string;
  tipFor: (iso3: string) => TipData;
  onSelect: (iso3: string | null) => void;
}

export default function CascadeMap(props: Props) {
  const { geo, info, atlas, frame, copy } = props;
  const world = useWorld();
  const [hover, setHover] = useState<{ iso: string; x: number; y: number } | null>(null);

  const shapes = useMemo(() => {
    if (!world.feats) return null;
    const projection = geoNaturalEarth1().fitSize([W, H], { type: 'FeatureCollection', features: world.feats } as any);
    const path = geoPath(projection).digits(1);
    const countries = world.feats.map((f: any, i: number) => ({ key: `${numericId(f)}-${i}`, iso: geo.ccn3[numericId(f)] ?? null, d: path(f) ?? '' }));
    const point = (ll: [number, number]) => {
      const p = projection(ll);
      return p ? ([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10] as [number, number]) : null;
    };
    const points: Record<string, [number, number]> = {};
    for (const [iso, ll] of Object.entries(geo.lonlat)) {
      const p = point(ll);
      if (p) points[iso] = p;
    }
    const withShape = new Set(countries.map((c: { iso: string | null }) => c.iso).filter(Boolean));
    return { countries, points, nist: geo.nist ? point(geo.nist) : null, pointOnly: Object.keys(points).filter((iso) => atlas.has(iso) && !withShape.has(iso)) };
  }, [world.feats, geo, atlas]);

  // one flat curve per line, bowed by kind so the lines of one jurisdiction fan apart
  const curves = useMemo(() => {
    const out: Record<string, string> = {};
    const seat = shapes?.nist;
    if (!shapes || !seat) return out;
    for (const l of geoLines(frame.links, seat)) {
      if (l.kind === 'own' || out[l.path]) continue;
      const p = shapes.points[l.from];
      if (p) out[l.path] = bentCurve(seat, p, 0.1 + 0.07 * FAN[l.kind]);
    }
    return out;
  }, [shapes, frame.links.map((l) => l.path).join(' ')]);

  if (!shapes) {
    return (
      <div className="cc-chart cc-chart--map cc-chart--waiting">
        <WorldState failed={world.failed} retry={world.retry} copy={copy} />
      </div>
    );
  }

  const fillOf = (iso: string | null) => {
    const i = iso ? info[iso] : undefined;
    if (!iso || !i || !atlas.has(iso)) return { fill: 'var(--process-none)', opacity: 1 };
    const fade = frame.faded.has(iso) ? 'var(--lab-faded)' : 1;
    if (frame.lit.has(iso) && i.postureColor) return { fill: i.postureColor, opacity: fade === 1 ? confidenceOpacity(i.confidence) : fade };
    return { fill: 'var(--process-none)', opacity: fade };
  };
  const onMove = (iso: string | null) => (e: React.PointerEvent<SVGElement>) => {
    if (!iso || !atlas.has(iso)) {
      if (hover) setHover(null);
      return;
    }
    const r = (e.currentTarget.ownerSVGElement ?? (e.currentTarget as unknown as SVGSVGElement)).getBoundingClientRect();
    setHover({ iso, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  const pick = (iso: string | null) => () => props.onSelect(iso && atlas.has(iso) ? (iso === frame.sel ? null : iso) : null);
  const outlined = [frame.sel, hover?.iso].filter((x): x is string => !!x);
  // a country with no posture has no colour to take once a document names the standards (only
  // another body's view has one today): it keeps the no-data grey and is marked open, by a dashed
  // ink edge, as the key says
  const open = new Set([...frame.lit].filter((iso) => atlas.has(iso) && info[iso] && !info[iso].postureColor));

  return (
    <div className="cc-chart cc-chart--map">
      <svg className="cc-svg cc-svg--map" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="cc-map-title cc-map-desc" onPointerLeave={() => setHover(null)}>
        <title id="cc-map-title">{props.title}</title>
        <desc id="cc-map-desc">{props.desc}</desc>
        <g className="cc-countries">
          {shapes.countries.map((c: { key: string; iso: string | null; d: string }) => {
            const f = fillOf(c.iso);
            return (
              <path
                key={c.key}
                d={c.d}
                style={{ fill: f.fill, fillOpacity: f.opacity, cursor: c.iso && atlas.has(c.iso) ? 'pointer' : 'default' }}
                onPointerMove={onMove(c.iso)}
                onClick={pick(c.iso)}
              />
            );
          })}
        </g>
        {open.size > 0 && (
          <g className="cc-country-open" aria-hidden="true">
            {shapes.countries
              .filter((c: { iso: string | null }) => c.iso && open.has(c.iso))
              .map((c: { key: string; iso: string; d: string }) => (
                <path key={c.key} d={c.d} style={{ opacity: frame.faded.has(c.iso) ? 'var(--lab-faded)' : 1 }} />
              ))}
          </g>
        )}
        <g className="cc-country-outline" aria-hidden="true">
          {shapes.countries
            .filter((c: { iso: string | null }) => c.iso && outlined.includes(c.iso))
            .map((c: { key: string; d: string }) => (
              <path key={c.key} d={c.d} />
            ))}
        </g>
        <g className="cc-lines">
          {geoLines(frame.links, shapes.nist).map((l) => (
            <LinkPath key={l.key} link={l} d={curves[l.path]} />
          ))}
        </g>
        {shapes.pointOnly.map((iso) => {
          const p = shapes.points[iso];
          const f = fillOf(iso);
          return (
            <g key={iso} className={`cc-point${outlined.includes(iso) ? ' is-on' : ''}${open.has(iso) ? ' is-open' : ''}`} onPointerMove={onMove(iso)} onClick={pick(iso)}>
              <circle cx={p[0]} cy={p[1]} r={9} className="cc-hit" />
              <circle cx={p[0]} cy={p[1]} r={3.5} style={{ fill: f.fill, fillOpacity: f.opacity }} />
              {iso === 'EUU' && (
                <text x={p[0] + 6} y={p[1] - 5} className="cc-small-label cc-halo" paintOrder="stroke">
                  {copy.euShort}
                </text>
              )}
            </g>
          );
        })}
        {frame.fork &&
          [...frame.forkNodes].map((iso) => {
            const p = shapes.points[iso];
            return p ? (
              <g key={iso} className="cc-fork-rings" aria-hidden="true">
                <circle cx={p[0]} cy={p[1]} r={7} />
                <circle cx={p[0]} cy={p[1]} r={11} />
              </g>
            ) : null;
          })}
        {shapes.nist && (
          <>
            <rect x={shapes.nist[0] - 4.5} y={shapes.nist[1] - 4.5} width={9} height={9} className="cc-centre" />
            <text x={shapes.nist[0] - 6} y={shapes.nist[1] - 8} textAnchor="end" className="cc-centre-label cc-halo" paintOrder="stroke">
              {copy.nistCentre}
            </text>
          </>
        )}
      </svg>
      {hover && <Tip tip={props.tipFor(hover.iso)} style={tipPlace(hover.x, hover.y)} />}
    </div>
  );
}
