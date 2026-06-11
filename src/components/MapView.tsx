import { useState } from 'react';
import { PROCESS_META, NO_DATA_COLOR, type StandardsProcess } from '../lib/process';

// React island stub for the interactive map. This proves the island wiring and
// gives a navigable interim list. Claude Design replaces the placeholder canvas
// with the real react-simple-maps world map, coloured by standards process, and
// wires selection to slide in the ProfilePanel.

export interface CountryDot {
  iso3: string;
  country: string;
  process: string | null;
}
interface Props {
  countries: CountryDot[];
}

function colorFor(process: string | null): string {
  if (process && process in PROCESS_META) {
    return PROCESS_META[process as StandardsProcess].color;
  }
  return NO_DATA_COLOR;
}

export default function MapView({ countries }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const withData = countries.filter((c) => c.process);
  const sorted = [...countries].sort((a, b) => a.country.localeCompare(b.country));
  const sel = countries.find((c) => c.iso3 === selected) ?? null;

  return (
    <div className="mapview">
      <div className="mapview-canvas" role="img" aria-label="World map placeholder">
        <p className="mapview-note">
          Interactive world map goes here. Claude Design builds this with react-simple-maps,
          coloured by standards process, with click-to-open profile.
        </p>
        <p className="mapview-count mono">{withData.length} countries with data</p>
      </div>

      {countries.length > 0 ? (
        <>
          <ul className="mapview-list">
            {sorted.map((c) => (
              <li key={c.iso3}>
                <button
                  type="button"
                  className={selected === c.iso3 ? 'is-selected' : ''}
                  onClick={() => setSelected(c.iso3)}
                >
                  <span className="dot" style={{ background: colorFor(c.process) }} aria-hidden="true" />
                  {c.country}
                </button>
              </li>
            ))}
          </ul>
          {sel && (
            <aside className="mapview-selected">
              <strong>{sel.country}</strong>{' '}
              <a href={`/countries/${sel.iso3.toLowerCase()}`}>open full profile &rarr;</a>
            </aside>
          )}
        </>
      ) : (
        <p className="mapview-empty">
          No country data loaded yet. Add your NOTION_TOKEN to .env and restart to pull live data.
        </p>
      )}

      <style>{`
        .mapview-canvas {
          border: 1px solid var(--hairline);
          background: var(--surface);
          padding: var(--space-8);
          text-align: center;
          border-radius: var(--radius);
        }
        .mapview-note { color: var(--ink-muted); max-width: 34rem; margin: 0 auto var(--space-2); }
        .mapview-count { color: var(--ink); }
        .mapview-list {
          list-style: none; margin: var(--space-6) 0 0; padding: 0;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--space-2);
        }
        .mapview-list button {
          display: flex; align-items: center; gap: var(--space-2);
          width: 100%; text-align: left; background: none; border: 1px solid transparent;
          padding: var(--space-2); font: inherit; color: inherit; cursor: pointer; border-radius: var(--radius);
        }
        .mapview-list button:hover { border-color: var(--hairline); }
        .mapview-list button.is-selected { border-color: var(--ink); }
        .mapview-list .dot { width: 0.8em; height: 0.8em; border-radius: 50%; flex: none; }
        .mapview-selected { margin-top: var(--space-4); padding: var(--space-3); border-top: 1px solid var(--hairline); }
        .mapview-empty { color: var(--ink-muted); font-style: italic; margin-top: var(--space-6); }
      `}</style>
    </div>
  );
}
