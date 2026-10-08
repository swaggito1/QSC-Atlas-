#!/usr/bin/env node
// QSC Atlas Labs: house-style scanner.
// Fails (exit 1) on HARD findings: em or en dashes anywhere, banned vocabulary and
// banned phrases in prose or visible copy. Reports WATCH findings (capped patterns)
// without failing. No dependencies. Node 18 or later.
//
// Usage:
//   node labs/tools/style-scan.mjs <file-or-dir> [...more] [--json] [--watch-fails]
//     [--exclude=data/lab/watch,another/path]
//
// Markdown: words are checked outside fenced code blocks; dashes are checked everywhere.
// Code (.ts .tsx .astro .js .mjs .json .yaml .yml .css .html .svg): dashes are checked
// everywhere; words are checked only inside string literals, JSX or HTML text and comments.
// JSON keys that hold verbatim source text (excerpt, documentTitle, definitionVerbatim,
// sourceTitle, and "title" inside a provenance object on the same line) are exempt: a quotation
// keeps the source's own punctuation and words. A line containing "style-scan-ignore" is skipped. Exact phrases listed in
// labs/tools/style-allow.txt (one per line) are masked before scanning, for proper nouns
// such as a statutory title that contains a banned word. Web addresses are masked for the
// word checks too.
//
// Also importable: scanString(text) returns the findings for one visitor-facing string
// (used by scripts/lab/validate.mjs and scripts/lab/check-proposals.mjs).

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.vercel', 'backups', 'logs']);
const MD = new Set(['.md', '.markdown', '.txt']);
const CODE = new Set(['.ts', '.tsx', '.astro', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.css', '.html', '.svg', '.template', '.sh', '.rq', '.csv']);
// Keys whose values are verbatim quotations from sources; exempt from word and dash checks.
const VERBATIM_KEY = /"(excerpt|documentTitle|definitionVerbatim|sourceTitle|quote)"\s*:/;

const DASHES = [
  { re: /—/g, rule: 'em dash' },
  { re: /–/g, rule: 'en dash' },
  { re: /‒/g, rule: 'figure dash' },
  { re: /―/g, rule: 'horizontal bar' },
];

const BANNED_WORDS = [
  'delve', 'delves', 'delving', 'delved',
  'robust', 'robustly', 'robustness',
  'leverage', 'leverages', 'leveraging', 'leveraged',
  'foster', 'fosters', 'fostering', 'fostered',
  'holistic', 'holistically',
  'comprehensive', 'comprehensively',
  'landscape', 'landscapes',
  'realm', 'realms',
  'moreover', 'furthermore', 'additionally', 'notably',
  'crucial', 'crucially', 'pivotal',
  'intricate', 'intricately', 'intricacies',
  'seamless', 'seamlessly',
  'underscore', 'underscores', 'underscoring', 'underscored',
  'navigate', 'navigates', 'navigating', 'navigated',
  'tapestry', 'nuanced', 'multifaceted',
];
const BANNED_PHRASES = [
  'bottom line', 'taken together', 'perhaps most importantly', 'put simply',
  "here's the thing", 'here is the thing', 'at its core',
];
const WATCH = [
  { re: /\bnot\s+[\w-]+(?:\s+[\w-]+){0,3}\s+but\s+/gi, rule: 'not X but Y pivot (capped)' },
  { re: /,\s+not\s+[\w-]+(?:\s+[\w-]+){0,3}\.(\s|$)/gi, rule: 'sentence-final X, not Y contrast (capped)' },
  { re: /\b(sits|sat|sitting|lands|landed|lives)\b/gi, rule: 'spatial verb for an abstraction (capped)' },
  { re: /\b(load-bearing|forcing function|machinery)\b/gi, rule: 'architecture metaphor (capped)' },
  { re: /(^|[.!?]\s+)(two|three|four|five)\s+(things|ways|reasons|points|lessons|moves)\b/gi, rule: 'enumeration opener (capped)' },
  { re: /\bnavigation\b/gi, rule: 'navigation (check it is UI wording, not prose)' },
];

const wordRe = new RegExp(`\\b(${BANNED_WORDS.join('|')})\\b`, 'gi');
const phraseRe = new RegExp(`(${BANNED_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

const allowPath = join(HERE, 'style-allow.txt');
const ALLOW = existsSync(allowPath)
  ? readFileSync(allowPath, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  : [];

// Web addresses are masked for the word and phrase checks (a URL such as
// .../threat-landscape-2025 is an address, not prose). Dashes are still checked.
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;

function mask(line) {
  let out = line.replace(URL_RE, (u) => ' '.repeat(u.length));
  for (const phrase of ALLOW) {
    const idx = out.toLowerCase().indexOf(phrase.toLowerCase());
    if (idx >= 0) out = out.slice(0, idx) + ' '.repeat(phrase.length) + out.slice(idx + phrase.length);
  }
  return out;
}

// For code files, keep only string literal contents, JSX or HTML text and comments;
// replace everything else with spaces so column numbers stay true.
function copyOnly(line) {
  const keep = new Array(line.length).fill(false);
  const mark = (s, e) => { for (let i = Math.max(0, s); i < Math.min(line.length, e); i++) keep[i] = true; };
  let m;
  const strRe = /(["'`])((?:\\.|(?!\1).)*)\1/g;
  while ((m = strRe.exec(line))) mark(m.index + 1, m.index + m[0].length - 1);
  const textRe = />([^<>{}]+)</g;
  while ((m = textRe.exec(line))) mark(m.index + 1, m.index + m[0].length - 1);
  const cIdx = line.search(/(\/\/|\/\*|<!--|^\s*#|^\s*\*)/);
  if (cIdx >= 0) mark(cIdx, line.length);
  return line.split('').map((ch, i) => (keep[i] ? ch : ' ')).join('');
}

function excluded(p, EXCLUDES) {
  const norm = p.replace(/\\/g, '/');
  return EXCLUDES.some((e) => norm === e || norm.startsWith(e + '/') || norm.includes('/' + e + '/') || norm.endsWith('/' + e));
}

function walk(p, out, EXCLUDES) {
  if (excluded(p, EXCLUDES)) return out;
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) {
      if (SKIP_DIRS.has(name) || name.startsWith('.DS_Store')) continue;
      walk(join(p, name), out, EXCLUDES);
    }
  } else {
    const ext = extname(p).toLowerCase();
    if (MD.has(ext) || CODE.has(ext)) out.push(p);
  }
  return out;
}

