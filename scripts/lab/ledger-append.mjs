#!/usr/bin/env node
// QSC Atlas Labs: record the outcome of one closed lab-watch pull request in the trust ledger.
// Runs in the lab-ledger workflow when such a pull request closes, and again whenever a closed
// one is labelled, so the row is upserted by pull request number: a review label added after
// closing replaces the "unlabelled" row.
// Reads PR_NUMBER, PR_MERGED, PR_CLOSED_AT, PR_LABELS (JSON array of names), PR_BODY and
// PR_AUTO_MERGED from the environment.
// A divergence:status-misread or divergence:factual label demotes the pair at once (tier
// review for 60 days, counter reset); demotion never needs approval. Within 14 days of a model
// change, graduated pairs that have not been re-shadowed yet go back to shadow.

import { ROOT, isMain, today } from './lib/common.mjs';
import { parseLabMeta } from './lib/proposals.mjs';
import { SERIOUS, applyReshadow, demote, loadAutonomyDoc, readLedger, saveAutonomyDoc, upsert, writeLedger } from './lib/ledger.mjs';

export function rowFromEnv(env) {
  const labels = JSON.parse(env.PR_LABELS || '[]').map((l) => (typeof l === 'string' ? l : l.name));
  const meta = parseLabMeta(env.PR_BODY) ?? {};
  const label = (prefix) => labels.find((l) => l.startsWith(prefix))?.slice(prefix.length) ?? '';
  const merged = env.PR_MERGED === 'true';
  const review = label('review:');
  return {
    closed_at: env.PR_CLOSED_AT || new Date().toISOString(),
    pr: String(env.PR_NUMBER),
    tool: meta.tool ?? label('tool:'),
    source_url: meta.sourceUrl ?? '',
    source_class: meta.sourceClass ?? label('class:'),
    item_type: meta.itemType ?? label('item:'),
    proposed_action: meta.proposedAction ?? '',
    would_auto_merge: meta.wouldAutoMerge === undefined ? '' : String(meta.wouldAutoMerge),
    reviewer_action: review || (merged && env.PR_AUTO_MERGED === 'true' ? 'auto' : 'unlabelled'),
    divergence: label('divergence:'),
    model: meta.model ?? '',
    notes: merged ? 'merged' : 'closed without merging',
  };
}

export function appendOutcome(env, { root = ROOT, now = today(env) } = {}) {
  const row = rowFromEnv(env);
  writeLedger(upsert(readLedger(root), row), root);
  const doc = loadAutonomyDoc(root);
  const notes = [];
  if (SERIOUS.has(row.divergence) && row.source_class && row.item_type) {
    notes.push(demote(doc, row.source_class, row.item_type, now, doc.toJS().window?.demotion_days ?? 60));
  }
  notes.push(...applyReshadow(doc, now));
  if (notes.length) saveAutonomyDoc(doc, root);
  return { row, notes };
}

if (isMain(import.meta.url)) {
  const { row, notes } = appendOutcome(process.env);
  console.log(`ledger: PR ${row.pr} ${row.source_class} / ${row.item_type}: ${row.reviewer_action}${row.divergence ? `, ${row.divergence}` : ''}`);
  for (const n of notes) console.log(`autonomy: ${n}`);
}
