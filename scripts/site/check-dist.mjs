#!/usr/bin/env node
// qscatlas.org: check built sites against the release gates and the house rules (spec 14 and 23).
//
// Usage:
//   node scripts/site/check-dist.mjs                     every mode the matrix has built
//   node scripts/site/check-dist.mjs --only=off,tool-cascade
//   node scripts/site/check-dist.mjs --dir=dist --mode=off
//                                                         one folder, built in that mode
//   options: --matrix=<folder> (default node_modules/.cache/atlas-site-matrix), --json
//
// A mode is off (production, flags as in tools.json), on (preview, every Atlas tool) or
// tool-<id> (production, that tool and the tools it requires forced public). npm run site:matrix
// builds them; npm run site:check builds what is missing or stale and then runs this.
// Findings are grouped across files and modes (one mistake in a shared component is one group),
// each with example files and, for the site's own words, where they are written in src/ or data/;
// --json prints every finding on its own. Exits 1 on any finding that is not a warning.

import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MATRIX_DIR, ROOT, STAMP_FILE, atlasOrigins, loadTs, matrixModes, modeEnv, pickModes, readTools, readWordAllow } from './lib/common.mjs';
import { checkDist, rolePattern, tripsWordRules } from './lib/dist.mjs';
import { readNoteFronts } from './lib/notes.mjs';
import { countByMode, describeCounts, formatGroup, groupFindings, makeLookIn } from './lib/report.mjs';
import { recordIndex, verbatimIndex } from './lib/text.mjs';

/**
 * What every mode's check needs once: the registry, the routes module, the notes' files, the
 * origins, the role words of ROLE_META, the reviewed exceptions to the word rules, the sources'
 * own words and the Atlas's records.
 */
export async function checkContext(root = ROOT) {
  const routes = await loadTs('src/lib/site/routes.ts', root);
  const { ROLE_META } = await loadTs('src/lib/process.ts', root);
  const roles = rolePattern(Object.values(ROLE_META ?? {}));
  const keep = (s) => tripsWordRules(s, roles);
  return {
    root,
    tools: readTools(root),
    routes,
    notes: readNoteFronts(root),
    origins: atlasOrigins(root),
    roles,
    wordAllow: readWordAllow(root),
    verbatim: verbatimIndex(root, keep),
    records: recordIndex(root, keep),
  };
}

/** Findings for one folder built in one mode. */
export function checkMode(mode, dir, ctx) {
  const env = modeEnv(mode);
  const pages = ctx.routes.allPages({ env, root: ctx.root });
  const files = ctx.routes.allFiles();
  const findings = [];
  const stampAbs = join(dir, STAMP_FILE);
  if (existsSync(stampAbs)) {
    const stamp = JSON.parse(readFileSync(stampAbs, 'utf8'));
    if (stamp.mode !== mode.id || (stamp.forced ?? []).join(',') !== mode.forced.join(',')) {
      findings.push({ mode: mode.id, rule: `this folder was built as ${stamp.mode} (${(stamp.forced ?? []).join(',') || 'nothing forced'})`, file: STAMP_FILE, line: null, col: null, excerpt: '', level: 'error' });
    }
  }
  findings.push(...checkDist({ dir, mode, tools: ctx.tools, pages, files, notes: ctx.notes ?? [], origins: ctx.origins, verbatim: ctx.verbatim, records: ctx.records, roles: ctx.roles, wordAllow: ctx.wordAllow }));
  return findings;
}

function parseArgs(argv) {
  const get = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  return { dir: get('dir'), mode: get('mode'), only: get('only'), matrix: get('matrix') ?? MATRIX_DIR, json: argv.includes('--json') };
}

/**
 * Print the findings, grouped across files and modes, then one line per mode; returns
 * { errors, warnings, groups (of errors), perMode }. With `json`, prints every finding on its own.
 */
export function report(byMode, { json = false, root = ROOT, summary = true } = {}) {
  const all = Object.values(byMode).flat();
  const perMode = countByMode(byMode);
  const errors = all.filter((f) => f.level !== 'warn').length;
  const warnings = all.length - errors;
  if (json) {
    console.log(JSON.stringify(byMode, null, 2));
    return { errors, warnings, groups: 0, perMode };
  }
  const groups = groupFindings(all);
  const lookIn = makeLookIn(root);
  for (const g of groups) console.log(formatGroup(g, lookIn));
  if (summary) for (const [mode, n] of Object.entries(perMode)) console.log(`check-dist [${mode}]: ${describeCounts(n)}`);
  return { errors, warnings, groups: groups.filter((g) => g.level !== 'warn').length, perMode };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ctx = await checkContext();
  const all = matrixModes(ctx.tools);
  const byMode = {};
  if (args.dir) {
    const mode = all.find((m) => m.id === (args.mode ?? 'off'));
    if (!mode) throw new Error(`unknown mode ${args.mode}; known: ${all.map((m) => m.id).join(', ')}`);
    const dir = isAbsolute(args.dir) ? args.dir : join(process.cwd(), args.dir);
    byMode[mode.id] = checkMode(mode, dir, ctx);
  } else {
    for (const mode of pickModes(all, args.only)) byMode[mode.id] = checkMode(mode, join(args.matrix, mode.id), ctx);
  }
  const { errors } = report(byMode, args);
  process.exit(errors ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`check-dist: ${e.message}`);
    process.exit(2);
  });
}
