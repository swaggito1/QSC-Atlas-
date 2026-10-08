// QSC Atlas Labs: the data contract every lab tool uses.
//
// Every value a lab tool shows carries its evidence. A record is "checked" when it has
// verify: false, a verifiedAt date and at least one provenance entry quoting the source.
// Seed records arrive with verify: true: they are leads, never rendered in production.
//
// This file is imported by the Astro build (through load.ts) and by the Node scripts in
// scripts/lab/ (through Node's TypeScript type stripping), so it uses only erasable
// TypeScript syntax: no enums, no namespaces, and only type-only imports of types.

import { z } from 'zod';

// ---- vocabularies ----------------------------------------------------------

export const SOURCE_CLASSES = ['trusted-institutional', 'new-institutional', 'secondary'] as const;
export const PRECISIONS = ['day', 'month', 'year'] as const;

// Lifecycle status of an instrument. A separate axis from the bindingness vocabulary
// already exported as InstrumentStatus by src/lib/regulation.ts; do not merge the two.
export const LIFECYCLE_STATUSES = [
  'proposal',
  'adopted',
  'in-force',
  'applies-from',
  'repealed',
  'withdrawn',
  'published',
  'superseded',
] as const;

export const TOOL_STATUSES = ['planned', 'building', 'preview', 'public', 'retired'] as const;

export const SourceClassSchema = z.enum(SOURCE_CLASSES);
export const PrecisionSchema = z.enum(PRECISIONS);
export const LifecycleStatusSchema = z.enum(LIFECYCLE_STATUSES);

// ---- dates -----------------------------------------------------------------

export const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const ISO_YEAR = /^\d{4}$/;

export const IsoDaySchema = z.string().regex(ISO_DAY, 'expected an ISO date (YYYY-MM-DD)');
export const IsoDateSchema = z
  .string()
  .refine((s) => ISO_DAY.test(s) || ISO_MONTH.test(s) || ISO_YEAR.test(s), 'expected an ISO date (YYYY, YYYY-MM or YYYY-MM-DD)');

// ---- evidence --------------------------------------------------------------

export const ProvenanceSchema = z.object({
  url: z.string().url(), // the page or document the excerpt was read from
  title: z.string().optional(),
  publisher: z.string().optional(),
  retrievedAt: IsoDaySchema, // the date the excerpt was read
  excerpt: z.string(), // verbatim, 60 words at most (checked by scripts/lab/validate.mjs)
  locator: z.string().optional(), // "Article 23(4)", "p. 14", "Box 1"
  sourceClass: SourceClassSchema,
});

// Spread into any record schema that carries evidence.
export const checkedShape = {
  verify: z.boolean(), // true = lead, not yet confirmed; never rendered in production
  verifiedAt: IsoDaySchema.nullable(), // date of confirmation
  provenance: z.array(ProvenanceSchema), // at least one entry when verify is false
};
export const CheckedSchema = z.object(checkedShape);

export const DatedEventSchema = z.object({
  ...checkedShape,
  id: z.string().min(1),
  date: IsoDateSchema.nullable(), // "2024-08" allowed when precision is "month"
  precision: PrecisionSchema.nullable(),
  label: z.string().min(1), // plain language, house style
});

export const StatusHistoryEntrySchema = z.object({
  status: LifecycleStatusSchema,
  date: IsoDateSchema,
  precision: PrecisionSchema,
  provenance: ProvenanceSchema,
});

// ---- shared files ----------------------------------------------------------

// The section of the site a tool's pages belong to (spec 14.1): the header item above them.
export const TOOL_SECTIONS = ['countries', 'standards', 'prepare'] as const;
// Which website a tool belongs to. "ai" tools wait for a separate AI site and are never built on
// the Atlas (Swann, 1 October 2026); "research" tools are built only on Swann's machine, never on
// any Vercel deployment. "elsewhere" tools are kept for another website (Swann, 2 October 2026):
// built only on Swann's machine, at a route under /elsewhere, and never linked or named from an
// Atlas page in any build. Absent means the Atlas.
export const TOOL_SITES = ['atlas', 'ai', 'research', 'elsewhere'] as const;
// A site path: lower case, digits, hyphens and slashes, with a leading slash and no trailing one.
export const ROUTE = /^\/[a-z0-9-]+(\/[a-z0-9-]+)*$/;

