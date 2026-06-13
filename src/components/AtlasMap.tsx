import { useEffect, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { PROCESS_META, processMeta, type StandardsProcess } from '../lib/process';
import { parseNameRole, parseTimeline, parseList } from '../lib/parse';

// AtlasMap - the signature view, ported from the QSC Atlas design system.
// A real d3-geo Natural Earth choropleth coloured by standards process; clicking
// a country slides its profile in from the right over a backdrop. Adapted to the
// product's data (fed from Notion) and parse helpers.

export interface ProfileData {
  iso3: string;
  country: string;
  summary?: string | null;
  govActors?: string | null;
  standardFamilies?: string | null;
  algorithms?: string | null;
  dominantProcess?: string | null;
  secondaryProcess?: string | null;
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
interface Props {
  mapProcess: Record<string, { iso3: string; name: string; process: string }>;
  profiles: Record<string, ProfileData>;
  documents: Record<string, DocData[]>;
}

const PROCESS_HEX: Record<string, string> = {
  NIST: '#2b4c7e',
  EU: '#5b54a8',
  ETSI: '#2e7d6f',
  ISO: '#b07a2b',
  Sovereign: '#7a3b5e',
  Mixed: '#6b7280',
};
const NO_DATA = '#e7e5df';
const W = 980;
const H = 500;
const key = (id: unknown) => String(Number(id));

// ---- small design-system primitives ----

function ProcessChip({ value }: { value?: string | null }) {
  const meta = processMeta(value);
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontFamily: 'var(--font-instrument)',
    fontSize: 'var(--text-sm)',
    padding: '0.2em 0.6em',
    border: '1px solid var(--hairline)',
    borderRadius: 'var(--radius)',
    whiteSpace: 'nowrap',
  };
  if (!meta) return <span style={{ ...base, color: 'var(--ink-muted)' }}>No data recorded</span>;
  return (
    <span style={{ ...base, color: 'var(--ink)' }}>
      <span aria-hidden style={{ width: '0.7em', height: '0.7em', borderRadius: '50%', background: meta.color, flex: 'none' }} />
      {meta.label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: 'var(--font-instrument)',
        fontSize: 'var(--text-sm)',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-label)',
        color: 'var(--ink-muted)',
        margin: '0 0 var(--space-3)',
      }}
    >
      {children}
    </h2>
  );
}

function DataPair({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: '2px' }}>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)' }}>{label}</span>
      <span className={mono ? 'mono' : undefined} style={{ fontSize: mono ? 'var(--text-sm)' : 'var(--text-base)', color: 'var(--ink)' }}>
        {value}
      </span>
    </div>
  );
}

const AXIS_START = 2025;
const AXIS_END = 2036;
const pctFor = (y: number) => Math.max(0, Math.min(100, ((y - AXIS_START) / (AXIS_END - AXIS_START)) * 100));

