// qscatlas.org: the manifest of every gated page (spec 2, 14 and 21.2).
//
// One list names each page that is built only when its gate is shown: the tool pages from
// data/lab/tools.json, and the record pages built from the same data (the Prepare hub, the
// guides, the standards). src/pages/[...gated].astro generates exactly
// builtPages(); links go through link() and pageHref() in gates.ts, which read the same list.
// Nothing here is hard-coded that the data can give: the guide pages come from readiness.json
// and the standard pages from the standards with at least one verified edge.
//
// The Standards overview (/standards) is the section's front page since 5 October 2026 (Swann,
// option c of labs/review/standards-beyond-nist.md): it is built wherever the Standards Cascade
// is, under the Cascade's own gate. The page of each standard has the same gate since 8 October
// 2026 (Swann), so a preview or production build that has the Cascade has them too; until then
// they waited behind a "local:" gate, open only in a build on his machine. A tool of site
// "elsewhere" (the Rulebook, kept for another website; the migration approach, off the Atlas
// since 5 October 2026) has its page here, built only locally, under /elsewhere.
//
// The notes (src/pages/notes) are built by the publishing rule in notes.ts, which this module
// cannot import, so it never answers for an address under /notes (isNotesPath).
//
// This module reads the registry through load.ts and never imports gates.ts, so the two do
// not import each other. Its imports name their .ts files, so plain Node can load it too:
// astro.config.mjs does, to decide which page components a build includes.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EdgesFileSchema, ReadinessFileSchema, StandardsFileSchema } from '../lab/schema.ts';
import { isProduction, loadDataset, projectRoot, siteLinked, toolState } from '../lab/load.ts';
import type { LoadOptions, ToolState } from '../lab/load.ts';
import type { LabTool } from '../lab/types.ts';

export type { LoadOptions };

export type PageSection = 'countries' | 'standards' | 'prepare' | 'research' | 'elsewhere';

export interface SitePage {
  path: string; // "/prepare/check": leading slash, no trailing slash
  key: string; // the folder of its component under src/components/site/pages/, "prepare-check"
  gate: string | 'prepare-any' | null; // a tool id, "prepare-any" for the hub, or "local:<id>" (localGate)
  section: PageSection; // "research" and "elsewhere" only for pages built on Swann's machine
  title: string; // the page's name as the breadcrumb shows it
  parent: string | null; // the path of the page above it in the breadcrumb
  question?: string; // the one question the page answers (spec 2); a tool's own page takes its promise from the registry
  toolId?: string; // set on a tool's own page
  props?: Record<string, unknown>; // passed to the page component: { guideId } or { standardId }
}

/** A file built beside the gated pages by its own endpoint in src/pages, only when its gate is shown. */
export interface GatedFile {
  path: string;
  gate: string;
}

const READINESS = 'data/lab/readiness/readiness.json';
const STANDARDS = 'data/lab/cascade/standards.json';
const EDGES = 'data/lab/cascade/edges.json';
const COUNTRIES = 'data/countries.json';

// The questions of spec 2 for the pages built from the records. The header's phone menu reads
// the Prepare and Standards ones from here too (nav.ts), so each question has one source.
export const PREPARE_QUESTION = 'What should an organisation or a public administration do, and by when?';
export const STANDARDS_QUESTION = 'Which post-quantum standards does the Atlas track, and who names each?';
const QUESTIONS = {
  guides: 'Which guides does Prepare draw on, and who are they written for?',
  guide: 'What does this guide ask, of whom, and by when?',
  standard: 'Who names this standard, and in which documents?',
};

// The files of spec 2 that belong to a gated page. Their endpoint generates each one only when
// its gate is shown (the inventory template's is src/pages/prepare/[file].csv.ts), and
// pageHref() answers for them from this list, never from the endpoint's file pattern.
const GATED_FILES: GatedFile[] = [{ path: '/prepare/inventory-template.csv', gate: 'inventory' }];

// ---- small helpers ------------------------------------------------------------

