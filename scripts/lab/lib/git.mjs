// QSC Atlas Labs: run git from the scripts.
// Uses LAB_GIT when set, else the first git on PATH that actually runs. On a Mac without the
// Xcode command line tools, /usr/bin/git is only a placeholder, so GitHub Desktop's bundled
// git is tried as a fallback.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { ROOT } from './common.mjs';

const CANDIDATES = [
  process.env.LAB_GIT,
  'git',
  '/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git',
].filter(Boolean);

let resolved;
export function gitBinary() {
  if (resolved !== undefined) return resolved;
  resolved = null;
  for (const c of CANDIDATES) {
    if (c.includes('/') && !existsSync(c)) continue;
    try {
      execFileSync(c, ['--version'], { stdio: 'pipe' });
      resolved = c;
      break;
    } catch {
      /* try the next one */
    }
  }
  return resolved;
}

/** Run git and return trimmed stdout. Throws when git fails or is missing. */
export function git(args, { cwd = ROOT, input } = {}) {
  const bin = gitBinary();
  if (!bin) throw new Error('no working git was found (set LAB_GIT to its path)');
  return execFileSync(bin, args, { cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
}

/** Like git(), but returns null instead of throwing. */
export function gitOrNull(args, opts) {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}
