// QSC Atlas Labs: read the canonical Atlas data for the lab tools.
//
// The JSON files under data/ are the version-controlled canonical copy of the Atlas
// (docs/REVIEWER_GUIDE.md); Notion is the published mirror the Atlas pages read. The
// lab tools read the JSON so they can be built and tested offline and in CI.
//
// Only the fields the Atlas publishes are returned: the same set src/content.config.ts
// reads from Notion. The internal analyticalNote, the classificationBasis working notes
// and the provenance review items are never returned, whatever the file contains.
// Parsing reuses src/lib/parse.ts and the colour and label metadata in src/lib/process.ts.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseList, parseNameRole, parseRegulation, parseTimeline } from '../parse';
import type { Milestone, NameRole, Regulation } from '../parse';
import { POSTURE_META, ROLE_META, confidenceOpacity } from '../process';
import type { CoordinationPosture, PostureMeta, RoleMeta, StandardsRole } from '../process';
import { projectRoot } from './load';

export interface AtlasCountry {
  iso3: string;
  iso2: string;
  name: string;
  priority: number;
  supranational: boolean;
}

export interface AtlasProfile {
  iso3: string;
  country: string;
  summary: string | null;
  posture: PostureMeta | null; // the map colour, from POSTURE_META
  role: RoleMeta | null; // the badge, from ROLE_META
  dominantProcess: string | null;
  secondaryProcess: string | null;
  confidence: 'High' | 'Medium' | 'Low' | null;
  opacity: number; // confidenceOpacity(confidence): soft calls look soft
  timeline: Milestone[]; // parseTimeline(migrationTimeline)
  targetCompletion: string | null;
  actors: NameRole[]; // parseNameRole(govActors)
  participation: NameRole[]; // parseNameRole(processParticipation)
  regulation: Regulation[]; // parseRegulation(mainRegulation)
  legalStatus: string | null;
  obligation: string | null;
  hybridDeployment: string | null;
  standardFamilies: string[];
  algorithms: string[];
  dataStatus: string | null;
  verificationStatus: string | null;
  lastUpdated: string | null;
}

export interface AtlasDocument {
  title: string;
  country: string;
  issuingOrg: string | null;
  year: number | null;
  docType: string | null;
  tier: string | null;
  url: string | null;
  summary: string | null;
  included: boolean;
}

export interface AtlasOptions {
  root?: string; // project root; defaults to projectRoot() in load.ts
}

const dataDir = (opts: AtlasOptions) => join(opts.root ?? projectRoot(), 'data');
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function listCountries(opts: AtlasOptions = {}): AtlasCountry[] {
  const rows = readJson(join(dataDir(opts), 'countries.json')) as Record<string, unknown>[];
  return rows.map((r) => ({
    iso3: String(r.iso3),
    iso2: String(r.iso2),
    name: String(r.name),
    priority: Number(r.priority),
    supranational: r.supranational === true,
  }));
}

/** Build the public profile from a raw file object. Reads named fields only. */
export function toProfile(raw: Record<string, unknown>, fallbackName?: string): AtlasProfile {
  const confidence = str(raw.confidence);
  const posture = str(raw.coordinationPosture);
  const role = str(raw.standardsRole);
  return {
    iso3: String(raw.iso3).toUpperCase(),
    country: str(raw.country) ?? fallbackName ?? String(raw.iso3),
    summary: str(raw.summary),
    posture: posture ? POSTURE_META[posture as CoordinationPosture] ?? null : null,
    role: role ? ROLE_META[role as StandardsRole] ?? null : null,
    dominantProcess: str(raw.dominantProcess),
    secondaryProcess: str(raw.secondaryProcess),
    confidence: confidence === 'High' || confidence === 'Medium' || confidence === 'Low' ? confidence : null,
    opacity: confidenceOpacity(confidence),
    timeline: parseTimeline(str(raw.migrationTimeline)),
    targetCompletion: str(raw.targetCompletion),
    actors: parseNameRole(str(raw.govActors)),
    participation: parseNameRole(str(raw.processParticipation)),
    regulation: parseRegulation(str(raw.mainRegulation)),
    legalStatus: str(raw.legalStatus),
    obligation: str(raw.obligation),
    hybridDeployment: str(raw.hybridDeployment),
    standardFamilies: parseList(str(raw.standardFamilies)),
    algorithms: parseList(str(raw.algorithms)),
    dataStatus: str(raw.dataStatus),
    verificationStatus: str(raw.verificationStatus),
    lastUpdated: str(raw.lastUpdated),
  };
}

export function getProfile(iso3: string, opts: AtlasOptions = {}): AtlasProfile | null {
  const path = join(dataDir(opts), 'profiles', `${iso3.toUpperCase()}.json`);
  if (!existsSync(path)) return null;
  const name = listCountries(opts).find((c) => c.iso3 === iso3.toUpperCase())?.name;
  return toProfile(readJson(path), name);
}

/** Every profile on disk, stubs included. Filter on dataStatus to drop placeholders. */
export function getProfiles(opts: AtlasOptions = {}): AtlasProfile[] {
  const dir = join(dataDir(opts), 'profiles');
  const names = new Map(listCountries(opts).map((c) => [c.iso3, c.name]));
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const raw = readJson(join(dir, f));
      return toProfile(raw, names.get(String(raw.iso3).toUpperCase()));
    });
}

function toDocument(raw: Record<string, unknown>): AtlasDocument {
  return {
    title: String(raw.title),
    country: String(raw.country),
    issuingOrg: str(raw.issuingOrg),
    year: typeof raw.year === 'number' ? raw.year : null,
    docType: str(raw.docType),
    tier: str(raw.tier),
    url: str(raw.url),
    summary: str(raw.summary),
    included: raw.included === true,
  };
}

/** A country's documents. Only included (public) documents unless includeDrafts is set. */
export function getDocuments(iso3: string, opts: AtlasOptions & { includeDrafts?: boolean } = {}): AtlasDocument[] {
  const path = join(dataDir(opts), 'results', `${iso3.toUpperCase()}.json`);
  if (!existsSync(path)) return [];
  const docs = (readJson(path) as Record<string, unknown>[]).map(toDocument);
  return opts.includeDrafts ? docs : docs.filter((d) => d.included);
}

/** Every included document across all countries. */
export function getAllDocuments(opts: AtlasOptions = {}): AtlasDocument[] {
  const dir = join(dataDir(opts), 'results');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .flatMap((f) => getDocuments(f.replace(/\.json$/, ''), opts));
}
