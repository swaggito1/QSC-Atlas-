// QSC Atlas: the parts the Cascade's three views share. The country shapes, loaded once for the
// globe and the map through globe.ts; the tooltip (.lab-tip, an overlay); the loading and error line
// (.lab-state); the orbit's role markers and the role badge, the one place a role is named; and
// the frame every view draws from.

import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { roleMeta } from '../../../../lib/process';
import { loadWorld } from '../../../../lib/lab/globe';
import type { LinkKind } from '../../../../lib/lab/cascade';

// ---- the frame: what every view shows at the month and filters chosen ------------------------

export interface FrameLink {
  key: string;
  path: string;
  from: string;
  kind: LinkKind;
  to: string | null;
  docs: number; // 0 when the line is not shown at this frame
  pre: boolean;
  lead: boolean;
  dim: boolean; // out of focus: another jurisdiction is selected, or the fork view is on
}

export interface Frame {
  links: FrameLink[]; // every line the data can draw, in a stable order
  lit: Set<string>; // jurisdictions coloured at this frame
  faded: Set<string>; // jurisdictions out of focus (group or fork view)
  sel: string | null;
  fork: boolean;
  forkNodes: Set<string>;
}

export interface TipData {
  name: string;
  color: string | null;
  short: string;
  line: ReactNode; // words in the interface face; a date in it is wrapped in .mono
}

// ---- the country shapes, fetched once for both geographic views -------------------------------

let pending: Promise<any[] | null> | null = null;
let loaded: any[] | null = null;

/** The world's country shapes (globe.ts loadWorld: local file, CDN, a timeout and two rounds). */
export function useWorld() {
  const [feats, setFeats] = useState<any[] | null>(loaded);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (loaded) {
      setFeats(loaded);
      return;
    }
    let alive = true;
    setFailed(false);
    pending ??= loadWorld();
    pending.then((f) => {
      if (f) loaded = f;
      else pending = null; // let the next retry fetch again
      if (!alive) return;
      setFeats(f);
      setFailed(!f);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);
  return { feats, failed, retry: () => setAttempt((a) => a + 1) };
}

/** "drawing the world…" while the shapes load; a plain error with a text retry if they cannot. */
export function WorldState({ failed, retry, copy }: { failed: boolean; retry: () => void; copy: Record<string, string> }) {
  return (
    <p className="lab-state cc-world-state" role="status">
      {failed ? (
        <>
          {copy.worldFailed}{' '}
          <button type="button" onClick={retry}>
            {copy.worldRetry}
          </button>
        </>
      ) : (
        copy.worldLoading
      )}
    </p>
  );
}

// ---- the ink tooltip ----------------------------------------------------------------------------

/**
 * Position a .lab-tip above a point given in per cent of its chart. Near the left or right edge
 * the tip is pinned to that side so it never runs off a narrow screen.
 */
export function tipPlace(xPct: number, yPct: number): CSSProperties {
  const tx = xPct < 22 ? '-12px' : xPct > 78 ? 'calc(-100% + 12px)' : '-50%';
  const ty = yPct < 12 ? '40%' : '-150%';
  return { left: `${xPct}%`, top: `${yPct}%`, transform: `translate(${tx}, ${ty})` };
}

export function Tip({ tip, style }: { tip: TipData; style: CSSProperties }) {
  return (
    <div className="lab-tip" style={style} aria-hidden="true">
      <span className="d" style={{ background: tip.color ?? 'var(--ink-faint)' }} />
      {tip.name}
      <span className="m">{tip.short}</span>
      {tip.line && <span className="m">{tip.line}</span>}
    </div>
  );
}

// ---- the orbit's role markers -------------------------------------------------------------------

/**
 * The marker shape is the role, as on the Atlas: a square for a maker, a ringed dot for a
 * contextualiser, a plain dot for a taker, an open dot with two orbits for a sovereign
 * developer. The fill is the posture colour, or ink in the legend.
 */
export function Marker({ role, size, color, faint }: { role: string | null; size: number; color: string; faint: boolean }) {
  if (faint) return <circle r={Math.max(2.5, size - 2)} className="cc-node-faint" />;
  switch (role) {
    case 'setter':
      return <rect x={-size} y={-size} width={size * 2} height={size * 2} style={{ fill: color }} className="cc-node-fill" />;
    case 'contextualiser':
      return (
        <>
          <circle r={size + 2} className="cc-ring-ink" />
          <circle r={size} style={{ fill: color }} className="cc-node-fill" />
        </>
      );
    case 'sovereign-developer':
      return (
        <>
          <circle r={size + 9} className="cc-orbit" />
          <circle r={size + 5} className="cc-orbit" />
          <circle r={size} className="cc-open" style={{ stroke: color }} />
          <circle r={size * 0.42} style={{ fill: color }} />
        </>
      );
    default:
      return <circle r={size} style={{ fill: color }} className="cc-node-fill" />;
  }
}

// ---- the role badge ------------------------------------------------------------------------------

/**
 * The standards role in words, as the Atlas's RoleBadge.astro sets it: sentence case at the small
 * step, weight 400, ink-muted, never a chip. The only place the Cascade names a role. Renders
 * nothing when none is recorded.
 */
export function RoleBadge({ role, short = false }: { role: string | null | undefined; short?: boolean }) {
  const meta = roleMeta(role);
  return meta ? <span className="role-badge">{short ? meta.short : meta.label}</span> : null;
}
