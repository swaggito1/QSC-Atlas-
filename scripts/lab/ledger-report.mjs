#!/usr/bin/env node
// QSC Atlas Labs: the monthly trust-ledger report.
// Usage: node scripts/lab/ledger-report.mjs [--write labs/ledger/STATUS.md] [--apply-transitions]
//          [--candidates labs/.watch/graduation.json]
// Computes, per source class and item type: items closed, the current run without a status
// misread or factual error, and the accept-or-minor rate over that run, against the graduation
// rule in labs/config/autonomy.yaml. With --apply-transitions (alias --apply-demotions) it applies
// the transitions the autonomy header assigns to it: clearing expired demotions (eligible again,
// never graduated), ending the shadow window, and applying and lifting the model-change
// re-shadow. It also checks the watch pipeline's health and the age of the canonical data.
// Graduation itself is only ever proposed (propose-graduation.mjs); Swann merges it or not.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, addDays, isMain, today } from './lib/common.mjs';
import { gitOrNull } from './lib/git.mjs';
import { SERIOUS, applyReshadow, loadAutonomyDoc, mayGraduate, pairStats, readLedger, saveAutonomyDoc } from './lib/ledger.mjs';

const pct = (x) => `${Math.round(x * 100)} per cent`;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a.slice(0, 10) + 'T00:00:00Z')) / 86_400_000);

/** Apply the monthly tier transitions to the YAML document; returns notes. */
export function applyTransitions(doc, rows, now) {
  const notes = [];
  const cfg = doc.toJS();
  const rule = cfg.window?.graduation;
  for (const node of doc.get('pairs')?.items ?? []) {
    const until = node.get('demoted_until');
    if (until && String(until) <= now) {
      node.delete('demoted_until');
      notes.push(`${node.get('class')} / ${node.get('item_type')}: demotion ended on ${until}; eligible to graduate again, still in review`);
    }
  }
  const started = cfg.window?.started_at ? String(cfg.window.started_at) : null;
  if (started && now >= addDays(started, cfg.window?.shadow_days ?? 30)) {
    for (const node of doc.get('pairs')?.items ?? []) {
      if (node.get('tier') === 'shadow' && !node.get('reshadow_until')) {
        node.set('tier', 'review');
        node.set('since', now);
        notes.push(`${node.get('class')} / ${node.get('item_type')}: shadow window ended; now in review`);
      }
    }
  }
  notes.push(...applyReshadow(doc, now));
  for (const node of doc.get('pairs')?.items ?? []) {
    const until = node.get('reshadow_until');
    if (!until || String(until) > now) continue;
    const stats = pairStats(rows, node.get('class'), node.get('item_type'), { counterResetAt: node.get('counter_reset_at') ?? null, rule });
    const changed = String(cfg.model?.changed_at ?? '');
    const errorSinceChange = rows.some((r) => r.source_class === node.get('class') && r.item_type === node.get('item_type') && r.closed_at >= changed && SERIOUS.has(r.divergence));
    const back = stats.meets && !errorSinceChange;
    node.set('tier', back ? 'auto-merge' : 'review');
    node.set('since', now);
    node.delete('reshadow_until');
    notes.push(`${node.get('class')} / ${node.get('item_type')}: re-shadow ended; ${back ? 'back to auto-merge (record still meets the rule)' : 'to review (record no longer meets the rule)'}`);
  }
  return notes;
}

function watchHealth(root, now) {
  const p = join(root, 'data/lab/watch/state.json');
  if (!existsSync(p)) return { lastRun: null, failing: [] };
  const sources = JSON.parse(readFileSync(p, 'utf8')).sources ?? {};
  const attempts = Object.values(sources).map((s) => s.lastAttempt).filter(Boolean).sort();
  const failing = Object.entries(sources).filter(([, s]) => (s.consecutiveFailures ?? 0) > 2).map(([id, s]) => ({ id, n: s.consecutiveFailures, error: s.lastError }));
  const lastRun = attempts.pop() ?? null;
  return { lastRun, age: lastRun ? daysBetween(lastRun, now) : null, failing };
}

