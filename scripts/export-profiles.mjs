import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { notion } from './lib/notion-write.mjs';

// Pull half of the sync: read every ATLAS_COUNTRIES row from Notion and merge it
// into the canonical data/profiles/<ISO3>.json files. Use this after a reviewer
// edits a profile in Notion, so the version-controlled files stay the source of
// truth. Merges field-by-field, so file-only fields (e.g. the provenance array)
// are preserved. Usage: node scripts/export-profiles.mjs

loadEnv();
const DS = process.env.NOTION_DB_COUNTRIES;

const txt = (p) => {
  const arr = p?.rich_text ?? p?.title ?? [];
  const s = arr.map((t) => t.plain_text).join('');
  return s || undefined;
};
const sel = (p) => p?.select?.name || undefined;

let cursor;
const rows = [];
do {
  const res = await notion.dataSources.query({ data_source_id: DS, start_cursor: cursor, page_size: 100 });
  rows.push(...res.results);
  cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
} while (cursor);

let n = 0;
for (const row of rows) {
  const P = row.properties;
  const iso3 = txt(P['ISO3']);
  if (!iso3) continue;
  const fp = join(ROOT, 'data', 'profiles', `${iso3}.json`);
  const prof = existsSync(fp) ? JSON.parse(readFileSync(fp, 'utf8')) : {};
  const overlay = {
    iso3,
    country: txt(P['Country']) ?? prof.country,
    summary: txt(P['Summary']),
    govActors: txt(P['Gov Actors']),
    standardFamilies: txt(P['Standard Families']),
    algorithms: txt(P['Algorithms']),
    dominantProcess: sel(P['Dominant Standards Process']),
    secondaryProcess: sel(P['Secondary Process']),
    processParticipation: txt(P['Process Participation']),
    hybridDeployment: txt(P['Hybrid Deployment']),
    migrationTimeline: txt(P['Migration Timeline']),
    targetCompletion: sel(P['Target Completion']),
    dataStatus: sel(P['Data Status']),
    confidence: sel(P['Confidence']),
    classificationBasis: txt(P['Classification Basis']),
    verificationStatus: sel(P['Verification Status']),
  };
  for (const [k, v] of Object.entries(overlay)) if (v !== undefined) prof[k] = v;
  writeFileSync(fp, JSON.stringify(prof, null, 2) + '\n');
  n++;
}
console.log(`Exported ${n} country profiles from Notion to data/profiles/.`);
