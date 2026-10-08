// The Standards rules of scripts/lab/invariants/cascade.mjs, on fixtures: every bodyId, buildsOn
// and supersedes names a record that exists, every edge points at a standard that exists, and a
// document's way of writing an identifier is matched apart from case, spacing and ellipses.

import { describe, expect, it } from 'vitest';
import { bodyFailures, edgeFailures, excerptNamesStandard, standardFailures } from './cascade.mjs';
import { validateData } from '../lib/validate-core.mjs';
import cascadeRules from './cascade.mjs';

const body = (over = {}) => ({ id: 'ietf', name: 'Internet Engineering Task Force', shortName: 'IETF', kind: 'international-standards-body', iso3: null, ...over });
const bodies = [body(), body({ id: 'nist', shortName: 'NIST', kind: 'national-agency', iso3: 'USA' }), body({ id: 'kpqc', shortName: 'KpqC', kind: 'research-group', iso3: 'KOR' })];
const std = (over = {}) => ({
  id: 'RFC-10024',
  bodyId: 'ietf',
  buildsOn: [],
  supersedes: null,
  statusDate: '2026-08',
  statusPrecision: 'month',
  national: null,
  synonyms: [
    { text: 'RFC 10024', type: 'official' },
    { text: 'draft-ietf-tls-ecdhe-mlkem', type: 'draft-name' },
  ],
  ...over,
});
const standards = [std(), std({ id: 'FIPS-203', bodyId: 'nist', synonyms: [{ text: 'FIPS 203', type: 'official' }] })];
const edge = (over = {}) => ({
  id: 'fra-rfc-10024-2026-anssi-tls',
  from: 'FRA',
  to: 'RFC-10024',
  relation: 'references',
  namedAs: 'draft-ietf-tls-ecdhe-mlkem-01',
  namedAsType: 'draft-name',
  date: '2026',
  precision: 'year',
  verify: true,
  provenance: [{ excerpt: 'Internet-Draft draft-ietf-tls-ecdhe-mlkem-01, Internet Engineering Task Force' }],
  ...over,
});
const messages = (failures) => failures.map((f) => f.message);

describe('a standard points only at records that exist', () => {
  it('accepts a standard whose body, buildsOn and supersedes all exist', () => {
    expect(standardFailures([...standards, std({ id: 'RFC-10042', buildsOn: ['FIPS-203'], supersedes: 'RFC-10024' })], bodies)).toEqual([]);
  });
  it('needs its bodyId in bodies.json', () => {
    expect(messages(standardFailures([std({ bodyId: 'etsi' })], bodies))).toEqual(['etsi is not a body in bodies.json']);
  });
  it('builds on standards in standards.json only, never on itself or twice on one', () => {
    expect(messages(standardFailures([std({ buildsOn: ['FIPS-999'] })], bodies))).toEqual(['FIPS-999 is not in standards.json']);
    expect(messages(standardFailures([std({ buildsOn: ['RFC-10024'] })], bodies))).toEqual(['RFC-10024 cannot build on itself']);
    expect(messages(standardFailures([...standards, std({ id: 'X', buildsOn: ['FIPS-203', 'FIPS-203'] })], bodies))).toEqual(['FIPS-203 is listed twice']);
  });
  it('supersedes a standard in standards.json only, never itself', () => {
    expect(messages(standardFailures([std({ supersedes: 'RFC-8708' })], bodies))).toEqual(['RFC-8708 is not in standards.json']);
    expect(messages(standardFailures([std({ supersedes: 'RFC-10024' })], bodies))).toEqual(['RFC-10024 cannot supersede itself']);
  });
  it('dates its status at the precision it gives, or leaves both empty', () => {
    expect(standardFailures([std({ statusDate: null, statusPrecision: null })], bodies)).toEqual([]);
    expect(messages(standardFailures([std({ statusDate: '2026-08-01', statusPrecision: 'month' })], bodies))).toEqual(['statusDate "2026-08-01" does not match precision "month"']);
    expect(messages(standardFailures([std({ statusDate: '2026-08', statusPrecision: null })], bodies))).toEqual(['statusDate and statusPrecision must both be set or both be null']);
  });
  it('runs a national process through a body of its own country', () => {
    expect(standardFailures([std({ id: 'KOR-KPQC', bodyId: 'kpqc', national: 'KOR' })], bodies)).toEqual([]);
    expect(messages(standardFailures([std({ id: 'KOR-KPQC', bodyId: 'nist', national: 'KOR' })], bodies))).toEqual(['KOR-KPQC is a national process of KOR, but nist is not a body of that country']);
  });
  it('keeps every standard id and body id unique', () => {
    expect(messages(standardFailures([std(), std()], bodies))).toEqual(['standard id RFC-10024 is used twice']);
    expect(messages(bodyFailures([body(), body()]))).toEqual(['body id ietf is used twice']);
  });
});

