// qscatlas.org site checks: what one built site may and may not contain (spec 1, 2, 14 and 18).
//
// checkDist() reads a dist folder built in one release mode and returns its findings:
// - pages: the gated pages built are exactly the ones the mode shows, the gated files likewise,
//   and nothing is built under /lab or /research;
// - notes: /notes, each note's page, the feed and the images in public/notes exactly when the
//   mode publishes a note (a finished one whose pages are all built here), never a draft, and the
//   feed lists exactly the published notes;
// - links: every gated address named in any HTML, script or data file is a page this build has,
//   and /lab and /research are never named;
// - names: no name of a tool the mode hides, anywhere, even wrapped over two lines or joined by
//   a non-breaking space (a title that is ordinary vocabulary, such as "Target dates", is left to
//   the address check);
// - words: in the text a visitor reads (inline scripts and island slots included), no em or en
//   dash, no banned word or phrase, no advisory wording, no "how ready" about a place, briefings
//   offered only in the one sentence on /about (decision 1), "deadline" only for binding law
//   (spec 13) and no theoretical vocabulary, role words only in the role badge; a source's own
//   words are exempt (CLAUDE.md, visible copy), and a finding in a record is a warning that names
//   the record;
// - the preview line and noindex on every page that is not public yet, and on no other;
// - robots.txt and sitemap.xml as the mode requires.
// The expectations come from the registry, the manifest's gates and the notes' own files, never
// from the build itself.

