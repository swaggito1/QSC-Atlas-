// The standards-process encoding: the ONLY functional colour in the whole site.
// Colour always means "which standards camp" - never decoration. Colours and
// plain-language labels shared by the map, the legend, and the country profile
// chip so they always agree.
//
// EU = the EU coordinated roadmap (NIS Cooperation Group), the camp EU member
// states align to. A country may also carry a SECONDARY process (e.g. France is
// EU-aligned with a Sovereign sub-label); the map colours by the primary, the
// profile shows both.

export type StandardsProcess = 'NIST' | 'EU' | 'ETSI' | 'ISO' | 'Sovereign' | 'Mixed';

export interface ProcessMeta {
  key: StandardsProcess;
  label: string;
  color: string;
}

export const PROCESS_META: Record<StandardsProcess, ProcessMeta> = {
  NIST: { key: 'NIST', label: 'NIST-aligned', color: '#2b4c7e' },
  EU: { key: 'EU', label: 'EU-aligned', color: '#5b54a8' },
  ETSI: { key: 'ETSI', label: 'ETSI-aligned', color: '#2e7d6f' },
  ISO: { key: 'ISO', label: 'ISO-aligned', color: '#b07a2b' },
  Sovereign: { key: 'Sovereign', label: 'Sovereign track', color: '#7a3b5e' },
  Mixed: { key: 'Mixed', label: 'Mixed', color: '#6b7280' },
};

/** Colour for a country with no data on the map (faint, recedes). */
export const NO_DATA_COLOR = '#e7e5df';

/** Order used for the map legend and any process listing. */
export const PROCESS_ORDER: StandardsProcess[] = ['NIST', 'EU', 'ETSI', 'ISO', 'Sovereign', 'Mixed'];

/** Look up the metadata for a raw select value, or null if absent/unknown. */
export function processMeta(value: string | null | undefined): ProcessMeta | null {
  if (!value) return null;
  return PROCESS_META[value as StandardsProcess] ?? null;
}
