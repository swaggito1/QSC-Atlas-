// qscatlas.org: the one helper every gated link goes through (spec 12 and 14.2).
//
// shown(id) is true when the registry entry's site is "atlas" (or "research" in a local build),
// the build is not production or the entry is public, and every id it requires is shown.
// link(id) returns a tool's address, or null when the tool is not shown; pageHref(path) does the
// same for any page, static or gated. A component renders nothing for null, so an unbuilt page is
// never named: no "coming soon", no greyed item, no count of hidden tools.
//
// A tool of site "elsewhere" (the Rulebook, kept for another website on 2 October 2026; the
// migration approach, taken off the Atlas on 5 October 2026) is built on Swann's machine only,
// and even there no Atlas page may name it: shown() is false for it, link() and pageHref() return
// null for it, and shownTools() leaves it out, in every build. Its page is reached by typing its
// address. A page kept for Swann behind a "local:" gate would be built on his machine only, so
// pageHref() would name it in a local build and in no preview or production build; none is kept
// so today. The Standards overview (/standards) has the Cascade's own gate since 5 October 2026,
// and the page of each standard (/standards/fips-203) since 8 October 2026.
//
// The rule itself is in src/lib/lab/load.ts (shownToolIds), which the older lab code also
// uses. Server code only: islands receive the hrefs as props and hold no route strings.

import { isProduction, siteLinked, toolState } from '../lab/load';
import type { Env, LoadOptions } from '../lab/load';
import type { LabTool } from '../lab/types';
import { builtFiles, builtPage, cleanPath, gateOpen, isGatedPath, isStaticPath } from './routes';

export type { LoadOptions };

type Extra = { query?: Record<string, string | undefined>; hash?: string };

/** False for the id of a tool no Atlas page may name (site "elsewhere"); true for any other id or gate. */
function linkable(id: string, tools: LabTool[]): boolean {
  const tool = tools.find((t) => t.id === id);
  return !tool || siteLinked(tool);
}

/**
 * Whether a tool (by id) is shown on the Atlas's pages in this build. Also accepts a page gate:
 * "prepare-any" is shown when any Prepare entry is, "local:cascade" only in a local build. Never
 * true for a tool kept for another website, whose page a local build has but no page names.
 */
export function shown(id: string, opts: LoadOptions = {}): boolean {
  const state = toolState(opts);
  return gateOpen(id, state) && linkable(id, state.tools);
}

/** The registry entries this build shows on the Atlas's pages, in registry order. */
export function shownTools(opts: LoadOptions = {}): LabTool[] {
  const { tools, shown: ids } = toolState(opts);
  return tools.filter((t) => ids.has(t.id) && siteLinked(t));
}

/** Whether any tool of a section is shown: decides whether the section's hub and menu item exist. */
export function anyShown(section: 'countries' | 'standards' | 'prepare', opts: LoadOptions = {}): boolean {
  const { tools, shown: ids } = toolState(opts);
  return tools.some((t) => t.section === section && ids.has(t.id));
}

/**
 * Whether a page's gate counts as public: true for a static page (gate null) and for a gate that a
 * production build would show. A page that is built but not public carries the preview banner
 * and noindex.
 */
export function gatePublic(gate: string | null, opts: LoadOptions = {}): boolean {
  if (gate === null) return true;
  const env: Env = { ...(opts.env ?? process.env), VERCEL_ENV: 'production' };
  return gateOpen(gate, toolState({ ...opts, env }));
}

/** True in a production build (VERCEL_ENV=production). */
export function productionBuild(opts: LoadOptions = {}): boolean {
  return isProduction(opts.env ?? process.env);
}

/** A path with a query and a hash appended; commas in values stay readable (?in=DEU,FRA). */
export function withExtra(path: string, extra: Extra = {}): string {
  const params = Object.entries(extra.query ?? {}).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== '');
  const query = params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%2C/gi, ',')}`).join('&');
  const hash = extra.hash ? (extra.hash.startsWith('#') ? extra.hash : `#${extra.hash}`) : '';
  return `${path}${query ? `?${query}` : ''}${hash}`;
}

/**
 * The address of a tool's page with an optional query and hash, or null when the tool is not
 * shown in this build: link('exposure', { query: { j: 'DEU' } }) gives "/prepare/exposure?j=DEU".
 * Always null for a tool kept for another website (link('rulebook'), link('approach')).
 */
export function link(id: string, extra: Extra = {}, opts: LoadOptions = {}): string | null {
  const { tools, shown: ids } = toolState(opts);
  const tool = tools.find((t) => t.id === id);
  if (!tool || !ids.has(id) || !siteLinked(tool)) return null;
  return withExtra(tool.route, extra);
}

/**
 * The given address when its page is built in this build, else null. Works for any page:
 * static ones (/countries/deu, /documents?country=DEU, /about#team), gated ones
 * (/prepare/guides/eu-roadmap) and the files of gated pages (/prepare/inventory-template.csv).
 * Inside a gated section only the manifest answers, so an endpoint's file pattern there never
 * makes an unbuilt address look built. The query and hash are kept as given. Null in every build
 * for the page of a tool kept for another website (/elsewhere/eu-rules, /elsewhere/approach) and
 * for its old Atlas address (/prepare/eu-rules, /prepare/approach), which no build has; null
 * outside a local build for a page kept for Swann behind a local gate, which no deployment has.
 * The page of a standard (/standards/fips-203) is named wherever the Cascade is shown.
 */
export function pageHref(path: string, opts: LoadOptions = {}): string | null {
  if (!path.startsWith('/')) return null;
  const bare = cleanPath(path);
  const page = builtPage(bare, opts);
  if (page) return page.section === 'elsewhere' ? null : path;
  if (builtFiles(opts).some((f) => f.path === bare)) return path;
  if (isGatedPath(bare, opts)) return null;
  if (isStaticPath(bare, opts)) return path;
  return null;
}
