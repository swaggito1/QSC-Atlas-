// qscatlas.org site checks: what every check shares (spec 14 and 23, package site-checks).
//
// The registry (data/lab/tools.json), the release modes the matrix builds, the folder the matrix
// writes to, the Atlas's own origins and a loader for the TypeScript modules the checks reuse.
// Plain Node, no dependency beyond what the site already installs.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/\/$/, '');

/** Where npm run site:matrix writes its builds: under node_modules, which git already ignores. */
export const MATRIX_DIR = join(ROOT, 'node_modules', '.cache', 'atlas-site-matrix');

/** The file each matrix build leaves beside its output, naming the mode and when it was built. */
export const STAMP_FILE = '.site-matrix.json';

/**
 * The first path segments that only gated pages may use, whatever the registry adds later. The
 * notes (/notes, /notes/<slug>, /notes/rss.xml and the images in public/notes) count as gated: a
 * build has them only when it publishes a note (src/lib/site/notes.ts, scripts/site/lib/notes.mjs).
 */
export const ALWAYS_GATED_ROOTS = ['prepare', 'standards', 'target-dates', 'lab', 'research', 'elsewhere', 'notes'];

/**
 * Paths that no build deployed to Vercel may name, in any mode: the old lab, the research tools
 * and the tools kept for another website (site "elsewhere"), all built on Swann's machine only.
 */
export const NEVER_ROOTS = ['lab', 'research', 'elsewhere'];

/**
 * The prefix of a page gate that only a local build opens (src/lib/site/routes.ts, localGate).
 * No page of the manifest has one since the standard pages took the Cascade's gate (8 October
 * 2026), but no matrix mode is a local build, so no mode may build or name such a page.
 */
export const LOCAL_GATE = 'local:';

/**
 * Words a visitor must never read on the Atlas (spec 1, 13 and 18). "How ready" is the dropped
 * readiness reading of a country (the old home lede and meta description); spec 13 keeps
 * readiness words off countries only, so an organisation weighing its own readiness, as a guide's
 * action does ("Assess how ready your organisation is"), is not this finding. The advisory
 * wording concerns the Atlas's own offer (decision 1), so a record that says an agency is
 * "advising on" something is no finding (`record: false`); readiness wording in a record is.
 * Every pattern is global, so each match in a segment is judged.
 */
export const NEVER_PHRASES = [
  { re: /request a briefing/gi, rule: 'advisory wording "Request a briefing"', record: false },
  { re: /\badvisory (?:work|services?|practice)\b/gi, rule: 'advisory wording (spec 18, decision 1)', record: false },
  { re: /\badvising on\b/gi, rule: 'advisory wording "advising on" (spec 18, decision 1)', record: false },
  { re: /\bconsult(?:ing|ancy)\s+(?:work|practice|services?)\b/gi, rule: 'advisory wording (spec 18, decision 1)', record: false },
  {
    re: /\bhow ready\b(?!\s+(?:your|an|the|their|our|its)\s+(?:own\s+)?(?:organisation|organization|administration|team|systems?|supply chain)\b)/gi,
    rule: 'readiness wording "how ready" about a place',
    record: true,
  },
];

/**
 * The Atlas offering briefings (decision 1, 1 October 2026): allowed in the one plain sentence
 * with the id "briefing" on /about and nowhere else. A source or an agency's own briefing (a
 * report called a briefing, a press briefing) is no offer, so only the ways of offering one are
 * matched: a verb of offering or asking, "for a briefing", "available for briefings", a segment
 * that opens on the word (a heading such as "Briefings for governments"), and any mention of a
 * briefing beside the authors' names or "we", "us" or "our".
 */
export const BRIEFING_OFFER = [
  /\b(?:request|requests|requesting|book|arrange|offer|offers|offering|give|gives|giving|provide|provides|providing)\s+(?:a\s+|our\s+)?briefings?\b/gi,
  /\bbriefings?\s+(?:on|upon|by)\s+request\b/gi,
  /\b(?:ask|asks|asking)\s+for\s+(?:a\s+)?briefings?\b/gi,
  /\bfor\s+a\s+briefing\b/gi,
  /\bavailable\s+for\s+(?:a\s+)?briefings?\b/gi,
  /^\s*briefings?\b/gi,
];
/**
 * A mention of a briefing that, beside these words, is the Atlas speaking of its own. "us" is
 * matched in lower case only, so the United States ("a US briefing") is not the Atlas speaking.
 */
export const BRIEFING_WORD = /\bbriefings?\b/gi;
export const BRIEFING_SPEAKER = /\b(?:[Ww]e|us|[Oo]ur|Pupillo|Ashworth)\b|mailto:|@ceps\.eu/;

/**
 * "Deadline" is kept for dates set in binding law (spec 1 and 13): a target shown as a deadline is
 * the most serious error the Atlas can make. The word passes when its own clause denies it ("not
 * a legal deadline", "No national migration deadline has been published"), as a "reporting
 * deadline" (the Rulebook's legal time limits), when the word itself is named ("the word
 * deadline"), on a page about binding law only (BINDING_LAW_TOOLS), or under a reviewed entry of
 * scripts/site/word-allow.json. Anywhere else it fails in the site's own words and is a warning
 * in a record, which only Swann can reword.
 */
export const DEADLINE = /\bdeadlines?\b/gi;
export const DEADLINE_RULE = 'the word "deadline" outside binding law (spec 13)';
export const NEGATION = /\b(?:not|no|none|never|nor|neither|without|cannot)\b|n't\b/i;
/** Tools whose every date is set in binding law: the word "deadline" is theirs to use. */
export const BINDING_LAW_TOOLS = ['rulebook'];