export const LabToolSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    route: z.string().regex(ROUTE, 'expected a lower-case site path such as /prepare/check'),
    byline: z.string().min(1),
    public: z.boolean(),
    status: z.enum(TOOL_STATUSES),
    gates: z.array(z.string()),
    promise: z.string().optional(), // the one-line promise under the title
    site: z.enum(TOOL_SITES).optional(),
    section: z.enum(TOOL_SECTIONS).optional(), // required for an Atlas tool (checked below)
    // old addresses that redirect here (vercel.json); a test keeps each rule's permanence equal to public
    legacyRoutes: z.array(z.string().regex(ROUTE)).default([]),
    // ids of tools that must be shown before this one is (the Prepare elements need the Readiness Check)
    requires: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    publishedAt: IsoDaySchema.optional(), // the day the tool went public; required when public is true
  })
  .superRefine((t, ctx) => {
    if (t.public && !t.publishedAt) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['publishedAt'], message: 'publishedAt is required when public is true' });
    }
    const site = t.site ?? 'atlas';
    if (site === 'atlas' && !t.section) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['section'], message: 'an Atlas tool needs a section (countries, standards or prepare)' });
    }
    if (site === 'research' && !t.route.startsWith('/research/')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['route'], message: 'a research tool has a route starting with /research/' });
    }
    if (site === 'elsewhere' && !t.route.startsWith('/elsewhere/')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['route'], message: 'a tool kept for another website has a route starting with /elsewhere/' });
    }
    // a section puts a tool in the Atlas's menus and hubs, so only an Atlas tool has one
    if (site !== 'atlas' && t.section) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['section'], message: `a tool of site ${site} has no section; only an Atlas tool belongs to one` });
    }
    // only an Atlas tool's old addresses redirect to it: a tool of another site is never sent visitors
    if (site !== 'atlas' && t.legacyRoutes.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['legacyRoutes'], message: `a tool of site ${site} has no legacy routes; vercel.json sends its old addresses elsewhere` });
    }
    if (t.requires.includes(t.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['requires'], message: 'a tool cannot require itself' });
    }
  });

export const ToolsFileSchema = z
  .object({
    _about: z.string().optional(),
    tools: z.array(LabToolSchema),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    const routes = new Set<string>();
    file.tools.forEach((t, i) => {
      if (ids.has(t.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tools', i, 'id'], message: `duplicate tool id ${t.id}` });
      ids.add(t.id);
      for (const r of [t.route, ...t.legacyRoutes]) {
        if (routes.has(r)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tools', i, 'route'], message: `route ${r} is used twice` });
        routes.add(r);
      }
    });
    file.tools.forEach((t, i) => {
      for (const r of t.requires) {
        if (!ids.has(r)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tools', i, 'requires'], message: `requires an unknown tool ${r}` });
      }
    });
  });

export const MemberSchema = z.object({
  iso3: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().min(1), // as the official list names it
});

export const MembershipListSchema = z.object({
  ...checkedShape,
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  count: z.number().int().positive(),
  members: z.array(MemberSchema).min(1),
});

export const MembershipsFileSchema = z.object({
  _about: z.string().optional(),
  lists: z.array(MembershipListSchema),
});

// The fixture used to prove the watch pipeline end to end (prompt 00, Step 10).
// Never loaded by a page.
export const FixtureRecordSchema = DatedEventSchema.extend({
  status: LifecycleStatusSchema,
  statusHistory: z.array(StatusHistoryEntrySchema).min(1),
});

export const FixtureFileSchema = z.object({
  _about: z.string().optional(),
  records: z.array(FixtureRecordSchema),
});

// ---- shared helpers for tool files ---------------------------------------------

// Every visitor-facing string of a tool is kept under "copy", so the style gate checks it.
export const CopyFileSchema = z.object({
  _about: z.string().optional(),
  copy: z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())])),
});

const verbatimQuote = z.object({ quote: z.string().min(1), locator: z.string().min(1) });

// ---- Exposure Clock (prompt 01) -----------------------------------------------------

export const SurveyPointSchema = z.object({
  ...checkedShape,
  horizonYears: z.number().int().positive(),
  lower: z.number().min(0).max(1),
  upper: z.number().min(0).max(1),
});

export const SurveyFileSchema = z.object({
  _about: z.string().optional(),
  survey: z.object({
    ...checkedShape,
    id: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    publishers: z.array(z.string()),
    edition: z.number().int().positive().nullable(),
    experts: z.number().int().positive().nullable(),
    published: IsoDateSchema, // the report's publication date (YYYY-MM allowed)
    baseYear: z.number().int(), // the year from which the survey counts its horizons
    reportUrl: z.string().url(),
    summaryUrl: z.string().url().nullable(),
    definitionVerbatim: z.string().min(1), // the survey's own definition of a CRQC, verbatim
    definitionLocator: z.string().min(1),
    rangeMethod: verbatimQuote, // how the lower and upper figures are built, verbatim
  }),
  points: z.array(SurveyPointSchema),
  context: z.array(DatedEventSchema.extend({ publisher: z.string(), url: z.string().url() })).default([]),
  method: z.object({ ...checkedShape, reference: z.string(), doi: z.string().nullable() }),
});

