// QSC Atlas Labs: the autonomy rules in labs/config/autonomy.yaml.
// Decides whether a lab-watch pull request may merge itself, and records tier changes.
// The never-graduate rules are applied first; only then does the pair's tier matter.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import YAML from 'yaml';
import { ROOT } from './common.mjs';
import { NEVER_AUTO_ITEM_TYPES } from './proposals.mjs';

export const AUTONOMY_FILE = 'labs/config/autonomy.yaml';

/** The parsed file, and the YAML document (kept for writing back with its comments). */
export function loadAutonomy(root = ROOT) {
  const doc = YAML.parseDocument(readFileSync(join(root, AUTONOMY_FILE), 'utf8'));
  return { doc, config: doc.toJS() };
}

export function saveAutonomy(doc, root = ROOT) {
  writeFileSync(join(root, AUTONOMY_FILE), doc.toString({ lineWidth: 0 }));
}

const globRe = (g) => new RegExp('^' + g.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');

const moduleRules = new Map();
/** Code rules added by tool prompts: scripts/lab/autonomy-rules/*.mjs, default export [{ id, reason, applies(meta, files) }]. */
export async function loadModuleRules(root = ROOT) {
  if (moduleRules.has(root)) return moduleRules.get(root);
  const rules = [];
  const dir = join(root, 'scripts', 'lab', 'autonomy-rules');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs') && !n.endsWith('.test.mjs')).sort()) {
      rules.push(...((await import(pathToFileURL(join(dir, f)).href)).default ?? []));
    }
  }
  moduleRules.set(root, rules);
  return rules;
}

/** Why this change can never merge itself, or null. */
export function neverReason(meta, files, config, rules = []) {
  const ng = config.never_graduate ?? {};
  const itemTypes = new Set([...(ng.item_types ?? []), ...NEVER_AUTO_ITEM_TYPES]);
  if (itemTypes.has(meta.itemType)) return `${meta.itemType} items never graduate`;
  if ((ng.tools ?? []).includes(meta.tool)) return `${meta.tool} changes never graduate`;
  if (meta.needsHuman) return 'the proposal asks for human review';
  const outside = files.filter((f) => !f.startsWith('data/lab/') || f.startsWith('data/lab/watch/'));
  if (outside.length) return `the change touches files outside the lab data: ${outside.join(', ')}`;
  if (!files.length) return 'the change touches no file';
  const protectedFile = files.find((f) => (ng.files ?? []).some((g) => globRe(g).test(f)));
  if (protectedFile) return `${protectedFile} is on the never-graduate list`;
  for (const r of rules) if (r.applies(meta, files)) return r.reason ?? r.id;
  return null;
}

export function findPair(config, sourceClass, itemType) {
  return (config.pairs ?? []).find((p) => p.class === sourceClass && p.item_type === itemType) ?? null;
}

/**
 * Whether a change may merge itself. With asIfGraduated, answers the shadow-mode question
 * the ledger records as would_auto_merge: eligible if its pair were already graduated.
 */
export function eligibility({ meta, files, labels = [], config, today, rules = [], asIfGraduated = false }) {
  if (labels.includes('needs-human')) return { eligible: false, reason: 'labelled needs-human' };
  const never = neverReason(meta, files, config, rules);
  if (never) return { eligible: false, reason: never };
  if (asIfGraduated) return { eligible: true, reason: 'eligible if its pair were graduated' };
  const pair = findPair(config, meta.sourceClass, meta.itemType);
  if (!pair) return { eligible: false, reason: `no pair for ${meta.sourceClass} / ${meta.itemType}` };
  if (pair.demoted_until && pair.demoted_until > today) return { eligible: false, reason: `demoted until ${pair.demoted_until}` };
  if (pair.reshadow_until && pair.reshadow_until > today) return { eligible: false, reason: `back in shadow after a model change until ${pair.reshadow_until}` };
  if (pair.tier !== 'auto-merge') return { eligible: false, reason: `the pair is in ${pair.tier}` };
  return { eligible: true, reason: 'graduated pair' };
}
