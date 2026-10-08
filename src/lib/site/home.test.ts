import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../lab/load';
import { POSTURE_ORDER } from '../process';
import { BLOC_POSTURES, census, censusItems, censusWhole, expectedRecords, supranationalRecords } from './home';
import type { CensusRecord } from './home';

const ROOT = projectRoot();

// the JSON copy of every profile, as the offline build reads it
const profiles: CensusRecord[] = readdirSync(join(ROOT, 'data/profiles'))
  .filter((f: string) => f.endsWith('.json'))
  .map((f: string) => JSON.parse(readFileSync(join(ROOT, 'data/profiles', f), 'utf8')) as Record<string, string | undefined>)
  .map((p: Record<string, string | undefined>) => ({ iso3: p.iso3 as string, country: p.country ?? null, coordinationPosture: p.coordinationPosture ?? null, lastUpdated: p.lastUpdated ?? null }));
const SUPRA = supranationalRecords();

describe('the census', () => {
  const fixture = (): CensusRecord[] => [
    { iso3: 'EUU', country: 'European Union', coordinationPosture: 'EU', lastUpdated: '2026-06-20' },
    { iso3: 'NATO', country: 'NATO', coordinationPosture: null },
    { iso3: 'DEU', country: 'Germany', coordinationPosture: 'EU', lastUpdated: '2026-06-25' },
    { iso3: 'USA', country: 'United States', coordinationPosture: 'NIST-bloc' },
    { iso3: 'CHN', country: 'China', coordinationPosture: 'sovereign-bloc' },
    { iso3: 'IND', country: 'India', coordinationPosture: 'engaged-unaligned' },
    { iso3: 'AUT', country: 'Austria', coordinationPosture: null },
  ];
  const supra = new Map([
    ['EUU', 'European Union'],
    ['NATO', 'NATO'],
  ]);

  it('counts countries apart from the EU and NATO, the three blocs and the unaligned', () => {
    const c = census(fixture(), supra);
    expect(c.records).toBe(7);
    expect(c.countries).toBe(5);
    expect(c.supranational).toEqual(['the EU', 'NATO']);
    expect(c.inBloc).toBe(4); // EUU, DEU, USA, CHN
    expect(c.unaligned).toBe(1);
    expect(c.noPosture).toBe(2);
    expect(c.asOf).toBe('2026-06-25');
  });

  it('changes when a profile changes posture', () => {
    const before = census(fixture(), supra);
    const moved = fixture().map((r) => (r.iso3 === 'AUT' ? { ...r, coordinationPosture: 'EU' } : r));
    const after = census(moved, supra);
    expect(after.inBloc).toBe(before.inBloc + 1);
    expect(after.noPosture).toBe(before.noPosture - 1);
    const unaligned = fixture().map((r) => (r.iso3 === 'USA' ? { ...r, coordinationPosture: 'engaged-unaligned' } : r));
    const third = census(unaligned, supra);
    expect(third.inBloc).toBe(before.inBloc - 1);
    expect(third.unaligned).toBe(before.unaligned + 1);
    expect(censusItems(third)).not.toEqual(censusItems(before));
  });

  it('never counts the unaligned as a bloc', () => {
    expect(BLOC_POSTURES).toEqual(POSTURE_ORDER.filter((k) => k !== 'engaged-unaligned'));
  });

  it('reads the line from the counts, with the posture label from POSTURE_META', () => {
    expect(censusItems(census(fixture(), supra))).toEqual([
      '5 countries, the EU and NATO on record',
      '4 in a coordination bloc',
      '1 engaged but unaligned',
      'data as of 25 June 2026',
    ]);
  });

  it('prints no line, never zeros, when no profile has loaded', () => {
    const empty = census([], supra);
    expect(empty.records).toBe(0);
    expect(censusItems(empty)).toEqual([]);
  });

  it('is published only when every record data/countries.json lists has its profile', () => {
    const expected = expectedRecords();
    expect(expected.length).toBe(profiles.length);
    expect(censusWhole(profiles, expected)).toBe(true);
    // a partial load (the Notion loader builds with whatever arrived) and an empty one are not whole
    expect(censusWhole(profiles.slice(1), expected)).toBe(false);
    expect(censusWhole([], expected)).toBe(false);
    // a profile the list does not name yet does not hide the census
    expect(censusWhole([...profiles, { iso3: 'XXX' } as CensusRecord], expected)).toBe(true);
  });

  it('agrees with a plain recount of data/profiles', () => {
    const c = census(profiles, SUPRA);
    const posture = (k: string) => profiles.filter((p) => p.coordinationPosture === k).length;
    expect(SUPRA.has('EUU') && SUPRA.has('NATO')).toBe(true);
    expect(c.records).toBe(profiles.length);
    expect(c.countries).toBe(profiles.length - profiles.filter((p) => SUPRA.has(p.iso3)).length);
    expect(c.inBloc).toBe(posture('NIST-bloc') + posture('EU') + posture('sovereign-bloc'));
    expect(c.unaligned).toBe(posture('engaged-unaligned'));
    expect(c.noPosture).toBe(profiles.filter((p) => !p.coordinationPosture).length);
    expect(c.inBloc + c.unaligned + c.noPosture).toBe(c.records);
  });
});
