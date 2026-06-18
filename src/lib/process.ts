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
// ETSI and ISO are kept in PROCESS_META so a country can still be coloured if
// classified that way, but they are dropped from the legend until any country uses them.
export const PROCESS_ORDER: StandardsProcess[] = ['NIST', 'EU', 'Sovereign', 'Mixed'];

/** Look up the metadata for a raw select value, or null if absent/unknown. */
export function processMeta(value: string | null | undefined): ProcessMeta | null {
  if (!value) return null;
  return PROCESS_META[value as StandardsProcess] ?? null;
}

// ---------------------------------------------------------------------------
// The two-field classification model (docs/CLASSIFICATION_MODEL.md).
//
// Coordination posture answers "whose club / timeline" and is the MAP COLOUR.
// Standards role answers "whose algorithms" and is shown as a BADGE. The two are
// deliberately separate: an EU member coordinates through the EU roadmap yet runs
// the NIST algorithms underneath, and one colour cannot say both.
// ---------------------------------------------------------------------------

export type CoordinationPosture = 'EU' | 'NIST-bloc' | 'sovereign-bloc' | 'engaged-unaligned';

export interface PostureMeta {
  key: CoordinationPosture;
  label: string; // full reader-facing label
  short: string; // compact label for chips and tooltips
  color: string;
}

export const POSTURE_META: Record<CoordinationPosture, PostureMeta> = {
  'NIST-bloc': { key: 'NIST-bloc', label: 'NIST-led ecosystem', short: 'NIST bloc', color: '#2b4c7e' },
  EU: { key: 'EU', label: 'EU coordinated roadmap', short: 'EU roadmap', color: '#5b54a8' },
  'sovereign-bloc': { key: 'sovereign-bloc', label: 'Sovereign bloc', short: 'Sovereign', color: '#7a3b5e' },
  'engaged-unaligned': { key: 'engaged-unaligned', label: 'Engaged but unaligned', short: 'Engaged', color: '#6b7280' },
};

/** Order for the legend and any posture listing. */
export const POSTURE_ORDER: CoordinationPosture[] = ['NIST-bloc', 'EU', 'sovereign-bloc', 'engaged-unaligned'];

export function postureMeta(value: string | null | undefined): PostureMeta | null {
  if (!value) return null;
  return POSTURE_META[value as CoordinationPosture] ?? null;
}

export type StandardsRole = 'setter' | 'contextualiser' | 'taker' | 'sovereign-developer';

export interface RoleMeta {
  key: StandardsRole;
  label: string;
  short: string; // compact label for the census and the how-to-read key
  color: string; // used only when the map is recoloured by role
}

export const ROLE_META: Record<StandardsRole, RoleMeta> = {
  setter: { key: 'setter', label: 'Standard-maker', short: 'Maker', color: '#a8322a' }, // key kept as 'setter' for data stability; display term is "Standard-maker"
  contextualiser: { key: 'contextualiser', label: 'Standard-contextualiser', short: 'Contextualiser', color: '#b9762e' },
  taker: { key: 'taker', label: 'Standard-taker', short: 'Taker', color: '#4a6fa5' },
  'sovereign-developer': { key: 'sovereign-developer', label: 'Sovereign developer', short: 'Sovereign developer', color: '#7a3b5e' },
};

export const ROLE_ORDER: StandardsRole[] = ['setter', 'contextualiser', 'taker', 'sovereign-developer'];

export function roleMeta(value: string | null | undefined): RoleMeta | null {
  if (!value) return null;
  return ROLE_META[value as StandardsRole] ?? null;
}

/** Confidence drives map opacity so soft calls look soft. */
export function confidenceOpacity(value: string | null | undefined): number {
  if (value === 'High') return 1;
  if (value === 'Medium') return 0.74;
  if (value === 'Low') return 0.5;
  return 0.74;
}
