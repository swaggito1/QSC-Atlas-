import { describe, expect, it } from 'vitest';
import { EU_ROADMAP, LIMITS, START_SPAN, axisDomain, basisOf, computeExposure, furthestHorizon, initialState, labelRows, listText, markerClusters, mergeDeadlines, parseState, periodFor, placesWithPeriod, readoutSentences, shelfLifeAfterChoice, stackTiers, startingYears, stateToSearch, surveyHorizonAt, surveySentences, surveyedAtOrBefore, yearsText } from './exposure';
import type { ExtraDeadline, ShelfPeriod, SurveyForClock } from './exposure';
import { chooseSurvey, documentDate, loadExposure, rowLocator } from './exposure-data';
import { allPrivateRoot } from './registry-fixture';
import { POSTURE_META } from '../process';
import { siteOrigin } from '../site/config';

const now = new Date('2026-11-10T12:00:00Z');
const survey: SurveyForClock = {
  id: 'test',
  title: 'Test Survey 2025',
  baseYear: 2025,
  published: '2026-03',
  verified: true,
  points: [
    { horizonYears: 5, lower: 0.1, upper: 0.2 },
    { horizonYears: 10, lower: 0.28, upper: 0.49 },
    { horizonYears: 15, lower: 0.51, upper: 0.7 },
    { horizonYears: 30, lower: 0.8, upper: 0.9 },
  ],
};
const copy = {
  readoutToday: 'today until {secrecyUntilForToday}.',
  readoutMigration: 'takes {migrationYears}, ends {migrationEnds}, last until {secrecyUntilForLast}.',
  readoutWithin: 'The experts surveyed for the {surveyTitle} put the chance within {h} years of {baseYear} at {lower} to {upper} per cent.',
  readoutBeyond: 'beyond {lastSurveyedYear}, {surveyTitle}.',
  readoutBefore: 'before {firstSurveyedYear}, {surveyTitle}.',
  readoutNoSurvey: 'no survey.',
};

describe('the three horizons', () => {
  it('computes today, the migration end and the last data sent the old way', () => {
    expect(computeExposure({ now, shelfLifeYears: 25, migrationYears: 7 })).toMatchObject({ year: 2026, migrationEnds: 2033, secrecyUntilForToday: 2051, secrecyUntilForLast: 2058, laterHorizon: 2058 });
    expect(computeExposure({ now, shelfLifeYears: 1, migrationYears: 1, migrationStartYear: 2030 })).toMatchObject({ migrationStart: 2030, migrationEnds: 2031, secrecyUntilForLast: 2032 });
    // a start year in the past starts now
    expect(computeExposure({ now, shelfLifeYears: 5, migrationYears: 5, migrationStartYear: 2020 }).migrationStart).toBe(2026);
  });
});

describe('the survey band', () => {
  it('reads the survey exactly at a surveyed horizon', () => {
    expect(surveyHorizonAt(survey, 2035)).toEqual({ horizonYears: 10, lower: 0.28, upper: 0.49, interpolated: false });
  });
  it('interpolates in a straight line between two surveyed horizons and says so', () => {
    const v = surveyHorizonAt(survey, 2045)!; // horizon 20, between 15 and 30
    expect(v.interpolated).toBe(true);
    expect(v.lower).toBeCloseTo(0.51 + (5 / 15) * (0.8 - 0.51));
  });
  it('never extrapolates: null before the first and after the last horizon', () => {
    expect(surveyHorizonAt(survey, 2029)).toBeNull();
    expect(surveyHorizonAt(survey, 2056)).toBeNull();
    expect(surveyHorizonAt(survey, 2025)).toBeNull(); // no zero assumed at horizon zero
  });
  it('picks the nearest surveyed horizon at or before a year, never an interpolated one', () => {
    expect(surveyedAtOrBefore(survey, 2044)?.horizonYears).toBe(15);
    expect(surveyedAtOrBefore(survey, 2029)).toBeNull();
  });
  it('sets the axis to at least 40 years and past the last horizon', () => {
    expect(axisDomain(2026, survey)).toEqual([2026, 2066]);
    expect(axisDomain(2026, survey, 2100)).toEqual([2026, 2102]);
  });
});