// A period a source documents for one kind of data. basis says which period it is:
// confidentiality (how long the information must stay secret), closure (how long access is barred)
// or retention (only how long a record is kept, at most a lower bound). iso3 null is a general
// value, for anywhere the Atlas holds nothing closer; euMembers carries an EU rule (iso3 "EUU") to
// each Member State without a period of its own.
export const ShelfLifeDefaultSchema = z.object({
  ...checkedShape,
  iso3: z.string().regex(/^[A-Z]{3,4}$/).nullable(),
  years: z.number().positive(),
  basis: z.enum(['retention', 'confidentiality', 'closure']), // which period the document sets
  basisNote: z.string().min(1),
  euMembers: z.boolean().default(false),
  // the source's short name beside the value, linked to the first provenance entry; its full
  // title stays in the sources list
  sourceName: z.string().min(1).optional(),
});

// A secrecy duty a source sets with no end in time (medical secrecy after death, a trade secret
// protected for as long as it stays secret): the slider starts at its maximum and says why.
export const ShelfLifeNoEndSchema = ShelfLifeDefaultSchema.omit({ years: true, basis: true }).extend({
  basis: z.literal('confidentiality'),
});

export const PresetsFileSchema = z.object({
  _about: z.string().optional(),
  presets: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      label: z.string().min(1),
      description: z.string().min(1),
      publicAdmin: z.boolean(),
      defaults: z.array(ShelfLifeDefaultSchema),
      noEnd: z.array(ShelfLifeNoEndSchema).default([]),
    }),
  ),
});

export const DeadlineExtraSchema = DatedEventSchema.extend({
  issuer: z.string().min(1),
  lane: z.enum(['roadmap', 'standards']),
  appliesToPosture: z.string().nullable(), // 'EU' for the EU coordinated roadmap
  documentStatus: z.enum(['draft', 'final', 'recommendation']),
});

export const DeadlinesExtraFileSchema = z.object({
  _about: z.string().optional(),
  deadlines: z.array(DeadlineExtraSchema),
});

// ---- Standards Cascade (prompt 02) -------------------------------------------------

export const CASCADE_RELATIONS = ['adopts', 'references', 'profiles', 'participates', 'fork', 'parallel-interoperable'] as const;

export const SpineEventSchema = DatedEventSchema.extend({
  body: z.string().min(1),
  kind: z.enum(['nist', 'coordination', 'sovereign']),
  standards: z.array(z.string()), // standard ids from standards.json
  iso3: z.string().nullable().default(null),
  relation: z.enum(CASCADE_RELATIONS).nullable().default(null),
});

export const SpineFileSchema = z.object({ _about: z.string().optional(), spine: z.array(SpineEventSchema) });

// The bodies that publish standards (data/lab/cascade/bodies.json, 5 October 2026): each
// standard names its body by id (StandardSchema.bodyId), so no page has to read a body's name
// out of free text. A national body carries the ISO3 code of its country.
export const BODY_KINDS = [
  'international-standards-body',
  'regional-standards-body',
  'national-standards-body',
  'national-agency',
  'research-group',
  'industry-consortium',
] as const;

export const BodySchema = z.object({
  ...checkedShape,
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1), // the body's full name
  shortName: z.string().min(1), // the name a heading uses: "NIST", "ISO/IEC"
  kind: z.enum(BODY_KINDS),
  iso3: z.string().regex(/^[A-Z]{3}$/).nullable().default(null), // a national body's country
  url: z.string().url(),
  description: z.string().min(1), // one plain line for the Standards overview (visible copy)
});

export const BodiesFileSchema = z.object({ _about: z.string().optional(), bodies: z.array(BodySchema) });

// A standards lifecycle, the third status vocabulary of the Atlas: kept apart from the legal
// LifecycleStatus above and from the bindingness labels of src/lib/regulation.ts, and never
// mixed with either. standardStatus is the Atlas's normalised value; bodyStatus keeps the body's
// own words ("RFC, Proposed Standard", "International Standard published [60.60]").
export const STANDARD_STATUSES = ['final', 'draft', 'selected', 'national', 'in-development', 'withdrawn', 'superseded'] as const;

export const STANDARD_KINDS = [
  'key-establishment',
  'signature',
  'stateful-signature',
  'hybrid',
  'transition',
  'national-suite',
  'protocol',
  'pki',
  'kem',
  'terminology',
  'implementation-guidance',
  'migration',
  'inventory',
] as const;

// What kind of document a standard is, so a report never reads as a specification: an ETSI TR
// or GR, a NIST IR and an informational RFC are reports; a FIPS, an ETSI TS, an International
// Standard and a Proposed Standard RFC are specifications (normative).
export const DELIVERABLES = [
  'fips',
  'nist-sp',
  'nist-ir',
  'rfc',
  'internet-draft',
  'etsi-ts',
  'etsi-tr',
  'etsi-gr',
  'iso-is',
  'iso-amd',
  'itu-rec',
  '3gpp-tr',
  'x9-standard',
  'x9-tr',
  'ieee-par',
  'cen-wi',
  'cen-tr',
  'national',
] as const;

