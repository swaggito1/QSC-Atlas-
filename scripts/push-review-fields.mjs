import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { notion, getSchema, findCountryByIso3 } from './lib/notion-write.mjs';

// Populate the review-support fields in ATLAS_COUNTRIES from the local profiles:
// Classification Basis (the recorded reasoning), Confidence, and Verification
// Status = Unverified. Touches ONLY these three fields, never the classification,
// so it is safe to run at any time. Usage: node scripts/push-review-fields.mjs

loadEnv();
const DS = process.env.NOTION_DB_COUNTRIES;
const props = await getSchema(DS);
const has = (n) => !!props[n];

function deriveConfidence(p) {
  if (p.confidence) return p.confidence;
  if (p.dominantProcess === 'EU') return 'High'; // EU is membership-based, factual
  const t = (Array.isArray(p.provenance) ? p.provenance.join(' ') : '').toLowerCase();
  if (/\blow\b/.test(t)) return 'Low';
  if (/\bhigh\b/.test(t)) return 'High';
  return 'Medium';
}

const dir = join(ROOT, 'data', 'profiles');
let n = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  if (!p.iso3) continue;
  const row = await findCountryByIso3(DS, p.iso3);
  if (!row) {
    console.log(`skip (no Notion row): ${p.iso3}`);
    continue;
  }
  const basis = Array.isArray(p.provenance) ? p.provenance.join('\n') : p.classificationBasis || '';
  const properties = {};
  if (has('Classification Basis') && basis)
    properties['Classification Basis'] = { rich_text: [{ text: { content: basis.slice(0, 1900) } }] };
  if (has('Confidence')) properties['Confidence'] = { select: { name: deriveConfidence(p) } };
  if (has('Verification Status'))
    properties['Verification Status'] = { select: { name: 'Unverified' } };
  if (Object.keys(properties).length) {
    await notion.pages.update({ page_id: row.id, properties });
    n++;
    console.log(`${p.iso3}: ${deriveConfidence(p)}`);
  }
}
console.log(`\nPopulated review fields for ${n} countries.`);
