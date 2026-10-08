// qscatlas.org site checks: the text a visitor reads in a built page.
//
// visibleSegments() walks an HTML page and returns each run of text a visitor can read: text
// nodes outside script and style (an island's slot, which Astro renders into a template marked
// data-astro-template, included); the readable attributes (alt, title, aria-label, placeholder);
// the page title and the description and sharing tags; and the string values an island receives
// as props (the island renders them once it runs). inlineScripts() returns the scripts written
// into the page itself, and jsProse() the string literals of a script that read as prose. Each
// segment says whether its markup marks it as a quotation (blockquote, q, or a data-verbatim
// attribute) and whether it is inside the role badge, and the verbatim index answers whether a
// run of text is a source's own words: a document's title or issuer as recorded in data/results,
// or a value under one of the style scanner's verbatim keys in data/lab. A source keeps its own
// punctuation and words (CLAUDE.md, visible copy), so the checks exempt both. The record index
// names, for each of the Atlas's own records, the file, the country and the field it comes from.

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse } from 'node-html-parser';
import { ROOT, walkFiles } from './common.mjs';

const SKIP_TAGS = new Set(['script', 'style', 'svg:style']);
const READABLE_ATTRS = ['alt', 'title', 'aria-label', 'placeholder', 'aria-description', 'aria-roledescription'];
const META_NAMES = new Set(['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description', 'twitter:image:alt']);
const QUOTE_TAGS = new Set(['blockquote', 'q']);

export const squash = (s) => String(s).replace(/\s+/g, ' ').trim();

