import { describe, expect, it } from 'vitest';
import { validateData } from './validate-core.mjs';

const FILE = 'data/lab/fixture/fixture.json';
const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const prov = (over = {}) => ({
  url: 'https://example.org/source',
  retrievedAt: '2026-09-30',
  excerpt: 'The instrument was adopted.',
  sourceClass: 'trusted-institutional',
  ...over,
});
const record = (over = {}) => ({
  id: 'r1',
  label: 'Fixture instrument',
  date: '2026-01-20',
  precision: 'day',
  status: 'proposal',
  statusHistory: [{ status: 'proposal', date: '2026-01-20', precision: 'day', provenance: prov() }],
  verify: false,
  verifiedAt: '2026-09-30',
  provenance: [prov()],
  ...over,
});
const run = (records, env = { LAB_TODAY: '2026-09-30' }) =>
  validateData(FILE, { records }, { env }).map((f) => `${f.rule}: ${f.message}`);

describe('shared invariants', () => {
  it('accepts a clean record', () => {
    expect(run([record()])).toEqual([]);
  });

  it('evidence: a checked record needs provenance with a short verbatim excerpt', () => {
    expect(run([record({ provenance: [] })]).join('\n')).toMatch(/evidence: .*no provenance/);
    expect(run([record({ provenance: [prov({ excerpt: '' })] })]).join('\n')).toMatch(/evidence: .*empty excerpt/);
    const long = Array.from({ length: 61 }, () => 'word').join(' ');
    expect(run([record({ provenance: [prov({ excerpt: long })] })]).join('\n')).toMatch(/evidence: excerpt has 61 words/);
    expect(run([record({ verifiedAt: null })]).join('\n')).toMatch(/evidence: verify is false but verifiedAt is empty/);
  });

  it('evidence: a lead (verify: true) may have no provenance yet', () => {
    expect(run([record({ verify: true, verifiedAt: null, provenance: [] })])).toEqual([]);
  });

  it('proposals are not law: no application date on a proposal', () => {
    expect(run([record({ appliesFrom: '2027-10-17' })]).join('\n')).toMatch(/proposals-not-law: .*appliesFrom/);
    expect(run([record({ proposed: { appliesFrom: '2027-10-17' } })])).toEqual([]);
  });

  it('status history: in date order and ending in the current status', () => {
    const h = [
      { status: 'proposal', date: '2026-03-01', precision: 'day', provenance: prov() },
      { status: 'adopted', date: '2026-01-01', precision: 'day', provenance: prov() },
    ];
    const out = run([record({ status: 'adopted', statusHistory: h })]).join('\n');
    expect(out).toMatch(/status-history: entry dated 2026-01-01 comes after/);
    expect(run([record({ status: 'adopted' })]).join('\n')).toMatch(/status-history: status is "adopted" but the last history entry says "proposal"/);
  });

  it('dates: precision must match, and a passed event must post-date nothing it was read before', () => {
    expect(run([record({ date: '2026-01', precision: 'day' })]).join('\n')).toMatch(/dates: date "2026-01" does not match precision "day"/);
    expect(run([record({ date: null, precision: 'day' })]).join('\n')).toMatch(/dates: date and precision must both be set/);
    // read on 1 September about an event of 15 September; today is 30 September: re-verify
    const stale = record({ date: '2026-09-15', provenance: [prov({ retrievedAt: '2026-09-01' })] });
    expect(run([stale]).join('\n')).toMatch(/dates: event dated 2026-09-15 has passed but its source was read on 2026-09-01/);
    // a future deadline read before it happens is fine
    expect(run([record({ date: '2030-12-31' })])).toEqual([]);
  });

  it('no internal notes', () => {
    expect(run([record({ analyticalNote: 'x' })]).join('\n')).toMatch(/no-internal-notes/);
  });

  it('style: visitor-facing strings pass the scan, verbatim excerpts are exempt', () => {
    expect(run([record({ label: 'A robust instrument' })]).join('\n')).toMatch(/style: house style: banned word "robust"/); // style-scan-ignore
    expect(run([record({ label: `From 2025 ${EN} 2030` })]).join('\n')).toMatch(/style: house style: en dash/);
    expect(run([record({ provenance: [prov({ excerpt: `A robust ${EM} comprehensive text` })] })])).toEqual([]); // style-scan-ignore
  });

  it('refuses a file with no registered schema', () => {
    expect(validateData('data/lab/unknown.json', {}).map((f) => f.message).join()).toMatch(/no schema is registered/);
  });
});