import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parse } from 'node-html-parser';
import { scanString } from '../../../labs/tools/style-scan.mjs';
import {
  ALWAYS_GATED_ROOTS,
  BINDING_LAW_TOOLS,
  BRIEFING_OFFER,
  BRIEFING_SPEAKER,
  BRIEFING_WORD,
  DEADLINE,
  DEADLINE_RULE,
  LOCAL_GATE,
  NEGATION,
  NEVER_PHRASES,
  NEVER_ROOTS,
  THEORY_TERMS,
  rel,
  siteOf,
  walkFiles,
} from './common.mjs';
import { coveringEntry, decodeForScan, inlineScripts, jsProse, looksLikeData, propStrings, squash, visibleSegments } from './text.mjs';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const firstSegment = (path) => (path.split(/[?#]/)[0].split('/')[1] ?? '').toLowerCase();

/** "/prepare/check/?x=1#y" gives "/prepare/check". */
export function cleanPath(path) {
  const bare = path.split(/[?#]/)[0] || '/';
  const trimmed = bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
  return trimmed || '/';
}

/** The site path a built file serves: "prepare/check/index.html" gives "/prepare/check". */
export function sitePathOf(relFile) {
  if (relFile === 'index.html') return '/';
  if (relFile.endsWith('/index.html')) return `/${relFile.slice(0, -'/index.html'.length)}`;
  if (relFile.endsWith('.html')) return `/${relFile.slice(0, -'.html'.length)}`;
  return `/${relFile}`;
}

/** The built HTML file of a site path, or null. */
export function htmlFileOf(dir, path) {
  const p = cleanPath(path);
  const candidates = p === '/' ? ['index.html'] : [`${p.slice(1)}/index.html`, `${p.slice(1)}.html`];
  for (const c of candidates) if (existsSync(join(dir, c))) return join(dir, c);
  return null;
}

/**
 * Whether a tool's title is a name ("Exposure Clock", "Rulebook in Motion") rather than the
 * site's ordinary words ("Target dates", "Supplier letter"). Spec 13 makes "target date" the
 * Atlas's word for a dated target, so a guide's "Target dates it sets" names no tool; for such a
 * title only a link can hint at the tool, and the address check catches every link.
 */
export const properName = (title) => title.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).length >= 2;

/**
 * What a mode builds, from the registry, the manifest and the notes alone. A tool is shown when its site is
 * the Atlas, the mode is a preview or the tool is public (or forced public), and every tool it
 * requires is shown; a research or elsewhere tool is never built here, because every matrix mode
 * sets VERCEL_ENV as a deployment would, and neither is a page behind a local gate (none today:
 * the overview and the standard pages have the Cascade's gate). A page is public when its gate would be shown in
 * production with nothing forced; a preview build marks every other built gated page.
 *
 * `notes` are the notes' files ({ slug, draft, pages, image }, scripts/site/lib/notes.mjs). A note
 * is published when it is finished (draft false) and every page it introduces is built in the
 * mode: a tool id when the tool is shown, a path when its manifest page or file is, or always for
 * a page outside the gated sections. A matrix build is never local, so no draft is listed. In a
 * preview a published note is public only when its pages would be shown in production with
 * nothing forced, and the others carry the preview line; in a production build every published
 * note is public.
 */
export function expectations({ tools, pages, files, mode, notes = [] }) {
  const byId = new Map(tools.map((t) => [t.id, t]));
  const forced = new Set(mode.forced ?? []);
  const closure = (open) => {
    const memo = new Map();
    const ok = (id, trail) => {
      if (memo.has(id)) return memo.get(id);
      const t = byId.get(id);
      if (!t || trail.has(id)) return false;
      const next = new Set(trail).add(id);
      const v = siteOf(t) === 'atlas' && open(t) && (t.requires ?? []).every((r) => ok(r, next));
      memo.set(id, v);
      return v;
    };
    return new Set(tools.filter((t) => ok(t.id, new Set())).map((t) => t.id));
  };
  const shown = closure((t) => !mode.production || t.public === true || forced.has(t.id));
  const publicIds = closure((t) => t.public === true);
  const gateIn = (ids) => (gate) => {
    if (gate === null || gate === undefined) return true;
    // a matrix build is never a local build, so a local gate is closed in every mode
    if (gate.startsWith(LOCAL_GATE)) return false;
    return gate === 'prepare-any' ? tools.some((t) => t.section === 'prepare' && ids.has(t.id)) : ids.has(gate);
  };
  const shownGate = gateIn(shown);
  const publicGate = gateIn(publicIds);
  const builtPages = pages.filter((p) => shownGate(p.gate));
  const builtFiles = files.filter((f) => shownGate(f.gate));
  const gatedRoots = new Set([...ALWAYS_GATED_ROOTS, ...pages.map((p) => firstSegment(p.path)), ...files.map((f) => firstSegment(f.path))]);
  const note = noteExpectations({ notes, byId, pages, files, gatedRoots, shownGate, publicGate, mode });
  const previewPages = mode.production ? [] : builtPages.filter((p) => !publicGate(p.gate)).map((p) => p.path);
  return {
    shown,
    builtPages,
    builtFiles,
    builtPaths: new Set([...builtPages.map((p) => p.path), ...builtFiles.map((f) => f.path), ...note.paths]),
    gatedRoots,
    hiddenTitles: tools.filter((t) => !shown.has(t.id) && t.title && properName(t.title)).map((t) => ({ id: t.id, title: t.title })),
    previewPaths: new Set([...previewPages, ...note.previewPages]),
    notes: note,
  };
}

/** The notes part of expectations(): what a mode publishes under /notes, and which of it is public. */
function noteExpectations({ notes, byId, pages, files, gatedRoots, shownGate, publicGate, mode }) {
  const opens = (gate) => (ref) => {
    if (!ref.startsWith('/')) {
      const t = byId.get(ref);
      return !!t && siteOf(t) === 'atlas' && gate(ref);
    }
    const path = cleanPath(ref);
    const at = pages.find((p) => p.path === path) ?? files.find((f) => f.path === path);
    if (at) return gate(at.gate);
    return !gatedRoots.has(firstSegment(path));
  };
  const published = notes.filter((n) => n.draft === false && n.pages.length > 0 && n.pages.every(opens(shownGate)));
  const open = mode.production ? published : published.filter((n) => n.pages.every(opens(publicGate)));
  const any = published.length > 0;
  const notePage = (n) => `${NOTES_ROOT}/${n.slug}`;
  const pagePaths = any ? [NOTES_ROOT, ...published.map(notePage)] : [];
  const images = [...new Set(published.flatMap((n) => (n.image ? [cleanPath(n.image)] : [])))];
  return {
    published: published.map((n) => n.slug),
    pagePaths,
    feed: any ? FEED_PATH : null,
    paths: [...pagePaths, ...(any ? [FEED_PATH] : []), ...images],
    // a preview marks a note whose pages are not public yet, and the list while no note on it is
    previewPages: mode.production ? [] : [...published.filter((n) => !open.includes(n)).map(notePage), ...(any && open.length === 0 ? [NOTES_ROOT] : [])],
    sitemap: mode.production && open.length ? [NOTES_ROOT, ...open.map(notePage)] : [],
  };
}

const NOTES_ROOT = '/notes';
const FEED_PATH = '/notes/rss.xml';

/** Every gated address in a piece of text, with its line and column: in hrefs, props, scripts and prose. */
export function findGatedRefs(text, { roots, origins }) {
  const originAlt = origins.map(esc).join('|');
  const rootAlt = [...roots].map(esc).join('|');
  const re = new RegExp(`(?<![\\w.~%/:@-])(?:${originAlt})?(/(?:${rootAlt})(?![\\w-])(?:/[\\w.~%-]*)*)`, 'gi');
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const line = decodeForScan(raw);
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      // a sentence may end on an address: ".../prepare/check." names /prepare/check
      const path = m[1].replace(/[.~%-]+$/, '');
      out.push({ path, line: i + 1, col: m.index + 1, excerpt: snippet(line, m.index, m[0].length) });
    }
  });
  return out;
}

function snippet(line, at, len) {
  const s = Math.max(0, at - 50);
  const e = Math.min(line.length, at + len + 50);
  return `${s > 0 ? '...' : ''}${line.slice(s, e).replace(/\s+/g, ' ')}${e < line.length ? '...' : ''}`;
}

/** The line and column of the first place a segment's words occur in a file, for the report. */
function locate(lines, text) {
  const needle = text.slice(0, 40);
  for (let i = 0; i < lines.length; i++) {
    const at = lines[i].indexOf(needle);
    if (at >= 0) return { line: i + 1, col: at + 1 };
  }
  return { line: null, col: null };
}

const matchLength = (rule) => {
  const m = /"([^"]+)"/.exec(rule);
  return m ? m[1].length : 1;
};

