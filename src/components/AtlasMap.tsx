import { useEffect, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { POSTURE_META, postureMeta, POSTURE_ORDER, ROLE_META, roleMeta, ROLE_ORDER, confidenceOpacity } from '../lib/process';
import { legalStatusMeta, instrumentStatusMeta, deriveLegalStatus } from '../lib/regulation';
import { parseNameRole, parseTimeline, parseList, parseRegulation } from '../lib/parse';

// The QSC Atlas hero and instrument in one object: "The Single Baseline".
// The real geoNaturalEarth1 choropleth rests on one hairline baseline, read as the
// post-quantum standard the United States writes and almost everyone adopts. The only
// fork is China, Russia and Vietnam, lifted onto a short detached rail beneath a torn
// segment of the line. Nine engaged-but-unaligned states sit on the map as unfilled
// outlines. Colour only ever encodes a coordination bloc or a standards role. Clicking
// a country slides its profile in. No arcs, nothing moves for atmosphere.

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
type MapEntry = { iso3: string; name: string; posture: string; role: string | null; confidence: string | null };
interface Props {
  mapProcess: Record<string, MapEntry>;
  profiles: Record<string, ProfileData>;
  documents: Record<string, DocData[]>;
}

const POSTURE_HEX: Record<string, string> = Object.fromEntries(Object.values(POSTURE_META).map((m) => [m.key, m.color]));
const ROLE_HEX: Record<string, string> = Object.fromEntries(Object.values(ROLE_META).map((m) => [m.key, m.color]));
const NO_DATA = 'var(--process-none)';
const NO_ROLE = 'var(--process-no-role)';
const AUBERGINE = POSTURE_META['sovereign-bloc'].color; // #7a3b5e
const SETTER_RED = ROLE_META.setter.color; // #a8322a
const W = 980;
const H = 500;
const BASELINE_Y = Math.round(0.62 * H);
const RAIL_GAP = 46;
const RAIL_Y = BASELINE_Y + RAIL_GAP;
const key = (id: unknown) => String(Number(id));

// The sovereign trio and the setter, by approximate centroid lon/lat. Projected at
// runtime so the marks land on the live projection exactly.
const SOVEREIGN = [
  { iso3: 'CHN', name: 'China', lonlat: [105, 35] as [number, number], conf: 'High' },
  { iso3: 'RUS', name: 'Russia', lonlat: [100, 60] as [number, number], conf: 'High' },
  { iso3: 'VNM', name: 'Vietnam', lonlat: [108, 16] as [number, number], conf: 'Low' },
];
const SETTER = { iso3: 'USA', lonlat: [-97, 38] as [number, number] };

// ---- small design-system primitives (used by the slide-in profile) ----

function PostureChip({ value }: { value?: string | null }) {
  const meta = postureMeta(value);
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
    fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
  };
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
  return (
    <span style={{ fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-sm)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-label)', color: 'var(--ink-muted)', margin: '0 0 var(--space-3)' }}>
      {children}
    </h2>
  );
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
  if (!items.length) {
    return <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic', borderTop: '2px solid var(--hairline)', paddingTop: 'var(--space-2)', margin: 'var(--space-4) 0' }}>No published migration timeline.</p>;
  }
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
              {participation.map((p, i) => (
                <li key={i}><span style={{ fontWeight: 600 }}>{p.name}</span>{p.role && <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>{p.role}</span>}</li>
              ))}
            </ul>
          </Block>
        )}

        <Block>
          <SectionLabel>Governmental and standards bodies</SectionLabel>
          {govActors.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {govActors.map((a, i) => (
                <li key={i}><a className="hb-link" href={orgLink(a.name)} style={{ fontWeight: 600, color: 'var(--ink)' }}>{a.name}</a>{a.role && <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>{a.role}</span>}</li>
              ))}
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
          <p style={{ margin: 'var(--space-4) 0 0' }}>
            <a className="hb-link" href={`/countries/${c.iso3.toLowerCase()}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>Open the full profile page &rarr;</a>
          </p>
        </Block>

        {c.lastUpdated && <p className="mono" style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-2xs)', color: 'var(--ink-faint)' }}>Last updated {c.lastUpdated}</p>}
      </div>
    </article>
  );
}

export default function AtlasMap({ mapProcess, profiles, documents }: Props) {
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [marks, setMarks] = useState<{ setter: [number, number] | null; sov: { iso3: string; name: string; x: number; y: number; conf: string }[] }>({ setter: null, sov: [] });
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ iso3: string; name: string; posture: string; role: string | null; x: number; y: number } | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [colorBy, setColorBy] = useState<'posture' | 'role'>('posture');
  const [composed, setComposed] = useState(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
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
        const setter = projection(SETTER.lonlat) as [number, number] | null;
        const sov = SOVEREIGN.map((s) => { const p = projection(s.lonlat) as [number, number]; return { iso3: s.iso3, name: s.name, x: p[0], y: p[1], conf: s.conf }; });
        setMarks({ setter, sov });
        requestAnimationFrame(() => requestAnimationFrame(() => alive && setComposed(true)));
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedIso(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const metaFor = (id: string) => mapProcess[id] ?? null;
  const isSovereign = (m: MapEntry | null) => !!m && m.posture === 'sovereign-bloc';
  const isEngaged = (m: MapEntry | null) => !!m && m.posture === 'engaged-unaligned';

  const fillFor = (m: MapEntry | null) => {
    if (!m) return NO_DATA;
    if (isEngaged(m)) return 'none'; // engaged states are outline-only: present but uncommitted
    if (colorBy === 'role') return m.role ? ROLE_HEX[m.role] ?? NO_ROLE : NO_ROLE;
    return POSTURE_HEX[m.posture] ?? NO_DATA;
  };
  const fillOpacity = (m: MapEntry | null) => {
    if (!m) return 1;
    const base = confidenceOpacity(m.confidence);
    return isSovereign(m) ? base * 0.32 : base; // the sovereign trio recede; the rail carries them
  };

  const open = (iso: string) => { if (profiles[iso]) setSelectedIso(iso); };
  const profile = selectedIso ? profiles[selectedIso] : null;

  // Live counts, derived (never hardcoded).
  const counts = { 'NIST-bloc': 0, EU: 0, 'sovereign-bloc': 0, 'engaged-unaligned': 0 } as Record<string, number>;
  for (const m of Object.values(mapProcess)) if (m.posture in counts) counts[m.posture]++;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // The three sovereign countries share almost the same longitude, so space their
  // tokens evenly on the rail (geographic order kept) rather than at colliding x.
  const sovSorted = [...marks.sov].sort((a, b) => a.x - b.x);
  const SOV_GAP = 84;
  const sovCenter = sovSorted.length ? sovSorted.reduce((s, m) => s + m.x, 0) / sovSorted.length : 0;
  const tokenX = sovSorted.map((_, i) => sovCenter + (i - (sovSorted.length - 1) / 2) * SOV_GAP);
  const railMin = tokenX.length ? Math.min(...tokenX) - 24 : 0;
  const railMax = tokenX.length ? Math.max(...tokenX) + 24 : 0;

  const c1 = composed || reduce.current;
  const t = (delayMs: number, dur = 'var(--dur)') => ({ transition: `opacity ${dur} var(--ease) ${delayMs}ms` });

  const legendItems = colorBy === 'role'
    ? ROLE_ORDER.map((k) => ({ color: ROLE_META[k].color, label: ROLE_META[k].label, outline: false }))
    : POSTURE_ORDER.map((k) => ({ color: POSTURE_META[k].color, label: POSTURE_META[k].label, outline: k === 'engaged-unaligned' }));

  return (
    <div className="hb" style={{ position: 'relative' }}>
      {error && <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic', padding: 'var(--space-8)', textAlign: 'center' }}>The map could not be loaded. Check your connection and try again.</p>}
      {!error && !paths.length && <div style={{ height: 360, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>composing the world&hellip;</div>}
      {!!paths.length && (
        <div style={{ position: 'relative' }}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map. Countries coloured by the cryptographic bloc they coordinate with. The United States writes the standard; China, Russia and Vietnam are the only fork; nine engaged states sit undecided as unfilled outlines." style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
            {/* the field */}
            <g style={{ opacity: c1 ? 1 : 0, ...t(420, '700ms') }}>
              {paths.map((p, idx) => {
                const m = metaFor(p.id);
                const isSel = m && m.iso3 === selectedIso;
                const hovered = hover && m && hover.iso3 === m.iso3;
                const eng = isEngaged(m);
                return (
                  <path key={`${p.id}-${idx}`} d={p.d}
                    fill={fillFor(m)} fillOpacity={fillOpacity(m)}
                    stroke={isSel || hovered ? 'var(--ink)' : eng ? 'var(--ink)' : 'var(--paper)'}
                    strokeWidth={isSel ? 1.6 : hovered ? 1.4 : eng ? 0.6 : 0.5}
                    strokeOpacity={eng ? 0.55 : 1}
                    style={{ cursor: m ? 'pointer' : 'default' }}
                    onMouseMove={(e) => { if (!m) return; const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ iso3: m.iso3, name: m.name, posture: m.posture, role: m.role, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
                    onClick={() => m && open(m.iso3)} />
                );
              })}
            </g>

            {/* the baseline: the shared standard */}
            <line x1={0} y1={BASELINE_Y} x2={W} y2={BASELINE_Y} stroke="var(--ink)" strokeWidth={1.4}
              strokeDasharray={W} strokeDashoffset={c1 ? 0 : W} style={{ transition: 'stroke-dashoffset 620ms var(--ease)' }} />

            {/* the fork: a torn segment, a detached rail, three tokens, ghost leaders */}
            <g style={{ opacity: c1 ? 1 : 0, ...t(1180) }}>
              {sovSorted.length > 0 && (
                <>
                  {/* the tear: the baseline broken into an aubergine dash over the sovereign span */}
                  <line x1={railMin} y1={BASELINE_Y} x2={railMax} y2={BASELINE_Y} stroke={AUBERGINE} strokeWidth={1.8} strokeDasharray="2 4" />
                  {/* the detached rail */}
                  <line x1={railMin} y1={RAIL_Y} x2={railMax} y2={RAIL_Y} stroke={AUBERGINE} strokeWidth={1} strokeOpacity={0.7} />
                  {sovSorted.map((s, i) => {
                    const soft = s.conf === 'Low' ? 0.5 : 1;
                    const tx = tokenX[i];
                    return (
                      <g key={s.iso3} style={{ cursor: 'pointer' }} onClick={() => open(s.iso3)}
                        onMouseMove={(e) => { const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover({ iso3: s.iso3, name: s.name, posture: 'sovereign-bloc', role: 'sovereign-developer', x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}>
                        {/* ghost leader from the receded country down to its token */}
                        <line x1={s.x} y1={s.y} x2={tx} y2={RAIL_Y - 6} stroke={AUBERGINE} strokeWidth={0.6} strokeOpacity={0.3 * soft} strokeDasharray="1 3" />
                        <rect x={tx - 4.5} y={RAIL_Y - 4.5} width={9} height={9} fill={AUBERGINE} fillOpacity={soft} />
                        <text x={tx} y={RAIL_Y + 18} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fill="var(--ink)" fillOpacity={0.85 * soft}>{s.name}</text>
                      </g>
                    );
                  })}
                </>
              )}
            </g>

            {/* the setter: one open ring on the United States, the only annotation */}
            {marks.setter && (
              <g style={{ opacity: c1 ? 1 : 0, ...t(1320) }}>
                <circle cx={marks.setter[0]} cy={marks.setter[1]} r={7} fill="none" stroke={SETTER_RED} strokeWidth={1.5} />
                <line x1={marks.setter[0] - 6} y1={marks.setter[1] - 2} x2={marks.setter[0] - 48} y2={marks.setter[1] - 30} stroke="var(--ink)" strokeWidth={0.7} strokeOpacity={0.45} />
                <text x={marks.setter[0] - 52} y={marks.setter[1] - 31} textAnchor="end" fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink)" fillOpacity={0.82}>writes the standard</text>
              </g>
            )}
          </svg>

          {/* hover tooltip */}
          {hover && (
            <div style={{ position: 'absolute', left: `${hover.x}%`, top: `${hover.y}%`, transform: 'translate(-50%, -130%)', pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', padding: '6px 10px', borderRadius: 'var(--radius)', fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorBy === 'role' ? (hover.role ? ROLE_HEX[hover.role] ?? NO_ROLE : NO_ROLE) : POSTURE_HEX[hover.posture] ?? NO_DATA }} />
              {hover.name}
              <span style={{ opacity: 0.7 }}>{colorBy === 'role' ? (hover.role ? roleMeta(hover.role)?.label ?? '' : 'No standards role') : postureMeta(hover.posture)?.short ?? ''}</span>
            </div>
          )}
        </div>
      )}

      {/* ---- instrument chrome: legend + toggle + readout, all over the map ---- */}
      {!!paths.length && (
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
            {total} countries classified &nbsp;·&nbsp; NIST bloc {counts['NIST-bloc']} &nbsp;·&nbsp; EU {counts.EU} (members) &nbsp;·&nbsp; sovereign {counts['sovereign-bloc']} &nbsp;·&nbsp; engaged {counts['engaged-unaligned']}
            <br />
            EU roadmap 2030 and 2035 &nbsp;·&nbsp; NIST bloc to 2035 &nbsp;·&nbsp; sovereign blocs run their own clock &nbsp;·&nbsp; engaged keep none
          </p>
        </div>
      )}

      {/* slide-in profile */}
      <div onClick={() => setSelectedIso(null)} aria-hidden={!profile} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.18)', zIndex: 30, opacity: profile ? 1 : 0, pointerEvents: profile ? 'auto' : 'none', transition: 'opacity var(--dur) var(--ease)' }} />
      <aside aria-hidden={!profile} aria-label="Country profile" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(var(--panel-width), 92vw)', background: 'var(--surface)', boxShadow: 'var(--shadow-panel)', zIndex: 31, overflowY: 'auto', transform: profile ? 'translateX(0)' : 'translateX(100%)', transition: 'transform var(--dur-panel) var(--ease)' }}>
        {profile && <ProfilePanel profile={profile} documents={documents[profile.iso3] ?? []} onClose={() => setSelectedIso(null)} />}
      </aside>

      <style>{`
        .hb { display: flex; flex-direction: column; }
        .hb-chrome { order: -1; display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-8); flex-wrap: wrap; margin: 0 0 var(--space-5); }
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
        .hb-readout { text-align: right; font-size: var(--text-2xs); color: var(--ink-faint); line-height: 1.7; margin: 0; }
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