/** "/prepare/check/?x=1#y" gives "/prepare/check". */
export function cleanPath(path: string): string {
  const bare = path.split(/[?#]/)[0] || '/';
  const trimmed = bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
  return trimmed || '/';
}

/** The component folder for a route: "/prepare/check" gives "prepare-check". */
export function keyForRoute(route: string): string {
  return route.replace(/^\//, '').replace(/\//g, '-');
}

/** The breadcrumb name of a standard: "FIPS 203 (ML-KEM)" gives "FIPS 203". */
function standardTitle(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

/** The page above a tool's own page in the breadcrumb. */
function toolParent(t: LabTool): string | null {
  if (t.section === 'prepare') return '/prepare';
  if (t.section === 'standards') return '/standards';
  if (t.section === 'countries') return '/countries';
  return null;
}

const LOCAL = 'local:';

/**
 * The gate of a page kept for Swann: open only in a local build (VERCEL_ENV and VERCEL unset)
 * and only while the inner gate is shown. localGate('cascade') is "local:cascade". No page of the
 * manifest has one since the standard pages took the Cascade's gate (8 October 2026); the rule
 * stays for the next page Swann keeps to his machine.
 */
export function localGate(gate: string): string {
  return `${LOCAL}${gate}`;
}

/** True for a gate that only a local build opens. */
export function isLocalGate(gate: string | null): boolean {
  return gate !== null && gate.startsWith(LOCAL);
}

/** Whether a gate is shown in a build, given the registry state. */
export function gateOpen(gate: string | null, state: ToolState): boolean {
  if (gate === null) return true;
  if (isLocalGate(gate)) return state.local && gateOpen(gate.slice(LOCAL.length), state);
  if (gate === 'prepare-any') return state.tools.some((t) => t.section === 'prepare' && state.shown.has(t.id));
  return state.shown.has(gate);
}

// ---- data the manifest is computed from ----------------------------------------

function readIf<T>(rel: string, root: string, read: () => T, empty: T): T {
  return existsSync(join(root, rel)) ? read() : empty;
}

/** The guides Prepare quotes, in readiness.json order. */
export function guideIds(opts: LoadOptions = {}): { id: string; title: string }[] {
  const root = opts.root ?? projectRoot();
  const file = readIf(READINESS, root, () => loadDataset(READINESS, ReadinessFileSchema, { ...opts, root }), { frameworks: [] } as { frameworks: { id: string; shortLabel: string }[] });
  return file.frameworks.map((f) => ({ id: f.id, title: f.shortLabel }));
}

/**
 * The standards with at least one verified edge, in standards.json order. A verified edge is one
 * with verify: false whose target is the standard; leads and edges to a body never count.
 */
export function standardsWithVerifiedEdges(opts: LoadOptions = {}): { id: string; title: string }[] {
  const root = opts.root ?? projectRoot();
  const standards = readIf(STANDARDS, root, () => loadDataset(STANDARDS, StandardsFileSchema, { ...opts, root }).standards, []);
  const edges = readIf(EDGES, root, () => loadDataset(EDGES, EdgesFileSchema, { ...opts, root }).edges, []);
  const named = new Set(edges.filter((e) => e.verify === false).map((e) => e.to));
  return standards.filter((s) => s.verify === false && named.has(s.id)).map((s) => ({ id: s.id, title: standardTitle(s.label) }));
}

// ---- the manifest ------------------------------------------------------------------

// A tool page whose component keeps the folder named after its former Atlas route. The migration
// approach left the Atlas on 5 October 2026 (Swann) for /elsewhere/approach; its code stays in
// prepare-approach, so nothing has to move when it returns to /prepare/approach.
const KEPT_FOLDERS: Record<string, string> = { approach: 'prepare-approach' };

function computePages(state: ToolState, opts: LoadOptions): SitePage[] {
  const pages: SitePage[] = [];

  // each tool's own page; tools of site "ai" are never built on the Atlas, and those of sites
  // "research" and "elsewhere" only on Swann's machine (their gate says so, load.ts siteBuilt)
  for (const t of state.tools) {
    const site = t.site ?? 'atlas';
    if (site === 'ai') continue;
    pages.push({
      path: t.route,
      key: KEPT_FOLDERS[t.id] ?? keyForRoute(t.route),
      gate: t.id,
      section: site === 'atlas' ? (t.section ?? 'prepare') : site,
      title: t.title,
      parent: site === 'atlas' ? toolParent(t) : null,
      toolId: t.id,
    });
  }

  // Prepare: the hub (built when any Prepare entry is shown), and the record pages of the guides.
  // Where the guides differ (/prepare/differences) left the site on 4 October 2026 (Swann); its
  // positions stay in readiness.json, unshown, and vercel.json sends the old address to /prepare.
  pages.push({ path: '/prepare', key: 'prepare-hub', gate: 'prepare-any', section: 'prepare', title: 'Prepare', parent: null, question: PREPARE_QUESTION });
  pages.push({ path: '/prepare/guides', key: 'prepare-guides', gate: 'readiness', section: 'prepare', title: 'The guides', parent: '/prepare', question: QUESTIONS.guides });
  for (const g of guideIds(opts)) {
    pages.push({
      path: `/prepare/guides/${g.id}`,
      key: 'prepare-guide',
      gate: 'readiness',
      section: 'prepare',
      title: g.title,
      parent: '/prepare/guides',
      question: QUESTIONS.guide,
      props: { guideId: g.id },
    });
  }

  // Standards: the overview, the section's front page (5 October 2026), and one page per standard
  // with at least one verified edge (8 October 2026), each built wherever the Cascade is
  pages.push({ path: '/standards', key: 'standards-list', gate: 'cascade', section: 'standards', title: 'Standards', parent: null, question: STANDARDS_QUESTION });
  for (const s of standardsWithVerifiedEdges(opts)) {
    pages.push({
      path: `/standards/${s.id.toLowerCase()}`,
      key: 'standard',
      gate: 'cascade',
      section: 'standards',
      title: s.title,
      parent: '/standards',
      question: QUESTIONS.standard,
      props: { standardId: s.id },
    });
  }

  // in the order of the data (registry, readiness.json, standards.json); allPages() sorts a copy
  return pages;
}

const pageCache = new Map<string, { stamp: string; pages: SitePage[]; sorted: SitePage[] }>();

function stampOf(root: string): string {
  return [READINESS, STANDARDS, EDGES, 'data/lab/tools.json']
    .map((rel) => {
      const abs = join(root, rel);
      if (!existsSync(abs)) return '-';
      const s = statSync(abs);
      return `${s.mtimeMs}:${s.size}`;
    })
    .join('|');
}

/**
 * Every gated page the Atlas can build, whatever the gates say: the tool pages (research and
 * elsewhere ones included; their gate keeps them to Swann's machine), the Prepare hub and record
 * pages, and the Standards overview and standard pages (the Cascade's gate). Sorted by path.
 */
export function allPages(opts: LoadOptions = {}): SitePage[] {
  return manifest(opts).sorted;
}

/** The manifest in data order and sorted by path, read once per build and again when its data changes. */
function manifest(opts: LoadOptions): { pages: SitePage[]; sorted: SitePage[] } {
  const env = opts.env ?? process.env;
  const root = opts.root ?? projectRoot();
  // JSON keeps an unset variable apart from an empty one
  const key = JSON.stringify([root, env.VERCEL_ENV, env.VERCEL, env.ATLAS_OFFLINE, env.ATLAS_FORCE_PUBLIC]);
  const stamp = stampOf(root);
  const hit = pageCache.get(key);
  if (hit && hit.stamp === stamp) return hit;
  const pages = computePages(toolState({ ...opts, env, root }), { ...opts, env, root });
  const entry = { stamp, pages, sorted: [...pages].sort((a, b) => a.path.localeCompare(b.path)) };
  pageCache.set(key, entry);
  return entry;
}

/** The gated pages this build generates: those whose gate is shown. */
export function builtPages(opts: LoadOptions = {}): SitePage[] {
  const state = toolState(opts);
  return allPages(opts).filter((p) => gateOpen(p.gate, state));
}

/** The built gated page at a path, or null. */
export function builtPage(path: string, opts: LoadOptions = {}): SitePage | null {
  const want = cleanPath(path);
  return builtPages(opts).find((p) => p.path === want) ?? null;
}

/**
 * The built pages one level below a page, in the order of the data: the seven guides under
 * /prepare/guides in readiness.json order, the standards under /standards in standards.json
 * order. A page with no built child gets an empty list.
 */
export function childPages(path: string, opts: LoadOptions = {}): SitePage[] {
  const want = cleanPath(path);
  const state = toolState(opts);
  return manifest(opts).pages.filter((p) => p.parent === want && gateOpen(p.gate, state));
}

/** Every file of spec 2 that belongs to a gated page, whatever the gates say. */
export function allFiles(): GatedFile[] {
  return GATED_FILES.map((f) => ({ ...f }));
}

/** The gated files this build generates: those whose gate is shown. An endpoint builds exactly these. */
export function builtFiles(opts: LoadOptions = {}): GatedFile[] {
  const state = toolState(opts);
  return allFiles().filter((f) => gateOpen(f.gate, state));
}

/**
 * True for a path inside a gated section: its first segment is the first segment of a manifest
 * page or gated file (/prepare, /standards, /target-dates, /research, /elsewhere). There the
 * manifest alone says what is built, whatever files src/pages holds.
 */
export function isGatedPath(path: string, opts: LoadOptions = {}): boolean {
  const first = (p: string) => cleanPath(p).split('/')[1] ?? '';
  const want = first(path);
  if (!want) return false;
  return allPages(opts).some((p) => first(p.path) === want) || GATED_FILES.some((f) => first(f.path) === want);
}

// ---- the Prepare side menu (spec 3.5) ----------------------------------------------------

// Fixed order. Target dates belongs to Countries and is marked so. EU rules (the Rulebook) left
// the Atlas for another website on 2 October 2026, and the migration approach left it on
// 5 October 2026 (Swann); neither has an entry.
const PREPARE_MENU: { label: string; tool?: string; path?: string; note?: string }[] = [
  { label: 'Overview', path: '/prepare' },
  { label: 'Readiness Check', tool: 'readiness' },
  { label: 'Target dates', tool: 'dates', note: 'in Countries' },
  { label: 'Exposure Clock', tool: 'exposure' },
  { label: 'Inventory template', tool: 'inventory' },
  { label: 'Supplier letter', tool: 'suppliers' },
  { label: 'The guides', path: '/prepare/guides' },
];

/**
 * The Prepare side menu: built pages only, in the fixed order, with the current entry marked.
 * A guide page marks "The guides". A Prepare tool missing from the fixed list (a later addition)
 * appears under its own title before The guides. A tool kept for another website (site
 * "elsewhere") is never listed, even in a local build where its page is built.
 */
export function sectionMenu(
  section: 'prepare',
  current: string,
  opts: LoadOptions = {},
): { label: string; href: string; current: boolean; note?: string }[] {
  if (section !== 'prepare') return [];
  const state = toolState(opts);
  const built = new Map(builtPages(opts).map((p) => [p.path, p]));
  const here = cleanPath(current);
  const listed = new Set(PREPARE_MENU.flatMap((e) => (e.tool ? [e.tool] : [])));
  const extra = state.tools
    .filter((t) => t.section === 'prepare' && !listed.has(t.id))
    .map((t) => ({ label: t.title, tool: t.id }) as (typeof PREPARE_MENU)[number]);
  const entries = [...PREPARE_MENU.slice(0, -1), ...extra, ...PREPARE_MENU.slice(-1)];

  const out: { label: string; href: string; current: boolean; note?: string }[] = [];
  for (const e of entries) {
    const tool = e.tool ? state.tools.find((t) => t.id === e.tool) : undefined;
    if (tool && !siteLinked(tool)) continue;
    const path = e.path ?? tool?.route;
    if (!path || !built.has(path)) continue;
    const isCurrent = here === path || (path === '/prepare/guides' && here.startsWith('/prepare/guides/'));
    out.push({ label: e.label, href: path, current: isCurrent, ...(e.note ? { note: e.note } : {}) });
  }
  return out;
}

// ---- the pages Astro builds from files in src/pages ---------------------------------------

export interface StaticRoute {
  file: string; // relative to src/pages, "countries/[iso3].astro"
  route: string; // "/countries/[iso3]"
  pattern: RegExp; // what paths the route answers
  dynamic: boolean; // the route has a parameter
  page: boolean; // an HTML page (.astro, .md, .mdx, .html), not an endpoint
}

const PAGE_EXT = /\.(astro|md|mdx|html)$/;
const ENDPOINT_EXT = /\.(ts|js|mjs)$/;

function routeOf(file: string): string {
  const noExt = file.replace(PAGE_EXT, '').replace(ENDPOINT_EXT, '');
  const route = '/' + noExt.replace(/(^|\/)index$/, '');
  return route.length > 1 ? route.replace(/\/$/, '') : '/';
}

// a rest parameter ("[...list]") also answers its folder's own address, as Astro's does:
// /notes/[...list] matches /notes as well as /notes/a/b
function patternOf(route: string): RegExp {
  if (route === '/') return /^\/$/;
  const parts = route
    .slice(1)
    .split('/')
    .map((seg) => {
      if (/^\[\.\.\.[^\]]+\]$/.test(seg)) return '(?:/.*)?';
      const piece = seg
        .split(/(\[[^\]]+\])/)
        .map((p) => (/^\[[^\]]+\]$/.test(p) ? '[^/]+' : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('');
      return `/${piece}`;
    });
  return new RegExp('^' + (parts.join('') || '/') + '$');
}

// ---- the notes (src/pages/notes) ------------------------------------------------------------

/** The notes section: the list, one page per note and the feed, under this address. */
export const NOTES_ROOT = '/notes';

/**
 * True for an address under /notes. The notes pages are built from src/content/notes by the
 * publishing rule in notes.ts, which reads gates.ts; this module cannot import it (gates.ts
 * imports this one, and plain Node loads this one), so it never answers for these addresses:
 * isStaticPath() is false for each, pageHref() returns null for each, and a link to them comes
 * from notesHref(), noteHref() or feedHref() in notes.ts. The sitemap takes their paths from
 * its caller (sitemapPaths).
 */
export function isNotesPath(path: string): boolean {
  const want = cleanPath(path);
  return want === NOTES_ROOT || want.startsWith(`${NOTES_ROOT}/`);
}

const routeCache = new Map<string, { at: number; routes: StaticRoute[] }>();

/**
 * Every route a file in src/pages defines, except the gated catch-all ([...gated].astro) and
 * files Astro ignores (a name starting with "_", tests).
 */
export function staticRoutes(opts: LoadOptions = {}): StaticRoute[] {
  const root = opts.root ?? projectRoot();
  // read again after two seconds, so a page added while npm run dev runs is found
  const hit = routeCache.get(root);
  if (hit && Date.now() - hit.at < 2000) return hit.routes;
  const routes = scanPages(root);
  routeCache.set(root, { at: Date.now(), routes });
  return routes;
}

function scanPages(root: string): StaticRoute[] {
  const dir = join(root, 'src', 'pages');
  if (!existsSync(dir)) return [];
  const files = (readdirSync(dir, { recursive: true }) as string[])
    .map((f) => f.split('\\').join('/'))
    .filter((f) => (PAGE_EXT.test(f) || ENDPOINT_EXT.test(f)) && !/\.test\.|\.d\.ts$/.test(f))
    .filter((f) => !f.split('/').some((seg) => seg.startsWith('_')))
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
  return files
    .map((file) => {
      const route = routeOf(file);
      return { file, route, pattern: patternOf(route), dynamic: /\[/.test(route), page: PAGE_EXT.test(file) };
    })
    .filter((r) => r.route !== '/[...gated]');
}

/**
 * The static HTML pages with a fixed path, for the sitemap: no parameter, no endpoint, not the
 * 404 page, and not a page whose address vercel.json redirects.
 */
export function staticPagePaths(opts: LoadOptions = {}): string[] {
  const root = opts.root ?? projectRoot();
  const redirected = new Set(redirectRules(opts).map((r) => r.source));
  return staticRoutes({ ...opts, root })
    .filter((r) => r.page && !r.dynamic && r.route !== '/404' && !redirected.has(r.route))
    .map((r) => r.route);
}

/**
 * True when a file in src/pages builds this path (a profile, /documents, /about...). A route with
 * a parameter builds lower-case paths only, since the site never emits upper case and
 * /countries/FRA stays a 404 (spec 15.1); the profile route builds one page per country in
 * data/countries.json, so /countries/zzz is not a page.
 */
export function isStaticPath(path: string, opts: LoadOptions = {}): boolean {
  const want = cleanPath(path);
  // the notes pages answer for themselves (isNotesPath): a route there says nothing about what is built
  if (isNotesPath(want)) return false;
  return staticRoutes(opts).some((r) => r.pattern.test(want) && (!r.dynamic || dynamicPathBuilt(r, want, opts)));
}

function dynamicPathBuilt(route: StaticRoute, path: string, opts: LoadOptions): boolean {
  if (path !== path.toLowerCase()) return false;
  if (route.route === '/countries/[iso3]') {
    const known = profileCodes(opts);
    return known === null || known.has(path.slice('/countries/'.length));
  }
  return true;
}

const codeCache = new Map<string, { stamp: string; codes: Set<string> | null }>();

/** The lower-case ISO3 codes of the profiles the Atlas builds, or null when the list is missing. */
function profileCodes(opts: LoadOptions): Set<string> | null {
  const root = opts.root ?? projectRoot();
  const abs = join(root, COUNTRIES);
  const stamp = existsSync(abs) ? `${statSync(abs).mtimeMs}` : '-';
  const hit = codeCache.get(root);
  if (hit && hit.stamp === stamp) return hit.codes;
  let codes: Set<string> | null = null;
  if (stamp !== '-') {
    const list = JSON.parse(readFileSync(abs, 'utf8')) as { iso3?: unknown }[];
    if (Array.isArray(list)) codes = new Set(list.flatMap((c) => (typeof c.iso3 === 'string' ? [c.iso3.toLowerCase()] : [])));
  }
  codeCache.set(root, { stamp, codes });
  return codes;
}

// ---- what crawlers are told (src/pages/sitemap.xml.ts and robots.txt.ts) ----------------

/**
 * The paths sitemap.xml lists, sorted: the static pages with a fixed path, every country profile
 * except the Placeholder ones (they carry noindex), and, in a production build only, the gated
 * pages that build generates (each of them public there). A preview or local build lists no
 * gated page, because each carries noindex until its tool is public. A page kept to Swann's
 * machine (research, elsewhere, a local gate) is never listed, whatever the build. `notes` are
 * the public notes addresses (noteSitemapPaths() in notes.ts), listed in a production build only,
 * like the gated pages; anything outside /notes passed there is ignored.
 */
export function sitemapPaths(profiles: { iso3: string; dataStatus: string | null }[], opts: LoadOptions = {}, notes: string[] = []): string[] {
  const env = opts.env ?? process.env;
  const production = isProduction(env);
  const indexable = profiles.filter((p) => p.dataStatus !== 'Placeholder').map((p) => `/countries/${p.iso3.toLowerCase()}`);
  const kept = (p: SitePage) => p.section === 'research' || p.section === 'elsewhere' || isLocalGate(p.gate);
  const gated = production ? builtPages({ ...opts, env }).filter((p) => !kept(p)).map((p) => p.path) : [];
  const notePaths = production ? notes.map(cleanPath).filter(isNotesPath) : [];
  return [...new Set([...staticPagePaths(opts), ...indexable, ...gated, ...notePaths])].sort();
}

/**
 * robots.txt: a production build lets every crawler in and names the sitemap; any other build
 * (a preview deployment, a local build) asks every crawler to stay out, so a preview page is
 * never indexed even when someone shares its link.
 */
export function robotsTxt(sitemapUrl: string, opts: LoadOptions = {}): string {
  return isProduction(opts.env ?? process.env) ? `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n` : 'User-agent: *\nDisallow: /\n';
}

// ---- vercel.json -----------------------------------------------------------------------

export interface RedirectRule {
  source: string;
  destination: string;
  permanent: boolean;
  has?: unknown;
}

/** The redirect rules in vercel.json, in order. */
export function redirectRules(opts: LoadOptions = {}): RedirectRule[] {
  const root = opts.root ?? projectRoot();
  const file = join(root, 'vercel.json');
  if (!existsSync(file)) return [];
  const json = JSON.parse(readFileSync(file, 'utf8')) as { redirects?: RedirectRule[] };
  return json.redirects ?? [];
}
