import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { notion, getSchema } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Force Included=false on ATLAS_DOCUMENTS rows whose URL is listed in a url-list
// file (default data/unpublish-urls.json), removing them from the public site, and
// mirror the change into the local data/results/<ISO3>.json. Usage:
//   node scripts/unpublish.mjs                       # uses data/unpublish-urls.json
//   node scripts/unpublish.mjs path/to/other.json

loadEnv();
const DOCUMENTS_DS = process.env.NOTION_DB_DOCUMENTS;

const findByType = (props, type) => {
  for (const [name, def] of Object.entries(props)) if (def.type === type) return name;
  return null;
};

async function main() {
  const listFile = process.argv[2] || join(ROOT, 'data', 'unpublish-urls.json');
  const parsed = JSON.parse(readFileSync(listFile, 'utf8'));
  const urls = new Set((Array.isArray(parsed) ? parsed : parsed.urls ?? []).map((u) => u.trim()));
  console.log(`unpublish list: ${urls.size} urls (from ${listFile})`);
  if (urls.size === 0) {
    console.log('nothing to do.');
    return;
  }

  // Mirror into local results files.
  const resultsDir = join(ROOT, 'data', 'results');
  let fileHits = 0;
  for (const f of readdirSync(resultsDir).filter((f) => f.endsWith('.json'))) {
    const p = join(resultsDir, f);
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    if (!Array.isArray(arr)) continue;
    let changed = false;
    for (const d of arr) {
      if (d && d.url && urls.has(d.url.trim()) && d.included !== false) {
        d.included = false;
        changed = true;
        fileHits++;
      }
    }
    if (changed) writeFileSync(p, JSON.stringify(arr, null, 2) + '\n');
  }
  console.log(`flipped ${fileHits} entries to included:false on disk.`);

  const props = await getSchema(DOCUMENTS_DS);
  const urlName = findByType(props, 'url');
  const includedName = props.Included ? 'Included' : findByType(props, 'checkbox');

  let updated = 0;
  let alreadyOff = 0;
  const matched = new Set();
  let cursor;
  do {
    const res = await notion.dataSources.query({
      data_source_id: DOCUMENTS_DS,
      start_cursor: cursor,
      page_size: 100,
    });
    for (const page of res.results) {
      const u = urlName && page.properties?.[urlName]?.url;
      if (!u || !urls.has(u.trim())) continue;
      matched.add(u.trim());
      if (page.properties?.[includedName]?.checkbox === false) {
        alreadyOff++;
        continue;
      }
      await notion.pages.update({
        page_id: page.id,
        properties: { [includedName]: { checkbox: false } },
      });
      updated++;
      console.log(`  - ${u}`);
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  console.log(`\nunpublished ${updated}; already hidden ${alreadyOff}; matched ${matched.size}/${urls.size}.`);
  const missing = [...urls].filter((u) => !matched.has(u));
  if (missing.length) {
    console.log(`WARNING: ${missing.length} urls not found in Notion:`);
    for (const u of missing) console.log(`  ? ${u}`);
  }
  // Fire a rebuild whenever the public set changed.
  if (updated > 0) await fireDeployHook();
}

main().catch((e) => {
  console.error('unpublish failed:', e?.message ?? e);
  process.exit(1);
});
