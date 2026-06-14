// The regulatory layer: how binding a country's QSC governance is, and the
// instruments behind it. Labels and helpers shared by the country profile.
//
// Note: the analytical note is deliberately NOT handled here and is NOT read by
// the site loader (src/content.config.ts). It is an internal working field,
// redacted from the public build, and lives only in the canonical mirror
// (data/profiles/*.json). See docs/REGULATORY_LAYER_SPEC.md, section 2.4.

export type LegalStatus = 'binding' | 'soft-only' | 'none';
export type InstrumentStatus =
  | 'binding-law'
  | 'binding-by-market-access'
  | 'soft-law'
  | 'guidance';

export interface LegalStatusMeta {
  key: LegalStatus;
  label: string;
}

export interface InstrumentStatusMeta {
  key: InstrumentStatus;
  label: string;
  binding: boolean;
}

export const LEGAL_STATUS_META: Record<LegalStatus, LegalStatusMeta> = {
  binding: { key: 'binding', label: 'Binding' },
  'soft-only': { key: 'soft-only', label: 'Soft law only' },
  none: { key: 'none', label: 'No instrument' },
};

export const INSTRUMENT_STATUS_META: Record<InstrumentStatus, InstrumentStatusMeta> = {
  'binding-law': { key: 'binding-law', label: 'Binding law', binding: true },
  'binding-by-market-access': {
    key: 'binding-by-market-access',
    label: 'Binding (market access)',
    binding: true,
  },
  'soft-law': { key: 'soft-law', label: 'Soft law', binding: false },
  guidance: { key: 'guidance', label: 'Guidance', binding: false },
};

/** Metadata for a legalStatus value, or null if absent/unknown. */
export function legalStatusMeta(value: string | null | undefined): LegalStatusMeta | null {
  if (!value) return null;
  return LEGAL_STATUS_META[value as LegalStatus] ?? null;
}

/** Metadata for an instrument status value, or null if absent/unknown. */
export function instrumentStatusMeta(
  value: string | null | undefined,
): InstrumentStatusMeta | null {
  if (!value) return null;
  return INSTRUMENT_STATUS_META[value as InstrumentStatus] ?? null;
}

/** Derive the legalStatus roll-up from a set of instrument statuses. */
export function deriveLegalStatus(statuses: (string | null | undefined)[]): LegalStatus {
  const known = statuses
    .map((s) => INSTRUMENT_STATUS_META[s as InstrumentStatus])
    .filter((m): m is InstrumentStatusMeta => Boolean(m));
  if (known.length === 0) return 'none';
  return known.some((m) => m.binding) ? 'binding' : 'soft-only';
}