// How a standard can be named: its official identifier or title, an algorithm name used before
// the standard renamed it, or the name of the Internet-Draft an RFC was published from
// ("draft-ietf-tls-ecdhe-mlkem" for RFC 10024). The candidate search matches all three.
export const SYNONYM_TYPES = ['official', 'pre-standard', 'draft-name'] as const;

export const StandardSchema = z.object({
  ...checkedShape,
  id: z.string().regex(/^[A-Za-z0-9-]+$/),
  label: z.string().min(1),
  body: z.string().min(1), // the body's name as free text, kept for older readers; bodyId is the key
  bodyId: z.string().regex(/^[a-z0-9-]+$/), // an id in bodies.json (scripts/lab/invariants/cascade.mjs)
  kind: z.enum(STANDARD_KINDS),
  standardStatus: z.enum(STANDARD_STATUSES),
  bodyStatus: z.string().min(1).nullable().default(null), // the body's own words, or null
  statusDate: IsoDateSchema.nullable().default(null), // when the body gave it that status
  statusPrecision: PrecisionSchema.nullable().default(null),
  deliverable: z.enum(DELIVERABLES),
  normative: z.boolean(), // a specification (true) or a report or draft (false)
  version: z.string().min(1).nullable().default(null), // "V1.2.2"
  supersedes: z.string().nullable().default(null), // a standard id in standards.json
  buildsOn: z.array(z.string()).default([]), // standard ids in standards.json ("uses FIPS 203")
  // one of the Standards Cascade's own records (the default, as every record was before 5 October
  // 2026): the Cascade, the profiles' standards rows and the documents' notes read these only, so a
  // standard added for the overview (cascade: false) changes none of them
  cascade: z.boolean().default(true),
  national: z.string().nullable().default(null), // ISO3 of a national scheme
  synonyms: z.array(z.object({ text: z.string().min(2), type: z.enum(SYNONYM_TYPES) })).min(1),
  url: z.string().url(),
});

export const StandardsFileSchema = z.object({ _about: z.string().optional(), standards: z.array(StandardSchema) });

// How a document wrote the standard it names: its official identifier or title, an earlier
// algorithm name, the name of the Internet-Draft it later became an RFC from, or code points only.
export const NAMED_AS_TYPES = ['official', 'pre-standard', 'draft-name', 'code-point'] as const;

export const CascadeEdgeSchema = z.object({
  ...checkedShape,
  id: z.string().min(1),
  from: z.string().min(2), // ISO3, or a body id such as "ETSI"
  to: z.string().min(2), // a standard id, or a body id for "participates"
  relation: z.enum(CASCADE_RELATIONS),
  preStandardOnly: z.boolean().default(false), // the document names only a pre-standard name
  // the identifier exactly as the document wrote it ("draft-ietf-tls-hybrid-design-12"), and what
  // kind of name that is; null on the Cascade's earlier records, which preStandardOnly describes
  namedAs: z.string().min(1).nullable().default(null),
  namedAsType: z.enum(NAMED_AS_TYPES).nullable().default(null),
  // read by the Standards Cascade (the default, as every edge was before 5 October 2026); an edge
  // entered for the Standards overview carries cascade: false, so the Cascade never shows it, even
  // when it names one of the Cascade's own standards (ETSI TS 103 744)
  cascade: z.boolean().default(true),
  // null only on a lead whose document carries no date the Atlas has read yet; a verified edge is
  // always dated (scripts/lab/invariants/cascade.mjs)
  date: IsoDateSchema.nullable(),
  precision: PrecisionSchema.nullable(),
  documentTitle: z.string().min(1),
  documentUrl: z.string().url(),
  issuingOrg: z.string().min(1),
});

export const EdgesFileSchema = z.object({ _about: z.string().optional(), edges: z.array(CascadeEdgeSchema) });

export const CandidatesFileSchema = z.object({
  _about: z.string().optional(),
  generatedAt: z.string(),
  candidates: z.array(
    z.object({
      docUrl: z.string(),
      docTitle: z.string(),
      issuingOrg: z.string().nullable(),
      iso3: z.string(),
      year: z.number().nullable(),
      matchedSynonym: z.string(),
      standardId: z.string(),
      field: z.enum(['title', 'summary']),
    }),
  ),
});

export const RejectedFileSchema = z.object({
  _about: z.string().optional(),
  rejected: z.array(z.object({ docUrl: z.string(), standardId: z.string(), reason: z.string().min(1), checkedAt: IsoDaySchema })),
});

// ---- Rulebook in Motion (prompt 03) ------------------------------------------------

