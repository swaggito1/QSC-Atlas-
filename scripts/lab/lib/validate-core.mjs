// QSC Atlas Labs: validate lab datasets against their schemas and invariants.
// Used by scripts/lab/validate.mjs (every file) and scripts/lab/check-proposals.mjs
// (one patched file, in memory).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { datasetFor } from '../../../src/lib/lab/schema.ts';
import { CORE_RULES } from './invariants.mjs';
import { ROOT, listFiles, pathString, rel, today } from './common.mjs';

// Snapshots and state are machine records of external text, checked by the watcher itself.
export const SKIP = ['data/lab/watch'];

const extraRules = new Map();
/** Rules added by tool prompts: every default export in scripts/lab/invariants/*.mjs. */
export async function toolRules(root = ROOT) {
  if (extraRules.has(root)) return extraRules.get(root);
  const dir = join(root, 'scripts', 'lab', 'invariants');
  const rules = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs') && !n.endsWith('.test.mjs')).sort()) {
      const mod = await import(pathToFileURL(join(dir, f)).href);
      rules.push(...(mod.default ?? []));
    }
  }
  extraRules.set(root, rules);
  return rules;
}

/**
 * Validate one dataset given its path (relative to the repository root) and parsed JSON.
 * Returns failures as { file, path, rule, message }.
 */
export function validateData(relPath, data, { rules = CORE_RULES, env = process.env } = {}) {
  const failures = [];
  const dataset = datasetFor(relPath);
  if (!dataset) {
    return [{ file: relPath, path: '(file)', rule: 'schema', message: 'no schema is registered for this file in src/lib/lab/schema.ts (DATASETS)' }];
  }
  const parsed = dataset.schema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      failures.push({ file: relPath, path: pathString(issue.path), rule: 'schema', message: issue.message });
    }
  }
  const ctx = { today: today(env) };
  for (const rule of rules) {
    if (rule.appliesTo && !rule.appliesTo(relPath)) continue;
    for (const f of rule.check({ rel: relPath, data, tool: dataset.tool }, ctx)) {
      failures.push({ file: relPath, path: pathString(f.path), rule: rule.id, message: f.message });
    }
  }
  return failures;
}

/** Validate every file under data/lab/ except the watch folder. */
export async function validateAll({ root = ROOT, env = process.env } = {}) {
  const rules = [...CORE_RULES, ...(await toolRules(root))];
  const failures = [];
  const files = listFiles(join(root, 'data', 'lab'), { root, skip: SKIP });
  for (const abs of files) {
    const r = rel(abs, root);
    if (r.endsWith('/README.md')) continue;
    if (!r.endsWith('.json')) {
      failures.push({ file: r, path: '(file)', rule: 'schema', message: 'only JSON datasets belong in data/lab/' });
      continue;
    }
    let data;
    try {
      data = JSON.parse(readFileSync(abs, 'utf8'));
    } catch (err) {
      failures.push({ file: r, path: '(file)', rule: 'json', message: `not valid JSON: ${err.message}` });
      continue;
    }
    failures.push(...validateData(r, data, { rules, env }));
  }
  return { files: files.length, failures };
}

export function formatFailure(f) {
  return `FAIL ${f.file} :: ${f.path} :: ${f.rule} :: ${f.message}`;
}