describe('the readout', () => {
  const r = (x: number, y: number) => computeExposure({ now, shelfLifeYears: x, migrationYears: y });
  it('inside the survey range: names the nearest surveyed horizon at or before', () => {
    expect(readoutSentences(r(10, 5), { migrationYears: 5 }, survey, copy)).toMatchSnapshot();
  });
  it('beyond the survey range', () => {
    expect(readoutSentences(r(40, 10), { migrationYears: 10 }, survey, copy)[2]).toBe('beyond 2055, Test Survey 2025.');
  });
  it('before the survey range', () => {
    expect(readoutSentences(r(1, 1), { migrationYears: 1 }, survey, copy)[2]).toBe('before 2030, Test Survey 2025.');
  });
  it('without a verified survey', () => {
    expect(readoutSentences(r(10, 5), { migrationYears: 5 }, null, copy)[2]).toBe('no survey.');
  });
  it('says "1 year" for a one-year migration, and "years" otherwise', () => {
    const c = { ...copy, readoutMigration: 'takes {migrationDuration}.' };
    expect(readoutSentences(r(10, 1), { migrationYears: 1 }, survey, c)[1]).toBe('takes 1 year.');
    expect(readoutSentences(r(10, 7), { migrationYears: 7 }, survey, c)[1]).toBe('takes 7 years.');
    expect(yearsText(1, { yearUnit: 'yr', yearsUnit: 'yrs' })).toBe('1 yr');
  });
  it('the live copy fills every placeholder in the readout', () => {
    const live = loadExposure().copy;
    for (const [x, y] of [[10, 1], [10, 7], [40, 10], [1, 1]]) {
      for (const s of readoutSentences(r(x, y), { migrationYears: y }, survey, live as never)) expect(s).not.toMatch(/\{\w+\}/);
    }
  });
  it('lists every wording the third sentence can take, so the page can keep room for the longest', () => {
    const live = loadExposure().copy as never;
    for (const sv of [survey, null]) {
      const all = surveySentences(sv, live);
      for (const x of [1, 5, 10, 25, 40, 60, 100]) {
        for (const y of [1, 7, 20]) {
          for (const start of [2026, 2036]) {
            const res = computeExposure({ now, shelfLifeYears: x, migrationYears: y, migrationStartYear: start });
            expect(all).toContain(readoutSentences(res, { migrationYears: y }, sv, live)[2]);
          }
        }
      }
      for (const t of all) expect(t).not.toMatch(/\{\w+\}/);
    }
  });
});

