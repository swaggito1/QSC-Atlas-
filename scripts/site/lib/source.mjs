// qscatlas.org site checks: hard-coded gated addresses in the source (spec 12 and 14.2).
//
// Every link to a gated page goes through link(id) or pageHref(path) in src/lib/site/gates.ts,
// which return null when the page is not built; a hard-coded href to /prepare would survive into
// a build where Prepare does not exist. scanSource() reads src/ and reports each place that sends
// a visitor to a gated address without those helpers: an href, src or action attribute, an href
// property, a location change, or a Markdown link. A literal handed straight to pageHref() or to
// one of the routes helpers that only ask whether a page is built is fine.
//
// Folders of tools that no deployment builds (site "ai", and "research" and "elsewhere", built
// only on Swann's machine) are left out, as are tests. scripts/site/route-literals.json lists the few places that
// define a section's address in a table and pass it through pageHref() further down; each entry
// names the file, the exact text of the line and the reason.

import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { ALWAYS_GATED_ROOTS, ROOT, atlasOrigins, readJson, readTools, rel, siteOf, walkFiles } from './common.mjs';

const EXT = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.md', '.mdx']);
const ALLOW_FILE = join('scripts', 'site', 'route-literals.json');

// helpers whose first argument is a path they check, never a link they hand out unchecked
const SAFE_CALLS = ['pageHref', 'builtPage', 'isGatedPath', 'isStaticPath', 'childPages', 'cleanPath'];

/** The first path segments a gated page uses: the manifest's, plus the ones that are always gated. */
export function gatedRootsFromTools(tools) {
  const roots = new Set(ALWAYS_GATED_ROOTS);
  for (const t of tools) {
    const first = (t.route ?? '').split('/')[1];
    if (first) roots.add(first);
  }
  return roots;
}

/** Comments out, string contents kept, so a commented example never counts and columns stay true. */
function stripComments(line, state) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf(state.block, i);
      if (end === -1) return out + ' '.repeat(line.length - i);
      out += ' '.repeat(end + state.block.length - i);
      i = end + state.block.length;
      state.block = null;
      continue;
    }
    const ch = line[i];
    if (state.quote) {
      out += ch;
      if (ch === '\\') {
        out += line[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === state.quote) state.quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      state.quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (line.startsWith('/*', i)) {
      state.block = '*/';
      continue;
    }
    if (line.startsWith('<!--', i)) {
      state.block = '-->';
      continue;
    }
    // a line comment starts at // outside a string, but never inside an address (https://)
    if (line.startsWith('//', i) && line[i - 1] !== ':') return out + ' '.repeat(line.length - i);
    out += ch;
    i++;
  }
  // a template literal may run on; a single or double quote ends with its line
  if (state.quote && state.quote !== '`') state.quote = null;
  return out;
}

/**
 * The hard-coded gated addresses in one file's text, as { line, col, text, sink }. `roots` are
 * the gated first segments (prepare, standards, target-dates, lab, research...); `origins` are
 * the Atlas's own origins, so an absolute link to a gated page counts too.
 */
export function scanText(text, roots, origins = []) {
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rootAlt = [...roots].map(esc).join('|');
  const own = origins.length ? `(?:${origins.map(esc).join('|')})?` : '';
  const path = `(?<path>${own}/(?:${rootAlt})(?![\\w-]))`;
  const q = `["'\`]`;
  const patterns = [
    // a change of location: location = '/x', location.href = '/x', .assign('/x'), window.open('/x') and the router call
    new RegExp(`(?<sink>\\blocation(?:\\.href)?\\s*=|\\.assign\\(|\\bwindow\\.open\\(|\\bnavigate\\()\\s*${q}${path}`, 'gi'),
    // href="/prepare", src='/lab/x', action={`/standards/${id}`}, href={"/prepare"}, in markup or in a string of markup
    new RegExp(`\\b(?<sink>href|src|action|formaction)\\s*=\\s*\\\\?["'\`{]?\\s*\\\\?${q}?${path}`, 'gi'),
    // href: '/prepare' or to: '/prepare' on an object
    new RegExp(`\\b(?<sink>href|to)\\s*:\\s*${q}${path}`, 'gi'),
    // a branch that hands out a literal: href={x ? '/prepare' : null}, href: a ?? '/standards'
    new RegExp(`\\b(?<sink>href)\\s*[:=]\\s*\\{?[^;,]*?(?:\\?\\??|\\|\\||:)\\s*${q}${path}`, 'gi'),
    // [text](/prepare) in Markdown
    new RegExp(`\\]\\(${path}`, 'gi'),
  ];
  const safe = new RegExp(`\\b(?:${SAFE_CALLS.join('|')})\\(\\s*$`);

  const out = [];
  const state = { quote: null, block: null };
  text.split('\n').forEach((raw, i) => {
    const line = stripComments(raw, state);
    const seen = new Set();
    for (const re of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const at = m.index + m[0].lastIndexOf(m.groups.path);
        if (seen.has(at)) continue;
        if (safe.test(line.slice(0, at).replace(/["'`]$/, ''))) continue;
        seen.add(at);
        const sink = (m.groups.sink ?? 'link').replace(/[\s=(:]/g, '').replace(/^\./, '').toLowerCase() || 'link';
        out.push({ line: i + 1, col: at + 1, text: raw.trim(), sink });
      }
    }
  });
  return out;
}

/** The allowed table entries, from scripts/site/route-literals.json. */
export function readAllow(root = ROOT) {
  const abs = join(root, ALLOW_FILE);
  return existsSync(abs) ? readJson(abs).entries ?? [] : [];
}

/** The folders of tools that no deployment builds, relative to the root. */
function unbuiltToolFolders(tools) {
  return tools.filter((t) => siteOf(t) !== 'atlas').map((t) => `src/components/lab/tools/${t.id}/`);
}

/**
 * Every hard-coded gated address in src/, as findings { file, line, col, rule, excerpt }, minus
 * the entries of the allow list (matched by file and exact line text, so a moved line still
 * matches and an edited one no longer does).
 */
export function scanSource(root = ROOT, { tools = readTools(root), allow = readAllow(root), origins = atlasOrigins(root) } = {}) {
  const roots = gatedRootsFromTools(tools);
  const skipDirs = unbuiltToolFolders(tools);
  const files = walkFiles(join(root, 'src'), (abs, name) => name === 'node_modules' || name === '__snapshots__').filter((abs) => {
    const r = rel(abs, root);
    if (!EXT.has(extname(abs))) return false;
    if (/\.test\.|\.d\.ts$/.test(r)) return false;
    return !skipDirs.some((d) => r.startsWith(d));
  });
  const findings = [];
  const used = new Set();
  for (const abs of files) {
    const r = rel(abs, root);
    for (const hit of scanText(readFileSync(abs, 'utf8'), roots, origins)) {
      const ok = allow.findIndex((a) => a.file === r && a.line.trim() === hit.text);
      if (ok >= 0) {
        used.add(ok);
        continue;
      }
      findings.push({
        mode: 'source',
        file: r,
        line: hit.line,
        col: hit.col,
        rule: `hard-coded ${hit.sink} to a gated page; pass it through pageHref() or link() (src/lib/site/gates.ts)`,
        excerpt: hit.text.slice(0, 160),
        level: 'error',
      });
    }
  }
  allow.forEach((a, i) => {
    if (!used.has(i)) findings.push({ mode: 'source', file: ALLOW_FILE, line: null, col: null, rule: `allow-list entry no longer matches any line: ${a.file}: ${a.line}`, excerpt: '', level: 'warn' });
  });
  return findings;
}