export const ActSchema = z.object({
  ...checkedShape,
  celex: z.string().regex(/^3\d{4}[A-Z]\d{4}$/),
  eli: z.string().url().nullable(),
  shortTitle: z.string().min(1),
  documentTitle: z.string().min(1), // the full English title, verbatim
  documentDate: IsoDaySchema,
  entryIntoForce: IsoDaySchema.nullable(),
  applies: z.array(
    z.object({ date: IsoDateSchema, precision: PrecisionSchema, label: z.string().min(1), provenance: z.array(ProvenanceSchema).min(1) }),
  ),
  status: LifecycleStatusSchema,
  statusHistory: z.array(StatusHistoryEntrySchema).min(1),
  consolidatedVersion: IsoDaySchema.nullable(),
  related: z.array(
    z.object({ celex: z.string(), relation: z.string(), documentDate: IsoDaySchema.nullable(), sourceTitle: z.string() }),
  ),
});

export const ActsFileSchema = z.object({ _about: z.string().optional(), checkedAt: IsoDaySchema, acts: z.array(ActSchema) });

export const ProposalSchema = z.object({
  ...checkedShape,
  id: z.string(),
  com: z.string().regex(/^COM\(\d{4}\) \d+$/),
  celex: z.string(),
  procedure: z.string(),
  documentTitle: z.string().min(1),
  label: z.string().min(1),
  commissionUrl: z.string().url().nullable(),
  oeilUrl: z.string().url().nullable(),
  status: z.literal('proposal'),
  statusHistory: z.array(StatusHistoryEntrySchema).min(1),
  stage: z.object({ label: z.string().min(1), date: IsoDateSchema, precision: PrecisionSchema, provenance: z.array(ProvenanceSchema).min(1) }),
  amends: z.array(z.string()), // CELEX of the base acts it would amend
  touches: z.array(z.object({ celex: z.string(), articleRef: z.string(), summary: z.string().min(1) })),
});

export const ProposalsFileSchema = z.object({ _about: z.string().optional(), proposals: z.array(ProposalSchema) });

export const ArticleTextFileSchema = z.object({
  _about: z.string().optional(),
  celex: z.string(),
  consolidatedVersion: IsoDaySchema.nullable(),
  sourceUrl: z.string().url(),
  retrievedAt: IsoDaySchema,
  articles: z.array(
    z.object({
      id: z.string(),
      ref: z.string(), // "Article 23"
      sourceTitle: z.string(), // the article heading, verbatim
      theme: z.enum(['scope', 'definitions', 'risk-management', 'incident-reporting', 'supervision', 'dates', 'jurisdiction']),
      paragraphs: z.array(z.object({ id: z.string(), ref: z.string(), quote: z.string().min(1), crossRefs: z.array(z.string()) })),
    }),
  ),
});

export const ReportingStepSchema = z.object({
  id: z.string(),
  label: z.string().min(1),
  within: z.number().positive(),
  unit: z.enum(['hours', 'days', 'months']),
  from: z.string().min(1), // the start event, plain words
  fromKind: z.enum(['aware', 'classified', 'notification', 'intermediate', 'fix']),
  quote: z.string().min(1), // the verbatim sentence setting the limit, with its number and unit
  locator: z.string().min(1),
});

export const RegimeSchema = z.object({
  ...checkedShape,
  id: z.string(),
  instrument: z.string().min(1),
  shortLabel: z.string().min(1),
  celex: z.string(),
  timeLimitCelex: z.string().nullable(), // the act that sets the limits when it is not the base act
  articleRef: z.string(),
  who: z.string().min(1),
  recipient: z.string().min(1),
  status: LifecycleStatusSchema,
  appliesFrom: IsoDaySchema.nullable(),
  hiddenReason: z.string().nullable(), // set when the application date could not be confirmed
  steps: z.array(ReportingStepSchema).min(1),
});

export const RegimesFileSchema = z.object({ _about: z.string().optional(), regimes: z.array(RegimeSchema) });

export const ObligationSchema = z.object({
  ...checkedShape,
  id: z.string(),
  celex: z.string(),
  articleRef: z.string(),
  paragraphId: z.string(),
  addressee: z.string().min(1),
  trigger: z.string().nullable(),
  action: z.string().min(1), // plain language, 25 words at most; stays verify: true until Swann approves it
  clockId: z.string().nullable(),
  scopeRuleIds: z.array(z.string()),
  status: LifecycleStatusSchema,
  appliesFrom: IsoDaySchema.nullable(),
});

export const ObligationsFileSchema = z.object({ _about: z.string().optional(), obligations: z.array(ObligationSchema) });

export const ScopeRulesFileSchema = z.object({
  _about: z.string().optional(),
  sectors: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      annex: z.enum(['I', 'II']),
      cer: z.boolean(), // also a sector of the CER Directive's Annex
      subsectors: z.array(z.object({ id: z.string(), label: z.string() })),
      provenance: z.array(ProvenanceSchema).min(1),
    }),
  ),
  sizeClasses: z.array(z.object({ id: z.enum(['micro', 'small', 'medium', 'large']), label: z.string(), description: z.string(), provenance: z.array(ProvenanceSchema).min(1) })),
  rules: z.array(
    z.object({
      id: z.string(),
      instrument: z.string(), // CELEX of the instrument the rule is about
      when: z.record(z.string(), z.unknown()), // declarative condition, evaluated by src/lib/lab/scope.ts
      outcome: z.enum(['appears-to-apply', 'applies-if-designated', 'may-apply-check', 'does-not-appear-to-apply']),
      reason: z.string().min(1),
      articleRef: z.string().min(1),
      priority: z.number().int(),
      provenance: z.array(ProvenanceSchema).min(1),
    }),
  ),
});

