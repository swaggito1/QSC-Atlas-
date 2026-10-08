import { describe, expect, it, beforeAll } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REREAD, byDate, datePlaces, datesFor, earliest, foldLines } from './dates';
import type { DateRow } from './dates';
import { projectRoot } from '../lab/load';
import { allPrivateRoot } from '../lab/registry-fixture';
import { dateAnnotation, loadAnnotations } from './annotations';
import { guides } from './joins';
import { targetDatesData } from '../../components/site/pages/target-dates/data';
import {
  AXIS_START,
  compareRows,
  csvTable,
  groupByYear,
  laneOf,
  lawNote,
  narrowing,
  nextLinks,
  packRows,
  passes,
  unpackRows,
  readState,
  readout,
  scopeText,
  visibleRows,
  writeState,
} from '../../components/site/pages/target-dates/model';

const PROD = { env: { VERCEL_ENV: 'production' } };
const PREVIEW = { env: {} };
// the real registry with every tool private again (src/lib/lab/registry-fixture.ts): an
// all-private production build and the flag states built on it read this root
const STAGE0 = allPrivateRoot();

describe('datesFor', () => {
  it("merges Germany's and France's profile lines, ANSSI's 2030 procurement target and the EU roadmap membership rows", () => {
    const rows = datesFor(['DEU', 'FRA'], PROD);
    const profileLines = (iso3: string) => rows.filter((r) => r.iso3 === iso3 && r.origin === 'profile');
    expect(profileLines('DEU').length).toBeGreaterThan(0);
    expect(profileLines('FRA').length).toBeGreaterThan(0);
    for (const r of [...profileLines('DEU'), ...profileLines('FRA')]) expect(r.relation).toBe('own');

    const anssi = rows.filter((r) => r.guide === 'anssi-faq');
    expect(anssi).toHaveLength(1);
    expect(anssi[0]).toMatchObject({ iso3: 'FRA', year: 2030, kind: 'procurement', relation: 'own', origin: 'guide', issuer: 'ANSSI' });

    for (const iso3 of ['DEU', 'FRA']) {
      const eu = rows.filter((r) => r.iso3 === iso3 && r.guide === 'eu-roadmap');
      expect(eu.map((r) => r.year)).toEqual([2026, 2030, 2035]);
      for (const r of eu) expect(r).toMatchObject({ relation: 'membership', origin: 'guide', bindingness: 'soft-law' });
    }
    // ANSSI's FAQ never reaches Germany
    expect(rows.some((r) => r.iso3 === 'DEU' && r.guide === 'anssi-faq')).toBe(false);
  });

  it('keeps each place together, in the order asked, and ignores unknown or repeated codes', () => {
    const rows = datesFor(['fra', 'XXX', 'DEU', 'FRA'], PROD);
    const places = rows.map((r) => r.iso3).filter((c, i, a) => a.indexOf(c) === i);
    expect(places).toEqual(['FRA', 'DEU']);
  });

  it('reads kind, status and bindingness only from an annotation or a guide, never from a label', () => {
    for (const r of datesFor(['DEU', 'FRA', 'GBR', 'USA', 'CAN', 'EUU'], PROD)) {
      if (r.origin === 'profile') expect([r.kind, r.status, r.bindingness]).toEqual([null, null, null]);
    }
  });

  it('gives the EU itself the roadmap as its own rows, not membership', () => {
    const eu = datesFor(['EUU'], PROD).filter((r) => r.guide === 'eu-roadmap');
    expect(eu).toHaveLength(3);
    for (const r of eu) expect(r.relation).toBe('own');
  });

  it('keeps a line whose annotation is still a lead in preview, marked as a lead and naming the guide it may repeat', () => {
    const rows = datesFor(['ITA'], PREVIEW);
    for (const [year, kind] of [[2030, 'priority'], [2035, 'complete']] as const) {
      const line = rows.filter((r) => r.year === year && r.origin === 'profile');
      expect(line).toHaveLength(1);
      expect(line[0]).toMatchObject({ lead: true, kind, restates: 'eu-roadmap', bindingness: 'soft-law', relation: 'own' });
      // the guide's own row stays beside it, and nothing was folded into it on a lead
      expect(rows.find((r) => r.year === year && r.guide === 'eu-roadmap')).toMatchObject({ lead: false, restated: null });
    }
  });

  it('never lets a lead hide a profile line in preview, across every seeded profile', () => {
    const seeded = ['BEL', 'CYP', 'CZE', 'DNK', 'GRC', 'HRV', 'IRL', 'ITA', 'LVA', 'PRT', 'ROU', 'SVN'];
    const rows = datesFor(seeded, PREVIEW);
    for (const iso3 of seeded) {
      const lines = rows.filter((r) => r.iso3 === iso3 && r.origin === 'profile');
      expect(lines.map((r) => r.year), iso3).toEqual([2030, 2035]);
      for (const r of lines) expect(r.lead, iso3).toBe(true);
    }
    expect(rows.some((r) => r.restated)).toBe(false);
  });
});