function MigrationTimeline({ raw, process, target }: { raw?: string | null; process?: string | null; target?: string | null }) {
  const items = parseTimeline(raw);
  const numeric = items.filter((m) => typeof m.year === 'number') as { year: number; label: string }[];
  const accent = processMeta(process)?.color ?? 'var(--ink)';
  const today = new Date().getFullYear();
  const phased = target === 'Phased (no fixed end)' || items.some((m) => typeof m.year === 'string');

  if (!items.length) {
    return (
      <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic', borderTop: '2px solid var(--hairline)', paddingTop: 'var(--space-2)', margin: 'var(--space-4) 0' }}>
        no published migration timeline
      </p>
    );
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
  const orgLink = (org: string) => `/documents?org=${encodeURIComponent(org)}`;

  return (
    <article style={{ fontFamily: 'var(--font-instrument)', color: 'var(--ink)' }}>
      <header style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-6) var(--space-8)', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'var(--font-reading)', fontSize: 'var(--text-2xl)', margin: 0, fontWeight: 600 }}>{c.country}</h1>
          <ProcessChip value={c.dominantProcess} />
          {c.secondaryProcess ? <ProcessChip value={c.secondaryProcess} /> : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Close profile" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1, color: 'var(--ink-muted)', padding: 4 }}>&times;</button>
      </header>

      <div style={{ padding: 'var(--space-2) var(--space-8) var(--space-8)' }}>
        {c.summary
          ? <p className="prose" style={{ margin: 'var(--space-6) 0 0', color: 'var(--ink)' }}>{c.summary}</p>
          : <p style={{ margin: 'var(--space-6) 0 0', color: 'var(--ink-muted)', fontStyle: 'italic' }}>No summary recorded yet.</p>}

        <Block>
          <SectionLabel>Standards and algorithms</SectionLabel>
          {families.length || algorithms.length ? (
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              {families.length > 0 && <DataPair label="Standard families" value={families.join(', ')} />}
              {algorithms.length > 0 && <DataPair label="Algorithms" value={algorithms.join(', ')} mono />}
            </div>
          ) : <p style={{ margin: 0, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No standards or algorithms recorded yet.</p>}
        </Block>

        <Block>
          <SectionLabel>Hybrid stance</SectionLabel>
          <p style={{ margin: 0, fontSize: 'var(--text-md)' }}>{c.hybridDeployment?.trim() || 'None stated'}</p>
        </Block>

        <Block>
          <SectionLabel>Migration timeline</SectionLabel>
          <MigrationTimeline raw={c.migrationTimeline} process={c.dominantProcess} target={c.targetCompletion} />
          {c.targetCompletion && <p className="mono" style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-muted)', marginTop: 'var(--space-2)' }}>Target completion: {c.targetCompletion}</p>}
        </Block>

        {participation.length > 0 && (
          <Block>
            <SectionLabel>International standards processes</SectionLabel>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {participation.map((p, i) => (
                <li key={i}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  {p.role && <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>{p.role}</span>}
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block>
          <SectionLabel>Governmental and standards bodies</SectionLabel>
          {govActors.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {govActors.map((a, i) => (
                <li key={i}>
                  <a href={orgLink(a.name)} style={{ fontWeight: 600, color: 'var(--ink)', textDecorationColor: 'var(--hairline)' }}>{a.name}</a>
                  {a.role && <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>{a.role}</span>}
                </li>
              ))}
            </ul>
          ) : <p style={{ margin: 0, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No institutional actors recorded yet.</p>}
        </Block>

        <Block>
          <SectionLabel>Key institutional documents</SectionLabel>
          {documents.length ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--space-3)' }}>
              {documents.map((d, i) => (
                <li key={i} style={{ display: 'grid', gap: 2 }}>
                  <a href={d.url ?? '#'} target={d.url ? '_blank' : undefined} rel={d.url ? 'noopener' : undefined} style={{ color: 'var(--ink)' }}>{d.title}</a>
                  <span className="mono" style={{ fontSize: 'var(--text-2xs)', color: 'var(--ink-muted)' }}>{[d.issuingOrg, d.year, d.tier].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          ) : <p style={{ margin: 0, color: 'var(--ink-muted)', fontStyle: 'italic' }}>No institutional documents recorded yet.</p>}
          <p style={{ margin: 'var(--space-4) 0 0' }}>
            <a href={`/countries/${c.iso3.toLowerCase()}`} style={{ fontSize: 'var(--text-sm)', color: 'var(--ink-muted)' }}>Open the full profile page &rarr;</a>
          </p>
        </Block>

        {c.lastUpdated && <p className="mono" style={{ marginTop: 'var(--space-8)', fontSize: 'var(--text-2xs)', color: 'var(--ink-faint)' }}>Last updated {c.lastUpdated}</p>}
      </div>
    </article>
  );
}

export default function AtlasMap({ mapProcess, profiles, documents }: Props) {
  const [paths, setPaths] = useState<{ id: string; d: string }[]>([]);
  const [error, setError] = useState(false);
  const [hover, setHover] = useState<{ iso3: string; name: string; process: string; x: number; y: number } | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

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

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedIso(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const metaFor = (id: string) => mapProcess[id] ?? null;
  const fillFor = (id: string) => {
    const m = metaFor(id);
    return m ? PROCESS_HEX[m.process] ?? NO_DATA : NO_DATA;
  };
  const open = (iso: string) => { if (profiles[iso]) setSelectedIso(iso); };
  const profile = selectedIso ? profiles[selectedIso] : null;

  return (
    <div style={{ position: 'relative' }}>
      {error && <p style={{ color: 'var(--ink-muted)', fontStyle: 'italic', padding: 'var(--space-8)', textAlign: 'center' }}>The map could not be loaded. Check your connection and try again.</p>}
      {!error && !paths.length && <div style={{ height: 360, display: 'grid', placeItems: 'center', color: 'var(--ink-faint)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>drawing the world&hellip;</div>}
      {!!paths.length && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map coloured by standards process" style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
          <rect x="0" y="0" width={W} height={H} fill="transparent" />
          {paths.map((p, idx) => {
            const m = metaFor(p.id);
            const isSel = m && m.iso3 === selectedIso;
            const dim = hover && m && hover.iso3 !== m.iso3;
            return (
              <path key={`${p.id}-${idx}`} d={p.d} fill={fillFor(p.id)}
                stroke={isSel || (hover && m && hover.iso3 === m.iso3) ? '#1a1a1a' : '#f7f5f0'}
                strokeWidth={isSel ? 1.6 : hover && m && hover.iso3 === m.iso3 ? 1.4 : 0.5}
                style={{ cursor: m ? 'pointer' : 'default', transition: 'opacity 120ms' }}
                opacity={dim ? 0.82 : 1}
                onMouseMove={(e) => {
                  if (!m) return;
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ ...m, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                }}
                onClick={() => m && open(m.iso3)} />
            );
          })}
        </svg>
      )}
      {hover && (
        <div style={{ position: 'absolute', left: `${hover.x}%`, top: `${hover.y}%`, transform: 'translate(-50%, -130%)', pointerEvents: 'none', background: 'var(--ink)', color: 'var(--paper)', padding: '6px 10px', borderRadius: 'var(--radius)', fontFamily: 'var(--font-instrument)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 8, zIndex: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: PROCESS_HEX[hover.process] ?? NO_DATA }} />
          {hover.name}
          <span style={{ opacity: 0.7 }}>{hover.process}-aligned</span>
        </div>
      )}

      {/* Slide-in profile panel */}
      <div
        onClick={() => setSelectedIso(null)}
        aria-hidden={!profile}
        style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,26,0.18)', zIndex: 30, opacity: profile ? 1 : 0, pointerEvents: profile ? 'auto' : 'none', transition: 'opacity var(--dur) var(--ease)' }}
      />
      <aside
        aria-hidden={!profile}
        aria-label="Country profile"
        style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(var(--panel-width), 92vw)', background: 'var(--surface)', boxShadow: 'var(--shadow-panel)', zIndex: 31, overflowY: 'auto', transform: profile ? 'translateX(0)' : 'translateX(100%)', transition: 'transform var(--dur-panel) var(--ease)' }}
      >
        {profile && <ProfilePanel profile={profile} documents={documents[profile.iso3] ?? []} onClose={() => setSelectedIso(null)} />}
      </aside>
    </div>
  );
}
