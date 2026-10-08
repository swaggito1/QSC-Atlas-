// QSC Atlas Labs: the Standards Cascade's data, assembled at build time. Reads the spine, the
// standards dictionary, the verified edges and the membership lists under data/lab/, the
// Atlas profiles and documents through atlas.ts, and lays out the orbit so the browser does no
// layout work. The country shapes for the globe and the map are loaded in the browser
// (globe.ts loadWorld), as the Atlas's own globe and map load them; this file only supplies
// each jurisdiction's reference point and numeric code. In production, leads (verify: true)
// never reach the page.
//
// Other standards bodies (Swann, 5 October 2026: "the potential to use other standards than NIST,
// don't put it default"). loadCascade() is the NIST view, the default, and its output does not
// change. loadCascadeBodies() builds one view for each other body the Standards overview groups
// that at least two governments cite (cascadeBodyOptions in src/lib/site/standards.ts): its verified standards, the verified
// documents of governments that name them (never a standards body's own document, never a lead,
// in any build), an orbit laid out by each government's first such document, the coordination
// events with the body's own standards dated from their records, and no seat on the globe or the
// map, so no line runs from a place there and the national processes stay in the NIST view.

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { z } from 'zod';
import { CopyFileSchema, EdgesFileSchema, SpineFileSchema, StandardsFileSchema } from './schema';
import { latestVerifiedAt, loadDataset, loadMemberships, projectRoot } from './load';
import type { LoadOptions } from './load';
import { getAllDocuments, getProfiles, listCountries } from './atlas';
import { periodEnd, resolveLocators } from './cascade';
import type { Passage } from './cascade';
import { computeOrbit } from './cascade-layout';
import type { LayoutJurisdiction, OrbitLayout } from './cascade-layout';
import type { SourceEntry } from './format';
import { siteOrigin } from '../site/config';
import { standardShortName, standardsRecords } from '../site/joins';
import { cascadeBodyOptions, fill, governmentCitations } from '../site/standards';
import type { CascadeBodyOption } from '../site/standards';

export interface CascadeEdgeView {
  id: string;
  from: string;
  to: string;
  relation: string;
  preStandardOnly: boolean;
  date: string;
  precision: string;
  documentTitle: string;
  documentUrl: string;
  issuingOrg: string;
  corpusOrg: string | null; // the issuer as the Atlas's documents page names it (its ?org= filter)
  passages: Passage[]; // every provenance excerpt, each with its own locator
  verified: boolean;
}

export interface CascadeNodeInfo {
  iso3: string;
  name: string;
  postureKey: string | null;
  postureLabel: string | null;
  postureShort: string | null;
  postureColor: string | null;
  roleLabel: string | null;
  role: string | null;
  confidence: string | null;
  verificationStatus: string | null;
  hasProfile: boolean;
}

export interface SpineView {
  id: string;
  iso3: string | null;
  date: string;
  label: string;
  body: string;
  kind: string;
  url: string | null;
  verified: boolean;
}

export interface GeoView {
  nist: [number, number] | null; // longitude, latitude; null for another standards body, which has no seat on the globe or the map
  lonlat: Record<string, [number, number]>; // ISO3 to the jurisdiction's reference point
  ccn3: Record<string, string>; // numeric code (as in world-110m.json, no leading zeros) to ISO3
}

export interface CascadeStandard {
  id: string;
  label: string;
  short: string; // the name the orbit's centre shows when the standard is chosen
  body: string;
  national: string | null;
  kind: string;
  status: string; // standardStatus: final, selected, draft or national
  centre: boolean; // NIST publishes or has selected it (or, in another body's view, that body publishes it), so its lines run from the centre
}

export interface CascadeData {
  copy: Record<string, string>;
  orbit: OrbitLayout;
  geo: GeoView;
  edges: CascadeEdgeView[];
  info: Record<string, CascadeNodeInfo>;
  standards: CascadeStandard[];
  nistIds: string[]; // the standards that place a jurisdiction on the orbit (in another body's view, that body's)
  spine: SpineView[];
  groups: { eu: string[]; nato: string[] };
  endMonth: string;
  corpusSize: number; // every included document the Atlas holds
  lineDocs: number; // the distinct documents the verified edges come from
  asOf: string | null;
  sources: SourceEntry[];
}