describe('a confirmed restated line', () => {
  // a copy of the data with the seeded annotations confirmed, as Swann would leave them
  let root: string;
  beforeAll(() => {
    const real = projectRoot();
    root = mkdtempSync(join(tmpdir(), 'site-dates-confirmed-'));
    for (const part of ['data/lab', 'data/profiles', 'data/countries.json']) cpSync(join(real, part), join(root, part), { recursive: true });
    const file = join(root, 'data/lab/annotations/annotations.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const d of data.dates) Object.assign(d, { verify: false, verifiedAt: '2026-10-01' });
    writeFileSync(file, JSON.stringify(data));
  });

  it('is drawn once, as the guide row it restates, in preview and in production', () => {
    for (const env of [{}, { VERCEL_ENV: 'production' }]) {
      const rows = datesFor(['ITA'], { root, env });
      for (const year of [2030, 2035]) {
        const atYear = rows.filter((r) => r.year === year);
        expect(atYear).toHaveLength(1);
        expect(atYear[0]).toMatchObject({ guide: 'eu-roadmap', relation: 'membership', origin: 'guide', lead: false });
        expect(atYear[0].restated).toBeTruthy();
      }
      expect(rows.some((r) => r.origin === 'profile')).toBe(false);
    }
  });

  it('folds only into a guide that reaches the place and holds a milestone that year', () => {
    const opts = { root, env: {} };
    // the seeded lines fold into the EU roadmap
    expect(foldLines('ITA', [{ year: 2030, label: 'High-risk use cases migrated' }], opts)).toEqual(['eu-roadmap']);
    // a year the roadmap has no milestone in, or a line no annotation matches, stays the country's own
    expect(foldLines('ITA', [{ year: 2031, label: 'High-risk use cases migrated' }], opts)).toEqual([null]);
    expect(foldLines('ITA', [{ year: 2030, label: 'Something else' }], opts)).toEqual([null]);
    // each milestone takes one line at most
    expect(foldLines('ITA', [{ year: 2030, label: 'High-risk use cases migrated' }, { year: 2030, label: 'High-risk use cases migrated' }], opts)).toEqual(['eu-roadmap', null]);
  });
});

describe('earliest', () => {
  const row = (year: number, month: number | null, kind: DateRow['kind'], label = 'x'): DateRow => ({
    iso3: 'XXX', place: 'X', year, month, label, kind, status: null, bindingness: null, issuer: null, scope: null, sourceUrl: null, relation: 'own', origin: 'profile', lead: false,
  });

  it('picks the earliest date, then the kind order on a tie', () => {
    expect(earliest([])).toBeNull();
    expect(earliest([row(2031, null, 'plan'), row(2028, null, 'complete'), row(2030, 4, 'plan')])!.year).toBe(2028);
    expect(earliest([row(2030, 12, 'plan'), row(2030, 4, 'complete')])!.month).toBe(4);
    expect(earliest([row(2030, null, 'complete'), row(2030, null, 'priority')])!.kind).toBe('priority');
    expect(earliest([row(2030, null, null), row(2030, null, 'other')])!.kind).toBe('other');
  });

  it('agrees with every row on real data', () => {
    const rows = datesFor(['GBR', 'CAN', 'FRA'], PROD);
    const first = earliest(rows)!;
    for (const r of rows) expect(r.year).toBeGreaterThanOrEqual(first.year);
  });
});

describe('leads', () => {
  // a copy of the readiness, membership and country data, plus one profile whose annotation is a lead
  let root: string;
  beforeAll(() => {
    const real = projectRoot();
    root = mkdtempSync(join(tmpdir(), 'site-dates-'));
    for (const dir of ['data/lab/readiness', 'data/lab/shared', 'data/lab/annotations', 'data/profiles']) mkdirSync(join(root, dir), { recursive: true });
    cpSync(join(real, 'data/lab/readiness/readiness.json'), join(root, 'data/lab/readiness/readiness.json'));
    cpSync(join(real, 'data/lab/shared/memberships.json'), join(root, 'data/lab/shared/memberships.json'));
    cpSync(join(real, 'data/countries.json'), join(root, 'data/countries.json'));
    writeFileSync(
      join(root, 'data/profiles/ZZZ.json'),
      JSON.stringify({ iso3: 'ZZZ', country: 'Testland', dataStatus: 'Partial', migrationTimeline: '2029 | A national plan\n2033 | Systems migrated' }),
    );
    writeFileSync(
      join(root, 'data/lab/annotations/annotations.json'),
      JSON.stringify({
        dates: [
          { verify: true, verifiedAt: null, provenance: [{ url: 'https://example.org/plan', retrievedAt: '2026-10-01', excerpt: 'A national plan', sourceClass: 'trusted-institutional' }], id: 'zzz-2029-plan', iso3: 'ZZZ', year: 2029, match: 'A national plan', kind: 'plan', restates: null, status: 'published', bindingness: 'guidance', scope: null },
        ],
        instruments: [],
      }),
    );
  });

  it('show in preview, marked as leads', () => {
    const rows = datesFor(['ZZZ'], { root, env: {} });
    const lead = rows.find((r) => r.year === 2029)!;
    expect(lead).toMatchObject({ lead: true, kind: 'plan', bindingness: 'guidance', sourceUrl: 'https://example.org/plan' });
    expect(rows.find((r) => r.year === 2033)).toMatchObject({ lead: false, kind: null });
  });

  it('never appear with VERCEL_ENV=production', () => {
    const rows = datesFor(['ZZZ'], { root, env: { VERCEL_ENV: 'production' } });
    expect(rows.some((r) => r.lead)).toBe(false);
    // the line itself is the profile's record and stays, with its kind "not recorded"
    expect(rows.find((r) => r.year === 2029)).toMatchObject({ lead: false, kind: null, bindingness: null, sourceUrl: null });
  });

  it('never appear in production across every real profile', () => {
    const all = readdirSync(join(projectRoot(), 'data/profiles')).map((f: string) => f.replace(/\.json$/, ''));
    expect(all).toHaveLength(197);
    expect(datesFor(all, PROD).filter((r) => r.lead)).toEqual([]);
  });
});

// ---- Target dates, the page (spec 6.3) -----------------------------------------------------------

const FORCED = { root: STAGE0, env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'dates' } };