/**
 * The theoretical vocabulary no visitor may see (CLAUDE.md, visible copy). The role words are
 * added from ROLE_META in src/lib/process.ts and pass only inside the role badge.
 */
export const THEORY_TERMS = [
  /\btriple[- ]helix\b/gi,
  /\bgovernance of expectations\b/gi,
  /\bcode famil(?:y|ies)\b/gi,
  /\bhelix strength\b/gi,
  /\bimbalance metrics?\b/gi,
];

/** Where the reviewed exceptions to the word rules live (scripts/site/word-allow.json). */
export const WORD_ALLOW_FILE = join('scripts', 'site', 'word-allow.json');

/** The reviewed exceptions to the word rules: { page, phrase, rule, reason }. */
export function readWordAllow(root = ROOT) {
  const abs = join(root, WORD_ALLOW_FILE);
  return existsSync(abs) ? readJson(abs).entries ?? [] : [];
}

export function rel(path, root = ROOT) {
  return relative(root, path).split(sep).join('/');
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Every entry of data/lab/tools.json, of every site. */
export function readTools(root = ROOT) {
  return readJson(join(root, 'data', 'lab', 'tools.json')).tools;
}

/** A tool's website: "atlas" (absent), "ai" (never built), "research" or "elsewhere" (Swann's machine only). */
export const siteOf = (t) => t.site ?? 'atlas';

/** A tool and every tool it requires, in registry order: what ATLAS_FORCE_PUBLIC must name. */
export function requiresClosure(tools, id) {
  const byId = new Map(tools.map((t) => [t.id, t]));
  const out = new Set();
  const visit = (x) => {
    if (out.has(x) || !byId.has(x)) return;
    out.add(x);
    for (const r of byId.get(x).requires ?? []) visit(r);
  };
  visit(id);
  return tools.filter((t) => out.has(t.id)).map((t) => t.id);
}

/**
 * The release modes the matrix builds (spec 14.3 and 23): every flag as it stands in production
 * ("off": with every tool private today, stage 0), every Atlas tool in a preview ("on"), and each
 * Atlas tool alone in production, forced public with the tools it requires.
 */
export function matrixModes(tools) {
  const modes = [
    { id: 'off', production: true, forced: [], label: 'production, flags as in tools.json' },
    { id: 'on', production: false, forced: [], label: 'preview, every Atlas tool' },
  ];
  for (const t of tools.filter((x) => siteOf(x) === 'atlas')) {
    const forced = requiresClosure(tools, t.id);
    modes.push({ id: `tool-${t.id}`, production: true, forced, tool: t.id, label: `production, ${forced.join(' and ')} forced public` });
  }
  return modes;
}

/**
 * The environment of one matrix build: offline, never a Vercel deployment (no VERCEL), and
 * VERCEL_ENV set as Vercel would for that kind of build. ATLAS_FORCE_PUBLIC is honoured only
 * because ATLAS_OFFLINE=1 is set and VERCEL is absent (src/lib/lab/load.ts, forcedPublic).
 */
export function modeEnv(mode, base = process.env) {
  const env = { ...base };
  for (const k of ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'ATLAS_FORCE_PUBLIC']) delete env[k];
  env.ATLAS_OFFLINE = '1';
  env.VERCEL_ENV = mode.production ? 'production' : 'preview';
  if (mode.forced.length) env.ATLAS_FORCE_PUBLIC = mode.forced.join(',');
  env.ASTRO_TELEMETRY_DISABLED = '1';
  return env;
}

/** The modes named on the command line (--only=off,tool-cascade), or all of them. */
export function pickModes(all, onlyArg) {
  if (!onlyArg) return all;
  const want = onlyArg.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = want.filter((w) => !all.some((m) => m.id === w));
  if (unknown.length) throw new Error(`unknown mode: ${unknown.join(', ')} (known: ${all.map((m) => m.id).join(', ')})`);
  return all.filter((m) => want.includes(m.id));
}

/** `site` from astro.config.mjs, with no trailing slash. */
export function configOrigin(root = ROOT) {
  const src = readFileSync(join(root, 'astro.config.mjs'), 'utf8');
  const m = /\bsite\s*:\s*['"`]([^'"`]+)['"`]/.exec(src);
  if (!m) throw new Error('no `site` in astro.config.mjs');
  return new URL(m[1]).origin;
}

/** Every origin the Atlas answers on, old and new, so an absolute link to a gated page is caught too. */
export function atlasOrigins(root = ROOT) {
  return [...new Set([configOrigin(root), 'https://qsc-atlas.vercel.app', 'https://qscatlas.org', 'https://www.qscatlas.org'])];
}

/** Every file under a folder, as absolute paths, sorted. */
export function walkFiles(dir, skip = () => false) {
  const out = [];
  const visit = (d) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      if (skip(abs, name)) continue;
      const st = statSync(abs);
      if (st.isDirectory()) visit(abs);
      else out.push(abs);
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

/**
 * Load a TypeScript module of the site: natively where Node strips types and the module names
 * its imports with their extension (routes.ts does), else through a short-lived Vite server, as
 * astro.config.mjs does for its own routes import.
 */
export async function loadTs(relPath, root = ROOT) {
  const abs = join(root, relPath);
  try {
    return await import(pathToFileURL(abs).href);
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? e.code : '';
    if (!['ERR_UNKNOWN_FILE_EXTENSION', 'ERR_MODULE_NOT_FOUND', 'ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING'].includes(code)) throw e;
  }
  const { createServer } = await import('vite');
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
  });
  try {
    return await server.ssrLoadModule(`/${relPath}`);
  } finally {
    await server.close();
  }
}

