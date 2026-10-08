// The joins the site needs between the Atlas records and the lab datasets, read once per build.
//
// Everything here reads the version-controlled JSON (data/profiles, data/results, data/lab) through
// the lab loaders, so leads (verify: true) are dropped in production exactly as the tools drop them.
// Results are memoised per project root, build mode and file modification time, so the 197 profile
// pages of one build read each file once and a dev server still sees an edited file.
//
// Nothing here counts across countries, ranks them or totals a country's evidence: callers get
// records, never scores.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import {
  ActsFileSchema,
  ArticleTextFileSchema,
  BodiesFileSchema,
  CopyFileSchema,
  CrosswalkFileSchema,
  EdgesFileSchema,
  IssuerAliasesFileSchema,
  PresetsFileSchema,
  SpineFileSchema,
  StandardsFileSchema,
} from '../lab/schema';
import { isProduction, latestVerifiedAt, loadDataset, loadMemberships, projectRoot } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { getAllDocuments, getProfiles, listCountries } from '../lab/atlas';
import type { AtlasProfile } from '../lab/atlas';
import { readReadiness } from '../lab/readiness-data';
import type { ReadinessFile } from '../lab/readiness-data';
import { docId, normaliseUrl } from './docid';

// ---- memo ------------------------------------------------------------------------------------

const store = new Map<string, unknown>();
const stamps = new Map<string, { at: number; value: string }>();

// A file's state, looked up at most once a second, so one build does not stat a folder per page.
function stamp(root: string, rel: string): string {
  const path = join(root, rel);
  const now = Date.now();
  const hit = stamps.get(path);
  if (hit && now - hit.at < 1000) return hit.value;
  const value = readStamp(root, rel);
  stamps.set(path, { at: now, value });
  return value;
}

function readStamp(root: string, rel: string): string {
  try {
    const st = statSync(join(root, rel));
    if (!st.isDirectory()) return `${st.mtimeMs}`;
    // a folder: the latest change of any JSON file in it
    let latest = st.mtimeMs;
    for (const f of readdirSync(join(root, rel))) {
      if (f.endsWith('.json')) latest = Math.max(latest, statSync(join(root, rel, f)).mtimeMs);
    }
    return `${latest}`;
  } catch {
    return 'absent';
  }
}

/** Run `fn` once per root, build mode and state of the files it reads. */
export function memo<T>(name: string, files: string[], opts: LoadOptions, fn: () => T): T {
  const root = opts.root ?? projectRoot();
  const prefix = [name, root, isProduction(opts.env) ? 'production' : 'preview'].join('|');
  const key = [prefix, ...files.map((f) => stamp(root, f))].join('|');
  if (store.has(key)) return store.get(key) as T;
  const value = fn();
  // an edited file replaces its old entry, so a long dev session does not keep every version
  for (const k of store.keys()) if (k.startsWith(`${prefix}|`)) store.delete(k);
  store.set(key, value);
  return value;
}

export function fileExists(rel: string, opts: LoadOptions = {}): boolean {
  return existsSync(join(opts.root ?? projectRoot(), rel));
}

const atlasOpts = (opts: LoadOptions) => (opts.root ? { root: opts.root } : {});

// ---- words and dates -------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2021-05-31" and "2021-05" give "May 2021"; "2021" gives "2021". */
export function monthYear(date: string): string {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(date);
  if (!m) return date;
  return m[2] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : m[1];
}

// Place names that take "the" inside a sentence, as the profiles spell them.
const WITH_ARTICLE = new Set([
  'Bahamas',
  'Central African Republic',
  'Comoros',
  'Dominican Republic',
  'European Union',
  'Gambia',
  'Maldives',
  'Marshall Islands',
  'Netherlands',
  'Philippines',
  'Republic of the Congo',
  'Seychelles',
  'Solomon Islands',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
]);

