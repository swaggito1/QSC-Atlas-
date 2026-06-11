import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Project root is two levels up from scripts/lib/.
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_PATH = join(ROOT, '.env');

/**
 * Minimal .env loader (no dependency). Populates process.env from ~/qsc-atlas/.env
 * for any key not already set. Quotes around values are stripped. Safe to call repeatedly.
 */
export function loadEnv() {
  if (!existsSync(ENV_PATH)) return;
  const text = readFileSync(ENV_PATH, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