describe('target dates', () => {
  const extras: ExtraDeadline[] = [
    { id: 'eu-2030', date: '2030', label: 'High-risk use cases migrated', issuer: 'NIS Cooperation Group', lane: 'roadmap', appliesToPosture: 'EU', documentStatus: 'recommendation', sourceUrl: 'https://example.org/roadmap', sourceLabel: 'EU roadmap', verified: true },
    { id: 'eu-2035', date: '2035', label: 'As much as feasible', issuer: 'NIS Cooperation Group', lane: 'roadmap', appliesToPosture: 'EU', documentStatus: 'recommendation', sourceUrl: 'https://example.org/roadmap', sourceLabel: 'EU roadmap', verified: true },
    { id: 'nist-2035', date: '2035', label: 'NIST proposes disallowing', issuer: 'NIST', lane: 'standards', appliesToPosture: null, documentStatus: 'draft', sourceUrl: 'https://example.org/nist', sourceLabel: 'NIST IR 8547', verified: true },
    { id: 'no-source', date: '2032', label: 'Unsourced', issuer: 'X', lane: 'standards', appliesToPosture: null, documentStatus: 'final', sourceUrl: null, sourceLabel: '', verified: true },
  ];
  const base = { jurisdictionName: 'France', iso3: 'FRA', posture: 'EU', euMember: true, postureColor: '#5b54a8', profileVerified: true, profileHref: '/countries/fra', opacity: 1, extras, roadmapColor: '#5b54a8' };

  it('adds roadmap milestones to an EU member only where its profile lacks them, and reports each decision', () => {
    const { deadlines, decisions } = mergeDeadlines({ ...base, profileLines: [{ year: 2030, label: 'High-risk cases migrated (EU coordinated roadmap)', display: '2030' }] });
    expect(decisions).toEqual([
      { id: 'eu-2030', year: 2030, action: 'skipped', reason: 'the profile already has "High-risk cases migrated (EU coordinated roadmap)"' },
      { id: 'eu-2035', year: 2035, action: 'added', reason: 'no profile line for this year mentions the EU roadmap' },
    ]);
    expect(deadlines.map((d) => `${d.lane}:${d.year}`)).toEqual(['jurisdiction:2030', 'roadmap:2035', 'standards:2035']);
  });

  it('adds the roadmap through EU membership, never through posture, and never shows a date without a source', () => {
    // an EU posture without membership gets no roadmap row
    expect(mergeDeadlines({ ...base, euMember: false, profileLines: [] }).deadlines.map((d) => d.id)).toEqual(['nist-2035']);
    // membership without the EU posture gets them
    expect(mergeDeadlines({ ...base, posture: null, profileLines: [] }).deadlines.map((d) => d.id)).toEqual(['eu-2030', 'eu-2035', 'nist-2035']);
    const { deadlines } = mergeDeadlines({ ...base, posture: 'NIST-bloc', euMember: false, profileLines: [] });
    expect(deadlines.every((d) => d.sourceUrl)).toBe(true);
  });

  it('carries an Unverified profile through with its opacity, linked to the profile the page was given', () => {
    const { deadlines } = mergeDeadlines({ ...base, posture: null, euMember: false, profileVerified: false, opacity: 0.5, profileLines: [{ year: 2031, label: 'Target', display: '2031' }] });
    expect(deadlines[0]).toMatchObject({ verified: false, opacity: 0.5, sourceUrl: '/countries/fra' });
  });

  it('names no issuer for a profile line, links it to the profile, and writes a range with "to"', () => {
    const { deadlines } = mergeDeadlines({ ...base, jurisdictionName: 'the European Union', iso3: 'EUU', posture: null, profileHref: '/countries/euu', extras: [], profileLines: [{ year: 2024, label: 'Inventory', display: '2024-2026' }] });
    expect(deadlines[0]).toMatchObject({ issuer: null, documentStatus: null, display: '2024 to 2026', sourceLabel: 'The European Union in the Atlas', sourceUrl: '/countries/euu' });
  });

  it('carries the kind of document each sourced extra comes from', () => {
    const { deadlines } = mergeDeadlines({ ...base, profileLines: [] });
    expect(Object.fromEntries(deadlines.map((d) => [d.id, d.documentStatus]))).toEqual({ 'eu-2030': 'recommendation', 'eu-2035': 'recommendation', 'nist-2035': 'draft' });
  });

  it('gives an empty lane for a place with no timeline and no applicable extras', () => {
    expect(mergeDeadlines({ ...base, posture: 'engaged-unaligned', euMember: false, profileLines: [], extras: extras.filter((e) => e.lane === 'roadmap') }).deadlines).toEqual([]);
  });

  describe('a profile line that restates the EU roadmap', () => {
    // Belgium's profile words the roadmap's years in its own terms, so the old rule (a line that
    // mentions the EU) missed them and each year was drawn twice
    const lines = [
      { year: 2030, label: 'High-risk use cases migrated', display: '2030' },
      { year: 2035, label: 'Full migration of all systems complete', display: '2035' },
    ];
    const annotations = [
      { year: 2030, match: 'High-risk use cases migrated', restates: EU_ROADMAP, bindingness: 'soft-law', lead: true },
      { year: 2035, match: 'Full migration of all systems complete', restates: EU_ROADMAP, bindingness: 'soft-law', lead: true },
    ];
    const bel = { ...base, jurisdictionName: 'Belgium', iso3: 'BEL', profileHref: '/countries/bel', profileLines: lines };

    it('was drawn twice without the annotation', () => {
      const own = mergeDeadlines(bel).deadlines.filter((d) => d.lane !== 'standards');
      expect(own.map((d) => d.year)).toEqual([2030, 2030, 2035, 2035]);
    });

    it('is drawn once, as the roadmap row, which names the line it stands in for', () => {
      const { deadlines, decisions } = mergeDeadlines({ ...bel, annotations });
      const own = deadlines.filter((d) => d.lane !== 'standards');
      expect(own.map((d) => `${d.lane}:${d.year}`)).toEqual(['roadmap:2030', 'roadmap:2035']);
      expect(own.map((d) => d.restated)).toEqual([
        { label: 'High-risk use cases migrated', lead: true },
        { label: 'Full migration of all systems complete', lead: true },
      ]);
      expect(decisions.map((d) => `${d.action}:${d.id}`)).toEqual(['folded:eu-2030', 'folded:eu-2035']);
    });

    it('keeps the line when no roadmap row of that year reaches the place', () => {
      const { deadlines } = mergeDeadlines({ ...bel, euMember: false, annotations });
      expect(deadlines.filter((d) => d.lane !== 'standards').map((d) => `${d.lane}:${d.year}`)).toEqual(['jurisdiction:2030', 'jurisdiction:2035']);
    });

    it('folds one line into each roadmap row at most', () => {
      const twice = [...lines, { year: 2030, label: 'High-risk use cases migrated, second line', display: '2030' }];
      const { deadlines } = mergeDeadlines({ ...bel, profileLines: twice, annotations });
      expect(deadlines.filter((d) => d.year === 2030 && d.lane !== 'standards').map((d) => d.lane)).toEqual(['jurisdiction', 'roadmap']);
    });
  });

  it('says what sets each date only from bindingness records: annotations and the roadmap record, never a document status', () => {
    const { deadlines } = mergeDeadlines({
      ...base,
      profileLines: [
        { year: 2028, label: 'Discovery done', display: '2028' },
        { year: 2029, label: 'Statutory cut-off', display: '2029' },
        { year: 2031, label: 'Unannotated', display: '2031' },
      ],
      annotations: [
        { year: 2028, match: 'Discovery', restates: null, bindingness: 'guidance', lead: false },
        { year: 2029, match: 'Statutory', restates: null, bindingness: 'binding-law', lead: true },
      ],
      roadmapBindingness: { bindingness: 'soft-law', lead: false },
    });
    const by = Object.fromEntries(deadlines.map((d) => [d.id, [d.basis, d.basisLead]]));
    expect(by).toEqual({
      'FRA-0': ['guidance', false],
      'FRA-1': ['law', true],
      'FRA-2': [null, false],
      'eu-2030': ['guidance', false],
      'eu-2035': ['guidance', false],
      // a draft is a lifecycle status, not bindingness, so the NIST row says none is recorded
      'nist-2035': [null, false],
    });
    expect([basisOf('binding-by-market-access'), basisOf('soft-law'), basisOf(null), basisOf('in-force')]).toEqual(['law', 'guidance', null, null]);
  });
});