const CASCADE = 'data/lab/cascade';
// NIST's campus at 100 Bureau Drive, Gaithersburg, Maryland (the place pin on
// nist.gov/about-nist/visit/getting-nist-gaithersburg, read 30 September 2026)
const NIST_LONLAT: [number, number] = [-77.218506, 39.14004];

function read<T>(path: string, fn: () => T, empty: T, opts: LoadOptions): T {
  return existsSync(join(opts.root ?? projectRoot(), path)) ? fn() : empty;
}

/** "FIPS-203" to "FIPS 203", "SP-800-208" to "SP 800-208", "NIST-IR-8547" to "IR 8547". */
const shortId = (id: string) => id.replace(/^NIST-/, '').replace(/-(\d)/, ' $1');

const LATIN = /^[\x20-\x7E]+$/;

/**
 * The short name the orbit gives a national process, in the Latin script its marks are set in:
 * its first name in that script ("KpqC", "NGCC"), else the first name its own label gives in
 * brackets ("Kodieum", from "Russian national post-quantum schemes (Kodieum, Shipovnik)"), else
 * the label. Its names in the source's own script stay in the standards file, the table and the
 * standard's page.
 */
export function nationalShort(s: { label: string; synonyms: { text: string }[] }): string {
  const latin = s.synonyms.find((x) => LATIN.test(x.text));
  if (latin) return latin.text;
  const inBrackets = /\(([^)]+)\)\s*$/.exec(s.label)?.[1];
  const first = inBrackets?.split(',')[0]?.trim();
  return first && LATIN.test(first) ? first : s.label;
}

type StandardsFile = z.infer<typeof StandardsFileSchema>;
type EdgesFile = z.infer<typeof EdgesFileSchema>;
type DatedEdge = EdgesFile['edges'][number] & { date: string; precision: NonNullable<EdgesFile['edges'][number]['precision']> };

/**
 * The Cascade's own records: the standards and the edges marked cascade: true (every record before
 * 5 October 2026; the overview's own records carry cascade: false), each edge naming one of those
 * standards (or a body, for "participates"). An edge with no date yet is a lead the time line
 * cannot place, so it stays out too; a verified edge always has its date (validate.mjs).
 */
export function cascadeRecords(standardsFile: StandardsFile, edgesFile: EdgesFile): { standardsFile: StandardsFile; edgesFile: { edges: DatedEdge[] } } {
  const standards = standardsFile.standards.filter((s) => s.cascade);
  const all = new Set(standardsFile.standards.map((s) => s.id));
  const own = new Set(standards.map((s) => s.id));
  const edges = edgesFile.edges.filter((e): e is DatedEdge => e.cascade && e.date !== null && e.precision !== null && (own.has(e.to) || (e.relation === 'participates' && !all.has(e.to))));
  return { standardsFile: { ...standardsFile, standards }, edgesFile: { ...edgesFile, edges } };
}

/** The earliest of some dates of any precision, by the end of their period. */
const earliest = (dates: string[]) => [...dates].sort((a, b) => periodEnd(a).localeCompare(periodEnd(b)))[0] ?? null;

// ---- what every view shares: the jurisdictions, their records and their places --------------

type Profiles = ReturnType<typeof getProfiles>;
interface Context {
  copy: Record<string, string>;
  spineFile: z.infer<typeof SpineFileSchema>;
  memberships: ReturnType<typeof loadMemberships>;
  corpus: ReturnType<typeof getAllDocuments>;
  names: Map<string, string>;
  profiles: Profiles;
  jurisdictions: LayoutJurisdiction[];
}

