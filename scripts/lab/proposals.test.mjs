import { describe, expect, it, beforeEach } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyPatch } from './lib/jsonpatch.mjs';
import { checkProposal, listProposalFiles, parseLabMeta, formatLabMeta } from './lib/proposals.mjs';
import { eligibility, loadAutonomy } from './lib/autonomy.mjs';
import { plan } from './open-prs.mjs';
import { checkPr } from './autonomy-check.mjs';
import { ROOT } from './lib/common.mjs';

const ENV = { LAB_TODAY: '2026-10-05' };
const EM = String.fromCharCode(0x2014);
let root;
let dir;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lab-prop-'));
  dir = join(root, 'labs/.watch/proposals');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'data/lab/fixture'), { recursive: true });
  mkdirSync(join(root, 'labs/config'), { recursive: true });
  copyFileSync(join(ROOT, 'data/lab/fixture/fixture.json'), join(root, 'data/lab/fixture/fixture.json'));
  copyFileSync(join(ROOT, 'labs/config/autonomy.yaml'), join(root, 'labs/config/autonomy.yaml'));
});

const prov = { url: 'https://example.org/fixture', retrievedAt: '2026-10-05', excerpt: 'Adopted by Parliament and Council on 1 October 2026.', locator: 'Status', sourceClass: 'trusted-institutional' };
const statusChange = (over = {}) => ({
  tool: 'fixture',
  sourceId: 'fixture-test',
  sourceClass: 'trusted-institutional',
  itemType: 'status-change',
  title: 'Fixture Directive adopted',
  summary: 'The fixture page now says the directive was adopted on 1 October 2026.',
  targetFile: 'data/lab/fixture/fixture.json',
  operation: {
    type: 'json-patch',
    ops: [
      { op: 'replace', path: '/records/0/status', value: 'adopted' },
      { op: 'add', path: '/records/0/statusHistory/-', value: { status: 'adopted', date: '2026-10-01', precision: 'day', provenance: prov } },
    ],
  },
  provenance: { url: prov.url, retrievedAt: prov.retrievedAt, excerpt: prov.excerpt, locator: 'Status' },
  needsHuman: false,
  openQuestions: [],
  ...over,
});
const write = (name, obj) => {
  const f = join(dir, name);
  writeFileSync(f, JSON.stringify(obj));
  return f;
};

describe('JSON Patch', () => {
  it('applies add, replace, remove, move, copy and test, and refuses a bad path', () => {
    const doc = { a: [1, 2], b: { c: 1 } };
    expect(applyPatch(doc, [{ op: 'add', path: '/a/-', value: 3 }, { op: 'replace', path: '/b/c', value: 2 }, { op: 'test', path: '/b/c', value: 2 }])).toEqual({ a: [1, 2, 3], b: { c: 2 } });
    expect(applyPatch(doc, [{ op: 'move', from: '/b/c', path: '/d' }, { op: 'copy', from: '/a/0', path: '/e' }, { op: 'remove', path: '/a/1' }])).toEqual({ a: [1], b: {}, d: 1, e: 1 });
    expect(() => applyPatch(doc, [{ op: 'replace', path: '/zz', value: 1 }])).toThrow(/does not exist/);
    expect(doc).toEqual({ a: [1, 2], b: { c: 1 } }); // never mutates its input
  });
});

describe('check-proposals', () => {
  it('accepts a clean status change and flags it as never auto-mergeable', async () => {
    const r = await checkProposal(write('a.json', statusChange()), { root, env: ENV });
    expect(r.errors).toEqual([]);
    expect(r.flags).toContain('status-change is never auto-mergeable');
    expect(r.after.records[0].status).toBe('adopted');
  });

  it('refuses a target outside data/lab', async () => {
    const r = await checkProposal(write('a.json', statusChange({ targetFile: 'data/profiles/FRA.json' })), { root, env: ENV });
    expect(r.errors.join()).toMatch(/targetFile must be a JSON file inside data\/lab/);
  });

  it('refuses a patch that does not apply', async () => {
    const p = statusChange({ operation: { type: 'json-patch', ops: [{ op: 'replace', path: '/records/9/status', value: 'adopted' }] } });
    expect((await checkProposal(write('a.json', p), { root, env: ENV })).errors.join()).toMatch(/does not apply/);
  });

  it('refuses a result that breaks an invariant: status changed without its history', async () => {
    const p = statusChange({ operation: { type: 'json-patch', ops: [{ op: 'replace', path: '/records/0/status', value: 'adopted' }] } });
    expect((await checkProposal(write('a.json', p), { root, env: ENV })).errors.join()).toMatch(/status-history/);
  });

  it('refuses a long excerpt and dashes in visible strings, but not in a verbatim excerpt', async () => {
    const long = Array.from({ length: 61 }, () => 'w').join(' ');
    expect((await checkProposal(write('a.json', statusChange({ provenance: { ...statusChange().provenance, excerpt: long } })), { root, env: ENV })).errors.join()).toMatch(/61 words/);
    expect((await checkProposal(write('b.json', statusChange({ title: `Adopted ${EM} at last` })), { root, env: ENV })).errors.join()).toMatch(/title: house style: em dash/);
    const quoted = statusChange({ provenance: { ...statusChange().provenance, excerpt: `Adopted ${EM} 1 October 2026.` } });
    expect((await checkProposal(write('c.json', quoted), { root, env: ENV })).errors).toEqual([]);
  });

  it('skips the triage log', () => {
    write('_triage-log.json', { noOps: [] });
    write('a.json', statusChange());
    expect(listProposalFiles(dir).map((f) => f.split('/').pop())).toEqual(['a.json']);
  });
});

