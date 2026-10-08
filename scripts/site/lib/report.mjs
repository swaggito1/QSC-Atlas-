// qscatlas.org site checks: findings as Swann reads them at the end of site:check.
//
// One mistake in a shared component shows on every page of every mode, so findings are grouped
// by level, rule and the words they were found in: one group names how many files and which
// modes, gives a few files as examples, and, for the site's own words, where in src/ or data/
// the words are written ("look in"). A finding in one of Swann's records already names the
// record. --json output stays one finding per entry, for machines.

import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { ROOT, rel, walkFiles } from './common.mjs';
import { squash } from './text.mjs';

/** Groups of findings, errors first, each { level, rule, words, findings, files, modes }. */
export function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = `${f.level}\u0000${f.rule}\u0000${f.group ?? ''}`;
    if (!groups.has(key)) groups.set(key, { level: f.level, rule: f.rule, words: f.group ?? '', hit: f.hit ?? null, findings: [] });
    groups.get(key).findings.push(f);
  }
  const out = [...groups.values()].map((g) => ({
    ...g,
    files: [...new Set(g.findings.map((f) => f.file).filter(Boolean))],
    modes: [...new Set(g.findings.map((f) => f.mode))],
  }));
  const rank = (g) => (g.level === 'warn' ? 1 : 0);
  return out.sort((a, b) => rank(a) - rank(b) || b.findings.length - a.findings.length);
}

const SOURCE_EXT = new Set(['.astro', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.mdx', '.css', '.yaml', '.yml', '.csv']);
const NOT_SOURCES = new Set(['watch', 'candidates', 'routine', 'node_modules', '.DS_Store']);

/**
 * A finder for the source of some words: the files under src/ and data/ that hold them, with the
 * line where it can be told. Reads each file once, on first use.
 */
export function makeLookIn(root = ROOT) {
  let corpus = null;
  const load = () => {
    corpus = [];
    for (const dir of ['src', 'data']) {
      for (const abs of walkFiles(join(root, dir), (_, name) => NOT_SOURCES.has(name))) {
        if (!SOURCE_EXT.has(extname(abs).toLowerCase())) continue;
        const text = readFileSync(abs, 'utf8');
        corpus.push({ file: rel(abs, root), text, flat: squash(text) });
      }
    }
  };
  return (needles) => {
    if (!corpus) load();
    for (const raw of needles) {
      const needle = squash(raw);
      if (needle.length < 8) continue;
      const hits = [];
      for (const c of corpus) {
        if (!c.flat.includes(needle)) continue;
        const lines = c.text.split('\n');
        const at = lines.findIndex((l) => squash(l).includes(needle));
        hits.push(at >= 0 ? `${c.file}:${at + 1}` : c.file);
        if (hits.length >= 3) break;
      }
      if (hits.length) return hits;
    }
    return [];
  };
}

/** The words around a finding to look for in the source: before it, from it, and the start of the segment. */
export function needlesOf(words, hit) {
  if (!words) return [];
  const at = typeof hit === 'number' ? hit : 0;
  return [words.slice(Math.max(0, at - 25), at + 5), words.slice(at, at + 30), words.slice(0, 30)];
}

const list = (xs, n) => (xs.length > n ? `${xs.slice(0, n).join(', ')} and ${xs.length - n} more` : xs.join(', '));

/** The lines of one group for the terminal. */
export function formatGroup(g, lookIn = null) {
  const where = (f) => (f.file ? `${f.file}${f.line ? `:${f.line}${f.col ? `:${f.col}` : ''}` : ''}` : '(build)');
  const count = g.files.length > 1 ? `${g.files.length} files` : g.files.length === 1 ? '1 file' : `${g.findings.length} finding(s)`;
  const out = [`${g.level === 'warn' ? '[warn] ' : ''}${g.rule} (${count}; ${g.modes.length > 1 ? 'modes' : 'mode'} ${list(g.modes, 4)})`];
  // one example per file: its first place
  const examples = [...new Map(g.findings.map((f) => [f.file ?? '(build)', where(f)])).values()];
  if (examples.length && !(examples.length === 1 && examples[0] === '(build)')) out.push(`    at ${list(examples, 3)}`);
  const excerpt = g.findings[0]?.excerpt;
  if (excerpt) out.push(`    ${excerpt.length > 180 ? `${excerpt.slice(0, 180)}...` : excerpt}`);
  if (lookIn && g.words && !/in a record Swann edits/.test(g.rule)) {
    const hits = lookIn(needlesOf(g.words, g.hit));
    out.push(`    look in: ${hits.length ? hits.join(', ') : 'not found as written in src/ or data/'}`);
  }
  return out.join('\n');
}

/** Counts per mode: { [mode]: { errors, warnings } }. */
export function countByMode(byMode) {
  const out = {};
  for (const [mode, findings] of Object.entries(byMode)) {
    out[mode] = { errors: findings.filter((f) => f.level !== 'warn').length, warnings: findings.filter((f) => f.level === 'warn').length };
  }
  return out;
}

/** "clean", "3 findings, 2 warnings" and so on. */
export function describeCounts({ errors, warnings }) {
  const parts = [errors ? `${errors} finding${errors === 1 ? '' : 's'}` : 'clean'];
  if (warnings) parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  return parts.join(', ');
}
