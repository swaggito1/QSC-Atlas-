#!/usr/bin/env node
// QSC Atlas Labs: turn each valid proposal into its own branch and pull request.
// Usage: node scripts/lab/open-prs.mjs [labs/.watch/proposals] [--dry-run]
// Needs git and the GitHub CLI (gh) with GH_TOKEN set; --dry-run prints each pull request
// it would open and touches neither git nor GitHub. Files beginning with "_" are skipped.
// Branch: lab-watch/<date>-<sourceId>-<n>. Labels: lab-watch, tool:<tool>, class:<class>,
// item:<itemType>, and needs-human when set.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { checkProposal, changeRows, formatLabMeta, listProposalFiles, proposedAction, ITEM_TYPES, SOURCE_CLASSES, TOOLS } from './lib/proposals.mjs';
import { eligibility, loadAutonomy, loadModuleRules } from './lib/autonomy.mjs';
import { ROOT, isMain, today } from './lib/common.mjs';
import { git } from './lib/git.mjs';

// Every label the lab workflows use, with a colour and a description.
export const LABELS = {
  'lab-watch': ['1a1a1a', 'Opened by the lab watch pipeline'],
  'needs-human': ['7a3b5e', 'The triage step could not verify something; read the open questions'],
  ...Object.fromEntries(TOOLS.map((t) => [`tool:${t}`, ['d8d6d0', `Lab tool: ${t}`]])),
  ...Object.fromEntries(SOURCE_CLASSES.map((c) => [`class:${c}`, ['efece6', `Source class: ${c}`]])),
  ...Object.fromEntries(ITEM_TYPES.map((i) => [`item:${i}`, ['e4e0d8', `Item type: ${i}`]])),
  'review:accept': ['2b4c7e', 'Merged as proposed'],
  'review:minor': ['4a6fa5', 'Merged after a small correction'],
  'review:substantive': ['b9762e', 'Merged after rewriting'],
  'review:reject': ['a8322a', 'Closed without merging'],
  'divergence:status-misread': ['a8322a', 'A proposal as law, a draft as adopted, a target as a deadline, a withdrawn instrument as live'],
  'divergence:factual': ['a8322a', 'Wrong date, institution, instrument number, article, algorithm or standard'],
  'divergence:attribution': ['b9762e', 'Right fact, wrong source, or a secondary source presented as primary'],
  'divergence:judgement': ['8a8a86', 'Factually clean but framed or weighted differently'],
  'divergence:style': ['8a8a86', 'Register or house-style drift'],
};

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The pull request body: evidence first, then the change, then the review checklist. */
export function prBody({ proposal, before, meta }) {
  const p = proposal;
  const rows = changeRows(p, before);
  const quote = p.provenance.excerpt.split('\n').map((l) => `> ${l}`).join('\n');
  const where = [p.provenance.locator, `[source](${p.provenance.url})`, `read ${p.provenance.retrievedAt}`].filter(Boolean).join(', ');
  return [
    `**${p.title}**`,
    '',
    p.summary,
    '',
    '### Evidence',
    '',
    quote,
    '',
    `${where}. Source class: \`${p.sourceClass}\`. Item type: \`${p.itemType}\`.`,
    '',
    '### The change',
    '',
    `File: \`${p.targetFile}\``,
    '',
    '| Path | Before | After |',
    '|---|---|---|',
    ...rows.map((r) => `| \`${cell(r.path)}\` | ${cell(r.before)} | ${cell(r.after)} |`),
    '',
    ...(p.openQuestions.length ? ['### Open questions', '', ...p.openQuestions.map((q) => `- ${q}`), ''] : []),
    ...(p.needsHuman ? ['The triage step could not confirm everything against the primary document; see the open questions.', ''] : []),
    '### Review checklist',
    '',
    '- [ ] Is the status exactly what the excerpt says?',
    '- [ ] Is every date in the excerpt?',
    '- [ ] Would you show this to a visitor as it stands?',
    '',
    `Would merge itself if its pair were graduated: **${meta.wouldAutoMerge ? 'yes' : 'no'}**.`,
    '',
    'Before merging or closing, add one `review:` label (accept, minor, substantive or reject) and, unless the outcome is `review:accept`, one `divergence:` label. The trust ledger records both.',
    '',
    formatLabMeta(meta),
    '',
  ].join('\n');
}

export function commitMessage(p) {
  return `lab(${p.tool}): ${p.title}\n\n${p.summary}\n\nSource: ${p.provenance.url}\nProposed by the lab watch pipeline from ${p.sourceId}.\n`;
}

