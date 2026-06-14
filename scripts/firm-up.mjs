import { notion, getSchema } from './lib/notion-write.mjs';
import { loadEnv, ROOT } from './lib/env.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Confirm a country's institutional sources: flip included=true for non-vendor
// (institutional) sources in data/results/<ISO3>.json, and update the matching
// ATLAS_DOCUMENTS rows in Notion so they appear on the site and back the colour.
// Usage: node scripts/firm-up.mjs <ISO3> [ISO3 ...]

loadEnv();
const DOCS = process.env.NOTION_DB_DOCUMENTS;
const VENDOR = /microsoft\.com|linkedin\.com|facebook\.com|medium\.com|twitter\.com|x\.com|youtube\.com|reddit\.com/i;

const isos = process.argv.slice(2);
const props = await getSchema(DOCS);
const urlName = Object.entries(props).find(([, d]) => d.type === 'url')?.[0];
const inclName = Object.entries(props).find(([, d]) => d.type === 'checkbox')?.[0] ?? 'Included';

const wanted = new Set();
for (const iso of isos) {
  const f = join(ROOT, 'data', 'results', `${iso}.json`);
  const arr = JSON.parse(readFileSync(f, 'utf8'));
  let changed = false;
  for (const d of arr) {
    if (d.url && !VENDOR.test(d.url)) {
      if (!d.included) {
        d.included = true;
        changed = true;
      }
      wanted.add(d.url.trim());
    }
  }
  if (changed) writeFileSync(f, JSON.stringify(arr, null, 2) + '\n');
  console.log(`${iso}: ${arr.filter((d) => d.included).length} institutional sources confirmed`);
}

let updated = 0;
let missing = 0;
for (const url of wanted) {
  const res = await notion.dataSources.query({
    data_source_id: DOCS,
    filter: { property: urlName, url: { equals: url } },
    page_size: 5,
  });
  if (!res.results.length) {
    missing++;
    continue;
  }
  for (const page of res.results) {
    await notion.pages.update({ page_id: page.id, properties: { [inclName]: { checkbox: true } } });
    updated++;
  }
}
console.log(`\nPromoted ${updated} document rows to Included in Notion; ${missing} not yet in Notion.`);