function context(opts: LoadOptions): Context {
  const copy = loadDataset(`${CASCADE}/copy.json`, CopyFileSchema, opts).copy as Record<string, string>;
  const spineFile = read(`${CASCADE}/spine.json`, () => loadDataset(`${CASCADE}/spine.json`, SpineFileSchema, opts), { spine: [] }, opts);
  const memberships = loadMemberships(opts);
  const corpus = getAllDocuments(opts);
  const names = new Map(listCountries(opts).map((c) => [c.iso3, c.name]));
  const profiles = getProfiles(opts);
  const jurisdictions = profiles
    .filter((p) => p.posture && p.iso3 !== 'NATO')
    .map((p) => ({ iso3: p.iso3, name: names.get(p.iso3) ?? p.country, posture: p.posture!.key, role: p.role?.key ?? null, opacity: p.opacity }));
  return { copy, spineFile, memberships, corpus, names, profiles, jurisdictions };
}

/** An edge as the island reads it, with the issuer as the Atlas's own documents page names it. */
function edgeViews(edges: DatedEdge[], corpus: Context['corpus']): CascadeEdgeView[] {
  // the issuer as the Atlas's own documents page names it, so a link can filter that page
  const corpusOrgOf = new Map(corpus.filter((d) => d.url).map((d) => [d.url as string, d.issuingOrg]));
  return edges.map((e) => {
    const locators = resolveLocators(e.provenance.map((p) => p.locator ?? ''));
    return {
      id: e.id,
      from: e.from,
      to: e.to,
      relation: e.relation,
      preStandardOnly: e.preStandardOnly,
      date: e.date,
      precision: e.precision,
      documentTitle: e.documentTitle,
      documentUrl: e.documentUrl,
      issuingOrg: e.issuingOrg,
      corpusOrg: corpusOrgOf.get(e.documentUrl) ?? null,
      passages: e.provenance.map((p, i) => ({ excerpt: p.excerpt, locator: locators[i] })),
      verified: !e.verify,
    };
  });
}

/** What the island needs about each jurisdiction it draws, and nothing about the rest. */
function infoOf(drawn: Set<string>, ctx: Context): Record<string, CascadeNodeInfo> {
  const info: Record<string, CascadeNodeInfo> = {};
  for (const p of ctx.profiles) {
    if (!drawn.has(p.iso3)) continue;
    info[p.iso3] = {
      iso3: p.iso3,
      name: ctx.names.get(p.iso3) ?? p.country,
      postureKey: p.posture?.key ?? null,
      postureLabel: p.posture?.label ?? null,
      postureShort: p.posture?.short ?? null,
      postureColor: p.posture?.color ?? null,
      roleLabel: p.role?.label ?? null,
      role: p.role?.key ?? null,
      confidence: p.confidence,
      verificationStatus: p.verificationStatus,
      hasProfile: p.dataStatus !== 'Placeholder',
    };
  }
  return info;
}

/**
 * Reference points (world-countries' centre of each country) and numeric codes, for the
 * jurisdictions drawn; the European Union is placed at Brussels.
 */
function pointsOf(drawn: Set<string>): Pick<GeoView, 'lonlat' | 'ccn3'> {
  const require = createRequire(import.meta.url);
  let worldCountries: any = require('world-countries');
  if (!Array.isArray(worldCountries)) worldCountries = worldCountries.default ?? [];
  const lonlat: Record<string, [number, number]> = {};
  const ccn3: Record<string, string> = {};
  for (const c of worldCountries) {
    if (!drawn.has(c.cca3)) continue;
    lonlat[c.cca3] = [Math.round(c.latlng[1] * 100) / 100, Math.round(c.latlng[0] * 100) / 100];
    if (c.ccn3) ccn3[String(Number(c.ccn3))] = c.cca3;
  }
  if (drawn.has('EUU')) lonlat.EUU = [4.35, 50.85];
  return { lonlat, ccn3 };
}

/** The source entry for the Atlas's own documents, which every view reads. */
const atlasSource = (site: string, now: Date): SourceEntry => ({
  author: 'QSC Atlas',
  date: null,
  title: 'Institutional documents on post-quantum cryptography, by country',
  url: `${site.replace(/\/$/, '')}/documents`,
  retrievedAt: now.toISOString().slice(0, 10),
});

const groupsOf = (ctx: Context) => ({
  eu: ctx.memberships.lists.find((l) => l.id === 'eu')?.members.map((m) => m.iso3) ?? [],
  nato: ctx.memberships.lists.find((l) => l.id === 'nato')?.members.map((m) => m.iso3) ?? [],
});

