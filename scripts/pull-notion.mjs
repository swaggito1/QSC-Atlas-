// Pull the analytical country fields from Notion (the fuller source after the local
// rollback) back into data/profiles/<ISO3>.json. Mapped fields are overwritten with
// Notion's values; all other JSON keys (e.g. the internal analyticalNote, provenance)
// are preserved. Read-only against Notion.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { notion } from './lib/notion-write.mjs';
import { ROOT } from './lib/env.mjs';

const DS = process.env.NOTION_DB_COUNTRIES;
const PROF = join(ROOT, 'data', 'profiles');

// Notion property -> JSON key (inverse of updateCountryProfile's map).
const MAP = {
  Summary: 'summary', 'Gov Actors': 'govActors', 'Standard Families': 'standardFamilies',
  Algorithms: 'algorithms', 'Dominant Standards Process': 'dominantProcess',
  'Secondary Process': 'secondaryProcess', 'Process Participation': 'processParticipation',
  'Hybrid Deployment': 'hybridDeployment', 'Migration Timeline': 'migrationTimeline',
  'Target Completion': 'targetCompletion', 'Data Status': 'dataStatus',
  'Coordination Posture': 'coordinationPosture', 'Standards Role': 'standardsRole',
  'Main Regulation': 'mainRegulation', 'Legal Status': 'legalStatus', Obligation: 'obligation',
  Confidence: 'confidence', ISO3: 'iso3', 'Verification Status': 'verificationStatus',
  'Classification Basis': 'classificationBasis', 'Last Updated': 'lastUpdated', Country: 'country',
};

function val(p) {
  if (!p) return null;
  switch (p.type) {
    case 'title': return p.title.map((t) => t.plain_text).join('').trim() || null;
    case 'rich_text': return p.rich_text.map((t) => t.plain_text).join('').trim() || null;
    case 'select': return p.select?.name ?? null;
    case 'multi_select': return p.multi_select?.length ? p.multi_select.map((o) => o.name).join(', ') : null;
    case 'number': return p.number ?? null;
    case 'checkbox': return p.checkbox;
    case 'date': return p.date?.start ?? null;
    default: return null;
  }
}

const pages = [];
let cursor;
do {
  const res = await notion.dataSources.query({ data_source_id: DS, start_cursor: cursor, page_size: 100 });
  pages.push(...res.results);
  cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
} while (cursor);

let touched = 0, created = 0, skipped = 0;
const changes = [];
for (const pg of pages) {
  const props = pg.properties;
  const rec = {};
  for (const [pn, key] of Object.entries(MAP)) {
    const v = val(props[pn]);
    if (v !== null && v !== '') rec[key] = v;
  }
  const iso3 = rec.iso3;
  if (!iso3) { skipped++; continue; }
  const file = join(PROF, iso3 + '.json');
  let cur = {};
  if (existsSync(file)) cur = JSON.parse(readFileSync(file, 'utf8')); else created++;
  const added = Object.keys(rec).filter((k) => cur[k] === undefined);
  const chg = Object.keys(rec).filter((k) => cur[k] !== undefined && JSON.stringify(cur[k]) !== JSON.stringify(rec[k]));
  const merged = { ...cur, ...rec, iso3 };
  if (JSON.stringify(merged) !== JSON.stringify(cur)) {
    writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
    touched++;
    if (added.length || chg.length) changes.push(`${iso3}: +[${added.join(',')}] ~[${chg.join(',')}]`);
  }
}
console.log(`pages=${pages.length} touched=${touched} created=${created} skipped(no ISO3)=${skipped}`);
console.log(changes.join('\n'));