describe('datePlaces', () => {
  it('offers every place with at least one dated row, the EU and every EU Member State, in alphabetical order', () => {
    for (const opts of [PREVIEW, PROD]) {
      const places = datePlaces(opts);
      const codes = places.map((p) => p.iso3);
      expect(codes).toContain('EUU');
      for (const m of ['AUT', 'BGR', 'EST', 'MLT', 'SVK', 'DEU', 'FRA', 'ITA']) expect(codes).toContain(m);
      for (const p of places) expect(datesFor([p.iso3], opts).length, p.iso3).toBeGreaterThan(0);
      const names = places.map((p) => p.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en-GB')));
      // a Placeholder profile with no line and no membership is not offered
      expect(codes).not.toContain('GIN');
    }
  });
});

describe('no row shows a kind, status or bindingness its records do not hold', () => {
  for (const [mode, opts] of [['preview', PREVIEW], ['production', PROD]] as const) {
    it(`in ${mode}: guide rows carry their milestone's kind and their guide's status and bindingness; profile lines their annotation's, or nothing`, () => {
      const byId = new Map(guides(opts).map((g) => [g.id, g]));
      const rows = datesFor(datePlaces(opts).map((p) => p.iso3), opts);
      expect(rows.length).toBeGreaterThan(100);
      for (const r of rows) {
        if (r.origin === 'guide') {
          const g = byId.get(r.guide!)!;
          expect(g, r.guide!).toBeTruthy();
          const m = g.milestones.find((x) => x.year === r.year && (x.month ?? null) === r.month && x.label === r.label);
          expect(m, `${r.iso3} ${r.year} ${r.label}`).toBeTruthy();
          expect(r.kind).toBe(m!.kind);
          expect(r.status).toBe(g.status);
          expect(r.bindingness).toBe(g.bindingness);
        } else {
          const note = dateAnnotation(r.iso3, r.year, r.label, opts);
          // with no annotation a line records nothing, and is a lead only where the place awaits a re-read
          if (!note) expect([r.kind, r.status, r.bindingness, r.lead], `${r.iso3} ${r.year}`).toEqual([null, null, null, REREAD.has(r.iso3)]);
          else {
            expect([r.kind, r.status, r.bindingness], `${r.iso3} ${r.year}`).toEqual([note.kind, note.status, note.bindingness]);
            expect(r.lead).toBe(note.verify);
          }
          if (mode === 'production') expect(r.lead).toBe(false);
        }
      }
    });
  }

  it('every annotation in use is either confirmed or, in preview only, a lead', () => {
    expect(loadAnnotations(PROD).dates.every((a) => !a.verify)).toBe(true);
  });
});

describe('the Target dates page data', () => {
  it('reads the profile timelines and the guides with dated targets, from the data', () => {
    const d = targetDatesData(PREVIEW);
    const withLines = new Set(d.rows.filter((r) => r.origin === 'profile').map((r) => r.iso3));
    expect(d.timelines).toBe(withLines.size);
    expect(d.guideCount).toBe(guides(PREVIEW).filter((g) => g.verified && g.milestones.length > 0).length);
    expect(d.reads[0].label).toBe(`Reads ${d.timelines} profile timelines`);
    expect(d.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.places.find((p) => p.iso3 === 'EUU')?.posture?.short).toBeTruthy();
  });

  it('with dates forced public in production mode renders no lead row, and links no tool that is not shown', () => {
    const d = targetDatesData(FORCED);
    expect(d.hasLeads).toBe(false);
    expect(d.rows.some((r) => r.lead)).toBe(false);
    expect(d.links.check).toBeNull();
    expect(d.prepare).toBeNull();
    for (const p of d.places) expect([p.exposure, p.rules]).toEqual([null, null]);
    expect(Object.values(d.links.guidePages).every((h) => h === null)).toBe(true);
  });

  it('takes the posture words from POSTURE_META', async () => {
    const { POSTURE_META } = await import('../process');
    const d = targetDatesData(PREVIEW);
    for (const p of d.places) if (p.posture) expect(p.posture.short).toBe(POSTURE_META[p.posture.key as keyof typeof POSTURE_META].short);
  });
});

describe('Target dates, the view', () => {
  const d = targetDatesData(PREVIEW);
  const prod = targetDatesData(PROD);

  it('reads ?in=DEU,FRA,EUU into three places, in alphabetical order, and writes it back', () => {
    const s = readState('?in=DEU,FRA,EUU', d.places);
    expect(s.places).toEqual(['EUU', 'FRA', 'DEU']);
    expect(readState('?in=deu,xxx,DEU', d.places).places).toEqual(['DEU']);
    expect(readState('?in=%E0%A4', d.places).places).toEqual([]);
    expect(writeState(s)).toBe('?in=EUU,FRA,DEU');
    const narrowed = readState('?in=FRA&kind=procurement&lane=guidance', d.places);
    expect([...narrowed.kinds]).toEqual(['procurement']);
    expect(readState(writeState(narrowed), d.places)).toEqual(narrowed);
  });

  it('names the earliest target among DEU, FRA and EUU with its kind and bindingness', () => {
    for (const data of [d, prod]) {
      const text = readout(data.rows, readState('?in=DEU,FRA,EUU', data.places), data.places, data.copy);
      expect(text).toMatch(/^From 2025 on, the earliest target among these places is December 2026, for the European Union, France and Germany: /);
      expect(text).toContain('(NIS Cooperation Group; plan; soft law)');
    }
  });

  it('says "not recorded" for a kind or bindingness the Atlas has not recorded, and "date" rather than "target"', () => {
    const text = readout(prod.rows, readState('?in=NOR', prod.places), prod.places, prod.copy);
    expect(text).toMatch(/^From 2025 on, the earliest date for Norway is 2025: /);
    expect(text).toContain('kind not recorded; bindingness not recorded');
  });

  it('agrees with the axis: the sentence never names a date before 2025', () => {
    for (const p of d.places) {
      const s = readState(`?in=${p.iso3}`, d.places);
      const text = readout(d.rows, s, d.places, d.copy);
      const shown = visibleRows(d.rows, s);
      if (shown.some((r) => r.year >= AXIS_START)) expect(text, p.iso3).toMatch(/^From 2025 on/);
      expect(text, p.iso3).not.toMatch(/deadline/i);
    }
  });

  it('shows an EU Member State the EU roadmap through membership, addressed to Member States', () => {
    const s = readState('?in=ITA', d.places);
    const eu = visibleRows(d.rows, s).filter((r) => r.guide === 'eu-roadmap');
    expect(eu.map((r) => r.year)).toEqual([2026, 2030, 2035]);
    for (const r of eu) {
      expect(r.relation).toBe('membership');
      expect(scopeText(r, d.copy)).toBe('Addressed to Member States');
    }
    expect(readout(d.rows, s, d.places, d.copy)).toContain('NIS Cooperation Group, addressed to Member States');
  });

  it('packs the rows for the island and unpacks them exactly', () => {
    for (const data of [d, prod]) {
      const packed = packRows(data.rows);
      expect(unpackRows(JSON.parse(JSON.stringify(packed)), data.places)).toEqual(data.rows);
      expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(data.rows).length / 2);
    }
  });

  it('files each row in one lane, from its bindingness and its status together', () => {
    const lane = (bindingness: DateRow['bindingness'], status: DateRow['status']) => laneOf({ bindingness, status });
    expect([lane('binding-law', 'in-force'), lane('binding-by-market-access', 'applies-from'), lane('binding-law', 'adopted')]).toEqual(['law', 'law', 'law']);
    expect([lane('soft-law', 'published'), lane('guidance', 'published'), lane('soft-law', 'adopted')]).toEqual(['guidance', 'guidance', 'guidance']);
    // a proposal is never drawn as law, nor a dead or superseded text as anything set
    for (const s of ['proposal', 'withdrawn', 'repealed', 'superseded', null] as const) {
      expect(lane('binding-law', s), String(s)).toBe('none');
      expect(lane('binding-by-market-access', s), String(s)).toBe('none');
    }
    for (const s of ['proposal', 'withdrawn', 'repealed', 'superseded', null] as const) expect(lane('guidance', s), String(s)).toBe('none');
    expect([lane(null, 'in-force'), lane(null, null)]).toEqual(['none', 'none']);
  });

  it('shows everything with no filter ticked, narrows to what is ticked, and round-trips through the address', () => {
    const none = readState('?in=FRA', d.places);
    expect([none.kinds.size, none.lanes.size, narrowing(none)]).toEqual([0, 0, 0]);
    const all = visibleRows(d.rows, none);
    expect(all.length).toBeGreaterThan(0);
    // ticking every chip says no more than ticking none
    const full = readState('?in=FRA&kind=plan,priority,complete,procurement,other,none&lane=law,guidance,none', d.places);
    expect([full.kinds.size, full.lanes.size]).toEqual([0, 0]);
    expect(visibleRows(d.rows, full)).toEqual(all);
    // unticking the last chip of a group shows everything again, so the address and the view agree
    const narrowed = readState('?in=FRA&kind=procurement', d.places);
    expect(narrowing(narrowed)).toBe(1);
    expect(visibleRows(d.rows, narrowed).every((r) => r.kind === 'procurement')).toBe(true);
    const cleared = { ...narrowed, kinds: new Set<never>() };
    expect(writeState(cleared)).toBe('?in=FRA');
    expect(visibleRows(d.rows, readState(writeState(cleared), d.places))).toEqual(visibleRows(d.rows, cleared));
    for (const r of d.rows) expect(passes(r, { kinds: new Set(), lanes: new Set() })).toBe(true);
  });

  it('says once, beside the lanes, when no date of these places is set in law', () => {
    expect(lawNote(d.rows, readState('', d.places), d.copy)).toBe(d.copy.lawNoneAll);
    expect(lawNote(d.rows, readState('?in=DEU,FRA', d.places), d.copy)).toBe(d.copy.lawNoneChosen);
    const law = d.rows.map((r, i) => (i === 0 ? { ...r, bindingness: 'binding-law' as const, status: 'in-force' as const } : r));
    expect(lawNote(law, readState(`?in=${d.rows[0].iso3}`, d.places), d.copy)).toBeNull();
  });

  it('orders rows exactly as dates.ts does', () => {
    const keys = (cmp: (a: DateRow, b: DateRow) => number) => [...d.rows].sort(cmp).map((r) => (r as DateRow & { key: string }).key);
    expect(keys(compareRows)).toEqual(keys(byDate));
  });

  it('writes "not recorded" in the CSV where a kind, status or bindingness is missing', () => {
    const { header, rows } = csvTable(visibleRows(prod.rows, readState('?in=DEU', prod.places)), prod.places, prod.copy);
    expect(header.slice(0, 3)).toEqual(['Place', 'ISO3', 'Date']);
    const line = rows.find((r) => r[1] === 'DEU' && r[3] === 2031)!;
    expect(line[header.indexOf('Kind')]).toBe('not recorded');
    expect(line[header.indexOf('Bindingness')]).toBe('not recorded');
    expect(header).not.toContain('Lead');
  });

  it('closes with at most three links, one of them back into the evidence', () => {
    for (const q of ['', '?in=DEU', '?in=ITA', '?in=DEU,FRA,EUU', '?in=AUT', '?in=USA']) {
      for (const data of [d, prod]) {
        const links = nextLinks(readState(q, data.places), data.places, data.links, data.copy);
        expect(links.length, q).toBeLessThanOrEqual(3);
        expect(links.some((l) => l.href.startsWith('/countries')), q).toBe(true);
      }
    }
    // in production with every tool private, no link leads into Prepare
    const allPrivate = targetDatesData({ root: STAGE0, env: PROD.env });
    for (const q of ['?in=DEU', '?in=ITA']) {
      expect(nextLinks(readState(q, allPrivate.places), allPrivate.places, allPrivate.links, allPrivate.copy).some((l) => l.href.startsWith('/prepare'))).toBe(false);
    }
  });

  it('keeps the word deadline to the standing note', () => {
    const strings: string[] = [];
    const walk = (v: unknown, key: string) => {
      if (typeof v === 'string') strings.push(`${key}: ${v}`);
      else if (v && typeof v === 'object') for (const [k, c] of Object.entries(v)) walk(c, k);
    };
    walk(d.copy, 'copy');
    const hits = strings.filter((s) => /deadline/i.test(s));
    expect(hits).toEqual([`standingNote: ${d.copy.standingNote}`]);
    expect(d.copy.standingNote).toMatch(/not a legal deadline/);
  });
});

