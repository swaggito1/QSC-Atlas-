// qscatlas.org: the site's fixed names and addresses (spec 21.2).
//
// The origin is read from `site` in astro.config.mjs, never written here, so the move to
// https://qscatlas.org is one line in that file (spec 15.2, after Swann has verified the domain
// in Vercel). Astro hands that value to every module as import.meta.env.SITE, in pages and in
// islands; vitest.config.mjs hands the same value to the tests; a plain Node script reads it
// from astro.config.mjs itself. This module imports nothing from Node, so an island may use it.
// The whole sequence, with every command explained, is docs/site/domain-move.md.

export const SITE_NAME = 'QSC Atlas';

// The host the Atlas was served from before the move. The cutover commit adds a vercel.json rule
// that sends this host to the new origin path for path (spec 15.2, step 4); originMoved() tells a
// page or a test whether that commit has been made, so neither needs editing on the day.
export const PREVIOUS_HOST = 'qsc-atlas.vercel.app';

// Swann's decision 5 of 1 October 2026 (spec decision 7): corrections go to his CEPS address,
// already public on /about.
export const CORRECTIONS_EMAIL = 'swann.ashworth@ceps.eu';

// The archived record and the public repository, as /commentary already cites them.
export const ZENODO_DOI = '10.5281/zenodo.21262284';
export const ZENODO_URL = `https://doi.org/${ZENODO_DOI}`;
export const GITHUB_URL = 'https://github.com/swaggito1/QSC-Atlas-';

const stripSlash = (s: string) => s.replace(/\/+$/, '');

/** `site` as written in astro.config.mjs, read from the file (plain Node only). */
function siteFromConfigFile(): string | null {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown; cwd?: () => string } }).process;
  const fs = proc?.getBuiltinModule?.('node:fs') as { existsSync(p: string): boolean; readFileSync(p: string, enc: string): string } | undefined;
  if (!fs || !proc?.cwd) return null;
  // the working directory is the repository root in every build, test and script
  const file = `${proc.cwd()}/astro.config.mjs`;
  if (!fs.existsSync(file)) return null;
  const m = /\bsite\s*:\s*['"`]([^'"`]+)['"`]/.exec(fs.readFileSync(file, 'utf8'));
  return m ? m[1] : null;
}

/** The Atlas's own origin, from astro.config.mjs, with no trailing slash, such as "https://qscatlas.org". */
export function siteOrigin(): string {
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  const fromAstro = typeof env?.SITE === 'string' && env.SITE ? env.SITE : null;
  const site = fromAstro ?? siteFromConfigFile();
  if (!site) throw new Error('siteOrigin: no `site` in astro.config.mjs');
  return stripSlash(new URL(site).origin);
}

/**
 * True once `site` in astro.config.mjs names a host other than PREVIOUS_HOST, which is the moment
 * vercel.json must also send PREVIOUS_HOST to the new origin. Before the cutover it is false, and
 * nothing may say that old addresses redirect.
 */
export function originMoved(origin: string = siteOrigin()): boolean {
  return new URL(origin).hostname !== PREVIOUS_HOST;
}

/** An absolute URL on the Atlas for a site path: absoluteUrl('/countries/deu'). */
export function absoluteUrl(path: string): string {
  if (!path || path === '/') return `${siteOrigin()}/`;
  return `${siteOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
}
