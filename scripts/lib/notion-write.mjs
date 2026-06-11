import { Client } from '@notionhq/client';
import { loadEnv } from './env.mjs';

loadEnv();

const token = process.env.NOTION_TOKEN;
if (!token) throw new Error('NOTION_TOKEN not set in ~/qsc-atlas/.env');
export const notion = new Client({ auth: token });

// data source (collection) id -> database id, used as a fallback parent on create.
const DB_FOR_DS = {
  '562cfd22-fff9-422e-9683-83c14642b49f': '167301a0-7fe7-47c8-9670-0ba1081be31c',
  'a93c0811-fce2-4c11-b2ab-1c58998317b1': 'a95eae14-5ced-4845-a43a-0d10b3deb039',
  '63e55bb6-8faa-4963-88ab-a5d2c2f1fe99': '69cf204c-a652-4d62-846d-eecf23c7f40e',
};

const schemaCache = new Map();
export async function getSchema(dataSourceId) {
  if (schemaCache.has(dataSourceId)) return schemaCache.get(dataSourceId);
  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const props = ds.properties || {};
  schemaCache.set(dataSourceId, props);
  return props;
}

const findByType = (props, type) => {
  for (const [name, def] of Object.entries(props)) if (def.type === type) return name;
  return null;
};

function buildValue(def, value) {
  if (value === null || value === undefined || value === '') return null;
  switch (def.type) {
    case 'title':
      return { title: [{ text: { content: String(value).slice(0, 2000) } }] };
    case 'rich_text':
      return { rich_text: [{ text: { content: String(value).slice(0, 2000) } }] };
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? { number: n } : null;
    }
    case 'select':
      return { select: { name: String(value).slice(0, 100) } };
    case 'multi_select':
      return { multi_select: (Array.isArray(value) ? value : [value]).map((v) => ({ name: String(v).slice(0, 100) })) };
    case 'url':
      return { url: String(value) };
    case 'checkbox':
      return { checkbox: !!value };
    case 'date':
      return { date: { start: String(value) } };
    default:
      return null;
  }
}

// Build a Notion properties payload from {propName: value} using the data source schema.
// Unknown property names and null values are skipped.
function buildProps(props, values) {
  const out = {};
  for (const [name, value] of Object.entries(values)) {
    const def = props[name];
    if (!def) continue;
    const built = buildValue(def, value);
    if (built !== null) out[name] = built;
  }
  return out;
}

async function createPage(dataSourceId, properties) {
  try {
    return await notion.pages.create({
      parent: { type: 'data_source_id', data_source_id: dataSourceId },
      properties,
    });
  } catch (err) {
    const dbId = DB_FOR_DS[dataSourceId];
    if (dbId) {
      return await notion.pages.create({
        parent: { type: 'database_id', database_id: dbId },
        properties,
      });
    }
    throw err;
  }
}

// ---- Documents (ATLAS_DOCUMENTS) ----

/** Return a Set of all URLs already in the documents database (for dedup). */
export async function getExistingDocUrls(documentsDsId) {
  const props = await getSchema(documentsDsId);
  const urlName = findByType(props, 'url');
  const urls = new Set();
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: documentsDsId,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const u = urlName && page.properties?.[urlName]?.url;
      if (u) urls.add(u.trim());
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);
  return urls;
}

export async function createDocument(documentsDsId, doc) {
  const props = await getSchema(documentsDsId);
  const titleName = findByType(props, 'title') ?? 'Title';
  const urlName = findByType(props, 'url');
  const values = {
    [titleName]: doc.title,
    Country: doc.country,
    'Issuing Organisation': doc.issuingOrg,
    Year: doc.year,
    'Document Type': doc.docType,
    Tier: doc.tier,
    Summary: doc.summary,
    Included: doc.included ?? false,
  };
  if (urlName) values[urlName] = doc.url;
  return createPage(documentsDsId, buildProps(props, values));
}

// ---- Countries (ATLAS_COUNTRIES) ----

export async function findCountryByIso3(countriesDsId, iso3) {
  const res = await notion.dataSources.query({
    data_source_id: countriesDsId,
    filter: { property: 'ISO3', rich_text: { equals: iso3 } },
    page_size: 1,
  });
  return res.results[0] ?? null;
}

/**
 * Write a country's analytical profile fields (the "mise en forme" step).
 * `fields` maps profile keys to values; only keys present are written, so a
 * partial profile never blanks existing data. Creates the row if missing.
 */
export async function updateCountryProfile(countriesDsId, iso3, name, fields) {
  const props = await getSchema(countriesDsId);
  const titleName = findByType(props, 'title') ?? 'Country';
  const values = {};
  const map = {
    summary: 'Summary',
    govActors: 'Gov Actors',
    standardFamilies: 'Standard Families',
    algorithms: 'Algorithms',
    dominantProcess: 'Dominant Standards Process',
    processParticipation: 'Process Participation',
    hybridDeployment: 'Hybrid Deployment',
    migrationTimeline: 'Migration Timeline',
    targetCompletion: 'Target Completion',
    dataStatus: 'Data Status',
  };
  for (const [key, propName] of Object.entries(map)) {
    if (fields[key] !== undefined && fields[key] !== null) values[propName] = fields[key];
  }
  values['Last Updated'] = new Date().toISOString().slice(0, 10);

  const existing = await findCountryByIso3(countriesDsId, iso3);
  if (existing) {
    await notion.pages.update({ page_id: existing.id, properties: buildProps(props, values) });
    return existing.id;
  }
  const page = await createPage(
    countriesDsId,
    buildProps(props, { [titleName]: name, ISO3: iso3, ...values }),
  );
  return page.id;
}

/**
 * Create the country row if missing, or update only its Data Status if present.
 * Never overwrites profile fields (dominant process, timeline, etc.) - those are
 * left for human review per the brief.
 */
export async function upsertCountry(countriesDsId, { iso3, name, dataStatus }) {
  const props = await getSchema(countriesDsId);
  const titleName = findByType(props, 'title') ?? 'Country';
  const existing = await findCountryByIso3(countriesDsId, iso3);
  if (existing) {
    await notion.pages.update({
      page_id: existing.id,
      properties: buildProps(props, { 'Data Status': dataStatus }),
    });
    return existing.id;
  }
  const page = await createPage(
    countriesDsId,
    buildProps(props, { [titleName]: name, ISO3: iso3, 'Data Status': dataStatus }),
  );
  return page.id;
}
