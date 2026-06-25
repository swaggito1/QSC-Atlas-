import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

// Persist refreshed profiles from a refresh-profiles workflow output: writes each
// returned profile to data/profiles/<ISO3>.json and prints what changed + any
// proposed map-colour (dominantProcess) change for human review. After this, run:
//   node scripts/update-profile.mjs data/profiles/<A>.json ... --deploy
// Usage: node scripts/apply-profiles.mjs <workflow-output.json>

const outPath = process.argv[2];
if (!outPath) { console.error('usage: node scripts/apply-profiles.mjs <output.json>'); process.exit(1); }
const j = JSON.parse(readFileSync(outPath, 'utf8'));
const arr = j.result || j;
if (!Array.isArray(arr)) { console.error('no result array'); process.exit(1); }

const wrote = [], colourFlags = [], attestGaps = [], nulls = [];
for (const r of arr) {
  if (!r || !r.iso3) continue;
  if (!r.profile || typeof r.profile !== 'object') { nulls.push(r.iso3); continue; }
  const p = r.profile;
  if (!p.iso3) p.iso3 = r.iso3;
  writeFileSync(join(ROOT, 'data', 'profiles', r.iso3 + '.json'), JSON.stringify(p, null, 2) + '\n');
  wrote.push({ iso3: r.iso3, changed: r.changedFields || [] });
  if (r.dominantProcessProposedChange && r.dominantProcessProposedChange !== 'none')
    colourFlags.push(`${r.iso3}: ${r.dominantProcessProposedChange}`);
  if (r.couldNotAttest && r.couldNotAttest !== 'none')
    attestGaps.push(`${r.iso3}: ${r.couldNotAttest}`);
}

console.log('PROFILES WRITTEN (' + wrote.length + '):');
for (const w of wrote) console.log(`  ${w.iso3}: changed [${w.changed.join(', ') || 'none'}]`);
console.log('\nMAP-COLOUR (dominantProcess) PROPOSED CHANGES - review before accepting (' + colourFlags.length + '):');
for (const f of colourFlags) console.log('  ' + f);
if (!colourFlags.length) console.log('  (none - map colours unchanged)');
console.log('\nWATCH ITEMS / COULD-NOT-ATTEST (' + attestGaps.length + '):');
for (const g of attestGaps) console.log('  ' + g);
if (nulls.length) console.log('\nNULL agents (re-run): ' + nulls.join(' '));
console.log('\nAPPLY_LIST=' + wrote.map((w) => 'data/profiles/' + w.iso3 + '.json').join(' '));