describe('places that wait for a re-read at the primary (spec 6.3)', () => {
  it('keeps every United States profile line a lead: dotted in preview, left out in production', () => {
    expect(REREAD.has('USA')).toBe(true);
    const preview = datesFor(['USA'], PREVIEW).filter((r) => r.origin === 'profile');
    expect(preview.length).toBeGreaterThan(0);
    for (const r of preview) expect(r.lead, `${r.year} ${r.label}`).toBe(true);
    expect(datesFor(['USA'], PROD).filter((r) => r.origin === 'profile')).toEqual([]);
    // with no dated row left, production does not offer the place, and the page names it when searched
    expect(datePlaces(PROD).some((p) => p.iso3 === 'USA')).toBe(false);
    expect(datePlaces(PREVIEW).some((p) => p.iso3 === 'USA')).toBe(true);
    const prod = targetDatesData(PROD);
    expect(prod.withheld.map((p) => p.iso3)).toEqual(['USA']);
    expect(prod.reread).toEqual(['United States']);
    expect(targetDatesData(PREVIEW).withheld).toEqual([]);
  });

  it('lifts the rule for a line once a confirmed annotation covers it', () => {
    const real = projectRoot();
    const root = mkdtempSync(join(tmpdir(), 'site-dates-reread-'));
    for (const part of ['data/lab', 'data/profiles', 'data/countries.json']) cpSync(join(real, part), join(root, part), { recursive: true });
    const file = join(root, 'data/lab/annotations/annotations.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.dates.push({
      verify: false,
      verifiedAt: '2026-10-01',
      provenance: [{ url: 'https://example.org/usa', retrievedAt: '2026-10-01', excerpt: 'CNSA 2.0', sourceClass: 'trusted-institutional' }],
      id: 'usa-2035-test',
      iso3: 'USA',
      year: 2035,
      match: 'CNSA 2.0',
      kind: 'complete',
      restates: null,
      status: 'published',
      bindingness: 'guidance',
      scope: null,
    });
    writeFileSync(file, JSON.stringify(data));
    const rows = datesFor(['USA'], { root, env: { VERCEL_ENV: 'production' } });
    expect(rows.map((r) => [r.year, r.kind, r.lead])).toEqual([[2035, 'complete', false]]);
  });
});

