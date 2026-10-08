#!/usr/bin/env node
// QSC Atlas Labs: may this lab-watch pull request merge itself?
// Usage: node scripts/lab/autonomy-check.mjs --pr-json pr.json
// pr.json is the output of: gh pr view <n> --json labels,files,body
// Prints eligible=true|false and reason=... (the gate workflow appends them to $GITHUB_OUTPUT).
// The never-graduate rules in labs/config/autonomy.yaml and scripts/lab/autonomy-rules/ come
// first; then the pair's tier, any demotion and any model-change re-shadow.

import { readFileSync } from 'node:fs';
import { eligibility, loadAutonomy, loadModuleRules } from './lib/autonomy.mjs';
import { parseLabMeta } from './lib/proposals.mjs';
import { isMain, today } from './lib/common.mjs';

export async function checkPr(pr, { root, now = today() } = {}) {
  const meta = parseLabMeta(pr.body);
  if (!meta) return { eligible: false, reason: 'no lab-meta block in the pull request body' };
  const labels = (pr.labels ?? []).map((l) => (typeof l === 'string' ? l : l.name));
  const files = (pr.files ?? []).map((f) => (typeof f === 'string' ? f : f.path));
  const { config } = loadAutonomy(root);
  return eligibility({ meta, files, labels, config, today: now, rules: await loadModuleRules(root) });
}

if (isMain(import.meta.url)) {
  const i = process.argv.indexOf('--pr-json');
  if (i < 0) {
    console.error('usage: node scripts/lab/autonomy-check.mjs --pr-json pr.json');
    process.exit(2);
  }
  const r = await checkPr(JSON.parse(readFileSync(process.argv[i + 1], 'utf8')));
  console.log(`eligible=${r.eligible}`);
  console.log(`reason=${r.reason.replace(/\n/g, ' ')}`);
}
