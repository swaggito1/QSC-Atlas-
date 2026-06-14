import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

// Persist results files from a scan-batch workflow's returned output.
// The workflow returns [{iso3, documents:[...], ...}]; this writes
// data/results/<ISO3>.json from each documents array (the workflow sandbox
// cannot write files itself). Usage: node scripts/write-from-workflow.mjs <task-output.json>

const outPath = process.argv[2];
if (!outPath) { console.error('usage: node scripts/write-from-workflow.mjs <workflow-output.json>'); process.exit(1); }
const j = JSON.parse(readFileSync(outPath, 'utf8'));
const arr = j.result || j;
if (!Array.isArray(arr)) { console.error('no result array in output'); process.exit(1); }

const wrote = [], rerun = [];
for (const r of arr) {
  if (!r || !r.iso3) continue;
  if (!Array.isArray(r.documents)) { rerun.push(r.iso3); continue; }
  writeFileSync(join(ROOT, 'data', 'results', r.iso3 + '.json'), JSON.stringify(r.documents, null, 2) + '\n');
  wrote.push(r.iso3);
}
console.log('wrote ' + wrote.length + ' results files:', wrote.join(' '));
if (rerun.length) console.log('NEEDS RERUN (documents field missing/null): ' + rerun.join(' '));
