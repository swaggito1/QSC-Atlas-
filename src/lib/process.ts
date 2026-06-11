// The standards-process encoding: the ONLY functional colour in the whole site.
// Colour always means "which standards camp" - never decoration. Colours and
// plain-language labels come from the design brief. Shared by the map and the
// country profile panel so they always agree.

export type StandardsProcess = 'NIST' | 'ETSI' | 'ISO' | 'Sovereign' | 'Mixed';

export interface ProcessMeta {
  /** Raw Notion select value. */
  key: StandardsProcess;
  /** Plain-language label shown to visitors (never the raw value as jargon). */
  label: string;
  /** The single functional colour for this process. */
  color: string;
}

export const PROCESS_META: Record<StandardsProcess, ProcessMeta> = {
  NIST:      { key: 'NIST',      label: 'NIST-aligned',    color: '#2B4C7E' },
  ETSI:      { key: 'ETSI',      label: 'ETSI-aligned',    color: '#2E7D6F' },
  ISO:       { key: 'ISO',       label: 'ISO-aligned',     color: '#B07A2B' },
  Sovereign: { key: 'Sovereign', label: 'Sovereign track', color: '#7A3B5E' },
  Mixed:     { key: 'Mixed',     label: 'Mixed',           color: '#6B7280' },
};

/** Colour for a country with no data on the map (faint, recedes). */
export const NO_DATA_COLOR = '#E7E5DF';

/** Order used for the map legend and any process listing. */
export const PROCESS_ORDER: StandardsProcess[] = ['NIST', 'ETSI', 'ISO', 'Sovereign', 'Mixed'];

/** Look up the metadata for a raw select value, or null if absent/unknown. */
export function processMeta(value: string | null | undefined): ProcessMeta | null {
  if (!value) return null;
  return PROCESS_META[value as StandardsProcess] ?? null;
}
