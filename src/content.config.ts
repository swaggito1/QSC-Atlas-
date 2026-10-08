import { defineCollection, z } from 'astro:content';
import type { Loader } from 'astro/loaders';
import { notionLoader, txt, num, sel, date, bool, url } from './loaders/notion';
import { jsonMirrorLoader } from './loaders/json-mirror';
import { noteSchema, noteSources, notesDir } from './lib/site/notes';

// ATLAS_OFFLINE=1 reads both collections from the JSON copy (data/profiles and data/results,
// included rows only) instead of Notion, mapped to the same fields by src/loaders/json-mirror.ts.
// For local builds, the agents' builds and CI; never set on Vercel. Unset, nothing changes.
const OFFLINE = (process.env.ATLAS_OFFLINE ?? import.meta.env.ATLAS_OFFLINE) === '1';

// Notion DATA SOURCE (collection) IDs come from the environment (.env), falling
// back to the known fixed IDs for this project. These are passed to dataSources.query.
const DB = {
  countries: process.env.NOTION_DB_COUNTRIES ?? '562cfd22-fff9-422e-9683-83c14642b49f',
  documents: process.env.NOTION_DB_DOCUMENTS ?? 'a93c0811-fce2-4c11-b2ab-1c58998317b1',
};

// ATLAS_COUNTRIES -> one entry per country, keyed by ISO3.
const countries = defineCollection({
  loader: OFFLINE ? jsonMirrorLoader({ collection: 'countries' }) : notionLoader({
    dataSourceId: DB.countries,
    map: (page) => {
      const p = page.properties;
      const country = txt(p, 'Country');
      const iso3 = txt(p, 'ISO3');
      if (!country || !iso3) return null; // skip rows missing the essentials
      return {
        id: iso3.toUpperCase(),
        country,
        iso3: iso3.toUpperCase(),
        summary: txt(p, 'Summary'),
        govActors: txt(p, 'Gov Actors'),
        standardFamilies: txt(p, 'Standard Families'),
        algorithms: txt(p, 'Algorithms'),
        dominantProcess: sel(p, 'Dominant Standards Process'),
        secondaryProcess: sel(p, 'Secondary Process'),
        processParticipation: txt(p, 'Process Participation'),
        hybridDeployment: sel(p, 'Hybrid Deployment') ?? txt(p, 'Hybrid Deployment'),
        migrationTimeline: txt(p, 'Migration Timeline'),
        targetCompletion: sel(p, 'Target Completion'),
        coordinationPosture: sel(p, 'Coordination Posture'),
        standardsRole: sel(p, 'Standards Role'),
        mainRegulation: txt(p, 'Main Regulation'),
        legalStatus: sel(p, 'Legal Status'),
        obligation: txt(p, 'Obligation'),
        confidence: sel(p, 'Confidence'),
        mapX: num(p, 'Map X'),
        mapY: num(p, 'Map Y'),
        lastUpdated: date(p, 'Last Updated'),
        dataStatus: sel(p, 'Data Status'),
        verificationStatus: sel(p, 'Verification Status'),
      };
    },
  }),
  schema: z.object({
    country: z.string(),
    iso3: z.string(),
    summary: z.string().nullable(),
    govActors: z.string().nullable(),
    standardFamilies: z.string().nullable(),
    algorithms: z.string().nullable(),
    dominantProcess: z.enum(['NIST', 'EU', 'ETSI', 'ISO', 'Sovereign', 'Mixed']).nullable(),
    secondaryProcess: z.enum(['NIST', 'EU', 'ETSI', 'ISO', 'Sovereign', 'Mixed']).nullable(),
    processParticipation: z.string().nullable(),
    hybridDeployment: z.string().nullable(),
    migrationTimeline: z.string().nullable(),
    targetCompletion: z.string().nullable(),
    coordinationPosture: z.enum(['EU', 'NIST-bloc', 'sovereign-bloc', 'engaged-unaligned']).nullable(),
    standardsRole: z.enum(['setter', 'contextualiser', 'taker', 'sovereign-developer']).nullable(),
    mainRegulation: z.string().nullable(),
    legalStatus: z.enum(['binding', 'soft-only', 'none']).nullable(),
    obligation: z.string().nullable(),
    confidence: z.enum(['High', 'Medium', 'Low']).nullable(),
    mapX: z.number().nullable(),
    mapY: z.number().nullable(),
    lastUpdated: z.string().nullable(),
    dataStatus: z.enum(['Complete', 'Partial', 'Placeholder']).nullable(),
    verificationStatus: z.enum(['Unverified', 'Verified', 'Corrected']).nullable(),
  }),
});

// ATLAS_DOCUMENTS -> one entry per institutional source (powers the Documents tool).
// Note: the "Summary" property is read here but must still be added in Notion.
const documents = defineCollection({
  loader: OFFLINE ? jsonMirrorLoader({ collection: 'documents' }) : notionLoader({
    dataSourceId: DB.documents,
    map: (page) => {
      const p = page.properties;
      const title = txt(p, 'Title');
      if (!title) return null;
      const included = bool(p, 'Included');
      if (!included) return null; // only vetted (Included) sources appear on the public site
      return {
        id: page.id,
        title,
        country: txt(p, 'Country'),
        issuingOrg: txt(p, 'Issuing Organisation'),
        year: num(p, 'Year'),
        docType: sel(p, 'Document Type'),
        tier: sel(p, 'Tier'),
        url: url(p, 'URL') ?? url(p, 'userDefined:URL'),
        summary: txt(p, 'Summary'),
        included,
      };
    },
  }),
  schema: z.object({
    title: z.string(),
    country: z.string().nullable(),
    issuingOrg: z.string().nullable(),
    year: z.number().nullable(),
    docType: z.string().nullable(),
    tier: z.string().nullable(),
    url: z.string().nullable(),
    summary: z.string().nullable(),
    included: z.boolean(),
  }),
});

// NOTES -> one entry per Markdown file in src/content/notes, keyed by its file name, read by the
// same reader and checked against the same schema as the publishing rule in src/lib/site/notes.ts,
// which decides which notes a build shows; this collection only holds each body, rendered. The
// folder holds no note until Swann writes one: no example is kept, since invented text must never
// ship. In npm run dev a note added, changed or removed is read again at once.
function notesLoader(): Loader {
  return {
    name: 'atlas-notes',
    load: async ({ store, parseData, renderMarkdown, generateDigest, watcher, logger }) => {
      const dir = notesDir();
      const sync = async () => {
        const entries = [];
        for (const src of noteSources()) {
          const data = await parseData({ id: src.slug, data: src.data, filePath: src.file });
          entries.push({ id: src.slug, data, body: src.body, filePath: src.file, digest: generateDigest(src.text), rendered: await renderMarkdown(src.body) });
        }
        store.clear();
        for (const entry of entries) store.set(entry);
      };
      await sync();
      if (!watcher) return;
      watcher.add(dir);
      const changed = async (path: string) => {
        if (!path.startsWith(dir) || !path.endsWith('.md')) return;
        try {
          await sync();
          logger.info('Reloaded the notes');
        } catch (e) {
          logger.error(e instanceof Error ? e.message : String(e));
        }
      };
      for (const event of ['add', 'change', 'unlink'] as const) watcher.on(event, changed);
    },
  };
}

const notes = defineCollection({
  loader: notesLoader(),
  schema: noteSchema(),
});

export const collections = { countries, documents, notes };