describe('the readout and the list name each target once, from its best record', () => {
  const d = targetDatesData(PREVIEW);
  const prod = targetDatesData(PROD);

  it('names a confirmed row before a lead on the same date', () => {
    const text = readout(d.rows, readState('?in=GBR', d.places), d.places, d.copy);
    expect(text).toContain('(National Cyber Security Centre; plan; guidance)');
    expect(text).not.toContain('a lead');
  });

  it('cites each profile when the same line stands in several profiles, and never groups profile lines with different records', () => {
    const text = readout(prod.rows, readState('?in=BEL,ITA&lane=none', prod.places), prod.places, prod.copy);
    expect(text).toContain('for Belgium and Italy');
    expect(text).toContain('(Belgium profile and Italy profile;');
    const spain = readout(prod.rows, readState('?in=ESP,NLD&lane=none', prod.places), prod.places, prod.copy);
    expect(spain).toContain('for the Netherlands and Spain');
    expect(spain).toContain('(Netherlands profile and Spain profile;');
    // in preview the same line is a lead in one profile and not in another: each keeps its own record
    const mixed = readout(d.rows, readState('?in=ITA,NLD&lane=none', d.places), d.places, d.copy);
    expect(mixed).not.toContain('Italy profile and');
  });

  it('lists each EU roadmap target once in the phone list, naming every place it reaches with its own mark', () => {
    const s = readState('?in=DEU,FRA,EUU', d.places);
    const years = groupByYear(visibleRows(d.rows, s));
    const roadmap = years.flatMap((y) => y.items).filter((i) => i.rows[0].guide === 'eu-roadmap');
    expect(roadmap.map((i) => i.rows[0].year)).toEqual([2026, 2030, 2035]);
    for (const item of roadmap) {
      expect(item.rows.map((r) => [r.iso3, r.relation])).toEqual([
        ['EUU', 'own'],
        ['FRA', 'membership'],
        ['DEU', 'membership'],
      ]);
    }
    // every row stays in exactly one item
    expect(years.flatMap((y) => y.items.flatMap((i) => i.rows)).length).toBe(visibleRows(d.rows, s).length);
  });

  it('offers what the guides ask with no place chosen, and only the guides that reach the chosen places otherwise', () => {
    const none = nextLinks(readState('', d.places), d.places, d.links, d.copy);
    if (d.links.check) expect(none.find((l) => l.label === d.copy.nextCheck)?.href).toBe(d.links.check);
    const fra = nextLinks(readState('?in=FRA', d.places), d.places, d.links, d.copy);
    if (d.links.check) expect(fra.find((l) => l.label === d.copy.nextCheck)?.href).toBe(`${d.links.check}#f=anssi-faq,eu-roadmap`);
  });
});