// Check one line of text. `prose` is true for Markdown and for single string values;
// false for code, where only string literals, JSX or HTML text and comments are checked.
function scanLine(raw, prose, n, add) {
  for (const d of DASHES) {
    d.re.lastIndex = 0;
    let m;
    while ((m = d.re.exec(raw))) add(n, m.index + 1, 'HARD', d.rule, raw);
  }
  const scanned = mask(prose ? raw : copyOnly(raw));
  let m;
  wordRe.lastIndex = 0;
  while ((m = wordRe.exec(scanned))) add(n, m.index + 1, 'HARD', `banned word "${m[1].toLowerCase()}"`, raw);
  phraseRe.lastIndex = 0;
  while ((m = phraseRe.exec(scanned))) add(n, m.index + 1, 'HARD', `banned phrase "${m[1].toLowerCase()}"`, raw);
  for (const w of WATCH) {
    w.re.lastIndex = 0;
    while ((m = w.re.exec(scanned))) add(n, m.index + 1, 'WATCH', w.rule, raw);
  }
}

/** Findings for one visitor-facing string, checked as prose. */
export function scanString(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (line.includes('style-scan-ignore')) return;
    scanLine(line, true, i + 1, (lineNo, col, level, rule, raw) =>
      out.push({ line: lineNo, col, level, rule, excerpt: raw.trim().slice(0, 140) }),
    );
  });
  return out;
}

/** Findings for files and folders, as the command line reports them. */
export function scanPaths(targets, excludes = []) {
  const findings = [];
  for (const t of targets) {
    if (!existsSync(t)) throw new Error(`not found: ${t}`);
    for (const file of walk(t, [], excludes)) {
      if (file.endsWith('style-scan.mjs')) continue; // the rule list itself
      const ext = extname(file).toLowerCase();
      const isMd = MD.has(ext);
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      let inFence = false;
      lines.forEach((raw, i) => {
        const n = i + 1;
        if (raw.includes('style-scan-ignore')) return;
        if (ext === '.json' && VERBATIM_KEY.test(raw)) return;
        const add = (lineNo, col, level, rule, text) =>
          findings.push({ file, line: lineNo, col, level, rule, excerpt: text.trim().slice(0, 140) });
        if (isMd && /^\s*(```|~~~)/.test(raw)) {
          // a fence line is still checked for dashes, then toggles the fence
          for (const d of DASHES) {
            d.re.lastIndex = 0;
            let m;
            while ((m = d.re.exec(raw))) add(n, m.index + 1, 'HARD', d.rule, raw);
          }
          inFence = !inFence;
          return;
        }
        if (isMd && inFence) {
          for (const d of DASHES) {
            d.re.lastIndex = 0;
            let m;
            while ((m = d.re.exec(raw))) add(n, m.index + 1, 'HARD', d.rule, raw);
          }
          return;
        }
        scanLine(raw, isMd, n, add);
      });
    }
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const watchFails = args.includes('--watch-fails');
  const excludeArg = args.find((a) => a.startsWith('--exclude='));
  const excludes = excludeArg
    ? excludeArg.slice('--exclude='.length).split(',').map((x) => x.trim().replace(/\/$/, '')).filter(Boolean)
    : [];
  const targets = args.filter((a) => !a.startsWith('--'));
  if (!targets.length) {
    console.error('usage: node labs/tools/style-scan.mjs <file-or-dir> [...] [--json] [--watch-fails]');
    process.exit(2);
  }
  let findings;
  try {
    findings = scanPaths(targets, excludes);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const hard = findings.filter((f) => f.level === 'HARD');
  const watch = findings.filter((f) => f.level === 'WATCH');
  if (asJson) {
    console.log(JSON.stringify({ hard: hard.length, watch: watch.length, findings }, null, 2));
  } else {
    for (const f of findings) console.log(`${f.file}:${f.line}:${f.col} [${f.level}] ${f.rule}: ${f.excerpt}`);
    console.log(`\nstyle-scan: ${hard.length} HARD, ${watch.length} WATCH`);
  }
  process.exit(hard.length || (watchFails && watch.length) ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
