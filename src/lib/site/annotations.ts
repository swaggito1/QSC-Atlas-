// The annotations sidecar (spec 16.1): the kind, status, bindingness and scope of profile lines,
// which the profile fields do not record. Read through loadDataset against AnnotationsFileSchema,
// so in production every row still marked verify: true (a lead) is dropped before any page sees it.

import { AnnotationsFileSchema, DATE_KINDS } from '../lab/schema';
import { loadDataset } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import type { AnnotationsFile, DateAnnotation, DateKind, InstrumentAnnotation } from '../lab/types';
import { memo, fileExists } from './joins';

export type { DateAnnotation, InstrumentAnnotation };
export type Kind = DateKind;
export const KINDS = DATE_KINDS;

export const ANNOTATIONS_FILE = 'data/lab/annotations/annotations.json';

/** Every annotation row the build may use: leads included in preview, dropped in production. */
export function loadAnnotations(opts: LoadOptions = {}): AnnotationsFile {
  return memo('annotations', [ANNOTATIONS_FILE], opts, () =>
    fileExists(ANNOTATIONS_FILE, opts) ? loadDataset(ANNOTATIONS_FILE, AnnotationsFileSchema, opts) : { dates: [], instruments: [] },
  );
}

/** The annotation of one timeline line, matched by ISO3, year and a substring of the label. */
export function dateAnnotation(iso3: string, year: number, label: string, opts: LoadOptions = {}): DateAnnotation | null {
  const code = iso3.toUpperCase();
  return loadAnnotations(opts).dates.find((a) => a.iso3 === code && a.year === year && label.includes(a.match)) ?? null;
}

/** The annotation of one regulation line, matched by ISO3 and a substring of the instrument. */
export function instrumentAnnotation(iso3: string, instrument: string, opts: LoadOptions = {}): InstrumentAnnotation | null {
  const code = iso3.toUpperCase();
  return loadAnnotations(opts).instruments.find((a) => a.iso3 === code && instrument.includes(a.match)) ?? null;
}