/** HTML entities and JSON escapes that can hide a path in a built file, decoded for a raw scan. */
export function decodeForScan(line) {
  return line
    .replace(/&(?:quot|#34|#x22);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&(?:sol|#47|#x2f);/gi, '/')
    .replace(/&(?:grave|#96|#x60);/gi, '`')
    .replace(/&(?:amp|#38|#x26);/gi, '&')
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\\//g, '/');
}

/** Every string inside an island's props: Astro writes them as {"key":[0,"value"]}. */
export function propStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => propStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => propStrings(v, out));
  return out;
}

/** True for a prop string that holds an address, an id or a code rather than words a visitor reads. */
export function looksLikeData(s) {
  if (!/[A-Za-z]/.test(s)) return true;
  if (/^(https?:|mailto:|tel:|data:|\/|#|\.\/)/i.test(s)) return true;
  if (/^[\w.-]+$/.test(s) && !/\s/.test(s)) return true; // a single token: an id, a key, a code
  return false;
}

/**
 * The readable text of one HTML page, as segments { text, where, quoted, badge, props, ids }.
 * `where` names the nearest element (tag#id.class) for the report; `quoted` is true inside a
 * quotation's markup; `badge` inside the role badge (class role-badge), the one place a role is
 * named; `props` for a string an island receives; `ids` lists the ids of the element and its
 * ancestors, so a check can find the #briefing sentence on /about. A template is read only when
 * Astro marks it as an island's slot (data-astro-template), since only then does it reach the page.
 */
export function visibleSegments(html) {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const out = [];
  const label = (el) => {
    if (!el || !el.rawTagName) return 'document';
    const id = el.getAttribute?.('id');
    const cls = (el.getAttribute?.('class') ?? '').split(/\s+/).filter((c) => c && !c.startsWith('astro-')).slice(0, 2);
    return `${el.rawTagName.toLowerCase()}${id ? `#${id}` : ''}${cls.length ? `.${cls.join('.')}` : ''}`;
  };
  const seg = (text, where, ctx, extra = {}) => ({ text, where, quoted: ctx.quoted, badge: ctx.badge, props: false, ids: ctx.ids, ...extra });
  const visit = (node, ctx) => {
    if (node.nodeType === 3) {
      const text = squash(node.text);
      if (text) out.push(seg(text, ctx.where, ctx));
      return;
    }
    if (node.nodeType !== 1) {
      node.childNodes?.forEach((c) => visit(c, ctx));
      return;
    }
    const tag = (node.rawTagName ?? '').toLowerCase();
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'template' && !node.hasAttribute('data-astro-template')) return;
    const id = node.getAttribute('id');
    const classes = (node.getAttribute('class') ?? '').split(/\s+/);
    const next = {
      where: tag ? label(node) : ctx.where,
      quoted: ctx.quoted || QUOTE_TAGS.has(tag) || node.hasAttribute?.('data-verbatim'),
      badge: ctx.badge || classes.includes('role-badge'),
      ids: id ? [...ctx.ids, id] : ctx.ids,
    };
    if (tag === 'title') {
      out.push(seg(squash(node.text), 'title', { ...next, quoted: false }));
      return;
    }
    if (tag === 'meta') {
      const name = (node.getAttribute('name') ?? node.getAttribute('property') ?? '').toLowerCase();
      const content = node.getAttribute('content');
      if (META_NAMES.has(name) && content) out.push(seg(squash(content), `meta[${name}]`, { ...next, quoted: false }));
      return;
    }
    for (const a of READABLE_ATTRS) {
      const v = node.getAttribute(a);
      if (v && squash(v)) out.push(seg(squash(v), `${label(node)}[${a}]`, next));
    }
    if (tag === 'astro-island') {
      const props = node.getAttribute('props');
      if (props) {
        try {
          for (const s of propStrings(JSON.parse(props))) {
            const t = squash(s);
            if (t && !looksLikeData(t)) out.push(seg(t, `${label(node)}[props]`, next, { props: true }));
          }
        } catch {
          /* props that are not JSON hold no readable text */
        }
      }
    }
    node.childNodes.forEach((c) => visit(c, next));
  };
  visit(root, { where: 'document', quoted: false, badge: false, ids: [] });
  return out;
}

/**
 * The scripts written into a page itself, as { kind, text, index }: `kind` is "json" for a data
 * block (type application/json), whose string values an island or the finder shows, and "js"
 * for code, whose comments are blanked so that an apostrophe in a comment never opens a string.
 * A script loaded from a file is checked as that file; structured data for search engines
 * (application/ld+json) and an import map hold no copy of their own and are left out. `index` is
 * where the script's text starts in the page, for the line of a finding.
 */
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1];
    if (/(?:^|\s)src\s*=/i.test(attrs)) continue;
    const type = (/(?:^|\s)type\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? '').toLowerCase();
    if (type === 'application/ld+json' || type === 'importmap' || type === 'speculationrules') continue;
    const index = m.index + m[0].indexOf('>') + 1;
    if (type === 'application/json') out.push({ kind: 'json', text: m[2], index });
    else if (!type || type === 'module' || /javascript|ecmascript/.test(type)) out.push({ kind: 'js', text: stripJsComments(m[2]), index });
  }
  return out;
}

/** A script with its comments turned to spaces, strings kept, so offsets stay true. */
export function stripJsComments(js) {
  let out = '';
  let quote = null;
  for (let i = 0; i < js.length; i++) {
    const ch = js[i];
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += js[i + 1] ?? '';
        i++;
      } else if (ch === quote || (ch === '\n' && quote !== '`')) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === '/' && js[i + 1] === '/') {
      const end = js.indexOf('\n', i);
      const stop = end === -1 ? js.length : end;
      out += ' '.repeat(stop - i);
      i = stop - 1;
      continue;
    }
    if (ch === '/' && js[i + 1] === '*') {
      const end = js.indexOf('*/', i + 2);
      const stop = end === -1 ? js.length : end + 2;
      out += js.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * The string literals of a built script that read as words a visitor sees. A list of
 * space-separated identifiers (React's attribute list, for one) has no capital and no sentence
 * punctuation, so it is left out; a label or a sentence has one or the other.
 */
export function jsProse(js) {
  const out = [];
  for (const m of jsStrings(js)) {
    const raw = m.raw;
    if (!/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(raw)) continue;
    const s = squash(raw.replace(/\\n/g, ' ').replace(/\\(["'`\\])/g, '$1').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
    const prose = /(^|\s)[A-Z][a-z]/.test(s) || /[.,;:?!]/.test(s);
    if (!prose) continue;
    out.push({ text: s, index: m.index });
  }
  return out;
}

const WORD_CHAR = /[A-Za-z0-9_$]/;
// after one of these words a slash opens a regular expression, not a division
const BEFORE_REGEX = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/**
 * The string literals of a script, in order of position, as { raw, index }: one pass from left to
 * right that steps over comments and regular expressions and follows a template's substitutions,
 * so a quote inside a regular expression or a nested template never pairs with the wrong quote
 * (minified code holds both, and a wrong pairing reads code as words). A template gives its
 * fixed parts joined by a space. `index` is where the literal opens.
 */
export function jsStrings(js) {
  const out = [];
  const n = js.length;
  let i = 0;

  const quoted = (q) => {
    const start = i;
    let s = '';
    i++;
    while (i < n && js[i] !== q && js[i] !== '\n') {
      if (js[i] === '\\') {
        s += js.slice(i, i + 2);
        i += 2;
      } else s += js[i++];
    }
    i++;
    out.push({ raw: s, index: start });
  };

  const regex = () => {
    i++;
    let inClass = false;
    while (i < n && js[i] !== '\n') {
      const c = js[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      i++;
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
    }
    while (i < n && /[a-z]/i.test(js[i])) i++;
  };

  const template = () => {
    const start = i;
    const parts = [];
    let s = '';
    i++;
    while (i < n) {
      const c = js[i];
      if (c === '\\') {
        s += js.slice(i, i + 2);
        i += 2;
      } else if (c === '`') {
        i++;
        break;
      } else if (c === '$' && js[i + 1] === '{') {
        parts.push(s);
        s = '';
        i += 2;
        code(true);
      } else s += js[i++];
    }
    parts.push(s);
    out.push({ raw: parts.join(' '), index: start });
  };

  // code up to the end, or, inside a template's ${ }, up to the brace that closes it
  function code(inSubstitution) {
    let depth = 0;
    let last = '';
    let word = '';
    while (i < n) {
      const c = js[i];
      if (c === '"' || c === "'") {
        quoted(c);
        last = 'a';
        word = '';
      } else if (c === '`') {
        template();
        last = 'a';
        word = '';
      } else if (c === '/' && js[i + 1] === '/') {
        while (i < n && js[i] !== '\n') i++;
      } else if (c === '/' && js[i + 1] === '*') {
        const end = js.indexOf('*/', i + 2);
        i = end === -1 ? n : end + 2;
      } else if (c === '/' && (last === '' || '([{,;:=!&|?+-*%<>~^'.includes(last) || BEFORE_REGEX.test(word))) {
        regex();
        last = 'a';
        word = '';
      } else if (WORD_CHAR.test(c)) {
        const from = i;
        while (i < n && WORD_CHAR.test(js[i])) i++;
        word = js.slice(from, i);
        last = 'a';
      } else {
        if (c === '{') depth++;
        else if (c === '}') {
          if (inSubstitution && depth === 0) {
            i++;
            return;
          }
          depth--;
        }
        if (!/\s/.test(c)) {
          last = c;
          word = '';
        }
        i++;
      }
    }
  }

  code(false);
  return out.sort((a, b) => a.index - b.index);
}

// ---- the sources' own words ------------------------------------------------------------------

// The keys the style scanner treats as verbatim (labs/tools/style-scan.mjs), plus the issuer's
// name, which is a proper noun as the source writes it.
const VERBATIM_KEYS = new Set(['excerpt', 'documentTitle', 'definitionVerbatim', 'sourceTitle', 'quote', 'issuingOrg']);

function collectKeys(value, keys, out) {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, keys, out));
  else if (value && typeof value === 'object') {
    // a provenance record's title is the source's own title
    if (typeof value.title === 'string' && typeof value.url === 'string' && ('retrievedAt' in value || 'excerpt' in value)) out.add(squash(value.title));
    for (const [k, v] of Object.entries(value)) {
      if (keys.has(k) && typeof v === 'string') out.add(squash(v));
      else collectKeys(v, keys, out);
    }
  }
  return out;
}

/**
 * The sources' own words the Atlas records: each document's title and issuer in data/results,
 * and every value under a verbatim key in data/lab (the watch snapshots aside, which no page
 * reads). Only strings that a house-style check could trip on are kept, so the index stays small.
 */
export function verbatimIndex(root = ROOT, keepIf = () => true) {
  const set = new Set();
  const results = join(root, 'data', 'results');
  for (const f of walkFiles(results).filter((p) => p.endsWith('.json'))) {
    const rows = JSON.parse(readFileSync(f, 'utf8'));
    for (const r of Array.isArray(rows) ? rows : []) {
      for (const k of ['title', 'issuingOrg']) if (typeof r?.[k] === 'string') set.add(squash(r[k]));
    }
  }
  const lab = join(root, 'data', 'lab');
  if (existsSync(lab)) {
    const files = walkFiles(lab, (abs, name) => name === 'watch').filter((p) => p.endsWith('.json'));
    for (const f of files) {
      try {
        collectKeys(JSON.parse(readFileSync(f, 'utf8')), VERBATIM_KEYS, set);
      } catch {
        /* a file that is not JSON holds no record */
      }
    }
  }
  return [...set].filter((s) => s && keepIf(s));
}

// The published prose fields of a profile, as src/loaders/json-mirror.ts maps them. No other
// field of data/profiles is used here: never analyticalNote, classificationBasis or the provenance
// notes.
const PROFILE_FIELDS = ['summary', 'govActors', 'standardFamilies', 'algorithms', 'processParticipation', 'hybridDeployment', 'migrationTimeline', 'targetCompletion', 'mainRegulation', 'obligation'];

/**
 * The Atlas's own records, which only Swann edits (in Notion, then the JSON copy): the published
 * prose fields of each profile in data/profiles and each document's summary in data/results. A
 * house-style finding inside them is reported for him to fix, as a warning, since no change to
 * the site's code can fix it and the automation never edits a profile (CLAUDE.md). Each entry is
 * { text, where }, `where` naming the file, the country and the field, or the document's title,
 * so that Swann can find the Notion row: "data/profiles/LUX.json (LUX), migrationTimeline".
 */
export function recordIndex(root = ROOT, keepIf = () => true) {
  const out = new Map();
  const add = (text, where) => {
    const t = squash(text);
    if (t && keepIf(t) && !out.has(t)) out.set(t, { text: t, where });
  };
  for (const f of walkFiles(join(root, 'data', 'profiles')).filter((p) => p.endsWith('.json'))) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      continue;
    }
    const file = `data/profiles/${basename(f)}`;
    const iso3 = typeof raw?.iso3 === 'string' ? raw.iso3 : basename(f, '.json');
    for (const k of PROFILE_FIELDS) {
      if (typeof raw?.[k] !== 'string') continue;
      // a timeline is drawn one line at a time
      for (const part of [raw[k], ...raw[k].split(/\r?\n/)]) if (part.trim()) add(part, `${file} (${iso3}), ${k}`);
    }
  }
  for (const f of walkFiles(join(root, 'data', 'results')).filter((p) => p.endsWith('.json'))) {
    const rows = JSON.parse(readFileSync(f, 'utf8'));
    for (const r of Array.isArray(rows) ? rows : []) {
      if (r?.included !== true || typeof r.summary !== 'string') continue;
      const title = typeof r.title === 'string' ? squash(r.title) : '';
      add(r.summary, `data/results/${basename(f)}, summary of "${title.length > 70 ? `${title.slice(0, 70)}...` : title}"`);
    }
  }
  return [...out.values()];
}

/**
 * The entry of an index (strings, or records { text, where }) that covers the stretch
 * [start, end) of a segment, or null: some entry covers it where it occurs in the segment, or the
 * whole segment is part of one (a title split by markup or shortened with an ellipsis).
 */
export function coveringEntry(text, start, end, index) {
  const bare = text.replace(/[\s.\u2026]+$/, '');
  for (const entry of index) {
    const v = typeof entry === 'string' ? entry : entry.text;
    // a whole segment inside a source's words: long enough that the match is the record itself
    if (bare.length >= 12 && v.includes(bare)) return entry;
    let at = text.indexOf(v);
    while (at !== -1) {
      if (at <= start && at + v.length >= end) return entry;
      at = text.indexOf(v, at + 1);
    }
  }
  return null;
}

/** Whether the stretch [start, end) of a segment lies inside a source's own words (or a record). */
export function inVerbatim(text, start, end, index) {
  return coveringEntry(text, start, end, index) !== null;
}