/** Build the report; returns { markdown, candidates, notes }. */
export function buildReport({ root = ROOT, now = today(), apply = false, repo = process.env.GITHUB_REPOSITORY ?? 'swaggito1/QSC-Atlas-', git = gitOrNull } = {}) {
  const rows = readLedger(root);
  const doc = loadAutonomyDoc(root);
  const notes = apply ? applyTransitions(doc, rows, now) : [];
  if (apply && notes.length) saveAutonomyDoc(doc, root);
  const cfg = doc.toJS();
  const rule = cfg.window?.graduation ?? {};

  const pairs = (cfg.pairs ?? []).map((p) => {
    const stats = pairStats(rows, p.class, p.item_type, { counterResetAt: p.counter_reset_at ?? null, rule });
    return { ...p, stats, candidate: mayGraduate(p, stats, cfg, now) };
  });
  const candidates = pairs.filter((p) => p.candidate).map((p) => ({
    class: p.class,
    item_type: p.item_type,
    run: p.stats.run,
    rate: p.stats.rate,
    closed: p.stats.closed,
    evidence: rows.filter((r) => r.source_class === p.class && r.item_type === p.item_type).slice(-p.stats.run - 5),
  }));
  const unlabelled = rows.filter((r) => r.reviewer_action === 'unlabelled' || r.reviewer_action === '');
  const health = watchHealth(root, now);
  const lastData = git(['log', '-1', '--format=%cs', '--', 'data/results', 'data/profiles'], { cwd: root });

  // one line on whether error rates moved, comparing the last 60 days with the 60 before
  const window = (from, to) => rows.filter((r) => r.closed_at.slice(0, 10) >= from && r.closed_at.slice(0, 10) < to && r.reviewer_action !== 'unlabelled');
  const recent = window(addDays(now, -60), addDays(now, 1));
  const earlier = window(addDays(now, -120), addDays(now, -60));
  const errRate = (rs) => (rs.length ? rs.filter((r) => SERIOUS.has(r.divergence)).length / rs.length : null);
  const [a, b] = [errRate(earlier), errRate(recent)];
  const moved =
    a === null || b === null
      ? 'Not enough labelled items yet to compare error rates between periods.'
      : Math.abs(b - a) >= 0.05
        ? `The serious-error rate moved from ${pct(a)} to ${pct(b)} between the previous 60 days and the last 60; check whether the pinned model or a source changed.`
        : `The serious-error rate held steady (${pct(a)} before, ${pct(b)} in the last 60 days).`;

  const md = [
    '# Lab trust ledger: status',
    '',
    `Written by \`scripts/lab/ledger-report.mjs\` on ${now}. The rules are in \`labs/context/04-trust-ledger.md\`; the tiers in \`labs/config/autonomy.yaml\`. Triage model: \`${cfg.model?.pinned ?? 'not set'}\`, pinned since ${cfg.model?.changed_at ?? 'unknown'}.`,
    '',
    rows.length
      ? `The ledger holds ${rows.length} closed pull request(s). A pair graduates after ${rule.min_consecutive} consecutive labelled items with an accept-or-minor rate of at least ${pct(rule.min_accept_or_minor_rate ?? 0.95)} and no status misread or factual error.`
      : 'The ledger is still empty: no lab-watch pull request has closed yet.',
    '',
    '## Pairs',
    '',
    '| Source class | Item type | Tier | Closed | Current run | Accept or minor | Meets the rule |',
    '|---|---|---|---|---|---|---|',
    ...pairs.map((p) => `| ${p.class} | ${p.item_type} | ${p.tier}${p.demoted_until ? ` (demoted until ${p.demoted_until})` : ''}${p.reshadow_until ? ` (re-shadow until ${p.reshadow_until})` : ''} | ${p.stats.closed} | ${p.stats.run} | ${p.stats.run ? pct(p.stats.rate) : 'n/a'} | ${p.stats.meets ? 'yes' : 'no'} |`),
    '',
    `Window: ${cfg.window?.started_at ? `shadow started on ${cfg.window.started_at}, ${cfg.window.shadow_days} days` : 'not started (set window.started_at after the first weekly watch run)'}.`,
    '',
    '## Changes applied this run',
    '',
    ...(notes.length ? notes.map((n) => `- ${n}`) : ['None.']),
    '',
    '## Graduation candidates',
    '',
    ...(candidates.length ? candidates.map((c) => `- ${c.class} / ${c.item_type}: ${c.run} clean items, ${pct(c.rate)} accepted or minor. A pull request proposes the change; it waits for Swann.`) : ['None this month.']),
    '',
    '## Waiting for a review label',
    '',
    ...(unlabelled.length ? unlabelled.map((r) => `- [Pull request ${r.pr}](https://github.com/${repo}/pull/${r.pr}): ${r.source_class} / ${r.item_type}, closed ${r.closed_at.slice(0, 10)}. Add one \`review:\` label (and a \`divergence:\` label unless it is an accept); the ledger updates itself.`) : ['None.']),
    '',
    '## Watch pipeline',
    '',
    health.lastRun
      ? `Last watch run: ${health.lastRun.slice(0, 10)}, ${health.age} day(s) ago.${health.age >= 10 ? ' **That is 10 days or more: check that the lab-watch workflow is still scheduled (GitHub disables schedules in public repositories after 60 days without activity).**' : ''}`
      : '**No watch run has been recorded yet.** Trigger lab-watch once by hand from the Actions tab.',
    '',
    ...(health.failing.length ? ['Sources failing for more than two runs in a row:', '', ...health.failing.map((f) => `- \`${f.id}\`: ${f.n} failures, last error "${f.error}"`)] : ['No source has failed more than two runs in a row.']),
    '',
    '## Canonical data',
    '',
    lastData
      ? `The last commit touching \`data/results/\` or \`data/profiles/\` is dated ${lastData}${daysBetween(lastData, now) > 30 ? `, ${daysBetween(lastData, now)} days ago. The lab tools read these files at build time, so commit and push the scraper's output (or pull Notion corrections back with \`scripts/export-profiles.mjs\`) to keep them current.` : '.'}`
      : 'Could not read the git history of the canonical data.',
    '',
    '## Error rates',
    '',
    moved,
    '',
  ].join('\n');
  return { markdown: md, candidates, notes };
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const apply = args.includes('--apply-transitions') || args.includes('--apply-demotions');
  const { markdown, candidates, notes } = buildReport({ apply });
  const out = val('--write');
  if (out) {
    mkdirSync(dirname(join(ROOT, out)), { recursive: true });
    writeFileSync(join(ROOT, out), markdown);
    console.log(`wrote ${out}`);
  } else console.log(markdown);
  const cand = val('--candidates');
  if (cand) {
    mkdirSync(dirname(join(ROOT, cand)), { recursive: true });
    writeFileSync(join(ROOT, cand), JSON.stringify(candidates, null, 2) + '\n');
    console.log(`${candidates.length} graduation candidate(s) written to ${cand}`);
  }
  for (const n of notes) console.log(`autonomy: ${n}`);
}
