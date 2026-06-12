import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { notion, getSchema } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Promote drafts (Included=false) to live (Included=true) on existing ATLAS_DOCUMENTS
// rows, matched by URL. Also rewrites the local data/results/<ISO3>.json so on-disk
// state matches what is published. Usage:
//   node scripts/publish-drafts.mjs            # all results files
//   node scripts/publish-drafts.mjs FRA CHE    # only these ISO3s

loadEnv();
const DOCUMENTS_DS = process.env.NOTION_DB_DOCUMENTS;

const findByType = (props, type) => {
  for (const [name, def] of Object.entries(props)) if (def.type === type) return name;
  return null;
};

async function main() {
  const isoArgs = process.argv.slice(2).map((s) => s.toUpperCase()).filter(Boolean);
  const resultsDir = join(ROOT, 'data', 'results');
  const files = readdirSync(resultsDir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => isoArgs.length === 0 || isoArgs.includes(f.replace('.json', '')));

  // Collect draft URLs (Included=false) and flip them to true on disk.
  const draftUrls = new Set();
  let fileDrafts = 0;
  for (const f of files) {
    const p = join(resultsDir, f);
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    if (!Array.isArray(arr)) continue;
    let changed = false;
    for (const d of arr) {
      if (d && d.included === false && d.url) {
        draftUrls.add(d.url.trim());
        d.included = true;
        changed = true;
        fileDrafts++;
      }
    }
    if (changed) writeFileSync(p, JSON.stringify(arr, null, 2) + '\n');
  }
  console.log(`drafts found on disk: ${fileDrafts} (unique urls ${draftUrls.size}) across ${files.length} files`);
  if (draftUrls.size === 0) {
    console.log('nothing to publish.');
    return;
  }

  const props = await getSchema(DOCUMENTS_DS);
  const urlName = findByType(props, 'url');
  const includedName = props.Included ? 'Included' : findByType(props, 'checkbox');

  let updated = 0;
  let alreadyOn = 0;
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
      if (!u || !draftUrls.has(u.trim())) continue;
      matched.add(u.trim());
      if (page.properties?.[includedName]?.checkbox === true) {
        alreadyOn++;
        continue;
      }
      await notion.pages.update({
        page_id: page.id,
        properties: { [includedName]: { checkbox: true } },
      });
      updated++;
      console.log(`  + ${u}`);
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  console.log(`\npublished ${updated}; already live ${alreadyOn}; matched ${matched.size}/${draftUrls.size} draft urls.`);
  const missing = [...draftUrls].filter((u) => !matched.has(u));
  if (missing.length) {
    console.log(`WARNING: ${missing.length} draft urls were not found in Notion (re-ingest needed):`);
    for (const u of missing) console.log(`  ? ${u}`);
  }
  if (updated > 0) await fireDeployHook();
}

main().catch((e) => {
  console.error('publish failed:', e?.message ?? e);
  process.exit(1);
});
