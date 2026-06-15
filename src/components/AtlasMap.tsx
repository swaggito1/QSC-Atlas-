import { useEffect, useRef, useState } from 'react';
import { geoOrthographic, geoPath, geoGraticule, geoDistance } from 'd3-geo';
import { POSTURE_META, postureMeta, POSTURE_ORDER, ROLE_META, roleMeta, ROLE_ORDER, confidenceOpacity } from '../lib/process';
import { legalStatusMeta, instrumentStatusMeta, deriveLegalStatus } from '../lib/regulation';
import { parseNameRole, parseTimeline, parseList, parseRegulation } from '../lib/parse';

// The QSC Atlas hero and instrument: a slow ink-on-paper globe. Every country is a
// point at its true position, coloured by the cryptographic bloc it coordinates with.
// The United States is marked as the one standard-setter; China, Russia and Vietnam
// stand apart inside small orbit rings, the only fork in the shared baseline; engaged
// states are faint. No arcs, no lines drawn around the world. Colour only ever encodes
// a bloc or a role. Hovering a country names it; clicking opens its profile.

export interface ProfileData {
  iso3: string;
  country: string;
  summary?: string | null;
  govActors?: string | null;
  standardFamilies?: string | null;
  algorithms?: string | null;
  coordinationPosture?: string | null;
  standardsRole?: string | null;
  confidence?: string | null;
  mainRegulation?: string | null;
  legalStatus?: string | null;
  obligation?: string | null;
  processParticipation?: string | null;
  hybridDeployment?: string | null;
  migrationTimeline?: string | null;
  targetCompletion?: string | null;
  lastUpdated?: string | null;
}
export interface DocData {
  title: string;
  issuingOrg?: string | null;
  year?: number | null;
  tier?: string | null;
  url?: string | null;
}
type NodeDatum = { iso3: string; name: string; lat: number; lng: number; posture: string | null; role: string | null; confidence: string | null };
interface Props {
  nodes: NodeDatum[];
  profiles: Record<string, ProfileData>;
  documents: Record<string, DocData[]>;
}

const INK = '#1a1a1a';
const POSTURE_HEX: Record<string, string> = Object.fromEntries(Object.values(POSTURE_META).map((m) => [m.key, m.color]));
const ROLE_HEX: Record<string, string> = Object.fromEntries(Object.values(ROLE_META).map((m) => [m.key, m.color]));
const AUBERGINE = POSTURE_META['sovereign-bloc'].color;
const SETTER_RED = ROLE_META.setter.color;
const NO_ROLE_HEX = '#cfcdc7';
const MONO = "'Space Mono', ui-monospace, monospace";
const NO_DATA = 'var(--process-none)';
const NO_ROLE = 'var(--process-no-role)';

// ---- small design-system primitives (used by the slide-in profile) ----