describe('an edge points only at records that exist', () => {
  it('accepts an edge to a standard in standards.json', () => {
    expect(edgeFailures([edge()], standards, bodies)).toEqual([]);
  });
  it('needs its `to` in standards.json, or for "participates" in bodies.json', () => {
    expect(messages(edgeFailures([edge({ to: 'RFC-0000' })], standards, bodies))).toEqual(['RFC-0000 is not in standards.json']);
    expect(edgeFailures([edge({ relation: 'participates', to: 'ietf' })], standards, bodies)).toEqual([]);
    expect(messages(edgeFailures([edge({ relation: 'participates', to: 'RFC-10024' })], standards, bodies))).toEqual(['RFC-10024 is not a body in bodies.json']);
  });
  it('keeps edge ids unique, namedAs with its type, and a date on every verified edge', () => {
    expect(messages(edgeFailures([edge(), edge()], standards, bodies))).toEqual(['edge id fra-rfc-10024-2026-anssi-tls is used twice']);
    expect(messages(edgeFailures([edge({ namedAsType: null })], standards, bodies))).toEqual(['namedAs and namedAsType must both be set or both be null']);
    expect(edgeFailures([edge({ namedAs: null, namedAsType: null })], standards, bodies)).toEqual([]);
    // a lead may wait for its date; a verified edge may not
    expect(edgeFailures([edge({ date: null, precision: null })], standards, bodies)).toEqual([]);
    expect(messages(edgeFailures([edge({ date: null, precision: null, verify: false })], standards, bodies))).toEqual(['a verified edge needs the date of its document']);
  });
});

describe('an excerpt names its standard', () => {
  it('word for word, or apart from case, spacing and the ellipses of a broken line', () => {
    expect(excerptNamesStandard(edge(), standards)).toBe(true);
    expect(excerptNamesStandard(edge({ provenance: [{ excerpt: 'updates of IKE [RFC10024] and TLS' }] }), standards)).toBe(true);
    expect(excerptNamesStandard(edge({ provenance: [{ excerpt: 'draft-ietf-tls- ... ECDHE-mlkem ... RFC Editor' }] }), standards)).toBe(true);
    expect(excerptNamesStandard(edge({ provenance: [{ excerpt: 'a hybrid key exchange for TLS' }] }), standards)).toBe(false);
    // the first passage must carry the name; a later one does not count
    expect(excerptNamesStandard(edge({ provenance: [{ excerpt: 'no name here' }, { excerpt: 'RFC 10024' }] }), standards)).toBe(false);
  });
});

describe('the rules run on the repository files', () => {
  it('flag an unknown body, buildsOn and supersedes in standards.json', () => {
    const data = { standards: [std({ bodyId: 'no-such-body', buildsOn: ['NO-SUCH-STANDARD'], supersedes: 'NOR-THIS' })] };
    const failures = validateData('data/lab/cascade/standards.json', data, { rules: cascadeRules });
    expect(failures.filter((f) => f.rule === 'standard-links-known').map((f) => f.message)).toEqual([
      'no-such-body is not a body in bodies.json',
      'NO-SUCH-STANDARD is not in standards.json',
      'NOR-THIS is not in standards.json',
    ]);
  });
  it('flag an edge whose `to` is not a standard of the repository', () => {
    const data = { edges: [edge({ to: 'NO-SUCH-STANDARD' })] };
    const failures = validateData('data/lab/cascade/edges.json', data, { rules: cascadeRules });
    expect(failures.filter((f) => f.rule === 'edge-standard-known').map((f) => f.message)).toEqual(['NO-SUCH-STANDARD is not in standards.json']);
  });
});
