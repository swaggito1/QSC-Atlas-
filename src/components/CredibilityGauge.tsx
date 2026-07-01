import { useId } from 'react';
import { CRITERIA, MAX_SCORE, type Evaluation } from '../lib/evaluation';

// The governance-credibility gauge (brief Part 5). A six-spoke radar filled in the bloc colour,
// paired with a precise values table (the skill flags radar as grade B, so the numbers are always
// there as text). A null axis reads as "not assessed".

interface Props {
  evaluation: Evaluation;
  countryName: string;
  blocColor: string;
}

const SIZE = 240;
const CX = 120;
const CY = 120;
const R = 82;
const ANGLES = CRITERIA.map((_, i) => (-90 + i * (360 / CRITERIA.length)) * (Math.PI / 180));
const point = (i: number, v: number): [number, number] => {
  const rr = (R * Math.max(0, Math.min(MAX_SCORE, v))) / MAX_SCORE;
  return [CX + rr * Math.cos(ANGLES[i]), CY + rr * Math.sin(ANGLES[i])];
};
const ring = (lvl: number) => CRITERIA.map((_, i) => point(i, lvl).join(',')).join(' ');
const fmt = (s: number | null) => (s == null ? 'not assessed' : `${s.toFixed(1)} / 2`);

export default function CredibilityGauge({ evaluation, countryName, blocColor }: Props) {
  const titleId = useId();
  const descId = useId();

  const primary = CRITERIA.map((c) => evaluation?.[c.key]?.score ?? null);
  const allScored = primary.every((s) => s != null);
  const areaStr = allScored ? primary.map((s, i) => point(i, s as number).join(',')).join(' ') : null;

  return (
    <figure className="gauge">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-labelledby={`${titleId} ${descId}`} className="gauge-svg">
        <title id={titleId}>Governance credibility for {countryName}</title>
        <desc id={descId}>
          A six-axis reading out of two: {CRITERIA.map((c, i) => `${c.label} ${fmt(primary[i])}`).join(', ')}.
        </desc>
        {[1, 2].map((l) => (
          <polygon key={l} points={ring(l)} className="ring" />
        ))}
        {CRITERIA.map((c, i) => {
          const [x, y] = point(i, MAX_SCORE);
          return <line key={c.key} x1={CX} y1={CY} x2={x} y2={y} className={`spoke${primary[i] == null ? ' na' : ''}`} />;
        })}
        {areaStr && <polygon points={areaStr} className="area" style={{ fill: blocColor, stroke: blocColor }} />}
        {CRITERIA.map((c, i) =>
          primary[i] == null ? null : (
            <circle key={c.key} cx={point(i, primary[i]!)[0]} cy={point(i, primary[i]!)[1]} r={2.6} style={{ fill: blocColor }} />
          ),
        )}
        {CRITERIA.map((c, i) => {
          const [x, y] = point(i, MAX_SCORE + 0.42);
          const anchor = x > CX + 4 ? 'start' : x < CX - 4 ? 'end' : 'middle';
          return (
            <text key={c.key} x={x} y={y} className="axis-label" textAnchor={anchor} dominantBaseline="middle">
              {c.short}
            </text>
          );
        })}
      </svg>

      <table className="gauge-values">
        <caption className="sr-only">Governance credibility scores for {countryName}, each out of two.</caption>
        <thead>
          <tr>
            <th scope="col">Criterion</th>
            <th scope="col">Score</th>
            <th scope="col">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {CRITERIA.map((c, i) => (
            <tr key={c.key}>
              <th scope="row">{c.label}</th>
              <td className="mono">{fmt(primary[i])}</td>
              <td>{evaluation?.[c.key]?.confidence ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
