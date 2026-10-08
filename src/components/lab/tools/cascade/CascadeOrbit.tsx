// QSC Atlas Labs: the Standards Cascade as an orbit. Every position comes from the build
// (cascade-layout.ts); this component only decides what a frame shows. NIST is the square at the
// centre; rings are years; a jurisdiction is placed at the date of its first verified document naming
// a NIST standard, in its bloc's sector, with a marker whose shape is the role it plays. Lines
// run from NIST, one per kind of reference, their weight the number of documents.
// The markers are one tab stop: the arrow keys move between them in the order they sit round
// the ring, and Enter or Space selects. Every word carries a paper halo set as an attribute, so
// the downloaded image keeps it; each name has a second place for the phone size, where the
// words are drawn twice as large, and each year label says at which sizes it shows. The sector
// names are set in sentence case in the interface face, as every label on the site is.

import { useRef, useState } from 'react';
import { POSTURE_META } from '../../../../lib/process';
import type { CoordinationPosture } from '../../../../lib/process';
import { LINK_ALPHA, linkWidth, onOrBefore } from '../../../../lib/lab/cascade';
import { CENTRE, VIEW } from '../../../../lib/lab/cascade-layout';
import type { LabelSpot, NationalMark, OrbitLayout } from '../../../../lib/lab/cascade-layout';
import type { CascadeNodeInfo } from '../../../../lib/lab/cascade-data';
import { Marker, Tip, tipPlace } from './parts';
import type { Frame, FrameLink, TipData } from './parts';

interface Props {
  orbit: OrbitLayout;
  frame: Frame;
  info: Record<string, CascadeNodeInfo>;
  copy: Record<string, string>;
  t: string; // the month shown
  active: Set<string>; // jurisdictions with a line at this frame
  nodeFaded: Set<string>;
  centreText: string;
  title: string;
  desc: string;
  ariaFor: (iso3: string) => string;
  tipFor: (iso3: string) => TipData;
  onSelect: (iso3: string) => void;
}

const pct = (v: number, o: number, span: number) => ((v - o) / span) * 100;

/**
 * A line; in the fork view a line to a national standard is drawn at least 2px wide. A line with
 * no document by the month shown is not drawn; it appears whole when the month reaches it, never
 * drawing itself on.
 */
export function LinkPath({ link, d, emphasis = false, className = '' }: { link: FrameLink; d: string | undefined; emphasis?: boolean; className?: string }) {
  if (!d) return null;
  const on = link.docs > 0;
  const width = emphasis ? Math.max(2, linkWidth(link.docs)) : linkWidth(link.docs);
  return (
    <path
      d={d}
      className={`cc-link cc-link--${link.kind}${link.pre ? ' is-pre' : ''}${link.lead ? ' is-lead' : ''}${className ? ` ${className}` : ''}`}
      style={{
        strokeWidth: `calc(${width}px * var(--cc-k, 1))`,
        strokeOpacity: link.lead ? undefined : LINK_ALPHA[link.kind],
        opacity: !on ? 0 : link.dim ? 'var(--lab-faded)' : 1,
      }}
    />
  );
}

/** A word on the chart with its paper halo, at its wide place and its phone place. */
function Label({ wide, phone, className, children }: { wide: LabelSpot; phone: LabelSpot; className: string; children: string }) {
  return (
    <>
      <text x={wide.x} y={wide.y} textAnchor={wide.anchor} className={`${className} cc-halo cc-at-wide`} paintOrder="stroke">
        {children}
      </text>
      <text x={phone.x} y={phone.y} textAnchor={phone.anchor} className={`${className} cc-halo cc-at-phone`} paintOrder="stroke">
        {children}
      </text>
    </>
  );
}