/** A place name as it reads inside a sentence: "the Netherlands", "the European Union", "France". */
export function nameInSentence(name: string): string {
  return WITH_ARTICLE.has(name) ? `the ${name}` : name;
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// ---- profiles, places and membership --------------------------------------------------------

/** The JSON copy of every profile (public fields only), by ISO3. */
export function profilesByIso3(opts: LoadOptions = {}): Map<string, AtlasProfile> {
  return memo('profiles', ['data/profiles', 'data/countries.json'], opts, () => new Map(getProfiles(atlasOpts(opts)).map((p) => [p.iso3, p])));
}

/** The name a page shows for a place: the profile's own, else data/countries.json, else the code. */
export function placeName(iso3: string, opts: LoadOptions = {}): string {
  const code = iso3.toUpperCase();
  const fromProfile = profilesByIso3(opts).get(code)?.country;
  if (fromProfile) return fromProfile;
  const names = memo('country-names', ['data/countries.json'], opts, () => new Map(listCountries(atlasOpts(opts)).map((c) => [c.iso3, c.name])));
  return names.get(code) ?? code;
}

/** The 27 EU Member States, from data/lab/shared/memberships.json (never inferred from posture). */
export function euMembers(opts: LoadOptions = {}): Set<string> {
  return memo('eu-members', ['data/lab/shared/memberships.json'], opts, () => {
    const list = loadMemberships(opts).lists.find((l) => l.id === 'eu');
    return new Set(list?.members.map((m) => m.iso3) ?? []);
  });
}

export const isEuMember = (iso3: string, opts: LoadOptions = {}) => euMembers(opts).has(iso3.toUpperCase());

/** The places the Exposure Clock offers as a jurisdiction: a posture, a profile beyond a Placeholder, and the EU. */
export function exposurePlaces(opts: LoadOptions = {}): Set<string> {
  return memo('exposure-places', ['data/profiles'], opts, () => {
    const out = new Set<string>(['EUU']);
    for (const p of profilesByIso3(opts).values()) {
      if (p.posture && p.dataStatus !== 'Placeholder' && p.iso3 !== 'NATO') out.add(p.iso3);
    }
    return out;
  });
}

// ---- documents --------------------------------------------------------------------------------

export interface AtlasDoc {
  id: string; // docId(url)
  url: string;
  title: string;
  country: string; // ISO3 as data/results records it
  issuingOrg: string | null;
  year: number | null;
  docType: string | null;
  tier: string | null;
}

/** Every included document in data/results, with its stable id. */
export function atlasDocuments(opts: LoadOptions = {}): AtlasDoc[] {
  return memo('documents', ['data/results'], opts, () =>
    getAllDocuments(atlasOpts(opts))
      .filter((d) => d.url)
      .map((d) => ({
        id: docId(d.url!),
        url: d.url!,
        title: d.title,
        country: d.country.toUpperCase(),
        issuingOrg: d.issuingOrg,
        year: d.year,
        docType: d.docType,
        tier: d.tier,
      })),
  );
}

/** Included documents by stable id. */
export function documentsById(opts: LoadOptions = {}): Map<string, AtlasDoc> {
  return memo('documents-by-id', ['data/results'], opts, () => new Map(atlasDocuments(opts).map((d) => [d.id, d])));
}

/** The included document recorded at this address (compared after normalising), or null. */
export function documentAt(url: string, opts: LoadOptions = {}): AtlasDoc | null {
  return documentsById(opts).get(docId(url)) ?? null;
}

// ---- guides (the Readiness Check's frameworks) ------------------------------------------------

export interface Guide {
  id: string;
  shortLabel: string;
  label: string;
  issuer: string;
  jurisdiction: string; // ISO3, or EUU
  status: string; // LifecycleStatus
  bindingness: string; // Bindingness
  verified: boolean;
  verifiedAt: string | null;
  milestones: ReadinessFile['frameworks'][number]['milestones'];
  actions: number; // actions of the Readiness Check quoted from this guide
}

/** The guides Prepare quotes, in the order readiness.json lists them. */
export function guides(opts: LoadOptions = {}): Guide[] {
  return memo('guides', ['data/lab/readiness/readiness.json'], opts, () => {
    if (!fileExists('data/lab/readiness/readiness.json', opts)) return [];
    const file = readReadiness(opts);
    return file.frameworks.map((f) => ({
      id: f.id,
      shortLabel: f.shortLabel,
      label: f.label,
      issuer: f.issuer,
      jurisdiction: f.jurisdiction,
      status: f.status,
      bindingness: f.bindingness,
      verified: !f.verify,
      verifiedAt: f.verifiedAt,
      milestones: f.milestones,
      actions: file.actions.filter((a) => a.source === f.id).length,
    }));
  });
}

// ---- crosswalk: guides to Atlas document records -----------------------------------------------

const CROSSWALK = 'data/lab/shared/doc-crosswalk.json';

export function loadCrosswalk(opts: LoadOptions = {}) {
  return memo('crosswalk', [CROSSWALK], opts, () =>
    fileExists(CROSSWALK, opts) ? loadDataset(CROSSWALK, CrosswalkFileSchema, opts) : { guides: [] },
  );
}

/** The Atlas records of a guide's documents, in crosswalk order; empty when unmapped. */
export function guideRecords(guideId: string, opts: LoadOptions = {}): AtlasDoc[] {
  const entry = loadCrosswalk(opts).guides.find((g) => g.id === guideId);
  if (!entry || entry.unmapped) return [];
  return entry.urls.map((u) => documentAt(u, opts)).filter((d): d is AtlasDoc => d !== null);
}

/** The ids of the guides whose crosswalk names this document. */
export function guidesForDocument(url: string, opts: LoadOptions = {}): string[] {
  const id = docId(url);
  return loadCrosswalk(opts)
    .guides.filter((g) => !g.unmapped && g.urls.some((u) => docId(u) === id))
    .map((g) => g.id);
}

// ---- issuer aliases ---------------------------------------------------------------------------

const ALIASES = 'data/lab/shared/issuer-aliases.json';

export function loadIssuerAliases(opts: LoadOptions = {}) {
  return memo('aliases', [ALIASES], opts, () => (fileExists(ALIASES, opts) ? loadDataset(ALIASES, IssuerAliasesFileSchema, opts) : { aliases: [] }));
}

const fold = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The organisations a name stands for, as the documents record them: the alias rows for that
 * name, plus the name itself when documents are recorded under it. Empty when nothing matches.
 */
export function resolveIssuer(name: string, opts: LoadOptions = {}): { issuingOrg: string; iso3: string }[] {
  const key = fold(name);
  const out = loadIssuerAliases(opts)
    .aliases.filter((a) => fold(a.alias) === key)
    .map((a) => ({ issuingOrg: a.issuingOrg, iso3: a.iso3 }));
  for (const d of atlasDocuments(opts)) {
    if (d.issuingOrg && fold(d.issuingOrg) === key && !out.some((o) => o.issuingOrg === d.issuingOrg && o.iso3 === d.country)) {
      out.push({ issuingOrg: d.issuingOrg, iso3: d.country });
    }
  }
  return out;
}

/** The other names of an organisation as the documents record it, for search: "NCSC" in GBR gives "National Cyber Security Centre". */
export function issuerAliasesFor(issuingOrg: string, iso3: string, opts: LoadOptions = {}): string[] {
  const code = iso3.toUpperCase();
  return [...new Set(loadIssuerAliases(opts).aliases.filter((a) => a.issuingOrg === issuingOrg && a.iso3 === code).map((a) => a.alias))];
}

// ---- Standards Cascade ------------------------------------------------------------------------

const CASCADE = 'data/lab/cascade';

/**
 * Every standard, body, edge and standards event the Atlas holds, leads included, as the loaders
 * give them (a production build has already dropped the leads). The Standards overview chooses
 * from these what a build shows; the Cascade's own subset is cascadeFiles().
 */
export function standardsRecords(opts: LoadOptions = {}) {
  return memo('standards-records', [`${CASCADE}/edges.json`, `${CASCADE}/standards.json`, `${CASCADE}/spine.json`, `${CASCADE}/bodies.json`], opts, () => {
    const read = <T>(file: string, load: () => T, empty: T): T => (fileExists(`${CASCADE}/${file}`, opts) ? load() : empty);
    return {
      edges: read('edges.json', () => loadDataset(`${CASCADE}/edges.json`, EdgesFileSchema, opts), { edges: [] }).edges,
      standards: read('standards.json', () => loadDataset(`${CASCADE}/standards.json`, StandardsFileSchema, opts), { standards: [] }).standards,
      spine: read('spine.json', () => loadDataset(`${CASCADE}/spine.json`, SpineFileSchema, opts), { spine: [] }).spine,
      bodies: read('bodies.json', () => loadDataset(`${CASCADE}/bodies.json`, BodiesFileSchema, opts), { bodies: [] }).bodies,
    };
  });
}

/**
 * The verified standards, edges and standards events, in preview as in production: what a
 * standard's own page reads. Every edge here is dated (validate.mjs requires it of a verified
 * edge), and the type says so.
 */
export function verifiedStandardsFiles(opts: LoadOptions = {}) {
  return memo('standards-verified', [`${CASCADE}/edges.json`, `${CASCADE}/standards.json`, `${CASCADE}/spine.json`], opts, () => {
    const { edges, standards, spine } = standardsRecords(opts);
    const shown = {
      edges: edges.filter((e): e is DatedEdge => !e.verify && e.date !== null && e.precision !== null),
      standards: standards.filter((s) => !s.verify),
      spine: spine.filter((s) => !s.verify),
    };
    return { ...shown, asOf: latestVerifiedAt(shown) };
  });
}

type DatedEdge = z.infer<typeof EdgesFileSchema>['edges'][number] & { date: string; precision: 'day' | 'month' | 'year' };

/**
 * The Standards Cascade's own verified records (the standards and edges with cascade: true, each
 * edge naming one of those standards), in preview as in production. The profiles' standards rows, the documents' notes and the
 * standard pages' way into the Cascade read these, so a standard the overview added for another
 * body changes none of them.
 */
export function cascadeFiles(opts: LoadOptions = {}) {
  return memo('cascade', [`${CASCADE}/edges.json`, `${CASCADE}/standards.json`, `${CASCADE}/spine.json`], opts, () => {
    const all = verifiedStandardsFiles(opts);
    const known = new Set(standardsRecords(opts).standards.map((s) => s.id));
    const standards = all.standards.filter((s) => s.cascade);
    const own = new Set(standards.map((s) => s.id));
    const edges = all.edges.filter((e) => e.cascade && (own.has(e.to) || (e.relation === 'participates' && !known.has(e.to))));
    const spine = all.spine;
    // the evidence block reads verified records only, in preview as in production
    return { edges, standards, spine, asOf: latestVerifiedAt({ edges, standards, spine }) };
  });
}

/**
 * The Cascade's own words for a standard that is not final, from data/lab/cascade/copy.json
 * ("selected, not yet published", "initial public draft"), so every page names a status alike.
 * Without the copy file, the standards file's own status values stand in.
 */
export function cascadeStatusWords(opts: LoadOptions = {}): { selected: string; draft: string } {
  return memo('cascade-copy', [`${CASCADE}/copy.json`], opts, () => {
    const copy = fileExists(`${CASCADE}/copy.json`, opts) ? loadDataset(`${CASCADE}/copy.json`, CopyFileSchema, opts).copy : {};
    const word = (key: string, fallback: string) => (typeof copy[key] === 'string' ? (copy[key] as string) : fallback);
    return { selected: word('statusSelected', 'selected'), draft: word('statusDraft', 'draft') };
  });
}

/** A standard's name without its parenthesis: "FIPS 203 (ML-KEM)" gives "FIPS 203". */
export const standardShortName = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '').trim();

