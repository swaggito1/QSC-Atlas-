import { defineCollection, z } from 'astro:content';
import { notionLoader, txt, num, sel, multi, date, bool, url } from './loaders/notion';

// Notion DATA SOURCE (collection) IDs come from the environment (.env), falling
// back to the known fixed IDs for this project. These are passed to dataSources.query.
const DB = {
  countries: process.env.NOTION_DB_COUNTRIES ?? '562cfd22-fff9-422e-9683-83c14642b49f',
  documents: process.env.NOTION_DB_DOCUMENTS ?? 'a93c0811-fce2-4c11-b2ab-1c58998317b1',
  blog: process.env.NOTION_DB_BLOG ?? '63e55bb6-8faa-4963-88ab-a5d2c2f1fe99',
};

// ATLAS_COUNTRIES -> one entry per country, keyed by ISO3.
const countries = defineCollection({
  loader: notionLoader({
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
  }),
});

// ATLAS_DOCUMENTS -> one entry per institutional source (powers the Documents tool).
// Note: the "Summary" property is read here but must still be added in Notion.
const documents = defineCollection({
  loader: notionLoader({
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

// ATLAS_BLOG -> one entry per article. Only Published rows are loaded.
// (Rendering the Notion page BODY is added in the blog build step.)
const blog = defineCollection({
  loader: notionLoader({
    dataSourceId: DB.blog,
    filter: { property: 'Status', select: { equals: 'Published' } },
    map: (page) => {
      const p = page.properties;
      const title = txt(p, 'Title');
      const slug = txt(p, 'Slug');
      if (!title || !slug) return null;
      return {
        id: slug,
        title,
        slug,
        published: date(p, 'Published'),
        excerpt: txt(p, 'Excerpt'),
        author: txt(p, 'Author'),
        tags: multi(p, 'Tags'),
        countriesReferenced: txt(p, 'Countries Referenced'),
      };
    },
  }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    published: z.string().nullable(),
    excerpt: z.string().nullable(),
    author: z.string().nullable(),
    tags: z.array(z.string()),
    countriesReferenced: z.string().nullable(),
  }),
});

export const collections = { countries, documents, blog };
