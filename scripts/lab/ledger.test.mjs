import { describe, expect, it, beforeEach } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import YAML from 'yaml';
import { appendOutcome } from './ledger-append.mjs';
import { buildReport } from './ledger-report.mjs';
import { graduatedYaml } from './propose-graduation.mjs';
import { scan } from './freshness.mjs';
import { formatLabMeta } from './lib/proposals.mjs';
import { parseCsv, readLedger } from './lib/ledger.mjs';
import { ROOT } from './lib/common.mjs';

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lab-ledger-'));
  mkdirSync(join(root, 'labs/ledger'), { recursive: true });
  mkdirSync(join(root, 'labs/config'), { recursive: true });
  copyFileSync(join(ROOT, 'labs/ledger/trust-ledger.csv'), join(root, 'labs/ledger/trust-ledger.csv'));
  copyFileSync(join(ROOT, 'labs/config/autonomy.yaml'), join(root, 'labs/config/autonomy.yaml'));
});
const autonomy = () => YAML.parse(readFileSync(join(root, 'labs/config/autonomy.yaml'), 'utf8'));
const setAutonomy = (fn) => {
  const doc = YAML.parseDocument(readFileSync(join(root, 'labs/config/autonomy.yaml'), 'utf8'));
  fn(doc);
  writeFileSync(join(root, 'labs/config/autonomy.yaml'), doc.toString());
};
const meta = { tool: 'cascade', sourceUrl: 'https://csrc.nist.gov/x', sourceClass: 'trusted-institutional', itemType: 'new-record', proposedAction: 'add /edges/-', model: 'claude-opus-5-5', wouldAutoMerge: true };
const env = (over = {}) => ({
  PR_NUMBER: '7',
  PR_MERGED: 'true',
  PR_CLOSED_AT: '2026-10-06T10:00:00Z',
  PR_LABELS: JSON.stringify(['lab-watch', 'tool:cascade']),
  PR_BODY: `Body with, commas and "quotes"\n${formatLabMeta(meta)}`,
  PR_AUTO_MERGED: 'false',
  LAB_TODAY: '2026-10-06',
  ...over,
});

describe('ledger-append', () => {
  it('records an unlabelled row, then replaces it when a review label arrives', () => {
    appendOutcome(env(), { root });
    expect(readLedger(root)).toMatchObject([{ pr: '7', reviewer_action: 'unlabelled', source_class: 'trusted-institutional', would_auto_merge: 'true' }]);
    appendOutcome(env({ PR_LABELS: JSON.stringify(['lab-watch', 'review:minor', 'divergence:style']) }), { root });
    const rows = readLedger(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reviewer_action: 'minor', divergence: 'style', notes: 'merged' });
    // the header stays intact and fields with commas survive the round trip
    expect(parseCsv(readFileSync(join(root, 'labs/ledger/trust-ledger.csv'), 'utf8'))[0][0]).toBe('closed_at');
  });

  it('records an auto-merged pull request as auto', () => {
    appendOutcome(env({ PR_AUTO_MERGED: 'true' }), { root });
    expect(readLedger(root)[0].reviewer_action).toBe('auto');
  });

  it('demotes the pair at once on a status misread, for 60 days, with the counter reset', () => {
    const { notes } = appendOutcome(env({ PR_LABELS: JSON.stringify(['review:substantive', 'divergence:status-misread']) }), { root });
    expect(notes[0]).toMatch(/demoted trusted-institutional \/ new-record/);
    const pair = autonomy().pairs.find((p) => p.class === 'trusted-institutional' && p.item_type === 'new-record');
    expect(pair).toMatchObject({ tier: 'review', demoted_until: '2026-12-05', counter_reset_at: '2026-10-06' });
  });

  it('sends graduated pairs back to shadow within 14 days of a model change', () => {
    setAutonomy((doc) => {
      doc.setIn(['model', 'changed_at'], '2026-10-01');
      doc.get('pairs').items[0].set('tier', 'auto-merge');
    });
    const { notes } = appendOutcome(env(), { root });
    expect(notes.join()).toMatch(/back to shadow until 2026-10-15/);
    expect(autonomy().pairs[0]).toMatchObject({ tier: 'shadow', reshadow_until: '2026-10-15' });
    // applied once only
    expect(appendOutcome(env({ PR_NUMBER: '8' }), { root }).notes).toEqual([]);
  });
});