/**
 * Everything the page needs. `site` is the Atlas's own address (the page passes the `site` that
 * astro.config.mjs names), so the source entry for the Atlas's documents follows a change of domain.
 */
export function loadCascade(opts: LoadOptions = {}, now: Date = new Date(), site: string = siteOrigin()): CascadeData {
  return nistView(context(opts), opts, now, site);
}

/** The NIST view, the Cascade as it opens. */
function nistView(ctx: Context, opts: LoadOptions, now: Date, site: string): CascadeData {
  const { copy, spineFile, corpus, profiles, jurisdictions } = ctx;
  // The Cascade reads its own records only (cascade: true, 5 October 2026): the standards the
  // overview added for other bodies, and the documents naming them, never reach it, so its
  // orbit, lines, table and dates stay as they were.
  const { standardsFile, edgesFile } = cascadeRecords(
    read(`${CASCADE}/standards.json`, () => loadDataset(`${CASCADE}/standards.json`, StandardsFileSchema, opts), { standards: [] }, opts),
    read(`${CASCADE}/edges.json`, () => loadDataset(`${CASCADE}/edges.json`, EdgesFileSchema, opts), { edges: [] }, opts),
  );
  const asOf = latestVerifiedAt({ spineFile, edgesFile, standardsFile });
  // the slider ends at the month the data was last verified, never at a later build month
  const endMonth = asOf ? asOf.slice(0, 7) : now.toISOString().slice(0, 7);

  const standards: CascadeStandard[] = standardsFile.standards.map((s) => ({
    id: s.id,
    label: s.label,
    short: s.national ? nationalShort(s) : shortId(s.id),
    body: s.body,
    national: s.national,
    kind: s.kind,
    status: s.standardStatus,
    centre: s.bodyId === 'nist',
  }));
  // the algorithm standards NIST publishes or has selected place a jurisdiction on the orbit;
  // the IR 8547 transition draft is NIST's too, so its lines run from the centre, but it places nobody
  const nist = standards.filter((s) => s.centre && s.kind !== 'transition');
  const nistIds = nist.map((s) => s.id);

  const edges = edgeViews(edgesFile.edges, corpus);

  // a national standard's mark is drawn from its first dated, verified record: a spine event
  // or a national-process document
  const nationalStandards = standards
    .filter((s) => s.national)
    .map((s) => ({
      id: s.id,
      label: s.short,
      iso3: s.national!,
      since: earliest([
        ...spineFile.spine.filter((x) => !x.verify && x.date && x.standards.includes(s.id)).map((x) => x.date as string),
        ...edges.filter((e) => e.verified && e.to === s.id).map((e) => e.date),
      ]),
    }));

  const orbit = computeOrbit({
    jurisdictions,
    edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, relation: e.relation, date: e.date, preStandardOnly: e.preStandardOnly, verified: e.verified, documentUrl: e.documentUrl })),
    nistStandards: nist.map((s) => ({ id: s.id, label: s.short })),
    centreIds: standards.filter((s) => s.centre).map((s) => s.id),
    nationalStandards,
    endYear: Number(endMonth.slice(0, 4)),
  });

  const drawn = new Set(orbit.nodes.map((n) => n.iso3));
  const info = infoOf(drawn, ctx);
  const { lonlat, ccn3 } = pointsOf(drawn);

  const spine: SpineView[] = spineFile.spine
    .map((s) => ({ id: s.id, iso3: s.iso3, date: s.date ?? '', label: s.label, body: s.body, kind: s.kind, url: s.provenance[0]?.url ?? null, verified: !s.verify }))
    .filter((s) => s.date)
    .sort((a, b) => periodEnd(a.date).localeCompare(periodEnd(b.date)));

  // Sources.astro sorts the list by author, then date
  const sources: SourceEntry[] = [];
  for (const s of spineFile.spine) {
    const p = s.provenance[0];
    if (!p || sources.some((x) => x.url === p.url)) continue;
    sources.push({ author: s.body, date: s.date, title: p.title ?? s.label, url: p.url });
  }
  sources.push(atlasSource(site, now));

  return {
    copy,
    orbit,
    geo: { nist: NIST_LONLAT, lonlat, ccn3 },
    edges,
    info,
    standards,
    nistIds,
    spine,
    groups: groupsOf(ctx),
    endMonth,
    corpusSize: corpus.length,
    lineDocs: new Set(edges.filter((e) => e.verified).map((e) => e.documentUrl)).size,
    asOf,
    sources,
  };
}