export default function CascadeOrbit(props: Props) {
  const { orbit, frame, info, copy, t, active, nodeFaded } = props;
  const [hover, setHover] = useState<string | null>(null);
  const [focusIso, setFocusIso] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGGElement>());
  const hovered = hover ? orbit.nodes.find((n) => n.iso3 === hover) ?? null : null;
  const sectorLabel = (key: string) => (key === 'none' ? copy.noPosture : POSTURE_META[key as CoordinationPosture]?.label ?? key);
  // the national marks appear from the first dated record of their process
  const nationalOn = (m: NationalMark) => !!m.since && onOrBefore(m.since, t);

  // one tab stop for every marker: the focused one, else the selected one, else the first
  const order = orbit.nodes; // the layout lists them round the ring, from the top, clockwise
  const stop = order.some((n) => n.iso3 === focusIso) ? focusIso : frame.sel ?? order[0]?.iso3 ?? null;
  const move = (from: string, to: number | 'first' | 'last') => {
    const i = order.findIndex((n) => n.iso3 === from);
    const j = to === 'first' ? 0 : to === 'last' ? order.length - 1 : (i + to + order.length) % order.length;
    const next = order[j].iso3;
    setFocusIso(next);
    refs.current.get(next)?.focus();
  };
  const onKey = (iso: string) => (e: React.KeyboardEvent) => {
    const step: Record<string, number | 'first' | 'last'> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: 'first', End: 'last' };
    if (e.key in step) {
      e.preventDefault();
      move(iso, step[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      props.onSelect(iso);
    }
  };

  return (
    <div className="cc-chart cc-chart--orbit">
      <svg className="cc-svg cc-svg--orbit" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} role="group" aria-labelledby="cc-title cc-desc">
        <title id="cc-title">{props.title}</title>
        <desc id="cc-desc">{props.desc}</desc>
        <defs>
          {orbit.sectors.map((s) => (
            <path key={s.key} id={`cc-sector-${s.key}`} d={s.labelPath} />
          ))}
        </defs>

        <g aria-hidden="true">
          {orbit.rings.map((r) => (
            <circle key={r.year} cx={CENTRE} cy={CENTRE} r={r.radius} className={`cc-year-ring${Number(t.slice(0, 4)) === r.year ? ' is-now' : ''}`} />
          ))}
          <circle cx={CENTRE} cy={CENTRE} r={orbit.outside} className="cc-outside" />
          {/* hidden where a sector of countries with no posture takes the top of the ring: the key's rings note says it */}
          {!orbit.noNist.hidden && (
            <g className="cc-no-nist">
              <line x1={orbit.noNist.x} y1={orbit.noNist.y1} x2={orbit.noNist.x} y2={orbit.noNist.y2} className="cc-leader" />
              <text x={orbit.noNist.x} y={orbit.noNist.y} textAnchor="middle" className="cc-small-label">
                {copy.noNist}
              </text>
            </g>
          )}
          {orbit.sectors.map((s) => (
            <g key={s.key}>
              <path className="cc-sector" d={s.arc} />
              <text className="cc-sector-label">
                <textPath href={`#cc-sector-${s.key}`} startOffset="50%" textAnchor="middle">
                  {sectorLabel(s.key)}
                </textPath>
              </text>
            </g>
          ))}

          {orbit.national.map((m) => {
            const owner = orbit.nodes.find((n) => n.iso3 === m.iso3);
            if (!owner) return null;
            const style = { opacity: nationalOn(m) ? 1 : 'var(--lab-faded)' };
            return (
              <g key={m.id} className="cc-national-tie" style={style}>
                <line className="cc-at-wide" x1={owner.x} y1={owner.y} x2={m.x} y2={m.y} />
                <line className="cc-at-phone" x1={owner.x} y1={owner.y} x2={m.phoneAt.x} y2={m.phoneAt.y} />
              </g>
            );
          })}

          <g className="cc-lines">
            {frame.links.map((l) =>
              l.kind === 'own' && orbit.phoneLinks[l.path] ? (
                <g key={l.key}>
                  <LinkPath link={l} d={orbit.links[l.path]} emphasis={frame.fork} className="cc-at-wide" />
                  <LinkPath link={l} d={orbit.phoneLinks[l.path]} emphasis={frame.fork} className="cc-at-phone" />
                </g>
              ) : (
                <LinkPath key={l.key} link={l} d={orbit.links[l.path]} emphasis={frame.fork && l.kind === 'own'} />
              ),
            )}
          </g>

          {orbit.national.map((m) => (
            <g key={m.id} className={`cc-national${frame.fork ? ' is-forking' : ''}`} style={{ opacity: nationalOn(m) ? 1 : 'var(--lab-faded)' }}>
              <rect className="cc-at-wide" x={m.x - 5} y={m.y - 5} width={10} height={10} />
              <rect className="cc-at-phone" x={m.phoneAt.x - 5} y={m.phoneAt.y - 5} width={10} height={10} />
              <Label wide={{ x: m.lx, y: m.ly, anchor: m.anchor }} phone={m.phone} className="cc-national-label">
                {m.label}
              </Label>
            </g>
          ))}

          <rect x={CENTRE - 7} y={CENTRE - 7} width={14} height={14} className="cc-centre" />
          <text x={orbit.centreLabel.x} y={orbit.centreLabel.y} textAnchor={orbit.centreLabel.anchor} className="cc-centre-label cc-halo" paintOrder="stroke">
            {props.centreText}
          </text>
          {orbit.rings.map((r) =>
            r.label ? (
              <text
                key={r.year}
                x={r.label.x}
                y={r.label.y}
                textAnchor="middle"
                className={`cc-ring-label cc-halo${r.label.wide && r.label.phone ? '' : r.label.wide ? ' cc-at-wide' : ' cc-at-phone'}`}
                paintOrder="stroke"
              >
                {r.year}
              </text>
            ) : null,
          )}
        </g>

        <g className="cc-nodes" role="group" aria-label={copy.orbitKeys}>
          {orbit.nodes.map((n) => {
            const i = info[n.iso3];
            const on = active.has(n.iso3);
            const sovereign = n.role === 'sovereign-developer';
            const faded = nodeFaded.has(n.iso3);
            const selected = frame.sel === n.iso3;
            return (
              <g
                key={n.iso3}
                ref={(el) => {
                  if (el) refs.current.set(n.iso3, el);
                  else refs.current.delete(n.iso3);
                }}
                className={`cc-node${selected ? ' is-selected' : ''}`}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ opacity: faded ? 'var(--lab-faded)' : n.opacity }}
                tabIndex={n.iso3 === stop ? 0 : -1}
                role="button"
                aria-pressed={selected}
                aria-label={props.ariaFor(n.iso3)}
                onClick={() => props.onSelect(n.iso3)}
                onKeyDown={onKey(n.iso3)}
                onPointerEnter={() => setHover(n.iso3)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => {
                  setFocusIso(n.iso3);
                  setHover(n.iso3);
                }}
                onBlur={() => setHover(null)}
              >
                <circle r={14} className="cc-hit" />
                <Marker role={n.role} size={n.size} color={i?.postureColor ?? 'var(--ink-faint)'} faint={!on && !sovereign && n.firstNistEdge !== null && !onOrBefore(n.firstNistEdge, t)} />
              </g>
            );
          })}
        </g>
        <g className="cc-node-labels" aria-hidden="true">
          {orbit.nodes
            .filter((n) => frame.sel === n.iso3 || (frame.fork && frame.forkNodes.has(n.iso3)))
            .map((n) => (
              <Label key={n.iso3} wide={n.label} phone={n.labelPhone} className="cc-node-label">
                {info[n.iso3]?.name ?? n.iso3}
              </Label>
            ))}
        </g>
      </svg>
      {hovered && <Tip tip={props.tipFor(hovered.iso3)} style={tipPlace(pct(hovered.x, VIEW.x, VIEW.w), pct(hovered.y - 6, VIEW.y, VIEW.h))} />}
    </div>
  );
}