// ---- shared by the Readiness Check and the site datasets ------------------------------

// The Atlas's bindingness vocabulary (src/lib/regulation.ts), a separate axis from lifecycle status.
export const BindingnessSchema = z.enum(['binding-law', 'binding-by-market-access', 'soft-law', 'guidance']);

// ---- Readiness Check: an organisation's own reflection against published migration guidance ----
// No score, no percentage, no ranking. The visitor marks each action; nothing is stored or sent.

export const ReadinessFileSchema = z.object({
  _about: z.string().optional(),
  // an institutional migration framework and its dated milestones (EU roadmap, NCSC, ...)
  frameworks: z.array(
    z.object({
      ...checkedShape,
      id: z.string().regex(/^[a-z0-9-]+$/),
      label: z.string().min(1), // full title as the issuer gives it
      shortLabel: z.string().min(1), // "EU roadmap", "NCSC timelines"
      issuer: z.string().min(1),
      jurisdiction: z.string().regex(/^[A-Z]{3}$/), // ISO3, or EUU for the EU
      status: LifecycleStatusSchema, // "published" for guidance
      bindingness: BindingnessSchema,
      audience: z.string().min(1), // who the source is written for, in its own terms
      appliesToPosture: z.string().nullable(), // coordination posture key of the issuer, for the chip
      milestones: z.array(
        z.object({
          id: z.string(),
          year: z.number().int(),
          month: z.number().int().min(1).max(12).nullable(), // when the source names one
          label: z.string().min(1),
          kind: z.enum(['plan', 'priority', 'complete', 'procurement', 'other']),
          provenance: z.array(ProvenanceSchema).min(1),
        }),
      ),
    }),
  ),
  // themes the actions fall into (governance, discovery, planning, suppliers, migration, assurance)
  domains: z.array(z.object({ id: z.string(), label: z.string().min(1), description: z.string().min(1) })),
  // one concrete action an organisation is asked to take, quoted from its source
  actions: z.array(
    z.object({
      ...checkedShape,
      id: z.string().regex(/^[a-z0-9-]+$/),
      domain: z.string(),
      source: z.string(), // the framework id the action is quoted from
      label: z.string().min(1),
      description: z.string().min(1),
      audienceNote: z.string().nullable(), // when the source addresses states or a sector, say so
      dueBy: z.array(z.object({ framework: z.string(), milestone: z.string() })), // empty = undated
    }),
  ),
  // where the sources disagree (hybrid schemes, for one); shown side by side, never merged
  positions: z.array(
    z.object({
      id: z.string(),
      topic: z.string().min(1),
      stances: z.array(z.object({ framework: z.string(), summary: z.string().min(1), provenance: z.array(ProvenanceSchema).min(1) })),
    }),
  ),
  // entry questions quoted from a source's own triage (the Dutch handbook's adopter personas)
  entry: z
    .object({
      source: z.string(),
      intro: z.string().min(1),
      questions: z.array(z.object({ id: z.string(), text: z.string().min(1), provenance: z.array(ProvenanceSchema).min(1) })),
      outcome: z.object({ yes: z.string().min(1), no: z.string().min(1) }),
    })
    .nullable(),
});

// ---- qscatlas.org: the site datasets (spec 16.7) ---------------------------------------
// Registered in wave 1 so lab:validate covers each file from the day it is written. The
// package named beside each schema writes the data.

// The kinds of date are exactly the milestone kinds of readiness.json; no other dataset's categories.
export const DATE_KINDS = ['plan', 'priority', 'complete', 'procurement', 'other'] as const;
const PlaceSchema = z.string().regex(/^[A-Z]{3,4}$/); // ISO3, plus EUU and NATO as the profiles key them

// What the profile fields do not record: the kind and bindingness of each timeline line, and the
// scope of each instrument (spec 16.1). A row with verify: true is a lead until Swann confirms it.
// Unrecorded values are null, which the pages render as "not recorded". Writer: evidence-data, then target-dates.
export const AnnotationsFileSchema = z.object({
  _about: z.string().optional(),
  dates: z
    .array(
      z.object({
        ...checkedShape,
        id: z.string().min(1),
        iso3: PlaceSchema,
        year: z.number().int(),
        match: z.string().min(1), // a substring of the profile line's label
        kind: z.enum(DATE_KINDS),
        restates: z.string().regex(/^[a-z0-9-]+$/).nullable().default(null), // a guide id, such as eu-roadmap
        status: LifecycleStatusSchema.nullable().default(null),
        bindingness: BindingnessSchema.nullable().default(null),
        scope: z.string().nullable().default(null),
      }),
    )
    .default([]),
  instruments: z
    .array(
      z.object({
        ...checkedShape,
        id: z.string().min(1),
        iso3: PlaceSchema,
        match: z.string().min(1), // a substring of the instrument
        pqcScope: z.enum(['pqc-specific', 'general-cyber']).nullable().default(null),
        status: LifecycleStatusSchema.nullable().default(null),
      }),
    )
    .default([]),
});

