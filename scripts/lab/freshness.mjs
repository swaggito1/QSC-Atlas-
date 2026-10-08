#!/usr/bin/env node
// QSC Atlas Labs: which lab records need checking again.
// Lists every record whose verifiedAt is older than its folder's threshold
// (src/lib/lab/freshness.ts: survey data 400 days, rulebook 90, cascade 180,
// memberships 365) and every record still at verify: true.
// Usage: node scripts/lab/freshness.mjs [--issue]
// With --issue, opens or updates a single GitHub issue titled "Lab data freshness" (needs gh).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshnessDays, daysSince } from '../../src/lib/lab/freshness.ts';
import { ROOT, isMain, listFiles, pathString, rel, today, walkJson } from './lib/common.mjs';

export const ISSUE_TITLE = 'Lab data freshness';

/** Stale and unverified records under data/lab/ (the watch folder excepted). */
export function scan({ root = ROOT, now = today() } = {}) {
  const stale = [];
  const leads = [];
  const nowDate = new Date(now + 'T00:00:00Z');
  // the watch folder holds machine records; the fixture exists only to test the pipeline
  for (const abs of listFiles(join(root, 'data', 'lab'), { root, skip: ['data/lab/watch', 'data/lab/fixture'] })) {
    const r = rel(abs, root);
    if (!r.endsWith('.json')) continue;
    const folder = r.split('/')[2]?.replace(/\.json$/, '') ?? 'shared';
    const threshold = freshnessDays(folder === 'tools' ? 'shared' : folder);
    walkJson(JSON.parse(readFileSync(abs, 'utf8')), (v, path) => {
      if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.verify !== 'boolean') return;
      const name = v.label ?? v.title ?? v.id ?? pathString(path);
      if (v.verify) leads.push({ file: r, path: pathString(path), name });
      else if (v.verifiedAt && daysSince(v.verifiedAt, nowDate) > threshold) {
        stale.push({ file: r, path: pathString(path), name, verifiedAt: v.verifiedAt, age: daysSince(v.verifiedAt, nowDate), threshold });
      }
    });
  }
  return { stale, leads };
}

export function issueBody({ stale, leads }, now) {
  return [
    `Checked on ${now} by \`scripts/lab/freshness.mjs\` (the monthly lab job). Thresholds live in \`src/lib/lab/freshness.ts\`.`,
    '',
    `## Verified longer ago than the threshold (${stale.length})`,
    '',
    ...(stale.length ? ['| File | Record | Verified | Age in days | Threshold |', '|---|---|---|---|---|', ...stale.map((s) => `| \`${s.file}\` | ${s.name} (\`${s.path}\`) | ${s.verifiedAt} | ${s.age} | ${s.threshold} |`)] : ['None.']),
    '',
    `## Still leads, never verified (${leads.length})`,
    '',
    ...(leads.length ? leads.map((l) => `- \`${l.file}\`: ${l.name} (\`${l.path}\`)`) : ['None.']),
    '',
    'Leads never appear in a production build. Re-verify a stale record against its source, update its provenance and verifiedAt, and the next monthly run will drop it from this list.',
    '',
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const now = today();
  const result = scan({ now });
  const body = issueBody(result, now);
  if (!process.argv.includes('--issue')) {
    console.log(body);
    process.exit(0);
  }
  const repoArgs = process.env.GITHUB_REPOSITORY ? ['--repo', process.env.GITHUB_REPOSITORY] : [];
  const gh = (args) => execFileSync('gh', [...args, ...repoArgs], { encoding: 'utf8' }).trim();
  const open = JSON.parse(gh(['issue', 'list', '--state', 'open', '--search', `"${ISSUE_TITLE}" in:title`, '--json', 'number,title'])).find((i) => i.title === ISSUE_TITLE);
  if (open) {
    gh(['issue', 'edit', String(open.number), '--body', body]);
    console.log(`updated issue #${open.number}: ${result.stale.length} stale, ${result.leads.length} leads`);
  } else if (result.stale.length || result.leads.length) {
    console.log(gh(['issue', 'create', '--title', ISSUE_TITLE, '--body', body]));
  } else console.log('Nothing stale and no open issue; nothing to do.');
}
