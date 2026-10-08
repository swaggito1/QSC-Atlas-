#!/usr/bin/env node
// QSC Atlas Labs: mechanical checks on every proposal the triage step wrote.
// Usage: node scripts/lab/check-proposals.mjs [labs/.watch/proposals]
// Files whose names begin with "_" are the triage log and are skipped. For each proposal:
// required fields, a target inside data/lab/, a patch that applies cleanly, a result that
// still passes lab:validate, an excerpt of 60 words or fewer, and house style on every
// string except the verbatim fields. Items that can never merge themselves are flagged.
// Exits 1 if any proposal fails, naming the file and the reason.

import { basename, join } from 'node:path';
import { checkProposal, listProposalFiles } from './lib/proposals.mjs';
import { ROOT, isMain } from './lib/common.mjs';

export async function checkAll(dir, opts) {
  const results = [];
  for (const file of listProposalFiles(dir)) results.push({ file, ...(await checkProposal(file, opts)) });
  return results;
}

if (isMain(import.meta.url)) {
  const dir = process.argv[2] ?? join(ROOT, 'labs', '.watch', 'proposals');
  const results = await checkAll(dir);
  let failed = 0;
  for (const r of results) {
    const name = basename(r.file);
    if (r.errors.length) {
      failed++;
      console.log(`FAIL ${name}`);
      for (const e of r.errors) console.log(`  - ${e}`);
    } else console.log(`OK   ${name}`);
    for (const f of r.flags) console.log(`  flag: ${f}`);
  }
  console.log(`\ncheck-proposals: ${results.length} proposal(s), ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