const has = (re, s) => s.search(re) !== -1;

/** The role words of ROLE_META (src/lib/process.ts) as one pattern: full labels, and the short forms as the badge writes them. */
export function rolePattern(roles = []) {
  const esc2 = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[- ]/g, '[- ]');
  const full = [...new Set(roles.map((r) => r.label).filter(Boolean))].map(esc2);
  // a short form of one short word ("Maker") is matched only as the badge writes it, so
  // "decision-makers" never reads as the role; a long short form ("Contextualiser") is a role
  // word in any case
  const shorts = [...new Set(roles.map((r) => r.short).filter((x) => x && !roles.some((r) => r.label === x)))];
  const long = shorts.filter((x) => x.length >= 8).map(esc2);
  const brief = shorts.filter((x) => x.length < 8).map(esc2);
  const words = (list, flags) => (list.length ? new RegExp(`\\b(?:${list.join('|')})s?\\b`, flags) : null);
  return {
    patterns: [words([...full, ...long], 'gi'), words(brief, 'g')].filter(Boolean),
    labels: new Set(roles.flatMap((r) => [r.label, r.short]).filter(Boolean)),
  };
}

/** Whether a word rule could trip on a string: the strings worth keeping in an index. */
export function tripsWordRules(s, roles = null) {
  return (
    scanString(s).some((f) => f.level === 'HARD') ||
    NEVER_PHRASES.some((p) => has(p.re, s)) ||
    has(BRIEFING_WORD, s) ||
    has(DEADLINE, s) ||
    THEORY_TERMS.some((re) => has(re, s)) ||
    (roles?.patterns ?? []).some((re) => has(re, s))
  );
}