describe('autonomy', () => {
  const meta = { tool: 'fixture', sourceClass: 'trusted-institutional', itemType: 'new-record', needsHuman: false };
  const files = ['data/lab/fixture/fixture.json'];

  it('never lets a pair in shadow merge itself, but records that it would if graduated', () => {
    const { config } = loadAutonomy(root);
    expect(eligibility({ meta, files, config, today: '2026-10-05' })).toEqual({ eligible: false, reason: 'the pair is in shadow' });
    expect(eligibility({ meta, files, config, today: '2026-10-05', asIfGraduated: true }).eligible).toBe(true);
  });

  it('applies the never-graduate rules before the tier', () => {
    const { config } = loadAutonomy(root);
    const graduated = { ...config, pairs: config.pairs.map((p) => ({ ...p, tier: 'auto-merge' })) };
    const e = (m, f = files, labels = []) => eligibility({ meta: { ...meta, ...m }, files: f, labels, config: graduated, today: '2026-10-05' });
    expect(e({}).eligible).toBe(true);
    expect(e({ itemType: 'status-change' }).reason).toMatch(/never graduate/);
    // a tool listed under never_graduate.tools (none today) never graduates
    const neverTool = { ...graduated, never_graduate: { ...graduated.never_graduate, tools: ['fixture'] } };
    expect(eligibility({ meta, files, config: neverTool, today: '2026-10-05' }).reason).toMatch(/fixture changes never graduate/);
    expect(e({}, ['data/lab/fixture/fixture.json', 'src/pages/index.astro']).reason).toMatch(/outside the lab data/);
    expect(e({}, files, ['needs-human']).eligible).toBe(false);
    const demoted = { ...graduated, pairs: graduated.pairs.map((p) => ({ ...p, demoted_until: '2026-12-01' })) };
    expect(eligibility({ meta, files, config: demoted, today: '2026-10-05' }).reason).toMatch(/demoted until 2026-12-01/);
  });

  it('reads a pull request through its lab-meta block', async () => {
    const body = `text\n${formatLabMeta({ ...meta, note: 'a --> b' })}\n`;
    expect(parseLabMeta(body).note).toBe('a --> b');
    const r = await checkPr({ body, labels: [{ name: 'lab-watch' }], files: [{ path: files[0] }] }, { root, now: '2026-10-05' });
    expect(r).toEqual({ eligible: false, reason: 'the pair is in shadow' });
  });
});

describe('open-prs plan', () => {
  it('builds one branch, labels and a body with evidence, checklist and lab-meta per proposal', async () => {
    write('a.json', statusChange());
    write('b.json', statusChange({ needsHuman: true, openQuestions: ['Is the adoption date the Council vote or the signature?'] }));
    const { items, skipped } = await plan(dir, { root, date: '2026-10-05', env: ENV });
    expect(skipped).toEqual([]);
    expect(items.map((i) => i.branch)).toEqual(['lab-watch/2026-10-05-fixture-test-1', 'lab-watch/2026-10-05-fixture-test-2']);
    expect(items[1].labels).toEqual(['lab-watch', 'tool:fixture', 'class:trusted-institutional', 'item:status-change', 'needs-human']);
    const body = items[0].body;
    expect(body).toContain('> Adopted by Parliament and Council on 1 October 2026.');
    expect(body).toContain('| `/records/0/status` | proposal | adopted |');
    expect(body).toContain('Is the status exactly what the excerpt says?');
    const meta = parseLabMeta(body);
    expect(meta).toMatchObject({ tool: 'fixture', itemType: 'status-change', wouldAutoMerge: false, model: 'claude-opus-5-5' });
    expect(items[1].body).toContain('### Open questions');
    expect(JSON.parse(items[0].content).records[0].status).toBe('adopted');
    // the plan never writes to the target file
    expect(JSON.parse(readFileSync(join(root, 'data/lab/fixture/fixture.json'), 'utf8')).records[0].status).toBe('proposal');
  });
});
