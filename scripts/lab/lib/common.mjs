// QSC Atlas Labs: small helpers shared by the scripts in scripts/lab/.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** Path relative to the repository root, with forward slashes. */
export const rel = (abs, root = ROOT) => relative(root, abs).split(sep).join('/');

/** True when the module at `metaUrl` is the script node was asked to run. */
export const isMain = (metaUrl) => Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;

/** Today as YYYY-MM-DD in UTC. LAB_TODAY overrides it, for tests and replays. */
export function today(env = process.env) {
  if (env.LAB_TODAY) return env.LAB_TODAY;
  return new Date().toISOString().slice(0, 10);
}

/** Add days to an ISO day. */
export function addDays(isoDay, days) {
  const d = new Date(isoDay + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every file under `dir`, recursively, skipping any path listed in `skip` (relative to root). */
export function listFiles(dir, { root = ROOT, skip = [] } = {}) {
  const out = [];
  const visit = (p) => {
    const r = rel(p, root);
    if (skip.some((s) => r === s || r.startsWith(s + '/'))) return;
    if (!existsSync(p)) return;
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        if (name === '.DS_Store') continue;
        visit(join(p, name));
      }
    } else out.push(p);
  };
  visit(dir);
  return out;
}

/** Count words the way a reader would: runs of non-space characters. */
export const wordCount = (s) => (String(s).trim() ? String(s).trim().split(/\s+/).length : 0);

/** Walk a JSON value, calling fn(value, path, parentKey) for every object and array member. */
export function walkJson(value, fn, path = [], parentKey = null) {
  fn(value, path, parentKey);
  if (Array.isArray(value)) value.forEach((v, i) => walkJson(v, fn, [...path, i], parentKey));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkJson(v, fn, [...path, k], k);
  }
}

/** "records[2].statusHistory[0]" from ["records", 2, "statusHistory", 0]. */
export function pathString(path) {
  return path.reduce((acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${p}` : String(p)), '') || '(root)';
}
