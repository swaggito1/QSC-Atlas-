// QSC Atlas Labs: the trust ledger (labs/ledger/trust-ledger.csv) and the tier transitions
// in labs/config/autonomy.yaml. Rules: labs/context/04-trust-ledger.md.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT, addDays } from './common.mjs';
import { NEVER_AUTO_ITEM_TYPES } from './proposals.mjs';

export const LEDGER_FILE = 'labs/ledger/trust-ledger.csv';
export const COLUMNS = ['closed_at', 'pr', 'tool', 'source_url', 'source_class', 'item_type', 'proposed_action', 'would_auto_merge', 'reviewer_action', 'divergence', 'model', 'notes'];
export const SERIOUS = new Set(['status-misread', 'factual']);
const ACCEPTED = new Set(['accept', 'minor', 'auto']);

// ---- CSV ----------------------------------------------------------------------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((f) => f !== '')) rows.push(row);
  }
  return rows;
}

const quote = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function readLedger(root = ROOT) {
  const p = join(root, LEDGER_FILE);
  if (!existsSync(p)) return [];
  const [header, ...rows] = parseCsv(readFileSync(p, 'utf8'));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export function writeLedger(rows, root = ROOT) {
  const sorted = [...rows].sort((a, b) => a.closed_at.localeCompare(b.closed_at) || Number(a.pr) - Number(b.pr));
  const text = [COLUMNS.join(','), ...sorted.map((r) => COLUMNS.map((c) => quote(r[c])).join(','))].join('\n') + '\n';
  writeFileSync(join(root, LEDGER_FILE), text);
}

/** Replace the row for this pull request, or add it. */
export function upsert(rows, row) {
  const out = rows.filter((r) => String(r.pr) !== String(row.pr));
  out.push(row);
  return out;
}

// ---- tier changes on the YAML document ------------------------------------------

function pairNode(doc, cls, itemType, create = false) {
  let pairs = doc.get('pairs');
  if (!pairs) {
    doc.set('pairs', doc.createNode([]));
    pairs = doc.get('pairs');
  }
  let node = pairs.items.find((n) => n.get('class') === cls && n.get('item_type') === itemType);
  if (!node && create) {
    node = doc.createNode({ class: cls, item_type: itemType, tier: 'review', since: null });
    pairs.items.push(node);
  }
  return node ?? null;
}

/** A status misread or factual error: review for 60 days, counter reset. Never needs approval. */
export function demote(doc, cls, itemType, today, days) {
  const node = pairNode(doc, cls, itemType, true);
  node.set('tier', 'review');
  node.set('since', today);
  node.set('demoted_until', addDays(today, days));
  node.set('counter_reset_at', today);
  node.delete('reshadow_until');
  return `demoted ${cls} / ${itemType} to review until ${addDays(today, days)}`;
}

/** After a model change, every graduated pair goes back to shadow for 14 days. */
export function applyReshadow(doc, today) {
  const cfg = doc.toJS();
  const changed = cfg.model?.changed_at ? String(cfg.model.changed_at) : null;
  const days = cfg.window?.model_change_reshadow_days ?? 14;
  const notes = [];
  if (!changed || today >= addDays(changed, days)) return notes;
  for (const node of doc.get('pairs')?.items ?? []) {
    if (node.get('tier') !== 'auto-merge') continue;
    const done = node.get('reshadowed_at');
    if (done && String(done) >= changed) continue;
    node.set('tier', 'shadow');
    node.set('since', today);
    node.set('reshadow_until', addDays(changed, days));
    node.set('reshadowed_at', today);
    notes.push(`model changed on ${changed}: ${node.get('class')} / ${node.get('item_type')} back to shadow until ${addDays(changed, days)}`);
  }
  return notes;
}

// ---- the record per pair ----------------------------------------------------------

/** Items closed, the current clean run, and the accept-or-minor rate over that run. */
export function pairStats(rows, cls, itemType, { counterResetAt = null, rule } = {}) {
  const mine = rows.filter((r) => r.source_class === cls && r.item_type === itemType).sort((a, b) => a.closed_at.localeCompare(b.closed_at));
  let run = 0;
  let accepted = 0;
  let lastSerious = null;
  for (let i = mine.length - 1; i >= 0; i--) {
    const r = mine[i];
    if (SERIOUS.has(r.divergence)) {
      lastSerious = r;
      break;
    }
    if (counterResetAt && r.closed_at.slice(0, 10) < counterResetAt) break;
    if (r.reviewer_action === 'unlabelled' || r.reviewer_action === '') continue;
    run++;
    if (ACCEPTED.has(r.reviewer_action)) accepted++;
  }
  const rate = run ? accepted / run : 0;
  const meets = Boolean(rule) && run >= rule.min_consecutive && rate >= rule.min_accept_or_minor_rate;
  return { closed: mine.length, run, accepted, rate, meets, lastSerious };
}

export function mayGraduate(pair, stats, config, today) {
  const never = new Set([...(config.never_graduate?.item_types ?? []), ...NEVER_AUTO_ITEM_TYPES]);
  if (never.has(pair.item_type)) return false;
  if (pair.tier !== 'review') return false;
  if (pair.demoted_until && String(pair.demoted_until) > today) return false;
  return stats.meets;
}

export function loadAutonomyDoc(root = ROOT) {
  return YAML.parseDocument(readFileSync(join(root, 'labs/config/autonomy.yaml'), 'utf8'));
}

export function saveAutonomyDoc(doc, root = ROOT) {
  writeFileSync(join(root, 'labs/config/autonomy.yaml'), doc.toString({ lineWidth: 0 }));
}