// For each guide Prepare quotes, the Atlas document URLs that record it, or unmapped: true with a
// note saying why (spec 16.3). Writer: evidence-data.
export const CrosswalkFileSchema = z.object({
  _about: z.string().optional(),
  guides: z.array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9-]+$/), // the framework id in readiness.json
        urls: z.array(z.string().url()).default([]),
        unmapped: z.boolean().default(false),
        note: z.string().nullable().default(null),
      })
      .superRefine((g, ctx) => {
        if (g.unmapped && g.urls.length > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['urls'], message: 'an unmapped guide lists no URL' });
        if (!g.unmapped && g.urls.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['urls'], message: 'list at least one URL, or set unmapped: true with a note' });
        if (g.unmapped && !g.note) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['note'], message: 'an unmapped guide needs a note' });
      }),
  ),
});

// Short forms of issuing organisations (NCSC, CCCS), each to the organisation as the documents
// record it and its country, so ?org= finds the documents (spec 16.3). Writer: evidence-data.
export const IssuerAliasesFileSchema = z.object({
  _about: z.string().optional(),
  aliases: z.array(
    z.object({
      alias: z.string().min(1),
      issuingOrg: z.string().min(1), // as the documents record it (the documents' issuingOrg field)
      iso3: PlaceSchema,
    }),
  ),
});

// Site releases for What changed (spec 10). Each row carries its precision because the shared
// dates rule (scripts/lab/lib/invariants.mjs) asks every dated object for one. Writer: about-method.
export const ReleasesFileSchema = z.object({
  _about: z.string().optional(),
  releases: z.array(
    z.object({
      date: IsoDaySchema,
      precision: z.literal('day'),
      text: z.string().min(1),
    }),
  ),
});

// What to record about each system, from the guides' own words (spec 5.2). Writer: prepare-elements.
// A field with column: false is advice about the inventory as a whole (the EU roadmap's CBOM
// format), shown on the page but never a column of the downloadable template. The notes hold the
// advice the page opens with (start with an incomplete inventory), each with its own evidence.
export const InventoryFileSchema = z.object({
  _about: z.string().optional(),
  notes: z.array(z.object({ ...checkedShape, id: z.string().regex(/^[a-z0-9-]+$/), text: z.string().min(1), source: z.string().min(1) })).default([]),
  fields: z.array(
    z.object({
      ...checkedShape,
      id: z.string().regex(/^[a-z0-9-]+$/),
      label: z.string().min(1),
      record: z.string().min(1), // what to record, in plain words
      source: z.string().min(1), // the guide id it comes from
      locator: z.string().min(1),
      column: z.boolean().default(true), // a column of the template CSV
    }),
  ),
});

// The NCSC's migration options and the two cases that need no choice (spec 5.2). Writer: prepare-elements.
// A note with noChoice: true is one of the two cases that need no choice; its label names it in
// the worksheet's list beside the five options. Any other note (legacy systems) is read only.
export const ApproachFileSchema = z.object({
  _about: z.string().optional(),
  options: z.array(z.object({ ...checkedShape, id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1), summary: z.string().min(1) })),
  notes: z.array(
    z.object({
      ...checkedShape,
      id: z.string().regex(/^[a-z0-9-]+$/),
      text: z.string().min(1),
      label: z.string().min(1).nullable().default(null),
      noChoice: z.boolean().default(false),
    }),
  ),
});

// The supplier letter's questions (spec 5.2), keyed by the id of the Readiness Check action each is
// drawn from. A question is in plain words; group is the plain head it stands under; cite is the
// short locator shown in its bracketed source tag ("p. 2"); its provenance holds the source's own
// words that open beneath it. The page's other strings are under copy, as in every copy file.
// Writer: prepare-elements.
export const SUPPLIER_GROUPS = ['plans', 'inside', 'contracts', 'updates'] as const;
export const SupplierQuestionSchema = z.object({
  ...checkedShape,
  id: z.string().regex(/^[a-z0-9-]+$/),
  group: z.enum(SUPPLIER_GROUPS),
  label: z.string().min(1), // the question, in plain words (style-checked as visible copy)
  cite: z.string().min(1),
});
export const ElementsCopyFileSchema = CopyFileSchema.extend({
  questions: z.record(z.string().regex(/^[a-z0-9-]+$/), z.array(SupplierQuestionSchema)).default({}),
  // passages a page cites beside its own copy (the NCSC's statement of intent, under the letter's
  // covering paragraph), each with its evidence
  notes: z.array(z.object({ ...checkedShape, id: z.string().regex(/^[a-z0-9-]+$/), label: z.string().min(1), cite: z.string().min(1) })).default([]),
});

