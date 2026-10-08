// QSC Atlas Labs: read the lab datasets at build time.
//
// Each loader reads a JSON file under data/lab/, validates it against its schema, and in
// production builds removes every record still marked verify: true. Preview builds and
// local development keep those records so they can be shown with a "lead" marker
// (see isLead). Production is detected with VERCEL_ENV === 'production', which Vercel
// sets only on production deployments.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';
import { ToolsFileSchema, MembershipsFileSchema } from './schema.ts';
import type { LabTool, MembershipsFile, ToolsFile } from './types.ts';

export type Env = Record<string, string | undefined>;

export interface LoadOptions {
  env?: Env;
  root?: string; // project root; defaults to projectRoot()
}

/**
 * The repository root: the working directory when it holds data/lab (a build on Vercel or in
 * CI, or npm run dev), else the folder three levels above this file (astro dev started from
 * elsewhere with --root).
 */
export function projectRoot(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'data', 'lab'))) return cwd;
  try {
    const here = fileURLToPath(new URL('../../../', import.meta.url));
    if (existsSync(join(here, 'data', 'lab'))) return here;
  } catch {
    /* not a file URL once bundled; fall through */
  }
  return cwd;
}

export function isProduction(env: Env = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}

/** True for a record that is a lead: present in preview, never in production. */
export function isLead(record: unknown): boolean {
  return typeof record === 'object' && record !== null && (record as { verify?: unknown }).verify === true;
}

/** Deep copy of `value` without any array item that is a lead. */
export function withoutLeads<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.filter((item) => !isLead(item)).map((item) => withoutLeads(item)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = withoutLeads(v);
    return out as T;
  }
  return value;
}

/** Read, validate and (in production) filter one dataset. Throws with the file name on a schema error. */
export function loadDataset<S extends z.ZodTypeAny>(relPath: string, schema: S, opts: LoadOptions = {}): z.infer<S> {
  const root = opts.root ?? projectRoot();
  const raw = JSON.parse(readFileSync(join(root, relPath), 'utf8'));
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`${relPath} does not match its schema: ${issues}`);
  }
  return isProduction(opts.env) ? withoutLeads(parsed.data) : parsed.data;
}

/** The most recent verifiedAt anywhere in a dataset, for the "as of" line. Null when nothing is verified. */
export function latestVerifiedAt(value: unknown): string | null {
  let latest: string | null = null;
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === 'object') {
      for (const [k, child] of Object.entries(v)) {
        if (k === 'verifiedAt' && typeof child === 'string' && (latest === null || child > latest)) latest = child;
        else visit(child);
      }
    }
  };
  visit(value);
  return latest;
}

// ---- one loader per dataset --------------------------------------------------

export function loadTools(opts: LoadOptions = {}): ToolsFile {
  return loadDataset('data/lab/tools.json', ToolsFileSchema, opts);
}

// ---- which tools a build shows ------------------------------------------------
// One rule, used here and by src/lib/site/gates.ts (spec 14.2). A tool is shown when its site is
// "atlas" (or "research" or "elsewhere" in a local build), when the build is not production or
// the tool is public, and when every tool it requires is shown. A tool of site "elsewhere" is
// kept for another website: its page is built on Swann's machine, but gates.ts never links or
// names it from an Atlas page (siteLinked below).

/** True in a build on Swann's machine: every Vercel build sets VERCEL and VERCEL_ENV, a local build neither. */
export function isLocalBuild(env: Env = process.env): boolean {
  return !env.VERCEL_ENV && env.VERCEL === undefined;
}

/**
 * Ids that ATLAS_FORCE_PUBLIC treats as public, for the test matrix only. Honoured only when
 * ATLAS_OFFLINE=1 is set and the VERCEL variable is absent, so a deployment never reads it
 * (Vercel sets VERCEL=1 on its builds).
 */
export function forcedPublic(env: Env = process.env): Set<string> {
  if (env.ATLAS_OFFLINE !== '1' || env.VERCEL !== undefined) return new Set();
  return new Set(
    (env.ATLAS_FORCE_PUBLIC ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * Whether a tool's website is built here: the Atlas always, research and elsewhere only in a local
 * build (VERCEL_ENV and VERCEL unset), ai never.
 */
export function siteBuilt(tool: LabTool, env: Env = process.env): boolean {
  const site = tool.site ?? 'atlas';
  if (site === 'atlas') return true;
  if (site === 'research' || site === 'elsewhere') return isLocalBuild(env);
  return false;
}

/**
 * Whether an Atlas page may link to a tool or name it when it is shown: every site but
 * "elsewhere", whose tools are kept for another website and reached only by typing their address
 * on Swann's machine. (An ai tool is never shown, so it is never linked either.)
 */
export function siteLinked(tool: Pick<LabTool, 'site'>): boolean {
  return (tool.site ?? 'atlas') !== 'elsewhere';
}

/** The ids of the tools a build shows, from a list of registry entries. */
export function shownToolIds(tools: LabTool[], env: Env = process.env): Set<string> {
  const byId = new Map(tools.map((t) => [t.id, t]));
  const production = isProduction(env);
  const forced = forcedPublic(env);
  const memo = new Map<string, boolean>();
  const visit = (id: string, trail: Set<string>): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const t = byId.get(id);
    // an unknown id, or a requirement that loops back on itself, is never shown
    if (!t || trail.has(id)) return false;
    const next = new Set(trail).add(id);
    const ok =
      siteBuilt(t, env) && (!production || t.public || forced.has(id)) && t.requires.every((r) => visit(r, next));
    memo.set(id, ok);
    return ok;
  };
  return new Set(tools.filter((t) => visit(t.id, new Set())).map((t) => t.id));
}

export interface ToolState {
  tools: LabTool[]; // every registry entry, of every site
  shown: Set<string>; // the ids this build shows (an elsewhere tool's page is built, never linked)
  local: boolean; // a build on Swann's machine (isLocalBuild): opens the "local:" page gates of routes.ts
}

const stateCache = new Map<string, { stamp: string; state: ToolState }>();

/**
 * The registry and the ids this build shows, read once per build and again only when
 * tools.json changes on disk (a hot reload in npm run dev). Shared: never mutate the result.
 */
export function toolState(opts: LoadOptions = {}): ToolState {
  const env = opts.env ?? process.env;
  const root = opts.root ?? projectRoot();
  // JSON keeps an unset variable apart from an empty one
  const key = JSON.stringify([root, env.VERCEL_ENV, env.VERCEL, env.ATLAS_OFFLINE, env.ATLAS_FORCE_PUBLIC]);
  const file = statSync(join(root, 'data/lab/tools.json'));
  const stamp = `${file.mtimeMs}:${file.size}`;
  const hit = stateCache.get(key);
  if (hit && hit.stamp === stamp) return hit.state;
  const tools = loadTools({ ...opts, env, root }).tools;
  const state = { tools, shown: shownToolIds(tools, env), local: isLocalBuild(env) };
  stateCache.set(key, { stamp, state });
  return state;
}

/**
 * Tools a build should show: every Atlas tool in preview and in local builds (plus the research
 * and elsewhere tools locally), and in production only the public ones whose requirements are
 * shown. Pages and links use src/lib/site/gates.ts, which applies the same rule and links no
 * elsewhere tool.
 */
export function visibleTools(opts: LoadOptions = {}): LabTool[] {
  const { tools, shown } = toolState(opts);
  return tools.filter((t) => shown.has(t.id));
}

export function loadMemberships(opts: LoadOptions = {}): MembershipsFile {
  return loadDataset('data/lab/shared/memberships.json', MembershipsFileSchema, opts);
}