/** Build the plan for every valid proposal; invalid ones are reported and skipped. */
export async function plan(dir, { root = ROOT, date = today(), env = process.env } = {}) {
  const { config } = loadAutonomy(root);
  const rules = await loadModuleRules(root);
  const counters = {};
  const items = [];
  const skipped = [];
  for (const file of listProposalFiles(dir)) {
    const r = await checkProposal(file, { root, env });
    if (r.errors.length) {
      skipped.push({ file: basename(file), errors: r.errors });
      continue;
    }
    const p = r.proposal;
    const n = (counters[p.sourceId] = (counters[p.sourceId] ?? 0) + 1);
    const labels = ['lab-watch', `tool:${p.tool}`, `class:${p.sourceClass}`, `item:${p.itemType}`, ...(p.needsHuman ? ['needs-human'] : [])];
    const would = eligibility({ meta: { ...p }, files: [p.targetFile], labels, config, today: date, rules, asIfGraduated: true });
    const meta = {
      tool: p.tool,
      sourceId: p.sourceId,
      sourceUrl: p.provenance.url,
      sourceClass: p.sourceClass,
      itemType: p.itemType,
      targetFile: p.targetFile,
      proposedAction: proposedAction(p),
      operation: p.operation,
      needsHuman: p.needsHuman,
      model: config.model?.pinned ?? null,
      wouldAutoMerge: would.eligible,
    };
    items.push({
      file: basename(file),
      branch: `lab-watch/${date}-${p.sourceId}-${n}`,
      title: `lab(${p.tool}): ${p.title}`,
      labels,
      body: prBody({ proposal: p, before: r.before, meta }),
      commit: commitMessage(p),
      targetFile: p.targetFile,
      content: JSON.stringify(r.after, null, 2) + '\n',
    });
  }
  return { items, skipped };
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function ensureLabels(repoArgs) {
  const existing = new Set(JSON.parse(gh(['label', 'list', '--limit', '500', '--json', 'name', ...repoArgs])).map((l) => l.name));
  for (const [name, [color, description]] of Object.entries(LABELS)) {
    if (!existing.has(name)) gh(['label', 'create', name, '--color', color, '--description', description, ...repoArgs]);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dir = args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'labs', '.watch', 'proposals');
  const { items, skipped } = await plan(dir);

  for (const s of skipped) console.log(`SKIP ${s.file}: ${s.errors.join('; ')}`);
  if (!items.length) {
    console.log('No valid proposals; nothing to open.');
    process.exit(skipped.length ? 1 : 0);
  }

  if (dryRun) {
    for (const it of items) {
      console.log(`\n=== ${it.file}\nbranch: ${it.branch}\ntitle:  ${it.title}\nlabels: ${it.labels.join(', ')}\nfile:   ${it.targetFile}\n--- commit message ---\n${it.commit}--- pull request body ---\n${it.body}`);
    }
    console.log(`\nDry run: ${items.length} pull request(s) would be opened; nothing was changed.`);
    return;
  }

  const repoArgs = process.env.GITHUB_REPOSITORY ? ['--repo', process.env.GITHUB_REPOSITORY] : [];
  const identity = process.env.GITHUB_ACTIONS ? ['-c', 'user.name=qsc-atlas-lab-bot', '-c', 'user.email=lab-bot@users.noreply.github.com'] : [];
  ensureLabels(repoArgs);
  const base = git(['rev-parse', 'HEAD']);
  const tmp = mkdtempSync(join(tmpdir(), 'lab-pr-'));
  let failed = 0;
  for (const it of items) {
    try {
      git(['checkout', '-B', it.branch, base]);
      writeFileSync(join(ROOT, it.targetFile), it.content);
      git(['add', it.targetFile]);
      git([...identity, 'commit', '-F', '-'], { input: it.commit });
      git(['push', '--force', '-u', 'origin', it.branch]);
      const bodyFile = join(tmp, `${basename(it.file)}.md`);
      writeFileSync(bodyFile, it.body);
      const url = gh(['pr', 'create', '--base', 'main', '--head', it.branch, '--title', it.title, '--body-file', bodyFile, ...it.labels.flatMap((l) => ['--label', l]), ...repoArgs]);
      console.log(`opened ${url}`);
    } catch (err) {
      failed++;
      console.log(`FAILED ${it.file}: ${String(err.stderr || err.message).trim()}`);
    } finally {
      git(['checkout', '--detach', base]);
    }
  }
  process.exit(failed || skipped.length ? 1 : 0);
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
