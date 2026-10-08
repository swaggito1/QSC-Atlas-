// qscatlas.org site checks: what an offline build reads, and whether a matrix build is current.
//
// A matrix build leaves a stamp beside its output (STAMP_FILE) with a digest of every input file
// as it stood when the build started: its path, size and modification time. A mode is built
// again when that digest no longer matches, so an added, edited, deleted or renamed input all
// count (a rename keeps the file's modification time, so the newest time alone would miss it).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, STAMP_FILE, rel, walkFiles } from './common.mjs';

// What an offline build reads. The scraper's working folders under data/ and the watch
// snapshots feed no page.
export const INPUTS = ['src', 'public', 'data', 'astro.config.mjs', 'package.json', 'package-lock.json', 'tsconfig.json'];
const NOT_INPUTS = new Set(['watch', 'candidates', 'routine', '.DS_Store']);

/** Every input file, as paths relative to the root, sorted. */
export function inputFiles(root = ROOT) {
  const out = [];
  for (const p of INPUTS) {
    const abs = join(root, p);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) out.push(...walkFiles(abs, (_, name) => NOT_INPUTS.has(name)));
    else out.push(abs);
  }
  return out.map((abs) => rel(abs, root)).sort();
}

/** The digest of the inputs (path, size and modification time of each) and their newest change. */
export function inputFingerprint(root = ROOT) {
  const hash = createHash('sha256');
  let newest = 0;
  const files = inputFiles(root);
  for (const f of files) {
    const st = statSync(join(root, f));
    newest = Math.max(newest, st.mtimeMs);
    hash.update(`${f}\t${st.size}\t${Math.round(st.mtimeMs)}\n`);
  }
  return { digest: hash.digest('hex'), newest, files: files.length };
}

/** The newest change among the build's inputs, in milliseconds. */
export function newestInput(root = ROOT) {
  return inputFingerprint(root).newest;
}

/**
 * Why a mode's folder needs building, or null when it is current. `current` is the fingerprint of
 * the inputs now (inputFingerprint); a bare number is read as the newest change alone.
 */
export function staleReason(dir, current) {
  const stamp = join(dir, STAMP_FILE);
  if (!existsSync(stamp)) return 'not built yet';
  let s;
  try {
    s = JSON.parse(readFileSync(stamp, 'utf8'));
  } catch {
    return 'its stamp cannot be read';
  }
  const now = typeof current === 'number' ? { newest: current } : current;
  if (!s.startedMs || now.newest > s.startedMs) return 'an input changed since it was built';
  if (now.digest !== undefined) {
    if (!s.inputs) return 'built before the inputs were recorded';
    if (s.inputs !== now.digest) return 'an input changed since it was built';
  }
  return null;
}