describe('the gate', () => {
  it('builds no Target dates page and gives no link to it in production while dates is private, and both when it is public', async () => {
    const { builtPages } = await import('./routes');
    const { link, pageHref } = await import('./gates');
    const prodOpts = { root: STAGE0, env: { VERCEL_ENV: 'production' } };
    expect(builtPages(prodOpts).some((p) => p.path === '/target-dates')).toBe(false);
    expect(link('dates', { query: { in: 'DEU' } }, prodOpts)).toBeNull();
    expect(pageHref('/target-dates', prodOpts)).toBeNull();
    expect(builtPages(FORCED).find((p) => p.path === '/target-dates')).toMatchObject({ key: 'target-dates', gate: 'dates', section: 'countries' });
    expect(link('dates', { query: { in: 'DEU,FRA' } }, FORCED)).toBe('/target-dates?in=DEU,FRA');
  });
});

describe('Target dates rows in production (snapshot)', () => {
  it('match the committed record', () => {
    const rows = datesFor(datePlaces(PROD).map((p) => p.iso3), PROD).map((r) =>
      [r.iso3, r.year, r.month ?? '', r.kind ?? '-', r.status ?? '-', r.bindingness ?? '-', r.relation, r.origin, r.guide ?? '', r.label].join(' | '),
    );
    expect(rows).toMatchSnapshot();
  });
});