// ---- registry --------------------------------------------------------------

// Every file under data/lab/ (except data/lab/watch/) must match one entry here, or
// scripts/lab/validate.mjs fails. Tool prompts add their own entries. A "*" matches
// one path segment.
export interface DatasetEntry {
  file: string;
  tool: string; // a tool id (exposure, cascade, dates, inventory...), or prepare, shared or fixture
  schema: z.ZodTypeAny;
}

export const DATASETS: DatasetEntry[] = [
  { file: 'data/lab/tools.json', tool: 'shared', schema: ToolsFileSchema },
  { file: 'data/lab/shared/memberships.json', tool: 'shared', schema: MembershipsFileSchema },
  { file: 'data/lab/fixture/fixture.json', tool: 'fixture', schema: FixtureFileSchema },
  // Exposure Clock
  { file: 'data/lab/exposure/surveys/*.json', tool: 'exposure', schema: SurveyFileSchema },
  { file: 'data/lab/exposure/presets.json', tool: 'exposure', schema: PresetsFileSchema },
  { file: 'data/lab/exposure/deadlines-extra.json', tool: 'exposure', schema: DeadlinesExtraFileSchema },
  { file: 'data/lab/exposure/copy.json', tool: 'exposure', schema: CopyFileSchema },
  // Standards Cascade
  { file: 'data/lab/cascade/spine.json', tool: 'cascade', schema: SpineFileSchema },
  { file: 'data/lab/cascade/bodies.json', tool: 'cascade', schema: BodiesFileSchema },
  { file: 'data/lab/cascade/standards.json', tool: 'cascade', schema: StandardsFileSchema },
  { file: 'data/lab/cascade/edges.json', tool: 'cascade', schema: EdgesFileSchema },
  { file: 'data/lab/cascade/candidates.json', tool: 'cascade', schema: CandidatesFileSchema },
  { file: 'data/lab/cascade/rejected.json', tool: 'cascade', schema: RejectedFileSchema },
  { file: 'data/lab/cascade/copy.json', tool: 'cascade', schema: CopyFileSchema },
  // Rulebook in Motion
  { file: 'data/lab/rulebook/acts.json', tool: 'rulebook', schema: ActsFileSchema },
  { file: 'data/lab/rulebook/proposals.json', tool: 'rulebook', schema: ProposalsFileSchema },
  { file: 'data/lab/rulebook/text/*.json', tool: 'rulebook', schema: ArticleTextFileSchema },
  { file: 'data/lab/rulebook/regimes.json', tool: 'rulebook', schema: RegimesFileSchema },
  { file: 'data/lab/rulebook/obligations.json', tool: 'rulebook', schema: ObligationsFileSchema },
  { file: 'data/lab/rulebook/scope-rules.json', tool: 'rulebook', schema: ScopeRulesFileSchema },
  { file: 'data/lab/rulebook/copy.json', tool: 'rulebook', schema: CopyFileSchema },
  // Readiness Check
  { file: 'data/lab/readiness/readiness.json', tool: 'readiness', schema: ReadinessFileSchema },
  { file: 'data/lab/readiness/copy.json', tool: 'readiness', schema: CopyFileSchema },
  // qscatlas.org site datasets (spec 16.7)
  { file: 'data/lab/annotations/annotations.json', tool: 'dates', schema: AnnotationsFileSchema },
  { file: 'data/lab/shared/doc-crosswalk.json', tool: 'shared', schema: CrosswalkFileSchema },
  { file: 'data/lab/shared/issuer-aliases.json', tool: 'shared', schema: IssuerAliasesFileSchema },
  { file: 'data/lab/shared/releases.json', tool: 'shared', schema: ReleasesFileSchema },
  { file: 'data/lab/prepare/hub-copy.json', tool: 'prepare', schema: CopyFileSchema },
  { file: 'data/lab/prepare/elements-copy.json', tool: 'prepare', schema: ElementsCopyFileSchema },
  { file: 'data/lab/prepare/inventory.json', tool: 'inventory', schema: InventoryFileSchema },
  { file: 'data/lab/prepare/approach.json', tool: 'approach', schema: ApproachFileSchema },
  { file: 'data/lab/dates/copy.json', tool: 'dates', schema: CopyFileSchema },
];

export function datasetFor(relPath: string): DatasetEntry | null {
  const norm = relPath.replace(/\\/g, '/');
  for (const entry of DATASETS) {
    const re = new RegExp(
      '^' + entry.file.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+') + '$',
    );
    if (re.test(norm)) return entry;
  }
  return null;
}
