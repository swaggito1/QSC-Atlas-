// QSC Atlas Labs: proposals written by the triage step, and the lab-meta block that travels
// with each pull request. Shared by check-proposals.mjs, open-prs.mjs, autonomy-check.mjs
// and ledger-append.mjs.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { scanString } from '../../../labs/tools/style-scan.mjs';
import { applyPatch, getAt, parsePointer } from './jsonpatch.mjs';
import { validateData, toolRules } from './validate-core.mjs';
import { CORE_RULES, MAX_EXCERPT_WORDS, VERBATIM_KEYS } from './invariants.mjs';
import { ROOT, wordCount } from './common.mjs';

export const TOOLS = ['exposure', 'cascade', 'rulebook', 'shared', 'fixture'];
export const SOURCE_CLASSES = ['trusted-institutional', 'new-institutional', 'secondary'];
export const ITEM_TYPES = ['new-record', 'field-change', 'status-change', 'survey-update', 'narrative-draft', 'profile-proposal'];
// Item types that always wait for Swann, whatever the ledger says.
export const NEVER_AUTO_ITEM_TYPES = ['status-change', 'survey-update', 'narrative-draft', 'profile-proposal'];
export const MAX_SUMMARY_WORDS = 80;

/** Proposal files in a folder; names beginning with "_" are logs and are skipped. */
export function listProposalFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => join(dir, f));
}

/** Target paths must stay inside data/lab/, outside the watch folder. */
export function targetIsAllowed(targetFile) {
  if (typeof targetFile !== 'string' || targetFile.includes('..') || targetFile.startsWith('/')) return false;
  const norm = normalize(targetFile).split('\\').join('/');
  return norm === targetFile && /^data\/lab\/.+\.json$/.test(norm) && !norm.startsWith('data/lab/watch/');
}