// ---- another standards body's view (5 October 2026) --------------------------------------------

export interface CascadeBodyData extends CascadeData {
  body: CascadeBodyOption;
}

/**
 * The time line's mark for one of the body's standards, from its own record: the date of its
 * status (statusDate, at its precision) and the body's own words for that status ("RFC, Proposed
 * Standard"), or, for an Internet-Draft, whose date is that of its latest revision, those words.
 */
function standardEventLabel(s: { label: string; bodyStatus: string | null; deliverable: string }, copy: Record<string, string>): string {
  if (s.deliverable === 'internet-draft') return fill(copy.spineEventRevision, { standard: s.label });
  return s.bodyStatus ? fill(copy.spineEventStatus, { standard: s.label, status: s.bodyStatus }) : s.label;
}

function bodyView(option: CascadeBodyOption, ctx: Context, opts: LoadOptions, now: Date, site: string): CascadeBodyData {
  const { copy, spineFile, corpus, jurisdictions } = ctx;
  const records = standardsRecords(opts);
  const bodyName = new Map(records.bodies.map((b) => [b.id, b.shortName]));
  // the body's verified standards, in the order of the standards file (a national process never)
  const own = records.standards.filter((s) => !s.verify && !s.national && option.bodyIds.includes(s.bodyId));
  const ids = new Set(own.map((s) => s.id));
  // a government's verified documents naming one of them, never a standards body's own document
  const cited = governmentCitations(ids, opts) as DatedEdge[];
  // the coordination events stay; NIST's events and the national processes belong to its view
  const coordination = spineFile.spine.filter((x) => !x.verify && x.date && x.kind === 'coordination');

  const asOf = latestVerifiedAt({ coordination, cited, own });
  const endMonth = asOf ? asOf.slice(0, 7) : now.toISOString().slice(0, 7);

  const standards: CascadeStandard[] = own.map((s) => ({
    id: s.id,
    label: s.label,
    short: standardShortName(s.label),
    body: s.body,
    national: null,
    kind: s.kind,
    status: s.standardStatus,
    centre: true,
  }));
  const edges = edgeViews(cited, corpus);
  const orbit = computeOrbit({
    jurisdictions,
    edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, relation: e.relation, date: e.date, preStandardOnly: e.preStandardOnly, verified: e.verified, documentUrl: e.documentUrl })),
    nistStandards: standards.map((s) => ({ id: s.id, label: s.short })),
    centreIds: [...ids],
    nationalStandards: [],
    endYear: Number(endMonth.slice(0, 4)),
    centreLabel: option.label,
    noneLabel: fill(copy.noBody, { body: option.labelOr }),
  });

  const drawn = new Set(orbit.nodes.map((n) => n.iso3));
  const info = infoOf(drawn, ctx);
  const { lonlat, ccn3 } = pointsOf(drawn);

  const events: SpineView[] = [
    ...coordination.map((s) => ({ id: s.id, iso3: s.iso3, date: s.date as string, label: s.label, body: s.body, kind: s.kind, url: s.provenance[0]?.url ?? null, verified: true })),
    ...own
      .filter((s) => s.statusDate)
      .map((s) => ({
        id: `standard-${s.id.toLowerCase()}`,
        iso3: null,
        date: s.statusDate as string,
        label: standardEventLabel(s, copy),
        body: bodyName.get(s.bodyId) ?? s.body,
        kind: 'standard',
        url: s.provenance[0]?.url ?? s.url ?? null,
        verified: true,
      })),
  ];
  const spine = events.sort((a, b) => periodEnd(a.date).localeCompare(periodEnd(b.date)) || a.id.localeCompare(b.id));

  // Sources.astro sorts the list by author, then date
  const sources: SourceEntry[] = [];
  for (const s of coordination) {
    const p = s.provenance[0];
    if (!p || sources.some((x) => x.url === p.url)) continue;
    sources.push({ author: s.body, date: s.date, title: p.title ?? s.label, url: p.url });
  }
  for (const s of own) {
    const p = s.provenance[0];
    if (!p || sources.some((x) => x.url === p.url)) continue;
    sources.push({ author: bodyName.get(s.bodyId) ?? s.body, date: s.statusDate, title: p.title ?? s.label, url: p.url });
  }
  sources.push(atlasSource(site, now));

  return {
    copy,
    orbit,
    geo: { nist: null, lonlat, ccn3 },
    edges,
    info,
    standards,
    nistIds: [...ids],
    spine,
    groups: groupsOf(ctx),
    endMonth,
    corpusSize: corpus.length,
    lineDocs: new Set(edges.map((e) => e.documentUrl)).size,
    asOf,
    sources,
    body: option,
  };
}

