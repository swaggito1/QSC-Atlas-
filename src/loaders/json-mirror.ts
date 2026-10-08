import type { Loader, LoaderContext } from 'astro/loaders';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../lib/lab/load';
import { docId } from '../lib/site/docid';

/**
 * Offline loaders for the two content collections (spec 16.5).
 *
 * With ATLAS_OFFLINE=1, src/content.config.ts reads the countries and documents collections from
 * the version-controlled JSON copy instead of Notion: data/profiles/*.json for the countries and
 * data/results/*.json (included rows only) for the documents. Each row is mapped to exactly the
 * fields the Notion loader produces, so every page builds from either source. The pages match the
 * Notion build only as far as the JSON copy matches Notion: a copy that lags (a document added in
 * Notion since the last dump, a year filled in since) shows the older record, and the entries come
 * in file order, not Notion's, so a page that cares about order sorts explicitly. mirrorDiff and
 * documentsMirrorDiff in src/lib/site/mirror.ts name such differences. It exists for local builds,
 * the agents' builds and CI, and is never set on Vercel.
 *
 * Only the published fields are read. The internal analyticalNote, the classificationBasis working
 * notes and the provenance review items in data/profiles are never mapped, whatever a file holds.
 */

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function jsonFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
}

/** One country entry, with the same fields as the Notion map in content.config.ts. */
export function profileEntry(raw: Raw, names: Map<string, string> = new Map()): (Raw & { id: string }) | null {
  const iso3 = str(raw.iso3)?.toUpperCase() ?? null;
  const country = str(raw.country) ?? (iso3 ? names.get(iso3) ?? null : null);
  if (!country || !iso3) return null; // the Notion loader skips rows missing the essentials too
  return {
    id: iso3,
    country,
    iso3,
    summary: str(raw.summary),
    govActors: str(raw.govActors),
    standardFamilies: str(raw.standardFamilies),
    algorithms: str(raw.algorithms),
    dominantProcess: str(raw.dominantProcess),
    secondaryProcess: str(raw.secondaryProcess),
    processParticipation: str(raw.processParticipation),
    hybridDeployment: str(raw.hybridDeployment),
    migrationTimeline: str(raw.migrationTimeline),
    targetCompletion: str(raw.targetCompletion),
    coordinationPosture: str(raw.coordinationPosture),
    standardsRole: str(raw.standardsRole),
    mainRegulation: str(raw.mainRegulation),
    legalStatus: str(raw.legalStatus),
    obligation: str(raw.obligation),
    confidence: str(raw.confidence),
    mapX: num(raw.mapX),
    mapY: num(raw.mapY),
    lastUpdated: str(raw.lastUpdated),
    dataStatus: str(raw.dataStatus),
    verificationStatus: str(raw.verificationStatus),
  };
}

/** One document entry, with the same fields as the Notion map; null for a row that is not included. */
export function documentEntry(raw: Raw): (Raw & { id: string }) | null {
  const title = str(raw.title);
  if (!title) return null;
  if (raw.included !== true) return null; // only vetted (Included) sources appear on the public site
  const url = str(raw.url);
  return {
    // Notion keys a document by its page id; offline, the stable document id stands in for it
    id: url ? docId(url) : `untitled-${title}`,
    title,
    country: str(raw.country),
    issuingOrg: str(raw.issuingOrg),
    year: num(raw.year),
    docType: str(raw.docType),
    tier: str(raw.tier),
    url,
    summary: str(raw.summary),
    included: true,
  };
}

/** Every country entry in data/profiles, in file order. */
export function readProfileEntries(root: string = projectRoot()): (Raw & { id: string })[] {
  const dataDir = join(root, 'data');
  const names = new Map<string, string>();
  const countriesPath = join(dataDir, 'countries.json');
  if (existsSync(countriesPath)) {
    for (const c of readJson(countriesPath) as Raw[]) {
      const iso3 = str(c.iso3);
      const name = str(c.name);
      if (iso3 && name) names.set(iso3.toUpperCase(), name);
    }
  }
  return jsonFiles(join(dataDir, 'profiles'))
    .map((f) => profileEntry(readJson(join(dataDir, 'profiles', f)) as Raw, names))
    .filter((e): e is Raw & { id: string } => e !== null);
}

/** Every included document entry in data/results, in file order. */
export function readDocumentEntries(root: string = projectRoot()): (Raw & { id: string })[] {
  const dir = join(root, 'data', 'results');
  const out: (Raw & { id: string })[] = [];
  const seen = new Set<string>();
  for (const f of jsonFiles(dir)) {
    const rows = readJson(join(dir, f));
    if (!Array.isArray(rows)) continue;
    for (const raw of rows as Raw[]) {
      const entry = documentEntry(raw);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

export interface JsonMirrorOptions {
  collection: 'countries' | 'documents';
  /** Project root; defaults to the repository root. */
  root?: string;
}

/** An Astro content loader that reads one collection from the JSON copy. */
export function jsonMirrorLoader(opts: JsonMirrorOptions): Loader {
  return {
    name: `json-mirror-${opts.collection}`,
    async load({ store, logger, parseData, generateDigest }: LoaderContext): Promise<void> {
      store.clear();
      const root = opts.root ?? projectRoot();
      const entries = opts.collection === 'countries' ? readProfileEntries(root) : readDocumentEntries(root);
      for (const data of entries) {
        const parsed = await parseData({ id: data.id, data });
        store.set({ id: data.id, data: parsed, digest: generateDigest(parsed) });
      }
      const from = opts.collection === 'countries' ? 'data/profiles' : 'data/results';
      logger.info(`ATLAS_OFFLINE: loaded ${entries.length} ${opts.collection} from ${from} instead of Notion.`);
    },
  };
}
