import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDocuments, getProfile, getProfiles, listCountries } from './atlas';
import { POSTURE_META, ROLE_META } from '../process';

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'lab-atlas-'));
  mkdirSync(join(root, 'data/profiles'), { recursive: true });
  mkdirSync(join(root, 'data/results'), { recursive: true });
  writeFileSync(join(root, 'data/countries.json'), JSON.stringify([{ iso3: 'FRA', iso2: 'FR', name: 'France', priority: 1 }]));
  writeFileSync(
    join(root, 'data/profiles/FRA.json'),
    JSON.stringify({
      iso3: 'FRA',
      country: 'France',
      coordinationPosture: 'EU',
      standardsRole: 'contextualiser',
      confidence: 'Low',
      migrationTimeline: '2030 | High-risk use cases\n2035 | All systems',
      govActors: 'ANSSI | national authority',
      mainRegulation: 'Law X | national | binding-law',
      analyticalNote: 'INTERNAL, must never leave the mirror',
      classificationBasis: 'working notes',
      provenance: ['review item'],
    }),
  );
  writeFileSync(
    join(root, 'data/results/FRA.json'),
    JSON.stringify([
      { title: 'Public doc', country: 'FRA', issuingOrg: 'ANSSI', year: 2026, docType: 'Guidance', tier: 'T1', url: 'https://cyber.gouv.fr/x', summary: 's', included: true },
      { title: 'Draft doc', country: 'FRA', issuingOrg: 'X', year: null, docType: null, tier: null, url: null, summary: null, included: false },
    ]),
  );
});

describe('Atlas profiles for the lab tools', () => {
  it('never returns the internal analytical note or working fields', () => {
    const p = getProfile('fra', { root })!;
    const json = JSON.stringify(p);
    expect(json).not.toContain('analyticalNote');
    expect(json).not.toContain('INTERNAL');
    expect(json).not.toContain('classificationBasis');
    expect(json).not.toContain('review item');
    expect(JSON.stringify(getProfiles({ root }))).not.toContain('INTERNAL');
  });

  it('reuses the Atlas parsers and metadata', () => {
    const p = getProfile('FRA', { root })!;
    expect(p.posture).toBe(POSTURE_META.EU);
    expect(p.role).toBe(ROLE_META.contextualiser);
    expect(p.opacity).toBe(0.5);
    expect(p.timeline.map((m) => m.year)).toEqual([2030, 2035]);
    expect(p.actors[0]).toEqual({ name: 'ANSSI', role: 'national authority' });
    expect(p.regulation[0].status).toBe('binding-law');
  });

  it('returns null for a country with no profile', () => {
    expect(getProfile('XXX', { root })).toBeNull();
  });
});

describe('Atlas documents for the lab tools', () => {
  it('returns only included documents unless drafts are asked for', () => {
    expect(getDocuments('FRA', { root }).map((d) => d.title)).toEqual(['Public doc']);
    expect(getDocuments('FRA', { root, includeDrafts: true })).toHaveLength(2);
  });
});

describe('the real canonical mirror', () => {
  it('loads every profile without exposing internal notes', () => {
    const all = getProfiles();
    expect(all.length).toBeGreaterThan(100);
    expect(JSON.stringify(all)).not.toContain('analyticalNote');
    expect(listCountries().length).toBe(197);
  });
});