/**
 * Whether one use of "deadline" in a segment is allowed (spec 13): denied in its own clause, a
 * reporting deadline, the word itself named, or on a page about binding law. A clause ends at a
 * sentence mark, a bracket, a comma or a joining word.
 */
export function deadlineAllowed(text, at, { bindingLaw = false } = {}) {
  if (bindingLaw) return true;
  const before = text.slice(0, at);
  if (/\breporting\s+$/i.test(before)) return true;
  if (/\bword\s+["'\u2018\u201c]?$/i.test(before) || /["'\u2018\u201c]$/.test(before)) return true;
  const clause = before.split(/[.;:!?()[\],]|\b(?:and|but|while|whereas|although|though)\b/i).pop();
  return NEGATION.test(clause);
}

/**
 * House-style findings in the words of one segment, as { rule, level, at }: dashes, banned words
 * and phrases (the style scanner's own rules and allow list), the advisory and readiness wording,
 * an offer of briefings outside the one sentence on /about, "deadline" outside binding law, and
 * the theoretical vocabulary, role words outside the role badge. A source's own words are
 * exempt. Words inside one of the Atlas's records are a warning for Swann, naming the record,
 * since only he edits a record; the briefing and advisory rules concern the site's own offer,
 * so a record is never that finding. `allow` holds the reviewed exceptions of this page
 * (scripts/site/word-allow.json); `used` collects the ones that matched.
 */
export function wordFindings(seg, { verbatim = [], records = [], briefingAllowed = false, bindingLaw = false, allow = [], used = null, roles = null } = {}) {
  const out = [];
  if (seg.quoted) return out;
  const text = seg.text;
  const judge = (start, end, rule, recordRule = true) => {
    if (coveringEntry(text, start, end, verbatim)) return;
    const record = coveringEntry(text, start, end, records);
    if (record) {
      const where = typeof record === 'string' ? 'data/profiles or data/results' : record.where;
      if (recordRule) out.push({ rule: `${rule} in a record Swann edits (Notion, then the dump): ${where}`, level: 'warn', at: start, record: true });
      return;
    }
    const entry = allow.find((a) => (!a.rule || rule.startsWith(a.rule)) && covers(text, a.phrase, start, end));
    if (entry) {
      used?.add(entry);
      return;
    }
    out.push({ rule, level: 'error', at: start });
  };
  for (const f of scanString(text)) {
    if (f.level !== 'HARD') continue;
    const start = f.col - 1;
    judge(start, start + matchLength(f.rule), f.rule);
  }
  for (const p of NEVER_PHRASES) for (const m of text.matchAll(p.re)) judge(m.index, m.index + m[0].length, p.rule, p.record);
  if (!briefingAllowed) {
    // every match is judged (the first may sit in a source's title), and one offer is one finding
    const rule = 'briefings offered outside the one sentence on /about (decision 1)';
    const offer = (start, end) => {
      if (!out.some((f) => f.rule === rule)) judge(start, end, rule, false);
    };
    for (const re of BRIEFING_OFFER) for (const m of text.matchAll(re)) offer(m.index, m.index + m[0].length);
    if (BRIEFING_SPEAKER.test(text)) for (const m of text.matchAll(BRIEFING_WORD)) offer(m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(DEADLINE)) if (!deadlineAllowed(text, m.index, { bindingLaw })) judge(m.index, m.index + m[0].length, DEADLINE_RULE);
  for (const re of THEORY_TERMS) for (const m of text.matchAll(re)) judge(m.index, m.index + m[0].length, `theoretical vocabulary "${m[0]}" (CLAUDE.md, visible copy)`);
  if (roles && !seg.badge) {
    // an island receives the badge's own label as a prop, or a built script holds it in ROLE_META,
    // and draws the badge with it
    const label = seg.props && roles.labels.has(text);
    if (!label) {
      const rule = (w) => `role word "${w}" outside the role badge (spec 13)`;
      for (const re of roles.patterns) for (const m of text.matchAll(re)) judge(m.index, m.index + m[0].length, rule(m[0]));
    }
  }
  return out;
}

/** Whether `phrase` occurs in `text` around the stretch [start, end). */
function covers(text, phrase, start, end) {
  if (!phrase) return false;
  const lower = text.toLowerCase();
  const p = phrase.toLowerCase();
  let at = lower.indexOf(p);
  while (at !== -1) {
    if (at <= start && at + p.length >= end) return true;
    at = lower.indexOf(p, at + 1);
  }
  return false;
}

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.json', '.xml', '.txt', '.css', '.csv', '.webmanifest', '.svg']);
const BANNER = /class="[^"]*\bfr-banner\b|Preview: not public yet/;
const NOINDEX = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i;

/** The words of a data block, as island props are read: every string that is not an address, an id or a code. */
function jsonStrings(text) {
  try {
    return propStrings(JSON.parse(text)).map(squash).filter((t) => t && !looksLikeData(t));
  } catch {
    return [];
  }
}

/** Up to 140 characters of a segment, around the place a rule matched. */
function excerptAround(text, at = 0) {
  if (text.length <= 140 || at < 90) return text.slice(0, 140);
  const s = Math.min(at - 60, text.length - 140);
  return `...${text.slice(s, s + 140)}`;
}

/** Line and column of an offset in a text. */
function lineCol(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  return { line, col: index - before.lastIndexOf('\n') };
}

/** A tool's title as a pattern that survives a line break, a non-breaking space or an entity between its words. */
export function titlePattern(title) {
  const gap = '(?:\\s|&nbsp;|&#160;|&#[xX]0*[aA]0;|\\\\u00[aA]0|\\\\xa0)+';
  return new RegExp(`(?<![\\w])${title.trim().split(/\s+/).map(esc).join(gap)}(?![\\w])`);
}

/**
 * The findings for one built site. `mode` is a matrix mode ({ id, production, forced });
 * `pages` and `files` are the whole manifest (allPages() and allFiles() in src/lib/site/routes.ts),
 * whatever the gates say; `notes` the notes' files (scripts/site/lib/notes.mjs); `origins` are the Atlas's own origins, the first being `site`;
 * `verbatim` and `records` the sources' own words and the Atlas's records (text.mjs); `roles`
 * the role words (rolePattern); `wordAllow` the reviewed exceptions of scripts/site/word-allow.json.
 * Each finding of the word rules carries `group`, the words it was found in, so that one mistake
 * in a shared component can be reported once for every page that shows it.
 */
export function checkDist({ dir, mode, tools, pages, files, origins, notes = [], verbatim = [], records = [], roles = null, wordAllow = [] }) {
  const findings = [];
  const add = (rule, file, at = {}, level = 'error', group = '') =>
    findings.push({ mode: mode.id, rule, file: file ? rel(file, dir) : null, line: at.line ?? null, col: at.col ?? null, excerpt: at.excerpt ?? '', level, group, hit: at.hit ?? null });
  if (!existsSync(dir)) {
    add(`no build found at ${dir}`, null);
    return findings;
  }
  const exp = expectations({ tools, pages, files, mode, notes });
  const all = walkFiles(dir, (abs, name) => name === '.DS_Store');
  const relOf = (abs) => rel(abs, dir);
  // pages about binding law only, where "deadline" is the right word (spec 13)
  const lawRoutes = tools.filter((t) => BINDING_LAW_TOOLS.includes(t.id) && t.route).map((t) => cleanPath(t.route));
  const lawPage = (path) => lawRoutes.some((r) => path === r || path.startsWith(`${r}/`));
  const used = new Set();
  const titles = exp.hiddenTitles.map((t) => ({ ...t, re: titlePattern(t.title) }));

  // ---- pages and files ----------------------------------------------------------------------
  for (const abs of all) {
    const r = relOf(abs);
    const root = firstSegment(`/${r}`);
    if (!exp.gatedRoots.has(root)) continue;
    const path = sitePathOf(r);
    if (NEVER_ROOTS.includes(root)) add(`a file under /${root} was built; no deployed build may have one`, abs);
    else if (!exp.builtPaths.has(path)) add(`gated page or file built outside this mode's scope: ${path}`, abs);
  }
  for (const p of exp.builtPages) if (!htmlFileOf(dir, p.path)) add(`expected page missing: ${p.path} (gate ${p.gate})`, null);
  for (const f of exp.builtFiles) if (!existsSync(join(dir, f.path.slice(1)))) add(`expected file missing: ${f.path} (gate ${f.gate})`, null);
  for (const p of exp.notes.pagePaths) if (!htmlFileOf(dir, p)) add(`expected page missing: ${p} (a published note)`, null);
  if (exp.notes.feed) findings.push(...feedFindings({ dir, mode, exp, origin: origins[0] }));

  // ---- every text file ------------------------------------------------------------------------
  const scope = { roots: exp.gatedRoots, origins };
  for (const abs of all) {
    const ext = extname(abs).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    const r = relOf(abs);
    const text = readFileSync(abs, 'utf8');
    const isHtml = ext === '.html';
    const isJs = ext === '.js' || ext === '.mjs';

    for (const ref of findGatedRefs(text, scope)) {
      const root = firstSegment(ref.path);
      const path = cleanPath(ref.path);
      if (NEVER_ROOTS.includes(root)) add(`names a /${root} address: ${ref.path}`, abs, ref);
      else if (!exp.builtPaths.has(path)) add(`names a page this build does not have: ${ref.path}`, abs, ref);
    }

    if (!isHtml && !isJs) continue;
    const lines = text.split('\n').map(decodeForScan);
    // a hidden tool's name, read over the whole file: a title may wrap onto the next line
    const decoded = decodeForScan(text);
    const segs = isHtml ? visibleSegments(text) : [];
    // the page's readable words, joined, for a name split by markup ("Readiness <em>Check</em>")
    const joined = segs.map((s) => s.text).join(' ');
    for (const { id, title, re } of titles) {
      const m = re.exec(decoded);
      if (m) {
        const at = lineCol(decoded, m.index);
        add(`names the hidden tool "${title}" (${id})`, abs, { ...at, excerpt: snippet(decoded, m.index, m[0].length) });
        continue;
      }
      const j = re.exec(joined);
      if (j) add(`names the hidden tool "${title}" (${id})`, abs, { excerpt: snippet(joined, j.index, j[0].length) });
    }

    const words = (seg, ctx, at) => {
      for (const f of wordFindings(seg, { verbatim, records, roles, used, ...ctx })) {
        // a record's warning already names the record, so it is one group however many pages show it
        add(f.rule, abs, { ...at, excerpt: `${seg.where}: ${excerptAround(seg.text, f.at)}`, hit: f.at }, f.level, f.record ? '' : seg.text);
      }
    };
    if (isHtml) {
      const path = sitePathOf(r);
      const isAbout = r === 'about/index.html';
      const page = { bindingLaw: lawPage(path), allow: wordAllow.filter((a) => cleanPath(a.page) === path) };
      for (const seg of segs) words(seg, { ...page, briefingAllowed: isAbout && seg.ids.includes('briefing') }, locate(lines, seg.text));
      // the scripts written into the page: their messages and data blocks reach the visitor too
      for (const script of inlineScripts(text)) {
        const strings = script.kind === 'json' ? jsonStrings(script.text).map((t) => ({ text: t, index: 0 })) : jsProse(script.text);
        for (const s of strings) {
          const at = script.kind === 'json' ? locate(lines, s.text) : lineCol(text, script.index + s.index);
          words({ text: s.text, where: script.kind === 'json' ? 'script[data]' : 'script', quoted: false, badge: false, props: script.kind === 'json', ids: [] }, page, at);
        }
      }
      const banner = BANNER.test(text);
      const noindex = NOINDEX.test(text);
      if (mode.production && banner) add('preview line in a production build', abs);
      if (!mode.production) {
        if (exp.previewPaths.has(path)) {
          if (!banner) add('page not public yet lacks the preview line', abs);
          if (!noindex) add('page not public yet lacks noindex', abs);
        } else if (banner) add('preview line on a page that is public', abs);
      }
      if (mode.production && exp.builtPages.some((p) => p.path === path) && noindex) add('a public tool page carries noindex', abs);
      if (mode.production && exp.notes.pagePaths.includes(path) && noindex) add('a published note page carries noindex', abs);
      if (isAbout) findings.push(...briefingFindings(text, abs, dir, mode));
    } else {
      // a built script that draws the role badge holds ROLE_META itself: a string that is exactly
      // one of its labels is that table, as an island's prop is, while a sentence is still judged
      for (const s of jsProse(text)) words({ text: s.text, where: 'script', quoted: false, badge: false, props: true, ids: [] }, {}, { line: text.slice(0, s.index).split('\n').length });
    }
  }

  // a reviewed exception whose page this mode builds but whose words no longer occur
  for (const a of wordAllow) {
    if (used.has(a) || !htmlFileOf(dir, a.page)) continue;
    add(`word-allow entry no longer matches its page: ${a.page}: "${a.phrase}"`, null, {}, 'warn');
  }

  findings.push(...crawlerFindings({ dir, mode, exp, origin: origins[0] }));
  return findings;
}

/** Decision 1: one plain sentence on /about with the id "briefing"; no heading, no button. */
function briefingFindings(html, abs, dir, mode) {
  const out = [];
  const add = (rule) => out.push({ mode: mode.id, rule, file: rel(abs, dir), line: null, col: null, excerpt: '', level: 'error' });
  const root = parse(html);
  const els = root.querySelectorAll('[id="briefing"]');
  if (els.length !== 1) add(`/about needs exactly one element with id "briefing" (found ${els.length})`);
  for (const el of els) {
    const tag = el.rawTagName.toLowerCase();
    if (/^(h[1-6]|button|a|section|aside)$/.test(tag)) add(`the #briefing element is a ${tag}; it must be one plain sentence`);
    if (el.querySelector('button, h1, h2, h3, h4, h5, h6, form, input')) add('the #briefing sentence holds a button, heading or form');
  }
  return out;
}

/** robots.txt and sitemap.xml for the mode (spec 14.4 and 17). */
function crawlerFindings({ dir, mode, exp, origin }) {
  const out = [];
  const add = (rule, file, level = 'error') => out.push({ mode: mode.id, rule, file, line: null, col: null, excerpt: '', level });
  const robotsAbs = join(dir, 'robots.txt');
  if (!existsSync(robotsAbs)) add('robots.txt missing', null);
  else {
    const robots = readFileSync(robotsAbs, 'utf8');
    const allows = /^Allow:\s*\/\s*$/m.test(robots);
    const disallowsAll = /^Disallow:\s*\/\s*$/m.test(robots);
    if (mode.production) {
      if (!allows || disallowsAll) add('robots.txt must allow every crawler in a production build', 'robots.txt');
      if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) add(`robots.txt must name ${origin}/sitemap.xml`, 'robots.txt');
    } else if (!disallowsAll || allows) add('robots.txt must disallow every crawler outside production', 'robots.txt');
  }

  const sitemapAbs = join(dir, 'sitemap.xml');
  if (!existsSync(sitemapAbs)) {
    add('sitemap.xml missing', null);
    return out;
  }
  const locs = [...readFileSync(sitemapAbs, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const listed = new Set();
  for (const loc of locs) {
    if (!loc.startsWith(`${origin}/`)) {
      add(`sitemap lists an address outside ${origin}: ${loc}`, 'sitemap.xml');
      continue;
    }
    const path = cleanPath(loc.slice(origin.length) || '/');
    listed.add(path);
    const root = firstSegment(path);
    if (NEVER_ROOTS.includes(root)) add(`sitemap lists ${path}`, 'sitemap.xml');
    else if (exp.gatedRoots.has(root)) {
      if (!mode.production) add(`a preview sitemap lists the gated page ${path}`, 'sitemap.xml');
      else if (!exp.builtPaths.has(path)) add(`sitemap lists a page this build does not have: ${path}`, 'sitemap.xml');
    }
    if (path === '/404') add('sitemap lists the 404 page', 'sitemap.xml');
    const html = htmlFileOf(dir, path);
    if (!html) add(`sitemap lists a page that was not built: ${path}`, 'sitemap.xml');
    else if (NOINDEX.test(readFileSync(html, 'utf8'))) add(`sitemap lists a noindex page: ${path}`, 'sitemap.xml');
  }
  if (mode.production) {
    for (const p of exp.builtPages) if (!listed.has(p.path)) add(`sitemap leaves out the public page ${p.path}`, 'sitemap.xml');
    for (const p of exp.notes.sitemap) if (!listed.has(p)) add(`sitemap leaves out the public page ${p}`, 'sitemap.xml');
  }
  // an indexable page left out of the sitemap is worth a look, but not a failure
  for (const abs of walkFiles(dir).filter((f) => f.endsWith('.html'))) {
    const path = sitePathOf(rel(abs, dir));
    if (path === '/404' || listed.has(path) || exp.gatedRoots.has(firstSegment(path))) continue;
    if (!NOINDEX.test(readFileSync(abs, 'utf8'))) add(`indexable page not in the sitemap: ${path}`, 'sitemap.xml', 'warn');
  }
  return out;
}

/** The feed (/notes/rss.xml): one item per published note, each linking its own page, and no other. */
function feedFindings({ dir, mode, exp, origin }) {
  const out = [];
  const add = (rule) => out.push({ mode: mode.id, rule, file: 'notes/rss.xml', line: null, col: null, excerpt: '', level: 'error' });
  const abs = join(dir, FEED_PATH.slice(1));
  if (!existsSync(abs)) {
    add(`expected file missing: ${FEED_PATH} (a published note)`);
    return out;
  }
  const xml = readFileSync(abs, 'utf8');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => (/<link>([^<]*)<\/link>/.exec(m[1])?.[1] ?? '').replace(/&amp;/g, '&'));
  const want = exp.notes.published.map((slug) => `${origin}${NOTES_ROOT}/${slug}`);
  for (const url of items) if (!want.includes(url)) add(`the feed lists a note this build does not publish: ${url}`);
  for (const url of want) if (!items.includes(url)) add(`the feed leaves out the published note ${url}`);
  return out;
}

/** One line per finding: file:line:col [mode] rule: excerpt (the --json and the source report keep this form). */
export function formatFinding(f) {
  const where = f.file ? `${f.file}${f.line ? `:${f.line}${f.col ? `:${f.col}` : ''}` : ''}` : '(build)';
  return `${where} [${f.mode}]${f.level === 'warn' ? ' [warn]' : ''} ${f.rule}${f.excerpt ? `: ${f.excerpt}` : ''}`;
}