describe('the live target dates', () => {
  const preview = loadExposure();
  const own = (iso3: string, d = preview) => (d.deadlines[iso3] ?? []).filter((x) => x.lane !== 'standards');

  it('draws 2030 and 2035 once each for Belgium, with the annotation in preview', () => {
    const years = own('BEL').map((d) => d.year);
    expect(years.filter((y) => y === 2030)).toHaveLength(1);
    expect(years.filter((y) => y === 2035)).toHaveLength(1);
    expect(own('BEL').filter((d) => d.restated).map((d) => d.restated!.label).sort()).toEqual(['Full migration of all systems complete', 'High-risk use cases migrated']);
    // the whole of Belgium's list as the page draws it: each year once, each row saying what sets it
    expect(preview.deadlines.BEL.map((d) => ({ year: d.display, lane: d.lane, id: d.id, basis: d.basis, basisLead: d.basisLead, restated: d.restated }))).toMatchSnapshot();
  });

  it('draws no restated EU roadmap year twice for any place', () => {
    for (const iso3 of Object.keys(preview.deadlines)) {
      const roadmapYears = own(iso3).filter((d) => d.lane === 'roadmap').map((d) => d.year);
      const folded = own(iso3).filter((d) => d.restated).map((d) => d.year);
      const lines = own(iso3).filter((d) => d.lane === 'jurisdiction' && folded.includes(d.year));
      expect(lines, iso3).toEqual([]);
      expect(new Set(roadmapYears).size, iso3).toBe(roadmapYears.length);
    }
  });

  it('in production, no row rests on a lead', () => {
    const prod = loadExposure({ env: { VERCEL_ENV: 'production' } });
    for (const rows of Object.values(prod.deadlines)) {
      for (const d of rows) {
        expect(d.basisLead).toBe(false);
        expect(d.restated?.lead ?? false).toBe(false);
      }
    }
  });

  it('calls no date a deadline anywhere in the copy: a date set in law says so in its own line', () => {
    expect(JSON.stringify(preview.copy)).not.toMatch(/deadline/i);
  });
});

