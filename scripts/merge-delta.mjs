import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

// Merge a delta-scan workflow's NEW documents into the existing per-country results
// files (append, dedupe by URL). Prints the countries that changed + any change-notes,
// so you know which to re-ingest and which profiles to refresh.
// Usage: node scripts/merge-delta.mjs <delta-workflow-output.json>

const outPath = process.argv[2];
if (!outPath) { console.error('usage: node scripts/merge-delta.mjs <output.json>'); process.exit(1); }
const j = JSON.parse(readFileSync(outPath, 'utf8'));
const arr = j.result || j;
if (!Array.isArray(arr)) { console.error('no result array'); process.exit(1); }

const changed = [], notes = [], nullAgents = [];
for (const r of arr) {
  if (!r || !r.iso3) continue;
  if (r.changeNote && r.changeNote !== 'none') notes.push(`${r.iso3}: ${r.changeNote}`);
  if (!Array.isArray(r.documents)) { nullAgents.push(r.iso3); continue; }
  if (r.documents.length === 0) continue;
  const rp = join(ROOT, 'data', 'results', r.iso3 + '.json');
  const existing = existsSync(rp) ? JSON.parse(readFileSync(rp, 'utf8')) : [];
  const haveUrls = new Set(existing.map((d) => (d.url || '').trim()));
  const fresh = r.documents.filter((d) => d && d.url && !haveUrls.has(d.url.trim()));
  if (fresh.length === 0) continue;
  writeFileSync(rp, JSON.stringify([...existing, ...fresh], null, 2) + '\n');
  changed.push({ iso3: r.iso3, added: fresh.length, included: fresh.filter((d) => d.included).length });
}

console.log('CHANGED countries (' + changed.length + '):');
for (const c of changed) console.log(`  ${c.iso3}: +${c.added} new (${c.included} live)`);
if (!changed.length) console.log('  (none - corpus already up to date)');
console.log('\nCHANGE-NOTES (analysis may need refresh, ' + notes.length + '):');
for (const n of notes) console.log('  ' + n);
if (!notes.length) console.log('  (none)');
if (nullAgents.length) console.log('\nNULL agents (re-run): ' + nullAgents.join(' '));
// emit the changed ISO3 list for the ingest step
console.log('\nINGEST_LIST=' + changed.map((c) => c.iso3).join(' '));