function PostureChip({ value }: { value?: string | null }) {
  const meta = postureMeta(value);
  const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)', fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' };
  if (!meta) return <span style={{ ...base, color: 'var(--ink-muted)' }}>Not classified</span>;
  return (
    <span style={{ ...base, color: 'var(--ink)' }}>
      <span aria-hidden style={{ width: '0.62em', height: '0.62em', borderRadius: '50%', background: meta.color, flex: 'none' }} />
      {meta.short}
    </span>
  );
}
function RoleBadge({ value }: { value?: string | null }) {
  const meta = roleMeta(value);
  if (!meta) return null;
  return <span style={{ fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>{meta.label}</span>;
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--ink-muted)', margin: '0 0 var(--space-3)' }}>{children}</h2>;
}
function DataPair({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: '2px' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>{label}</span>
      <span className={mono ? 'mono' : undefined} style={{ fontSize: mono ? 'var(--text-sm)' : 'var(--text-base)', color: 'var(--ink)' }}>{value}</span>
    </div>
  );
}
const REG_TAG_BASE: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', whiteSpace: 'nowrap' };

const AXIS_START = 2025;
const AXIS_END = 2036;
const pctFor = (y: number) => Math.max(0, Math.min(100, ((y - AXIS_START) / (AXIS_END - AXIS_START)) * 100));

function MigrationTimeline({ raw, posture, target }: { raw?: string | null; posture?: string | null; target?: string | null }) {
  const items = parseTimeline(raw);
  const numeric = items.filter((m) => typeof m.year === 'number') as { year: number; label: string }[];
  const accent = postureMeta(posture)?.color ?? 'var(--ink)';
  const today = new Date().getFullYear();
  const phased = target === 'Phased (no fixed end)' || items.some((m) => typeof m.year === 'string');
  if (!items.length) return <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic', borderTop: '2px solid var(--hairline)', paddingTop: 'var(--space-2)', margin: 'var(--space-4) 0' }}>No published migration timeline.</p>;
  return (
    <figure style={{ margin: 'var(--space-5) 0 0' }}>
      <div style={{ position: 'relative', height: 40, marginTop: '1.1em' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: 'var(--ink)' }} />
        {today >= AXIS_START && today <= AXIS_END && (
          <div style={{ position: 'absolute', top: -2, bottom: 0, left: `${pctFor(today)}%`, transform: 'translateX(-50%)', borderLeft: '1px dashed var(--ink-muted)' }}>
            <span className="mono" style={{ position: 'absolute', top: '-1.25em', left: '50%', transform: 'translateX(-50%)', fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>today</span>
          </div>
        )}
        {numeric.map((m, i) => {
          const isFinal = i === numeric.length - 1;
          const p = pctFor(m.year);
          const anchor = p > 88 ? 'translateX(-100%)' : p < 12 ? 'translateX(0)' : 'translateX(-50%)';
          return (
            <div key={`${m.year}-${i}`} style={{ position: 'absolute', bottom: 0, left: `${p}%` }}>
              <span className="mono" style={{ position: 'absolute', bottom: 12, left: 0, transform: anchor, fontSize: 'var(--text-2xs)', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{m.year}</span>
              <span style={isFinal
                ? { position: 'absolute', bottom: -5, left: 0, transform: 'translateX(-50%)', width: 11, height: 11, borderRadius: '50%', background: accent, border: '2px solid var(--surface)' }
                : { position: 'absolute', bottom: -3, left: 0, transform: 'translateX(-50%)', width: 7, height: 7, borderRadius: '50%', background: 'var(--ink)' }} />
            </div>
          );
        })}
        {phased && <span className="mono" style={{ position: 'absolute', right: 0, bottom: 12, fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>phased &rarr;</span>}
      </div>
      <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-2xs)', color: 'var(--ink-faint)', marginTop: 'var(--space-1)' }}>
        <span>{AXIS_START}</span><span>{AXIS_END}</span>
      </div>
      <ol style={{ listStyle: 'none', margin: 'var(--space-5) 0 0', padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
        {numeric.map((m, i) => (
          <li key={`r-${m.year}-${i}`} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-3)', alignItems: 'baseline' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: i === numeric.length - 1 ? accent : 'var(--ink)', flex: 'none' }} />
              <span className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink)' }}>{m.year}</span>
            </span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)', lineHeight: 1.45 }}>{m.label}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <section style={{ padding: 'var(--space-6) 0', borderTop: '1px solid var(--hairline)' }}>{children}</section>;
}

function ProfilePanel({ profile, documents, onClose }: { profile: ProfileData; documents: DocData[]; onClose: () => void }) {
  const c = profile;
  const families = parseList(c.standardFamilies);
  const algorithms = parseList(c.algorithms);
  const govActors = parseNameRole(c.govActors);
  const participation = parseNameRole(c.processParticipation);
  const regulations = parseRegulation(c.mainRegulation).map((r) => ({ ...r, statusMeta: instrumentStatusMeta(r.status) }));
  const legal = legalStatusMeta(c.legalStatus) ?? (regulations.length ? legalStatusMeta(deriveLegalStatus(regulations.map((r) => r.status))) : null);
  const orgLink = (org: string) => `/documents?org=${encodeURIComponent(org)}`;
  return (
    <article style={{ fontFamily: 'var(--font-instrument)', color: 'var(--ink)' }}>
      <header style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-6) var(--space-8)', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'var(--font-reading)', fontSize: 'var(--text-2xl)', margin: 0, fontWeight: 600 }}>{c.country}</h1>
          <PostureChip value={c.coordinationPosture} />
          <RoleBadge value={c.standardsRole} />
        </div>
        <button type="button" onClick={onClose} aria-label="Close profile" className="hb-close" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1, color: 'var(--ink-muted)', padding: 4 }}>&times;</button>
      </header>
      <div style={{ padding: 'var(--space-2) var(--space-8) var(--space-8)' }}>
        {c.summary
          ? <p className="prose" style={{ margin: 'var(--space-6) 0 0', color: 'var(--ink)' }}>{c.summary}</p>
          : <p style={{ margin: 'var(--space-6) 0 0', color: 'var(--ink-muted)', fontStyle: 'italic' }}>No summary in the public record.</p>}

        <Block>
          <SectionLabel>Regulatory basis</SectionLabel>
          {regulations.length ? (
            <ul style={{ listStyle: 'none', margin: '0 0 var(--space-3)', padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {regulations.map((r, i) => (
                <li key={i} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-2) var(--space-3)' }}>
                  <span style={{ fontWeight: 600 }}>{r.instrument}</span>
                  <span style={{ display: 'inline-flex', gap: 'var(--space-3)', flexShrink: 0, alignItems: 'baseline' }}>
                    {r.level && <span style={{ ...REG_TAG_BASE, color: 'var(--ink-faint)' }}>{r.level}</span>}
                    {r.statusMeta && <span style={{ ...REG_TAG_BASE, color: r.statusMeta.binding ? 'var(--ink)' : 'var(--ink-faint)', fontWeight: r.statusMeta.binding ? 600 : 400 }}>{r.statusMeta.label}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p style={{ margin: 0, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No governing instrument identified.</p>}
          {legal && <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>Legal status: <strong style={{ color: 'var(--ink)' }}>{legal.label}</strong></p>}
          {c.obligation && <p className="prose" style={{ margin: 0 }}>{c.obligation}</p>}
        </Block>

        <Block>
          <SectionLabel>Standards and algorithms</SectionLabel>
          {families.length || algorithms.length ? (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {families.length > 0 && <DataPair label="Standard families" value={families.join(', ')} />}
              {algorithms.length > 0 && <DataPair label="Algorithms" value={algorithms.join(', ')} mono />}
            </div>
          ) : <p style={{ margin: 0, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No standards or algorithms specified.</p>}
        </Block>

        <Block>
          <SectionLabel>Hybrid stance</SectionLabel>
          <p style={{ margin: 0, fontSize: 'var(--text-md)' }}>{c.hybridDeployment?.trim() || 'None stated'}</p>
        </Block>

        <Block>
          <SectionLabel>Migration timeline</SectionLabel>
          <MigrationTimeline raw={c.migrationTimeline} posture={c.coordinationPosture} target={c.targetCompletion} />
          {c.targetCompletion && <p className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 'var(--space-2)' }}>Target completion: {c.targetCompletion}</p>}
        </Block>

        {participation.length > 0 && (
          <Block>
            <SectionLabel>International standards processes</SectionLabel>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {participation.map((p, i) => (<li key={i}><span style={{ fontWeight: 600 }}>{p.name}</span>{p.role && <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>{p.role}</span>}</li>))}
            </ul>
          </Block>
        )}

        <Block>
          <SectionLabel>Governmental and standards bodies</SectionLabel>
          {govActors.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {govActors.map((a, i) => (<li key={i}><a className="hb-link" href={orgLink(a.name)} style={{ fontWeight: 600, color: 'var(--ink)' }}>{a.name}</a>{a.role && <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>{a.role}</span>}</li>))}
            </ul>
          ) : <p style={{ margin: 0, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No institutional actors identified.</p>}
        </Block>

        <Block>
          <SectionLabel>Key institutional documents</SectionLabel>
          {documents.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {documents.map((d, i) => (
                <li key={i} style={{ display: 'grid', gap: 2 }}>
                  <a className="hb-link" href={d.url ?? '#'} target={d.url ? '_blank' : undefined} rel={d.url ? 'noopener' : undefined} style={{ color: 'var(--ink)' }}>{d.title}</a>
                  <span className="mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{[d.issuingOrg, d.year, d.tier].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : <p style={{ margin: 0, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No documents indexed for this country.</p>}
          <p style={{ margin: 'var(--space-4) 0 0' }}><a className="hb-link" href={`/countries/${c.iso3.toLowerCase()}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>Open the full profile page &rarr;</a></p>
        </Block>

        {c.lastUpdated && <p className="mono" style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-2xs)', color: 'var(--ink-faint)' }}>Last updated {c.lastUpdated}</p>}
      </div>
    </article>
  );
}

export default function AtlasMap({ nodes, profiles, documents }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<{ x: number; y: number; n: NodeDatum }[]>([]);
  const colorByRef = useRef<'posture' | 'role'>('posture');
  const [colorBy, setColorBy] = useState<'posture' | 'role'>('posture');
  const [hover, setHover] = useState<{ iso3: string; name: string; posture: string | null; role: string | null; x: number; y: number } | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  colorByRef.current = colorBy;

  const counts: Record<string, number> = { 'NIST-bloc': 0, EU: 0, 'sovereign-bloc': 0, 'engaged-unaligned': 0 };
  for (const n of nodes) if (n.posture && n.posture in counts) counts[n.posture]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, CX = 0, CY = 0, R = 0, dpr = 1, raf = 0;
    let lambda = 82;
    const phi = -16;
    const projection = geoOrthographic().clipAngle(90).precision(0.4);
    const grat = geoGraticule().step([30, 30])();
    let t0 = performance.now();
    setReady(true);

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      CX = W / 2; CY = H / 2; R = Math.min(W, H) * 0.45;
      projection.scale(R).translate([CX, CY]);
    }

    function draw(now: number) {
      const el = now - t0;
      const intro = Math.min(1, el / 1600);
      const eo = intro < 1 ? 1 - Math.pow(1 - intro, 3) : 1;
      if (!reduce) lambda = 82 - el * 0.004;
      projection.rotate([lambda, phi]);
      const center: [number, number] = [-lambda, -phi];
      const path = geoPath(projection as any, ctx as any);
      ctx.clearRect(0, 0, W, H);
      // sphere
      ctx.beginPath(); path({ type: 'Sphere' } as any); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(26,26,26,0.16)'; ctx.stroke();
      // graticule
      ctx.beginPath(); path(grat as any); ctx.lineWidth = 0.5; ctx.strokeStyle = `rgba(26,26,26,${0.07 * eo})`; ctx.stroke();
      // nodes
      const hits: { x: number; y: number; n: NodeDatum }[] = [];
      let setterPt: [number, number] | null = null;
      for (const n of nodes) {
        const d = geoDistance([n.lng, n.lat], center);
        if (d > Math.PI / 2 - 0.02) continue;
        const p = projection([n.lng, n.lat]);
        if (!p) continue;
        const front = Math.cos(d);
        const data = !!n.posture;
        let col: string;
        if (!data) col = INK;
        else if (colorByRef.current === 'role') col = n.role ? ROLE_HEX[n.role] || NO_ROLE_HEX : NO_ROLE_HEX;
        else col = POSTURE_HEX[n.posture as string] || INK;
        const baseA = data ? confidenceOpacity(n.confidence) : 0.24;
        const a = Math.max(0, baseA * eo * (0.5 + 0.5 * front));
        const r = data ? 3.1 : 1.3;
        ctx.globalAlpha = a; ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
        if (data) hits.push({ x: p[0], y: p[1], n });
        if (n.posture === 'sovereign-bloc') {
          const sa = Math.min(1, front * 1.5) * eo;
          ctx.strokeStyle = AUBERGINE;
          ctx.globalAlpha = 0.6 * sa; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 7); ctx.stroke();
          ctx.globalAlpha = 0.26 * sa; ctx.beginPath(); ctx.arc(p[0], p[1], 11, 0, 7); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        if (n.role === 'setter') setterPt = [p[0], p[1]];
      }
      hitsRef.current = hits;
      if (setterPt) {
        ctx.globalAlpha = eo;
        ctx.strokeStyle = SETTER_RED; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(setterPt[0], setterPt[1], 6.5, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(setterPt[0] + 6, setterPt[1] - 4); ctx.lineTo(setterPt[0] + 11, setterPt[1] - 8); ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(26,26,26,0.42)'; ctx.stroke();
        ctx.fillStyle = INK; ctx.font = `11px ${MONO}`; ctx.textAlign = 'left';
        ctx.fillText('writes the standard', setterPt[0] + 14, setterPt[1] - 7);
        ctx.globalAlpha = 1;
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    }

    resize();
    if (reduce) { t0 = performance.now() - 2000; draw(performance.now()); }
    else { t0 = performance.now(); raf = requestAnimationFrame(draw); }
    const onResize = () => { resize(); if (reduce) draw(performance.now()); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [nodes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedIso(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onMove = (e: React.MouseEvent) => {
    const wrap = wrapRef.current; if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let best: { x: number; y: number; n: NodeDatum } | null = null, bd = 90;
    for (const h of hitsRef.current) { const dx = h.x - mx, dy = h.y - my, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = h; } }
    if (best) setHover({ iso3: best.n.iso3, name: best.n.name, posture: best.n.posture, role: best.n.role, x: best.x, y: best.y });
    else if (hover) setHover(null);
  };
  const onClick = () => { if (hover && profiles[hover.iso3]) setSelectedIso(hover.iso3); };

  const profile = selectedIso ? profiles[selectedIso] : null;
  const legendItems = colorBy === 'role'
    ? ROLE_ORDER.map((k) => ({ color: ROLE_META[k].color, label: ROLE_META[k].label, outline: false }))
    : POSTURE_ORDER.map((k) => ({ color: POSTURE_META[k].color, label: POSTURE_META[k].label, outline: k === 'engaged-unaligned' }));

  return (
    <div className="hb">
      <div className="hb-chrome">
        <div className="hb-key">
          <div className="hb-coloredby">
            <span className="hb-coloredby-lbl">Coloured by</span>
            <button type="button" className={colorBy === 'posture' ? 'on' : ''} onClick={() => setColorBy('posture')} aria-pressed={colorBy === 'posture'}>coordination</button>
            <button type="button" className={colorBy === 'role' ? 'on' : ''} onClick={() => setColorBy('role')} aria-pressed={colorBy === 'role'}>standards role</button>
          </div>
          <ul className="hb-legend" aria-label={`Legend: ${colorBy === 'role' ? 'standards role' : 'coordination bloc'}`}>
            {legendItems.map((it) => (
              <li key={it.label}>
                <span className="sw" style={it.outline ? { background: 'transparent', border: '1px solid var(--ink)' } : { background: it.color }} aria-hidden="true" />
                {it.label}
              </li>
            ))}
            {colorBy === 'posture' && <li><span className="sw sw-none" aria-hidden="true" />No data</li>}
          </ul>
        </div>
        <p className="hb-readout mono">
          {total} countries classified &nbsp;·&nbsp; NIST bloc {counts['NIST-bloc']} &nbsp;·&nbsp; EU {counts.EU} &nbsp;·&nbsp; sovereign {counts['sovereign-bloc']} &nbsp;·&nbsp; engaged {counts['engaged-unaligned']}
          <br />
          EU roadmap 2030 and 2035 &nbsp;·&nbsp; NIST bloc to 2035 &nbsp;·&nbsp; sovereign blocs run their own clock &nbsp;·&nbsp; engaged keep none
        </p>
      </div>

      <div
        className="hb-stage"
        ref={wrapRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        role="img"
        aria-label="A slowly rotating globe of countries coloured by the cryptographic bloc they coordinate with. The United States writes the standard; China, Russia and Vietnam stand apart inside orbit rings as the only fork; engaged-but-unaligned states are faint."
        style={{ cursor: hover ? 'pointer' : 'default' }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        {!ready && <div className="hb-loading mono">composing the world&hellip;</div>}
        {hover && (
          <div className="hb-tip" style={{ left: hover.x, top: hover.y }}>
            <span className="d" style={{ background: colorBy === 'role' ? (hover.role ? ROLE_HEX[hover.role] || NO_ROLE_HEX : NO_ROLE_HEX) : POSTURE_HEX[hover.posture as string] || 'var(--ink-faint)' }} />
            {hover.name}
            <span className="m">{colorBy === 'role' ? (hover.role ? roleMeta(hover.role)?.label ?? '' : 'No standards role') : postureMeta(hover.posture)?.short ?? 'No data'}</span>
          </div>
        )}
      </div>

      <div onClick={() => setSelectedIso(null)} aria-hidden={!profile} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.18)', zIndex: 30, opacity: profile ? 1 : 0, pointerEvents: profile ? 'auto' : 'none', transition: 'opacity var(--dur) var(--ease)' }} />
      <aside aria-hidden={!profile} aria-label="Country profile" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(var(--panel-width), 92vw)', background: 'var(--surface)', boxShadow: 'var(--shadow-panel)', zIndex: 31, overflowY: 'auto', transform: profile ? 'translateX(0)' : 'translateX(100%)', transition: 'transform var(--dur-panel) var(--ease)' }}>
        {profile && <ProfilePanel profile={profile} documents={documents[profile.iso3] ?? []} onClose={() => setSelectedIso(null)} />}
      </aside>

      <style>{`
        .hb { display: flex; flex-direction: column; }
        .hb-chrome { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-8); flex-wrap: wrap; margin: 0 0 var(--space-4); }
        .hb-key { display: grid; gap: var(--space-3); }
        .hb-coloredby { display: flex; align-items: baseline; gap: var(--space-3); font-family: var(--font-mono); font-size: var(--text-xs); }
        .hb-coloredby-lbl { color: var(--ink-faint); text-transform: lowercase; }
        .hb-coloredby button { font: inherit; background: none; border: none; padding: 0 0 2px; cursor: pointer; color: var(--ink-faint); border-bottom: 2px solid transparent; }
        .hb-coloredby button:hover { color: var(--ink-muted); }
        .hb-coloredby button.on { color: var(--ink); border-bottom-color: var(--ink); }
        .hb-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); font-family: var(--font-instrument); font-size: var(--text-sm); color: var(--ink-muted); }
        .hb-legend li { display: flex; align-items: center; gap: var(--space-2); }
        .hb-legend .sw { width: 0.85em; height: 0.85em; border-radius: var(--radius-sm); display: inline-block; flex: none; }
        .hb-legend .sw-none { background: var(--process-none); }
        .hb-readout { text-align: right; font-size: var(--text-2xs); color: var(--ink-faint); line-height: 1.8; margin: 0; }
        .hb-stage { position: relative; width: 100%; height: clamp(440px, 66vh, 680px); }
        .hb-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--ink-faint); font-size: var(--text-sm); }
        .hb-tip { position: absolute; transform: translate(-50%, -150%); pointer-events: none; background: var(--ink); color: var(--paper); padding: 5px 9px; border-radius: var(--radius); font-family: var(--font-instrument); font-size: var(--text-xs); white-space: nowrap; display: flex; align-items: center; gap: 7px; z-index: 5; }
        .hb-tip .d { width: 8px; height: 8px; border-radius: 50%; flex: none; }
        .hb-tip .m { opacity: 0.7; }
        .hb-link { color: var(--ink); text-decoration-color: var(--hairline); text-underline-offset: 2px; }
        .hb-link:hover { text-decoration-color: var(--ink); }
        .hb-close:hover { color: var(--ink); }
        @media (max-width: 640px) {
          .hb-chrome { flex-direction: column; align-items: flex-start; gap: var(--space-4); }
          .hb-readout { text-align: left; }
        }
      `}</style>
    </div>
  );
}