describe('the links the page and the island carry', () => {
  it('links each place with dates of its own to Target dates, and each place to its profile', () => {
    const d = loadExposure();
    expect(d.links.compare.BEL).toBe('/target-dates?in=BEL');
    expect(d.links.compare.EUU).toBe('/target-dates?in=EUU');
    expect(d.links.profile.BEL).toEqual({ href: '/countries/bel', name: 'Belgium' });
    expect(d.links.profile.EUU?.href).toBe('/countries/euu');
    expect(d.frame.notForYou?.href).toBe('/target-dates');
  });

  it('with Target dates hidden, names it nowhere: not in the island props, not in the frame', () => {
    // the Exposure Clock alone, forced public on the real registry with every tool private again
    const env = { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'exposure' };
    const d = loadExposure({ root: allPrivateRoot(), env });
    expect(d.links.compare).toEqual({});
    expect(d.frame.notForYou).toBeNull();
    const { decisions, sources, asOf, frame, ...island } = d;
    expect(JSON.stringify(island)).not.toMatch(/target-dates/);
    expect(JSON.stringify(frame).match(/href":"[^"]*target-dates/)).toBeNull();
    // the profiles are always built, so their links stay
    expect(d.links.profile.BEL?.href).toBe('/countries/bel');
  });

  it('reads its counts from the data for the facts line', () => {
    const { frame } = loadExposure();
    expect(frame.reads.map((r) => r.label)).toEqual([
      expect.stringMatching(/^Reads \d+ profile timelines$/),
      'the 2025 expert survey',
      'periods from laws and official rules for 7 places',
    ]);
  });
});

describe('date marks on one line', () => {
  it('leaves marks that are far apart on the lane rule', () => {
    expect(stackTiers([100, 200, 300], 9)).toEqual([0, 0, 0]);
  });
  it('steps marks of one year, or of nearby years, away from the rule, never along the axis', () => {
    expect(stackTiers([100, 100, 100], 9)).toEqual([0, 1, 2]);
    // Germany at a phone width with a long shelf life: 2026 twice, 2030 twice, 2031, 2035 twice
    expect(stackTiers([0, 0, 10.5, 10.5, 13.1, 23.6, 23.6], 9)).toEqual([0, 1, 0, 1, 2, 0, 1]);
  });
  it('never leaves two marks of one tier closer than the gap, whatever the input order', () => {
    const xs = [41, 10, 12, 300, 12, 13, 40, 302];
    const t = stackTiers(xs, 9);
    for (let a = 0; a < xs.length; a++) {
      for (let b = a + 1; b < xs.length; b++) if (t[a] === t[b]) expect(Math.abs(xs[a] - xs[b])).toBeGreaterThanOrEqual(9);
    }
  });

  it('gives a lone mark a 44px target centred on it', () => {
    expect(markerClusters([100])).toEqual([{ members: [0], x: 78, w: 44 }]);
  });
  it('lets marks closer than 44px share one target that spans them', () => {
    expect(markerClusters([110, 100, 200])).toEqual([
      { members: [1, 0], x: 78, w: 54 },
      { members: [2], x: 178, w: 44 },
    ]);
  });
  it('keeps every target at least 44px wide and no two overlapping', () => {
    const t = markerClusters([10, 30, 52, 96, 140, 141, 300]);
    t.forEach((c) => expect(c.w).toBeGreaterThanOrEqual(44));
    t.slice(1).forEach((c, k) => expect(c.x).toBeGreaterThanOrEqual(t[k].x + t[k].w));
  });

  it('puts a year label in the first row with room, and leaves it out when no row has room', () => {
    expect(labelRows([100, 120, 140, 200], 32)).toEqual([0, 1, 0, 0]);
    expect(labelRows([100, 105, 110], 32)).toEqual([0, 1, null]);
    // the case a single alternating row got wrong: four labels a few pixels apart
    expect(labelRows([12, 16, 33, 49], 32)).toEqual([0, 1, null, 0]);
  });
  it('gives every label a row when given as many rows as labels, as the chart does', () => {
    expect(labelRows([12, 16, 33, 49], 32, 4)).toEqual([0, 1, 2, 0]);
  });
});

describe('the shelf life after a choice', () => {
  it('takes the sourced period for the new choice, up to the slider maximum', () => {
    expect(shelfLifeAfterChoice({ x: 25, before: null, after: 60, userX: 25 })).toBe(60);
    expect(shelfLifeAfterChoice({ x: 25, before: null, after: 100, userX: 25 })).toBe(100);
    expect(shelfLifeAfterChoice({ x: 25, before: null, after: 140, userX: 25 })).toBe(100);
  });
  it('returns to the visitor own value when a sourced period they had not changed stops applying', () => {
    expect(shelfLifeAfterChoice({ x: 60, before: 60, after: null, userX: 25 })).toBe(25);
  });
  it('keeps the visitor own value otherwise', () => {
    expect(shelfLifeAfterChoice({ x: 40, before: 60, after: null, userX: 40 })).toBe(40);
    expect(shelfLifeAfterChoice({ x: 50, before: null, after: null, userX: 50 })).toBe(50);
  });
});

describe('the period a kind of data starts the shelf life from', () => {
  const at = (iso3: string | null, years: number | null, extra: Partial<ShelfPeriod> = {}): ShelfPeriod => ({
    iso3, euMembers: false, years, basis: 'closure', basisNote: 'n', sourceUrl: 'https://example.org', sourceName: 's', verified: true, words: [], ...extra,
  });
  const eu = (iso3: string) => ['DEU', 'FRA', 'ESP'].includes(iso3);
  const periods = [at('FRA', 75), at('EUU', 5, { euMembers: true, basis: 'retention' }), at(null, null, { basis: 'confidentiality' }), at('GBR', 100)];

  it("takes the place's own period first, then an EU rule for a Member State, then the general value", () => {
    expect(periodFor(periods, 'FRA', eu)).toMatchObject({ scope: 'place', period: { years: 75 } });
    expect(periodFor(periods, 'ESP', eu)).toMatchObject({ scope: 'eu', period: { years: 5 } });
    expect(periodFor(periods, 'EUU', eu)).toMatchObject({ scope: 'place', period: { years: 5 } });
    expect(periodFor(periods, 'USA', eu)).toMatchObject({ scope: 'general', period: { years: null } });
    expect(periodFor(periods, 'none', eu)).toMatchObject({ scope: 'general' });
  });
  it('finds nothing where the Atlas documents nothing, and never lets an EU rule reach a place outside the EU', () => {
    const own = [at('FRA', 75), at('EUU', 30)];
    expect(periodFor(own, 'USA', eu)).toBeNull();
    expect(periodFor(own, 'none', eu)).toBeNull();
    expect(periodFor(own, 'ESP', eu)).toBeNull(); // an EU record that does not reach the Member States
    expect(periodFor([at('EUU', 5, { euMembers: true })], 'GBR', eu)).toBeNull();
  });
  it('starts a duty with no end at the slider maximum, and a fixed period at its own figure', () => {
    expect(startingYears(at(null, null))).toBe(LIMITS.x[1]);
    expect(startingYears(at('FRA', 75))).toBe(75);
    expect(startingYears(null)).toBeNull();
  });
  it('names the places that hold a period, an EU rule as one phrase, never the chosen place', () => {
    const name = (iso3: string) => ({ FRA: 'France', GBR: 'the United Kingdom', USA: 'the United States', EUU: 'the European Union' })[iso3] ?? null;
    expect(placesWithPeriod([at('FRA', 75), at('GBR', 100)], 'USA', name, eu, 'every EU Member State')).toEqual(['France', 'the United Kingdom']);
    expect(placesWithPeriod([at('FRA', 75), at('GBR', 100)], 'GBR', name, eu, 'every EU Member State')).toEqual(['France']);
    expect(placesWithPeriod([at('FRA', 10), at('EUU', 5, { euMembers: true })], 'USA', name, eu, 'every EU Member State')).toEqual(['every EU Member State']);
    expect(listText(['France', 'Germany', 'Italy'])).toBe('France, Germany and Italy');
    expect(listText(['France'])).toBe('France');
  });
});

describe('the live periods behind "What do you protect?"', () => {
  const data = loadExposure();
  const eu = (iso3: string) => data.jurisdictions.some((j) => j.iso3 === iso3 && j.eu);
  const at = (c: string, j: string) => periodFor(data.presets.find((p) => p.id === c)!.periods, j, eu);

  it('gives every kind of data a documented period somewhere, each naming its source by a link', () => {
    for (const p of data.presets) {
      expect(p.periods.length, p.id).toBeGreaterThan(0);
      for (const d of p.periods) {
        expect(d.sourceUrl).toMatch(/^https:\/\//);
        expect(d.sourceName.length).toBeGreaterThan(3);
        expect(['confidentiality', 'closure', 'retention']).toContain(d.basis);
      }
    }
  });
  it('sets a period for a choice that used to leave the slider alone', () => {
    expect(at('citizen-health-records', 'FRA')?.period).toMatchObject({ years: 25, basis: 'closure' });
    expect(at('citizen-health-records', 'DEU')?.period).toMatchObject({ years: null, basis: 'confidentiality' });
    expect(at('classified-government', 'USA')?.period).toMatchObject({ years: 25, basis: 'confidentiality' });
    expect(at('diplomatic', 'EUU')?.period).toMatchObject({ years: 30, basis: 'closure' });
    expect(at('identity-registry', 'DEU')?.period.years).toBe(110);
    // the anti-money laundering directive reaches a Member State without a rule of its own, as retention
    expect(at('financial-transactions', 'FRA')).toMatchObject({ scope: 'eu', period: { years: 5, basis: 'retention' } });
    expect(at('financial-transactions', 'DEU')).toMatchObject({ scope: 'place', period: { years: 10 } });
    // with no country chosen, the general value: a trade secret is protected with no end
    expect(at('trade-secrets', 'none')).toMatchObject({ scope: 'general', period: { years: null } });
  });
  it('documents nothing it has not read: no period for tax records outside Germany, none for a place outside the EU for transactions', () => {
    expect(at('tax-records', 'ESP')).toBeNull();
    expect(at('tax-records', 'none')).toBeNull();
    expect(at('financial-transactions', 'USA')).toBeNull();
  });
  it('carries the source words only in a build that may carry them', () => {
    expect(data.presets.some((p) => p.periods.some((d) => d.words.length > 0))).toBe(true);
    const prod = loadExposure({ env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1' } });
    expect(prod.presets.every((p) => p.periods.every((d) => d.words.length === 0))).toBe(true);
  });
});

describe('the survey edition and its rows', () => {
  const ed = (baseYear: number, verify: boolean) => ({ survey: { baseYear, verify } });
  it('falls back in production to the latest checked edition while a newer one is a lead', () => {
    const editions = [ed(2024, false), ed(2025, false), ed(2026, true)];
    expect(chooseSurvey(editions, true)?.survey.baseYear).toBe(2025);
    expect(chooseSurvey(editions, false)?.survey.baseYear).toBe(2026);
    expect(chooseSurvey([ed(2026, true)], true)).toBeNull();
  });
  it('shows the band in a production build', () => {
    expect(loadExposure({ env: { VERCEL_ENV: 'production' } }).survey?.id).toBe('qtt-2025');
  });
  it('gives each row a report locator that supports both of its figures', () => {
    const url = 'https://example.org/report.pdf';
    const point = {
      lower: 0.05,
      upper: 0.15,
      provenance: [
        { url, excerpt: 'leads to ~49% within a decade and ~15% within 5 years.', locator: 'p. 6' },
        { url: 'https://example.org/summary.pdf', excerpt: 'between 5% and 15%', locator: 'p. 3' },
        { url, excerpt: 'Figure 17 [5y] Optimistic 15% Pessimistic 5%', locator: 'p. 31, Figure 17' },
      ],
    };
    expect(rowLocator(point, url)).toBe('p. 31, Figure 17');
    expect(rowLocator({ ...point, provenance: point.provenance.slice(0, 2) }, url)).toBe('p. 6');
    const rows = loadExposure().surveyRows;
    expect(rows.find((r) => r.horizonYears === 10)?.page).toBe('p. 54');
    expect(rows.find((r) => r.horizonYears === 20)?.page).toMatch(/Figure 17/);
  });
});

describe('the sources list', () => {
  it('reads a document date from its provenance, and never guesses one', () => {
    const url = 'https://example.org';
    expect(documentDate([{ url, excerpt: 'Date Published: November 12, 2024 Comments Due: January 10, 2025' }])).toBe('2024-11-12');
    expect(documentDate([{ url, title: 'A Roadmap, Version 1.1 (11.06.2025)', excerpt: 'x' }])).toBe('2025-06-11');
    expect(documentDate([{ url, excerpt: 'no date here' }])).toBeNull();
  });
  it('dates the roadmap and the NIST draft, and lists the legal texts behind the defaults', () => {
    const { sources } = loadExposure();
    expect(sources.find((s) => s.url?.includes('NIST.IR.8547'))?.date).toBe('2024-11-12');
    expect(sources.find((s) => s.url?.includes('document/117507'))?.date).toBe('2025-06-11');
    for (const law of ['stgb/__203', 'LEGIARTI000043887707', 'BOE-A-1985-12534', 'art122', 'section-160.103', 'cnsi-eo', 'bsvwvbund_13032023', 'pstg/__5', 'barchg_2017/__11', 'ao_1977/__147', 'CELEX:32001R1049', 'CELEX:02015L0849', 'ukpga/2000/36/section/63', 'wipo-guide-to-trade-secrets']) {
      expect(sources.some((s) => s.url?.includes(law))).toBe(true);
    }
  });
  it('cites the Atlas at the address the page gives it, so the reference follows a change of domain', () => {
    const atlas = (site?: string) => loadExposure({}, now, site).sources.find((s) => s.author === 'QSC Atlas')?.url;
    expect(atlas('https://example.org/')).toBe('https://example.org/countries');
    // the default is the site astro.config.mjs names, so the cutover is one line there
    expect(atlas()).toBe(`${siteOrigin()}/countries`);
  });
});

describe('the posture beside the target dates heading', () => {
  const d = loadExposure();
  it('names a posture for every jurisdiction in the select, read from its profile', () => {
    expect(d.jurisdictions.every((j) => d.postures[j.iso3]?.label === j.group)).toBe(true);
  });
  it('names the European Union by the posture its own profile records', () => {
    expect(d.postures.EUU).toEqual({ label: POSTURE_META.EU.label, short: POSTURE_META.EU.short, color: POSTURE_META.EU.color });
  });
});

describe('the URL state', () => {
  const defaults = { c: 'other', j: 'none', x: 10, y: 7, s: null, view: 'all' as const, present: false };
  it('round-trips, including the public-admin view and presentation mode', () => {
    const st = { c: 'tax-records', j: 'FRA', x: 25, y: 7, s: 2028, view: 'public-admin' as const, present: true };
    expect(parseState(stateToSearch(st), defaults, 2026)).toEqual(st);
  });
  it('starts the shelf life at the sourced period when a link names what and where but no shelf life', () => {
    const data = loadExposure();
    const eu = (iso3: string) => data.jurisdictions.some((x) => x.iso3 === iso3 && x.eu);
    const sourced = (c: string, j: string) => startingYears(periodFor(data.presets.find((p) => p.id === c)?.periods ?? [], j, eu)?.period ?? null);
    // the profile's "Periods the Exposure Clock has read for Germany" row links here with ?c=&j= only
    expect(initialState('?c=tax-records&j=DEU', defaults, 2026, sourced)).toEqual({ state: { ...defaults, c: 'tax-records', j: 'DEU', x: 60 }, userX: 10 });
    expect(initialState('?c=law-enforcement&j=GBR', defaults, 2026, sourced).state.x).toBe(100);
    // an explicit shelf life always wins, and is the visitor's own
    expect(initialState('?c=tax-records&j=DEU&x=12', defaults, 2026, sourced)).toMatchObject({ state: { x: 12 }, userX: 12 });
    // a link to the sourced value itself keeps the default as the visitor's own value
    expect(initialState('?c=tax-records&j=DEU&x=60', defaults, 2026, sourced).userX).toBe(10);
    // nothing sourced for the pair: the default, or the link's own value
    expect(initialState('?c=tax-records&j=ESP', defaults, 2026, sourced)).toMatchObject({ state: { x: 10 }, userX: 10 });
    // a duty with no end starts the slider at its maximum, wherever the general value applies
    expect(initialState('?c=trade-secrets&j=DEU', defaults, 2026, sourced).state.x).toBe(100);
    expect(initialState('?c=trade-secrets&j=none', defaults, 2026, sourced).state.x).toBe(100);
    expect(initialState('?j=FRA&x=30', defaults, 2026, sourced)).toMatchObject({ state: { x: 30 }, userX: 30 });
  });
  it('clamps values to the slider ranges, the shelf life to 100 years', () => {
    expect(parseState('?x=500&y=0&s=1999', defaults, 2026)).toMatchObject({ x: 100, y: 1, s: 2026 });
    expect(parseState('?x=100', defaults, 2026).x).toBe(100);
  });
  it('starts the migration at most ten years ahead, and knows the furthest horizon the sliders reach', () => {
    expect(parseState('?s=2099', defaults, 2026).s).toBe(2026 + START_SPAN);
    const furthest = computeExposure({ now, shelfLifeYears: LIMITS.x[1], migrationYears: LIMITS.y[1], migrationStartYear: 2026 + START_SPAN });
    expect(furthestHorizon(2026)).toBe(furthest.laterHorizon);
  });
});
