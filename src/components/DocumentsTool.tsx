import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';

// The documents research tool. Full-text fuzzy search over title + summary
// (Fuse.js), combined with exact-match facet filters. When a visitor arrives
// from a country profile via /documents?org=..., the issuing-organisation
// filter is applied automatically and shown with a clear way to remove it.

export interface Doc {
  title: string;
  country?: string | null;
  issuingOrg?: string | null;
  year?: number | null;
  docType?: string | null;
  tier?: string | null;
  url?: string | null;
  summary?: string | null;
}
interface Props {
  documents: Doc[];
}

const uniqueSorted = (values: (string | null | undefined)[]): string[] =>
  [...new Set(values.filter((v): v is string => !!v))].sort();

export default function DocumentsTool({ documents }: Props) {
  const [q, setQ] = useState('');
  const [org, setOrg] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [type, setType] = useState('');
  const [tier, setTier] = useState('');

  // Read the pre-filter from the URL on mount (?org=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const o = params.get('org');
    if (o) setOrg(o);
  }, []);

  const fuse = useMemo(
    () => new Fuse(documents, { keys: ['title', 'summary'], threshold: 0.4, ignoreLocation: true }),
    [documents],
  );

  const countries = useMemo(() => uniqueSorted(documents.map((d) => d.country)), [documents]);
  const types = useMemo(() => uniqueSorted(documents.map((d) => d.docType)), [documents]);
  const tiers = useMemo(() => uniqueSorted(documents.map((d) => d.tier)), [documents]);

  const base = q.trim() ? fuse.search(q).map((r) => r.item) : documents;
  const results = base.filter(
    (d) =>
      (!org || d.issuingOrg === org) &&
      (!country || d.country === country) &&
      (!type || d.docType === type) &&
      (!tier || d.tier === tier),
  );

  const noData = documents.length === 0;

  return (
    <div className="docs-tool">
      <input
        className="docs-search"
        type="search"
        placeholder="Search title and summary..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search documents"
      />

      <div className="docs-filters">
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Filter by country">
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by tier">
          <option value="">All tiers</option>
          {tiers.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {org && (
          <span className="org-pill">
            showing: {org}
            <button type="button" onClick={() => setOrg(null)} aria-label="Clear organisation filter">
              &times;
            </button>
          </span>
        )}
      </div>

      {noData ? (
        <p className="docs-empty">
          No documents loaded yet. Add your NOTION_TOKEN to .env and restart to pull live data.
        </p>
      ) : results.length === 0 ? (
        <p className="docs-empty">
          Nothing matches those filters. Try clearing a filter or broadening your search.
        </p>
      ) : (
        <table className="docs-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Organisation</th>
              <th>Country</th>
              <th>Year</th>
              <th>Type</th>
              <th>Tier</th>
            </tr>
          </thead>
          <tbody>
            {results.map((d, i) => (
              <tr key={`${d.title}-${i}`}>
                <td>
                  {d.url ? (
                    <a href={d.url} target="_blank" rel="noopener">{d.title}</a>
                  ) : (
                    d.title
                  )}
                  {d.summary && <span className="row-summary">{d.summary}</span>}
                </td>
                <td>{d.issuingOrg ?? ''}</td>
                <td>{d.country ?? ''}</td>
                <td className="mono">{d.year ?? ''}</td>
                <td>{d.docType ?? ''}</td>
                <td className="mono">{d.tier ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="docs-count mono">{noData ? '' : `${results.length} of ${documents.length} documents`}</p>

      <style>{`
        .docs-search {
          width: 100%; font: inherit; padding: var(--space-3) var(--space-4);
          border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--surface);
        }
        .docs-filters { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: var(--space-4) 0; align-items: center; }
        .docs-filters select { font: inherit; padding: var(--space-2); border: 1px solid var(--hairline); border-radius: var(--radius); background: var(--surface); }
        .org-pill { display: inline-flex; align-items: center; gap: var(--space-2); font-size: 0.85rem; border: 1px solid var(--ink); border-radius: var(--radius); padding: 0.2em 0.6em; }
        .org-pill button { background: none; border: none; cursor: pointer; font: inherit; font-size: 1.1em; line-height: 1; padding: 0; color: var(--ink-muted); }
        .docs-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
        .docs-table th { text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-muted); border-bottom: 1px solid var(--ink); padding: var(--space-2) var(--space-3); }
        .docs-table td { padding: var(--space-3); border-bottom: 1px solid var(--hairline); vertical-align: top; }
        .row-summary { display: block; font-size: 0.8rem; color: var(--ink-muted); margin-top: 2px; }
        .docs-empty { color: var(--ink-muted); font-style: italic; margin: var(--space-8) 0; }
        .docs-count { color: var(--ink-muted); font-size: 0.78rem; margin-top: var(--space-4); }
        @media (max-width: 640px) {
          .docs-table, .docs-table thead, .docs-table tbody, .docs-table tr, .docs-table td { display: block; }
          .docs-table thead { display: none; }
          .docs-table tr { border: 1px solid var(--hairline); border-radius: var(--radius); margin-bottom: var(--space-3); padding: var(--space-2); }
          .docs-table td { border: none; padding: var(--space-1) var(--space-2); }
        }
      `}</style>
    </div>
  );
}