/** The view of every standards body the Cascade offers besides NIST, in the order of the choice. */
export function loadCascadeBodies(opts: LoadOptions = {}, now: Date = new Date(), site: string = siteOrigin()): CascadeBodyData[] {
  const options = cascadeBodyOptions(opts).filter((o) => o.id !== 'nist');
  if (!options.length) return [];
  const ctx = context(opts);
  return options.map((o) => bodyView(o, ctx, opts, now, site));
}

/** One body's view by its option id ("nist" gives the Cascade as it opens), or null when the Cascade does not offer it. */
export function loadCascadeBody(id: string, opts: LoadOptions = {}, now: Date = new Date(), site: string = siteOrigin()): CascadeBodyData | null {
  const option = cascadeBodyOptions(opts).find((o) => o.id === id);
  if (!option) return null;
  if (option.id === 'nist') return { ...loadCascade(opts, now, site), body: option };
  return bodyView(option, context(opts), opts, now, site);
}

// ---- what the island receives for the other bodies ----------------------------------------------

/** One other body's view as the island draws it: its edges by id, from the NIST edges and extraEdges. */
export interface CascadeBodyView {
  orbit: OrbitLayout;
  geo: GeoView;
  standards: CascadeStandard[];
  nistIds: string[];
  edgeIds: string[];
  spine: SpineView[];
  endMonth: string;
  asOf: string | null; // the latest verifiedAt of what this view draws
}

export interface CascadeIslandBodies {
  options: CascadeBodyOption[]; // NIST first
  views: Record<string, CascadeBodyView>; // by option id, NIST's left out (it is the island's own props)
  extraEdges: CascadeEdgeView[]; // the edges no NIST prop carries, once each
  extraInfo: Record<string, CascadeNodeInfo>; // the jurisdictions the NIST view does not draw
}

/**
 * The other bodies' views for the island, each edge and each jurisdiction sent once: the NIST
 * view's own props stay exactly as loadCascade() gives them.
 */
export function cascadeIslandBodies(nist: Pick<CascadeData, 'edges' | 'info'>, others: CascadeBodyData[], options: CascadeBodyOption[]): CascadeIslandBodies {
  const sent = new Set(nist.edges.map((e) => e.id));
  const extraEdges: CascadeEdgeView[] = [];
  const extraInfo: Record<string, CascadeNodeInfo> = {};
  const views: Record<string, CascadeBodyView> = {};
  for (const b of others) {
    for (const e of b.edges) {
      if (sent.has(e.id)) continue;
      sent.add(e.id);
      extraEdges.push(e);
    }
    for (const [iso3, i] of Object.entries(b.info)) if (!nist.info[iso3] && !extraInfo[iso3]) extraInfo[iso3] = i;
    views[b.body.id] = { orbit: b.orbit, geo: b.geo, standards: b.standards, nistIds: b.nistIds, edgeIds: b.edges.map((e) => e.id), spine: b.spine, endMonth: b.endMonth, asOf: b.asOf };
  }
  return { options: options.filter((o) => o.id === 'nist' || views[o.id]), views, extraEdges, extraInfo };
}