/** Every string in the proposal that is not quoted verbatim, with its location. */
function styleFindings(proposal) {
  const out = [];
  const visit = (v, path, key) => {
    if (typeof v === 'string') {
      if (VERBATIM_KEYS.has(key)) return;
      for (const f of scanString(v)) if (f.level === 'HARD') out.push(`${path}: house style: ${f.rule} in "${f.excerpt}"`);
      return;
    }
    if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${path}[${i}]`, key));
    if (v && typeof v === 'object') {
      // a patch operation that writes a verbatim field carries its text under "value"
      const tail = typeof v.path === 'string' && 'value' in v ? parsePointer(v.path).pop() : null;
      for (const [k, x] of Object.entries(v)) {
        if (k === 'value' && tail && VERBATIM_KEYS.has(tail)) continue;
        visit(x, path ? `${path}.${k}` : k, k);
      }
    }
  };
  visit(proposal, '', null);
  return out;
}

/**
 * Check one proposal. Returns { errors, flags, proposal, before, after }.
 * `before` is the current target (null for a new file) and `after` the patched result.
 */
export async function checkProposal(file, { root = ROOT, env = process.env } = {}) {
  const errors = [];
  const flags = [];
  let p;
  try {
    p = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    return { errors: [`not valid JSON: ${err.message}`], flags, proposal: null, before: null, after: null };
  }

  const need = (cond, msg) => cond || errors.push(msg);
  need(TOOLS.includes(p.tool), `tool must be one of ${TOOLS.join(', ')}`);
  need(typeof p.sourceId === 'string' && p.sourceId, 'sourceId is required');
  need(SOURCE_CLASSES.includes(p.sourceClass), `sourceClass must be one of ${SOURCE_CLASSES.join(', ')}`);
  need(ITEM_TYPES.includes(p.itemType), `itemType must be one of ${ITEM_TYPES.join(', ')}`);
  need(typeof p.title === 'string' && p.title.trim(), 'title is required');
  need(typeof p.summary === 'string' && p.summary.trim(), 'summary is required');
  if (typeof p.summary === 'string') need(wordCount(p.summary) <= MAX_SUMMARY_WORDS, `summary has ${wordCount(p.summary)} words; the limit is ${MAX_SUMMARY_WORDS}`);
  need(typeof p.needsHuman === 'boolean', 'needsHuman must be true or false');
  need(Array.isArray(p.openQuestions), 'openQuestions must be an array (empty when there are none)');
  need(targetIsAllowed(p.targetFile), `targetFile must be a JSON file inside data/lab/ (not data/lab/watch/): got ${JSON.stringify(p.targetFile)}`);

  const prov = p.provenance ?? {};
  need(typeof prov.url === 'string' && /^https?:\/\//.test(prov.url), 'provenance.url must be a web address');
  need(typeof prov.retrievedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prov.retrievedAt), 'provenance.retrievedAt must be YYYY-MM-DD');
  need(typeof prov.excerpt === 'string' && prov.excerpt.trim(), 'provenance.excerpt is required');
  if (typeof prov.excerpt === 'string') need(wordCount(prov.excerpt) <= MAX_EXCERPT_WORDS, `provenance.excerpt has ${wordCount(prov.excerpt)} words; the limit is ${MAX_EXCERPT_WORDS}`);

  const op = p.operation ?? {};
  let before = null;
  let after = null;
  if (errors.length === 0) {
    const abs = join(root, p.targetFile);
    try {
      if (op.type === 'json-patch') {
        if (!existsSync(abs)) throw new Error(`${p.targetFile} does not exist; use a "create" operation for a new file`);
        before = JSON.parse(readFileSync(abs, 'utf8'));
        after = applyPatch(before, op.ops);
      } else if (op.type === 'create') {
        if (existsSync(abs)) throw new Error(`${p.targetFile} already exists; use a "json-patch" operation`);
        if (!op.record || typeof op.record !== 'object') throw new Error('a "create" operation needs the full file under "record"');
        after = op.record;
      } else {
        throw new Error('operation.type must be "json-patch" or "create"');
      }
    } catch (err) {
      errors.push(`the change does not apply: ${err.message}`);
    }
  }
  if (after) {
    const rules = [...CORE_RULES, ...(await toolRules(root))];
    for (const f of validateData(p.targetFile, after, { rules, env })) errors.push(`after the change, ${f.path} :: ${f.rule} :: ${f.message}`);
  }
  errors.push(...styleFindings(p));

  if (NEVER_AUTO_ITEM_TYPES.includes(p.itemType)) flags.push(`${p.itemType} is never auto-mergeable`);
  if (p.needsHuman) flags.push('needs human review');
  return { errors, flags, proposal: p, before, after };
}

// ---- before and after, for the pull request body -------------------------------

const show = (v) => {
  if (v === undefined) return '(absent)';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 160 ? s.slice(0, 157) + '...' : s;
};

/** Rows of { path, before, after } describing what the proposal changes. */
export function changeRows(proposal, before) {
  const op = proposal.operation;
  if (op.type === 'create') return [{ path: proposal.targetFile, before: '(new file)', after: show(op.record) }];
  // "test" operations are safety checks that change nothing, so they have no row
  return op.ops
    .filter((o) => o.op !== 'test')
    .map((o) => ({
      path: o.path,
      before: o.op === 'add' ? '(absent)' : show(getAt(before, o.path)),
      after: o.op === 'remove' ? '(removed)' : show(o.value ?? getAt(before, o.from)),
    }));
}

/** One line describing the proposed action, for the ledger. */
export function proposedAction(proposal) {
  const op = proposal.operation;
  if (op.type === 'create') return `create ${proposal.targetFile}`;
  return op.ops.map((o) => `${o.op} ${o.path}`).join('; ');
}

// ---- the lab-meta block ---------------------------------------------------------

/** "<!-- lab-meta {json} -->", with ">" escaped so the comment cannot close early. */
export function formatLabMeta(meta) {
  return `<!-- lab-meta ${JSON.stringify(meta).replace(/>/g, '\\u003e')} -->`;
}

export function parseLabMeta(body) {
  const m = /<!--\s*lab-meta\s+([\s\S]*?)\s*-->/.exec(body ?? '');
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}
