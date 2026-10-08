#!/usr/bin/env node
// QSC Atlas Labs: open one pull request per graduation candidate, editing
// labs/config/autonomy.yaml, with the evidence in the body. Graduation always waits for
// Swann's merge; nothing here merges.
// Usage: node scripts/lab/propose-graduation.mjs [labs/.watch/graduation.json] [--dry-run]

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import { ROOT, isMain, today } from './lib/common.mjs';
import { git } from './lib/git.mjs';

/** The autonomy file with one pair moved to auto-merge. */
export function graduatedYaml(text, cls, itemType, now) {
  const doc = YAML.parseDocument(text);
  const node = doc.get('pairs').items.find((n) => n.get('class') === cls && n.get('item_type') === itemType);
  if (!node) throw new Error(`no pair ${cls} / ${itemType} in autonomy.yaml`);
  node.set('tier', 'auto-merge');
  node.set('since', now);
  node.set('graduated_at', now);
  return doc.toString({ lineWidth: 0 });
}

export function graduationBody(c) {
  return [
    `**Graduate ${c.class} / ${c.item_type} to auto-merge**`,
    '',
    `This pair has ${c.run} consecutive labelled items without a status misread or factual error, and ${Math.round(c.rate * 100)} per cent of them were accepted as proposed or after a minor correction (${c.closed} closed in all). That meets the graduation rule in \`labs/config/autonomy.yaml\`.`,
    '',
    'If you merge this, lab-watch pull requests of this pair will merge themselves once the gate passes, unless a never-graduate rule applies (status changes, survey updates, narrative, profile proposals, and the protected files). A single status misread or factual error demotes the pair again for 60 days.',
    '',
    '### The evidence',
    '',
    '| Closed | Pull request | Tool | Outcome | Divergence |',
    '|---|---|---|---|---|',
    ...c.evidence.map((r) => `| ${r.closed_at.slice(0, 10)} | #${r.pr} | ${r.tool} | ${r.reviewer_action} | ${r.divergence || 'none'} |`),
    '',
    'Merge to graduate the pair, or close to keep it in review.',
    '',
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'labs/.watch/graduation.json');
  const candidates = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  if (!candidates.length) {
    console.log('No graduation candidates.');
    process.exit(0);
  }
  const now = today();
  const autonomyPath = join(ROOT, 'labs/config/autonomy.yaml');
  const base = dryRun ? null : git(['rev-parse', 'HEAD']);
  const repoArgs = process.env.GITHUB_REPOSITORY ? ['--repo', process.env.GITHUB_REPOSITORY] : [];
  const identity = process.env.GITHUB_ACTIONS ? ['-c', 'user.name=qsc-atlas-lab-bot', '-c', 'user.email=lab-bot@users.noreply.github.com'] : [];
  const tmp = mkdtempSync(join(tmpdir(), 'lab-grad-'));
  for (const c of candidates) {
    const branch = `lab-graduation/${now}-${c.class}-${c.item_type}`;
    const title = `lab(autonomy): graduate ${c.class} / ${c.item_type}`;
    const body = graduationBody(c);
    if (dryRun) {
      console.log(`\n=== ${branch}\n${title}\n\n${body}`);
      continue;
    }
    try {
      git(['checkout', '-B', branch, base]);
      writeFileSync(autonomyPath, graduatedYaml(readFileSync(autonomyPath, 'utf8'), c.class, c.item_type, now));
      git(['add', 'labs/config/autonomy.yaml']);
      git([...identity, 'commit', '-m', title]);
      git(['push', '--force', '-u', 'origin', branch]);
      const bodyFile = join(tmp, `${c.class}-${c.item_type}.md`);
      writeFileSync(bodyFile, body);
      console.log(execFileSync('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body-file', bodyFile, ...repoArgs], { encoding: 'utf8' }).trim());
    } finally {
      git(['checkout', '--detach', base]);
    }
  }
}
