#!/usr/bin/env node
// qscatlas.org: npm run site:check, the release gate for the whole site (spec 14.5 and 23).
//
// Usage:
//   npm run site:check                      everything below; builds the modes that are missing or stale
//   npm run site:check -- --no-build        check the folders already built, build nothing
//   npm run site:check -- --rebuild         build every mode again first
//   npm run site:check -- --only=off,on     only these modes
//   npm run site:check -- --skip-mirror     leave Notion out
//
// 1. Source: no hard-coded href to a gated page anywhere in src/ (scripts/site/lib/source.mjs).
// 2. Matrix: each release mode built offline (scripts/site/build-matrix.mjs), quietly, one line
//    per mode, and checked (scripts/site/check-dist.mjs): off is production with every flag as in
//    tools.json, on is a preview with every Atlas tool, tool-<id> is production with that tool and
//    its requirements forced public. A mode is built again when an input was added, changed,
//    deleted or renamed since its last build (scripts/site/lib/inputs.mjs).
// 3. Mirror: Notion against the JSON copy, when a token is available and Notion answers
//    (scripts/site/check-mirror.mjs).
// The findings are grouped across files and modes, and the run ends on a short table: one row per
// mode (clean, findings, warnings, not built, build failed), the source scan and the mirror.
// Exits 1 on any finding that is not a warning, on a failed build, and when a mode was not built
// (with --no-build), since then nothing proves that mode.

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildModes } from './build-matrix.mjs';
import { checkContext, checkMode, report } from './check-dist.mjs';
import { runMirror } from './check-mirror.mjs';
import { MATRIX_DIR, STAMP_FILE, matrixModes, pickModes } from './lib/common.mjs';
import { formatFinding } from './lib/dist.mjs';
import { inputFingerprint, newestInput, staleReason } from './lib/inputs.mjs';
import { describeCounts } from './lib/report.mjs';
import { scanSource } from './lib/source.mjs';

export { newestInput, staleReason };

async function main() {
  const argv = process.argv.slice(2);
  const get = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const flag = (k) => argv.includes(`--${k}`);
  const out = get('matrix') ? (isAbsolute(get('matrix')) ? get('matrix') : join(process.cwd(), get('matrix'))) : MATRIX_DIR;
  const rows = [];
  let errors = 0;

  // 1. source
  const source = scanSource();
  for (const f of source) console.log(formatFinding(f));
  const sourceErrors = source.filter((f) => f.level !== 'warn').length;
  const sourceWarns = source.length - sourceErrors;
  console.log(`site:check [source]: ${sourceErrors ? `${sourceErrors} hard-coded gated link(s)` : 'every gated link goes through pageHref() or link()'}`);
  rows.push(['source', describeCounts({ errors: sourceErrors, warnings: sourceWarns })]);
  errors += sourceErrors;

  // 2. matrix
  const ctx = await checkContext();
  const modes = pickModes(matrixModes(ctx.tools), get('only'));
  const inputs = inputFingerprint();
  const stale = new Map(modes.map((m) => [m.id, flag('rebuild') ? 'rebuild asked' : staleReason(join(out, m.id), inputs)]));
  const toBuild = modes.filter((m) => stale.get(m.id) !== null);
  const notBuilt = new Set();
  const failed = new Set();
  if (toBuild.length && flag('no-build')) {
    for (const m of toBuild) notBuilt.add(m.id);
    const reasons = [...new Set(toBuild.map((m) => stale.get(m.id)))].join('; ');
    console.log(`site:check: --no-build, so ${toBuild.length} mode(s) are not checked (${reasons}): ${toBuild.map((m) => m.id).join(', ')}`);
  } else if (toBuild.length) {
    console.log(`site:check: building ${toBuild.length} mode(s) offline: ${toBuild.map((m) => m.id).join(', ')} (full log: npm run site:matrix)`);
    for (const id of buildModes(toBuild, out, { quiet: true })) failed.add(id);
  }
  const byMode = {};
  for (const mode of modes) {
    if (notBuilt.has(mode.id) || failed.has(mode.id)) continue;
    if (existsSync(join(out, mode.id, STAMP_FILE))) byMode[mode.id] = checkMode(mode, join(out, mode.id), ctx);
    else notBuilt.add(mode.id);
  }
  if (Object.keys(byMode).length) console.log('');
  const matrix = report(byMode, { summary: false });
  errors += matrix.errors;
  for (const mode of modes) {
    if (failed.has(mode.id)) rows.push([mode.id, 'build failed']);
    else if (notBuilt.has(mode.id)) rows.push([mode.id, 'not built']);
    else rows.push([mode.id, describeCounts(matrix.perMode[mode.id] ?? { errors: 0, warnings: 0 })]);
  }

  // 3. mirror
  if (flag('skip-mirror')) rows.push(['mirror', 'left out (--skip-mirror)']);
  else {
    const mirror = await runMirror();
    for (const f of mirror.findings) console.log(formatFinding(f));
    const mirrorErrors = mirror.findings.filter((f) => f.level !== 'warn').length;
    const mirrorWarns = mirror.findings.length - mirrorErrors;
    rows.push(['mirror', mirror.status === 'skipped' ? `skipped: ${mirror.note}` : `${describeCounts({ errors: mirrorErrors, warnings: mirrorWarns })} (${mirror.note})`]);
    errors += mirrorErrors;
  }

  // the table
  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  console.log('\nsite:check summary');
  for (const [k, v] of rows) console.log(`  ${k.padEnd(width)}${v}`);
  const verdict = [];
  if (errors) verdict.push(`${errors} finding${errors === 1 ? '' : 's'}${matrix.groups ? ` in ${matrix.groups} group${matrix.groups === 1 ? '' : 's'} above` : ''}`);
  if (failed.size) verdict.push(`${failed.size} build${failed.size === 1 ? '' : 's'} failed (${[...failed].join(', ')})`);
  if (notBuilt.size) verdict.push(`not checked: ${notBuilt.size} mode${notBuilt.size === 1 ? '' : 's'} not built; run npm run site:matrix`);
  console.log(`\nsite:check: ${verdict.length ? verdict.join('; ') : 'passed'}`);
  return verdict.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.error(`site:check: ${e.stack ?? e.message}`);
      process.exit(2);
    });
}