// ---- Rulebook: EU acts by number --------------------------------------------------------------

const RULEBOOK = 'data/lab/rulebook';

export interface RulebookAct {
  celex: string;
  number: string; // "2022/2555", read from the act's title
  shortTitle: string;
  articles: Set<string>; // article ids held in the Rulebook's texts, such as "art21"
}

export function rulebookActs(opts: LoadOptions = {}): { acts: RulebookAct[]; asOf: string | null } {
  return memo('rulebook', [`${RULEBOOK}/acts.json`, `${RULEBOOK}/text`], opts, () => {
    if (!fileExists(`${RULEBOOK}/acts.json`, opts)) return { acts: [], asOf: null };
    const file = loadDataset(`${RULEBOOK}/acts.json`, ActsFileSchema, opts);
    const textDir = join(opts.root ?? projectRoot(), RULEBOOK, 'text');
    const articles = new Map<string, Set<string>>();
    if (existsSync(textDir)) {
      for (const f of readdirSync(textDir).filter((n) => n.endsWith('.json'))) {
        const t = loadDataset(`${RULEBOOK}/text/${f}`, ArticleTextFileSchema, opts);
        articles.set(t.celex, new Set(t.articles.map((a) => a.id)));
      }
    }
    const acts: RulebookAct[] = [];
    for (const a of file.acts.filter((x) => !x.verify)) {
      const number = /(?:Directive|Regulation|Decision)\s+\(EU\)\s+(\d{4}\/\d+)/.exec(a.documentTitle)?.[1];
      if (number) acts.push({ celex: a.celex, number, shortTitle: a.shortTitle, articles: articles.get(a.celex) ?? new Set() });
    }
    return { acts, asOf: latestVerifiedAt(file) ?? file.checkedAt };
  });
}

// ---- Exposure Clock: the periods it reads per country (confidentiality, closure or retention) -----

export interface KeepingPeriod {
  preset: string; // the category id, the Exposure Clock's ?c=
  label: string; // the category, as the Clock names it
  years: number;
  basis: string;
}

export function keepingPeriods(iso3: string, opts: LoadOptions = {}): { periods: KeepingPeriod[]; asOf: string | null } {
  const all = memo('presets', ['data/lab/exposure/presets.json'], opts, () => {
    if (!fileExists('data/lab/exposure/presets.json', opts)) return { presets: [], asOf: null as string | null };
    const file = loadDataset('data/lab/exposure/presets.json', PresetsFileSchema, opts);
    return { presets: file.presets, asOf: latestVerifiedAt(file) };
  });
  const code = iso3.toUpperCase();
  const periods: KeepingPeriod[] = [];
  for (const p of all.presets) {
    for (const d of p.defaults) {
      if (d.iso3 === code && !d.verify) periods.push({ preset: p.id, label: p.label, years: d.years, basis: d.basis });
    }
  }
  return { periods, asOf: all.asOf };
}

/** Normalised URL, re-exported for callers that compare addresses. */
export { normaliseUrl };