describe('ledger-report', () => {
  const seed = (n, over = () => ({})) => {
    for (let i = 1; i <= n; i++) {
      const day = String(i).padStart(2, '0');
      appendOutcome(env({ PR_NUMBER: String(i), PR_CLOSED_AT: `2026-10-${day}T10:00:00Z`, PR_LABELS: JSON.stringify(['review:accept']), LAB_TODAY: `2026-10-${day}`, ...over(i) }), { root });
    }
  };

  it('finds a graduation candidate after 30 clean items in review, and only then', () => {
    setAutonomy((doc) => doc.get('pairs').items[0].set('tier', 'review'));
    seed(29);
    expect(buildReport({ root, now: '2026-10-31', git: () => null }).candidates).toEqual([]);
    appendOutcome(env({ PR_NUMBER: '30', PR_CLOSED_AT: '2026-10-30T10:00:00Z', PR_LABELS: JSON.stringify(['review:minor']) }), { root });
    const { candidates, markdown } = buildReport({ root, now: '2026-10-31', git: () => null });
    expect(candidates.map((c) => `${c.class}/${c.item_type}/${c.run}`)).toEqual(['trusted-institutional/new-record/30']);
    expect(markdown).toContain('| trusted-institutional | new-record | review | 30 | 30 | 100 per cent | yes |');
  });

  it('restarts the run after a factual error', () => {
    setAutonomy((doc) => doc.get('pairs').items[0].set('tier', 'review'));
    seed(30, (i) => (i === 25 ? { PR_LABELS: JSON.stringify(['review:substantive', 'divergence:factual']) } : {}));
    const pair = buildReport({ root, now: '2026-10-31', git: () => null });
    expect(pair.candidates).toEqual([]);
    expect(pair.markdown).toMatch(/\| trusted-institutional \| new-record \| review \(demoted until 2026-12-24\) \| 30 \| 5 \|/);
  });

  it('ends the shadow window, clears an expired demotion and lists unlabelled items', () => {
    setAutonomy((doc) => {
      doc.setIn(['window', 'started_at'], '2026-09-01');
      doc.get('pairs').items[1].set('demoted_until', '2026-10-01');
    });
    appendOutcome(env(), { root });
    const { notes, markdown } = buildReport({ root, now: '2026-10-06', apply: true, git: () => null });
    expect(notes.join('\n')).toMatch(/demotion ended on 2026-10-01/);
    expect(notes.join('\n')).toMatch(/shadow window ended/);
    expect(autonomy().pairs.every((p) => p.tier === 'review')).toBe(true);
    expect(markdown).toMatch(/\[Pull request 7\]\(https:\/\/github.com\/.+\/pull\/7\)/);
  });

  it('graduation edits only the one pair', () => {
    const out = YAML.parse(graduatedYaml(readFileSync(join(root, 'labs/config/autonomy.yaml'), 'utf8'), 'secondary', 'new-record', '2026-11-01'));
    expect(out.pairs.filter((p) => p.tier === 'auto-merge')).toEqual([{ class: 'secondary', item_type: 'new-record', tier: 'auto-merge', since: '2026-11-01', graduated_at: '2026-11-01' }]);
  });
});

describe('freshness', () => {
  it('lists stale records by folder threshold and leads', () => {
    mkdirSync(join(root, 'data/lab/rulebook'), { recursive: true });
    const rec = (id, verifiedAt, verify = false) => ({ id, label: id, verify, verifiedAt, provenance: [] });
    writeFileSync(join(root, 'data/lab/rulebook/regimes.json'), JSON.stringify({ regimes: [rec('old', '2026-01-01'), rec('new', '2026-09-01'), rec('lead', null, true)] }));
    const { stale, leads } = scan({ root, now: '2026-09-30' });
    expect(stale.map((s) => `${s.name}:${s.threshold}`)).toEqual(['old:90']);
    expect(leads.map((l) => l.name)).toEqual(['lead']);
  });
});
