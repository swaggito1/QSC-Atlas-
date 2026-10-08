#!/usr/bin/env node
// qscatlas.org: build the site once per release mode, offline (spec 14.3, 16.5 and 23).
//
// Usage:
//   node scripts/site/build-matrix.mjs                    every mode
//   node scripts/site/build-matrix.mjs --only=off,tool-cascade
//   node scripts/site/build-matrix.mjs --list             name the modes and stop
//   option: --out=<folder> (default node_modules/.cache/atlas-site-matrix, which git ignores)
//
// Modes: off (production, every flag as in data/lab/tools.json: stage 0 today), on (a preview
// with every Atlas tool) and tool-<id> for each Atlas tool (production, that tool and the tools
// it requires forced public through ATLAS_FORCE_PUBLIC). Every build reads the JSON copy
// (ATLAS_OFFLINE=1), so no Notion token is needed, and none sets VERCEL, so the forced flags are
// honoured here and could never be on a deployment. Each build goes to its own folder; the
// site's own dist/ is left alone. Beside each build a stamp records the mode and a digest of the
// inputs as they stood when it started (scripts/site/lib/inputs.mjs), so npm run site:check
// knows when a folder is stale. npm run site:check checks the folders, and builds quietly: it
// prints one line per mode and Astro's own log only when a build fails.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MATRIX_DIR, ROOT, STAMP_FILE, matrixModes, modeEnv, pickModes, readTools } from './lib/common.mjs';
import { inputFingerprint } from './lib/inputs.mjs';

const ASTRO = join(ROOT, 'node_modules', 'astro', 'astro.js');

/**
 * Build one mode into its folder; returns { ok, ms }. Astro's log goes to this terminal, or, with
 * `quiet`, is kept and printed only when the build fails.
 */
export function buildMode(mode, outRoot = MATRIX_DIR, { quiet = false } = {}) {
  if (!existsSync(ASTRO)) throw new Error('astro is not installed; run npm ci first');
  const outDir = join(outRoot, mode.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outRoot, { recursive: true });
  const started = Date.now();
  const inputs = inputFingerprint();
  console.log(quiet ? `site:matrix [${mode.id}] building: ${mode.label}` : `\nsite:matrix [${mode.id}] ${mode.label}`);
  const res = spawnSync(process.execPath, [ASTRO, 'build', '--outDir', outDir], {
    cwd: ROOT,
    env: modeEnv(mode),
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    // Astro logs one line per page; keep all of it for a failure report
    maxBuffer: 256 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  if (res.status !== 0) {
    if (quiet) process.stderr.write(`${res.stdout ?? ''}${res.stderr ?? ''}`);
    if (res.error) console.log(`site:matrix [${mode.id}] ${res.error.message}`);
    console.log(`site:matrix [${mode.id}] build failed after ${Math.round(ms / 1000)} s`);
    return { ok: false, ms };
  }
  writeFileSync(
    join(outDir, STAMP_FILE),
    `${JSON.stringify(
      { mode: mode.id, production: mode.production, forced: mode.forced, startedAt: new Date(started).toISOString(), startedMs: started, seconds: Math.round(ms / 1000), inputs: inputs.digest, inputFiles: inputs.files },
      null,
      2,
    )}\n`,
  );
  console.log(`site:matrix [${mode.id}] built in ${Math.round(ms / 1000)} s`);
  return { ok: true, ms };
}

/** Build several modes in turn (Astro builds share a cache, so never in parallel). */
export function buildModes(modes, outRoot = MATRIX_DIR, opts = {}) {
  const failed = [];
  for (const mode of modes) if (!buildMode(mode, outRoot, opts).ok) failed.push(mode.id);
  return failed;
}

function main() {
  const argv = process.argv.slice(2);
  const get = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const all = matrixModes(readTools());
  if (argv.includes('--list')) {
    for (const m of all) console.log(`${m.id.padEnd(18)} ${m.label}`);
    return 0;
  }
  const out = get('out') ? (isAbsolute(get('out')) ? get('out') : join(process.cwd(), get('out'))) : MATRIX_DIR;
  const modes = pickModes(all, get('only'));
  const failed = buildModes(modes, out);
  console.log(`\nsite:matrix: ${modes.length - failed.length} of ${modes.length} built in ${out}${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
  return failed.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(`site:matrix: ${e.message}`);
    process.exit(2);
  }
}
