// QSC Atlas Labs: TypeScript types inferred from the zod schemas in ./schema.ts.
// The schemas are the single definition; never write these shapes out by hand.

import type { z } from 'zod';
import type {
  SourceClassSchema,
  PrecisionSchema,
  LifecycleStatusSchema,
  ProvenanceSchema,
  CheckedSchema,
  DatedEventSchema,
  StatusHistoryEntrySchema,
  LabToolSchema,
  ToolsFileSchema,
  MemberSchema,
  MembershipListSchema,
  MembershipsFileSchema,
  TOOL_SECTIONS,
  TOOL_SITES,
  DATE_KINDS,
  AnnotationsFileSchema,
  CrosswalkFileSchema,
  IssuerAliasesFileSchema,
  ReleasesFileSchema,
  InventoryFileSchema,
  ApproachFileSchema,
} from './schema';

export type SourceClass = z.infer<typeof SourceClassSchema>;
export type Precision = z.infer<typeof PrecisionSchema>;
// Lifecycle status of an instrument. A separate axis from the bindingness vocabulary
// already exported as InstrumentStatus by src/lib/regulation.ts; do not merge the two.
export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;

export type Provenance = z.infer<typeof ProvenanceSchema>;
export type Checked = z.infer<typeof CheckedSchema>;
export type DatedEvent = z.infer<typeof DatedEventSchema>;
export type StatusHistoryEntry = z.infer<typeof StatusHistoryEntrySchema>;

// A registry entry as loaded: legacyRoutes and requires are always arrays after parsing.
export type LabTool = z.infer<typeof LabToolSchema>;
export type ToolsFile = z.infer<typeof ToolsFileSchema>;
export type ToolSection = (typeof TOOL_SECTIONS)[number];
export type ToolSite = (typeof TOOL_SITES)[number];
export type Member = z.infer<typeof MemberSchema>;
export type MembershipList = z.infer<typeof MembershipListSchema>;
export type MembershipsFile = z.infer<typeof MembershipsFileSchema>;

// qscatlas.org site datasets (spec 16.7)
export type DateKind = (typeof DATE_KINDS)[number];
export type AnnotationsFile = z.infer<typeof AnnotationsFileSchema>;
export type DateAnnotation = AnnotationsFile['dates'][number];
export type InstrumentAnnotation = AnnotationsFile['instruments'][number];
export type CrosswalkFile = z.infer<typeof CrosswalkFileSchema>;
export type IssuerAliasesFile = z.infer<typeof IssuerAliasesFileSchema>;
export type ReleasesFile = z.infer<typeof ReleasesFileSchema>;
export type InventoryFile = z.infer<typeof InventoryFileSchema>;
export type ApproachFile = z.infer<typeof ApproachFileSchema>;
