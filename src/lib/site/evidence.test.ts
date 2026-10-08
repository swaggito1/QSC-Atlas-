import { beforeAll, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as evidence from './evidence';
import { GROUP_ORDER, connectedEvidence, documentNotes, standardHref } from './evidence';
import type { EvidenceInput, EvidenceRow } from './evidence';
import { readDocumentEntries, readProfileEntries } from '../../loaders/json-mirror';
import { cascadeFiles, cascadeStatusWords, euMembers, exposurePlaces, guides, standardShortName } from './joins';
import { datesFor } from './dates';
import { pageHref } from './gates';
import { projectRoot } from '../lab/load';
import { allPrivateRoot, writeAllPrivateRegistry } from '../lab/registry-fixture';

// Every profile as the offline build reads it (src/loaders/json-mirror.ts), so the snapshot covers
// the same fields the profile page passes from Notion.
const profiles: EvidenceInput[] = readProfileEntries().map((p) => ({
  iso3: p.iso3 as string,
  name: p.country as string,
  posture: (p.coordinationPosture as string | null) ?? null,
  dataStatus: (p.dataStatus as string | null) ?? null,
  migrationTimeline: (p.migrationTimeline as string | null) ?? null,
  mainRegulation: (p.mainRegulation as string | null) ?? null,
  standardFamilies: (p.standardFamilies as string | null) ?? null,
  algorithms: (p.algorithms as string | null) ?? null,
  lastUpdated: (p.lastUpdated as string | null) ?? null,
}));
const byIso3 = new Map(profiles.map((p) => [p.iso3, p]));
const profile = (iso3: string) => byIso3.get(iso3)!;

// A production build with the given tools forced public (the test-matrix switch of spec 14.2),
// on the real registry with every tool private again (src/lib/lab/registry-fixture.ts), so each
// flag state shows exactly the tools it names and "all off" shows none.
// EU rules has left the site; it stays in the matrix to show that forcing it public adds nothing.
const TOOLS = ['cascade', 'readiness', 'exposure', 'rulebook', 'dates'];
const STAGE0 = allPrivateRoot();
const flags = (ids: string[]) => ({
  root: STAGE0,
  env: { ATLAS_OFFLINE: '1', VERCEL_ENV: 'production', ...(ids.length ? { ATLAS_FORCE_PUBLIC: ids.join(',') } : {}) },
});
const STATES: [string, string[]][] = [
  ['all off', []],
  ['all on', TOOLS],
  ...TOOLS.map((t): [string, string[]] => [`${t} alone`, [t]]),
];

const line = (r: EvidenceRow) =>
  [
    `${r.group} ${r.relation} ${r.tool}`,
    r.sentence,
    r.count ?? '',
    r.asOf ?? 'no date',
    r.parts.flatMap((x) => ('href' in x ? [`[${x.text} -> ${x.href}]`] : [])).join(' '),
    r.links.map((l) => `${l.label} -> ${l.href}`).join(' ; '),
  ].join(' | ');

describe('the offline countries collection (ATLAS_OFFLINE=1)', () => {
  // the enumerations of the countries schema in src/content.config.ts
  const ENUMS: Record<string, (string | null)[]> = {
    dominantProcess: ['NIST', 'EU', 'ETSI', 'ISO', 'Sovereign', 'Mixed', null],
    secondaryProcess: ['NIST', 'EU', 'ETSI', 'ISO', 'Sovereign', 'Mixed', null],
    coordinationPosture: ['EU', 'NIST-bloc', 'sovereign-bloc', 'engaged-unaligned', null],
    standardsRole: ['setter', 'contextualiser', 'taker', 'sovereign-developer', null],
    legalStatus: ['binding', 'soft-only', 'none', null],
    confidence: ['High', 'Medium', 'Low', null],
    dataStatus: ['Complete', 'Partial', 'Placeholder', null],
    verificationStatus: ['Unverified', 'Verified', 'Corrected', null],
  };
  const entries = readProfileEntries();

  it('holds all 197 profiles, keyed by ISO3, with the fields the Notion loader maps and no others', () => {
    expect(entries.length).toBe(197);
    expect(new Set(entries.map((e) => e.id)).size).toBe(197);
    const fields = ['algorithms', 'confidence', 'coordinationPosture', 'country', 'dataStatus', 'dominantProcess', 'govActors', 'hybridDeployment', 'id', 'iso3', 'lastUpdated', 'legalStatus', 'mainRegulation', 'mapX', 'mapY', 'migrationTimeline', 'obligation', 'processParticipation', 'secondaryProcess', 'standardFamilies', 'standardsRole', 'summary', 'targetCompletion', 'verificationStatus'];
    for (const e of entries) expect(Object.keys(e).sort()).toEqual(fields);
  });

  it('fits every enumeration of the collection schema', () => {
    for (const e of entries) {
      for (const [field, allowed] of Object.entries(ENUMS)) expect(allowed, `${e.iso3} ${field}`).toContain(e[field]);
    }
  });
});

describe('connectedEvidence snapshot, seven flag states', () => {
  for (const [label, ids] of STATES) {
    it(label, () => {
      const out: Record<string, string | string[]> = {};
      for (const p of profiles) {
        const r = connectedEvidence(p, flags(ids));
        out[p.iso3] = r.rows.length ? r.rows.map(line) : `(${r.empty})`;
      }
      expect(out).toMatchSnapshot();
    });
  }

  it('gives every profile zero rows and no block when every tool is off', () => {
    for (const p of profiles) expect(connectedEvidence(p, flags([]))).toEqual({ rows: [], empty: 'absent' });
  });
});

describe('row checks', () => {
  const rowText = (r: EvidenceRow) => `${r.sentence} ${r.links.map((l) => `${l.label} ${l.href}`).join(' ')}`;

  it('never gives Italy an ANSSI FAQ or Dutch Handbook row, in any flag state', () => {
    for (const [, ids] of STATES) {
      for (const r of connectedEvidence(profile('ITA'), flags(ids)).rows) {
        expect(rowText(r)).not.toMatch(/anssi|nl-handbook|Dutch Handbook/i);
      }
    }
  });

  it('gives France its own ANSSI FAQ row', () => {
    for (const ids of [['readiness'], TOOLS]) {
      const own = connectedEvidence(profile('FRA'), flags(ids)).rows.filter((r) => r.group === 'guidance' && r.relation === 'own');
      expect(own.map((r) => r.sentence)).toEqual([expect.stringContaining('ANSSI FAQ')]);
      expect(own[0].links.map((l) => l.href)).toContain('/prepare/check#f=anssi-faq');
    }
  });

  it('gives Austria membership rows only, each starting "As an EU Member State"', () => {
    const { rows, empty } = connectedEvidence(profile('AUT'), flags(TOOLS));
    expect(empty).toBeNull();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.relation).toBe('membership');
      expect(r.sentence.startsWith('As an EU Member State')).toBe(true);
    }
  });

  it('gives Guinea, a non-EU Placeholder, no row and no block', () => {
    expect(profile('GIN').dataStatus).toBe('Placeholder');
    for (const [, ids] of STATES) expect(connectedEvidence(profile('GIN'), flags(ids))).toEqual({ rows: [], empty: 'absent' });
  });

  it('decides guidance by issuer or membership, never by posture', () => {
    // a profile with the EU posture that is not a Member State gets no EU roadmap row, and a
    // Member State with no posture gets one
    const all = flags(TOOLS);
    const fakeNonMember = { ...profile('ITA'), iso3: 'NOR', name: 'Norway', posture: 'EU' };
    expect(connectedEvidence(fakeNonMember, all).rows.some((r) => r.relation === 'membership')).toBe(false);
    expect(profile('AUT').posture).toBeNull();
    expect(connectedEvidence(profile('AUT'), all).rows.some((r) => r.group === 'guidance')).toBe(true);
  });

  it('shows the one-line empty state for a Partial profile with no record when a tool is shown', () => {
    const partials = profiles.filter((p) => p.dataStatus === 'Partial');
    const noRecord = partials.filter((p) => connectedEvidence(p, flags(['cascade'])).empty === 'no-record');
    expect(noRecord.length).toBeGreaterThan(0);
    for (const p of noRecord) expect(connectedEvidence(p, flags(['cascade'])).rows).toEqual([]);
  });

  it('marks every membership row as such in its first words', () => {
    for (const p of profiles) {
      for (const r of connectedEvidence(p, flags(TOOLS)).rows) {
        if (r.relation === 'membership') expect(r.sentence.startsWith('As an EU Member State')).toBe(true);
      }
    }
  });

  it('gives every row a link, inline or after the sentence, and no row a dash, in every flag state', () => {
    for (const [label, ids] of STATES) {
      for (const p of profiles) {
        for (const r of connectedEvidence(p, flags(ids)).rows) {
          expect(r.links.length + r.parts.filter((x) => 'href' in x).length, `${label} ${p.iso3}`).toBeGreaterThan(0);
          expect([...r.sentence].some((ch) => ch.charCodeAt(0) >= 0x2012 && ch.charCodeAt(0) <= 0x2015)).toBe(false);
        }
      }
    }
  });

  // every address a row can hold, inline or after the sentence
  const hrefsOf = (r: EvidenceRow) => [...r.parts.flatMap((x) => ('href' in x ? [x.href] : [])), ...r.links.map((l) => l.href)];

  it('gives no row and no link for EU rules, even with the Rulebook forced public', () => {
    for (const [label, ids] of [...STATES, ['preview', []] as [string, string[]]]) {
      const opts = label === 'preview' ? { env: { ATLAS_OFFLINE: '1' } } : flags(ids);
      for (const p of profiles) {
        for (const r of connectedEvidence(p, opts).rows) {
          expect(r.tool, `${label} ${p.iso3}`).not.toBe('rulebook');
          expect(r.group as string).not.toBe('rules');
          expect(r.sentence).not.toMatch(/EU rules|EU cyber rules/);
          for (const h of hrefsOf(r)) expect(h, `${label} ${p.iso3}`).not.toMatch(/eu-rules/);
        }
      }
    }
    expect(GROUP_ORDER).toEqual(['standards', 'dates', 'guidance']);
    expect(connectedEvidence(profile('EUU'), flags(['rulebook']))).toEqual({ rows: [], empty: 'absent' });
  });

  it('links neither the standards list nor a standard\'s page; the Standards Cascade link stays', () => {
    for (const [label, ids] of [...STATES, ['preview', []] as [string, string[]]]) {
      const opts = label === 'preview' ? { env: { ATLAS_OFFLINE: '1' } } : flags(ids);
      for (const p of profiles) {
        for (const r of connectedEvidence(p, opts).rows) {
          for (const h of hrefsOf(r)) expect(h, `${label} ${p.iso3}`).not.toMatch(/^\/standards(?!\/cascade)(?:[/?#]|$)/);
        }
      }
    }
    const usa = connectedEvidence(profile('USA'), flags(TOOLS)).rows.find((r) => r.group === 'standards')!;
    expect(usa.links.map((l) => l.href)).toEqual(['/standards/cascade?sel=USA']);
  });
});

describe('order, and no totals', () => {
  it('keeps the groups in the fixed order standards, dates, guidance, rules on every profile', () => {
    for (const p of profiles) {
      const groups = connectedEvidence(p, flags(TOOLS)).rows.map((r) => GROUP_ORDER.indexOf(r.group));
      expect(groups).toEqual([...groups].sort((a, b) => a - b));
    }
  });

  it('orders guide rows as readiness.json lists the guides, whatever their counts', () => {
    const order = guides().map((g) => g.id);
    for (const p of profiles) {
      const ids = connectedEvidence(p, flags(['readiness']))
        .rows.filter((r) => r.relation === 'own')
        .map((r) => /f=([a-z0-9-]+)/.exec(r.links.map((l) => l.href).join(' '))?.[1] ?? '');
      expect(ids).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
  });

  it('returns rows and an empty state, and nothing that sums them', () => {
    const r = connectedEvidence(profile('FRA'), flags(TOOLS));
    expect(Object.keys(r).sort()).toEqual(['empty', 'rows']);
    for (const row of r.rows) {
      for (const key of Object.keys(row)) expect(['tool', 'group', 'relation', 'sentence', 'parts', 'count', 'links', 'asOf']).toContain(key);
    }
  });

  it('exports no function that totals, tallies, ranks or scores', () => {
    for (const name of Object.keys(evidence)) expect(name).not.toMatch(/total|tally|rank|score|sum|coverage/i);
  });

  it('says when the earliest document names an algorithm only by its earlier name, and which name', () => {
    const first = (iso3: string) => connectedEvidence(profile(iso3), flags(['cascade'])).rows[0].sentence;
    expect(first('FRA')).toContain('The earliest, from January 2022, names the algorithms behind FIPS 203 and FIPS 204 under their earlier names, Kyber and Dilithium.');
    // Germany's earliest document also names NIST SP 800-208 by its own name; the earlier name of
    // the algorithm behind FIPS 203 is still said, because any such edge on that date is enough
    expect(first('DEU')).toContain('names the algorithm behind FIPS 203 under its earlier name, CRYSTALS-Kyber.');
    expect(first('EUU')).toContain('the algorithms behind FIPS 203, FIPS 204 and FIPS 205 under their earlier names, Kyber, Dilithium and SPHINCS+.');
    // Japan's earliest document names only the algorithm behind FIPS 205
    expect(first('JPN')).toContain('The earliest, from November 2021, names the algorithm behind FIPS 205 under its earlier name, SPHINCS+.');
    // the date is never joined to the list of standards
    for (const p of profiles) {
      const r = connectedEvidence(p, flags(['cascade'])).rows.find((x) => x.sentence.startsWith('Names'));
      if (r) expect(r.sentence).not.toMatch(/first in|by a pre-standard name/);
    }
  });

  it('names a national process in Latin script, with what its earliest record concerns', () => {
    const own = (iso3: string) => connectedEvidence(profile(iso3), flags(['cascade'])).rows.find((r) => r.sentence.startsWith('Runs'))!.sentence;
    expect(own('KOR')).toBe('Runs its own post-quantum process, KpqC. The earliest Atlas record of it dates from January 2025.');
    expect(own('CHN')).toBe('Runs its own post-quantum process, NGCC. The earliest Atlas record of it dates from February 2025.');
    // the March 2024 record names Kodieum only, so the sentence says so
    expect(own('RUS')).toBe('Runs its own post-quantum process, Kodieum and Shipovnik. The earliest Atlas record of it dates from March 2024 and concerns Kodieum.');
    for (const iso3 of ['KOR', 'CHN', 'RUS']) expect(own(iso3)).toMatch(/^[\x20-\x7E]+$/);
  });

  it('never calls a selected algorithm or a draft a standard, and gives each its status words once', () => {
    const words = cascadeStatusWords();
    expect(words).toEqual({ selected: 'selected, not yet published', draft: 'initial public draft' });
    const { standards } = cascadeFiles();
    const pending = standards.filter((s) => s.standardStatus === 'selected' || s.standardStatus === 'draft');
    expect(pending.length).toBeGreaterThan(0);
    let seen = 0;
    for (const p of profiles) {
      for (const r of connectedEvidence(p, flags(['cascade'])).rows) {
        // the list that follows "standards in {n} documents:" holds final standards only
        const list = /standards in \d+ documents?: ([^.]*)\./.exec(r.sentence)?.[1] ?? '';
        for (const s of pending) {
          const name = standardShortName(s.label);
          expect(list.split(/, | and /)).not.toContain(name);
          const at = r.sentence.indexOf(name);
          if (at < 0) continue;
          seen += 1;
          // its first mention carries the Cascade's words before the sentence ends
          const rest = r.sentence.slice(at, r.sentence.indexOf('.', at));
          expect(rest).toContain(`(${words[s.standardStatus as 'selected' | 'draft']})`);
        }
      }
      for (const notes of documentNotes(p.iso3, flags(['cascade'])).values()) {
        for (const n of notes) {
          for (const s of pending) {
            const name = standardShortName(s.label);
            if (n.includes(name)) expect(n.slice(n.indexOf(name))).toContain(`${name} (${words[s.standardStatus as 'selected' | 'draft']})`);
          }
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('sets counts and dates apart for the mono face, keeps each standard\'s name whole, and repeats no inline link after the sentence', () => {
    for (const p of profiles) {
      for (const r of connectedEvidence(p, flags(TOOLS)).rows) {
        expect(r.parts.map((x) => ('mono' in x ? x.mono : x.text)).join('')).toBe(r.sentence);
        if (r.count !== undefined) expect(r.parts.some((x) => 'mono' in x && x.mono === String(r.count))).toBe(true);
        const inline = new Set(r.parts.flatMap((x) => ('href' in x ? [x.href] : [])));
        for (const l of r.links) expect(inline.has(l.href)).toBe(false);
      }
    }
    const usa = connectedEvidence(profile('USA'), flags(['cascade'])).rows[0];
    expect(usa.parts).toContainEqual({ text: 'FIPS 203', whole: true });
    expect(usa.parts).toContainEqual({ text: 'NIST SP 800-208', whole: true });
    expect(usa.parts.some((x) => 'href' in x)).toBe(false);
    expect(usa.parts).toContainEqual({ mono: 'October 2021' });
    expect(usa.links.map((l) => l.label)).toEqual(['See the United States in the Standards Cascade']);
  });

  it('uses "count" only for the records inside one row', () => {
    const r = connectedEvidence(profile('USA'), flags(['cascade'])).rows[0];
    expect(r.sentence).toContain(`standards in ${r.count} documents`);
  });
});

describe('helpers', () => {
  it('documentNotes names the Cascade standards and the Prepare guide, for shown tools only', () => {
    const notes = [...documentNotes('FRA', flags(TOOLS)).values()].flat();
    expect(notes).toContain('A guide in Prepare: ANSSI FAQ');
    expect(notes.some((n) => n.startsWith('Named in the Standards Cascade: '))).toBe(true);
    // ANSSI's January 2022 document names Kyber and Dilithium, before FIPS 203 and 204 existed
    expect(notes).toContain('Named in the Standards Cascade: the algorithms behind FIPS 203 and FIPS 204 under their earlier names, Kyber and Dilithium');
    expect(notes).toContain('Named in the Standards Cascade: FIPS 206 (selected, not yet published), HQC (selected, not yet published) and NIST SP 800-208');
    expect(documentNotes('FRA', flags([])).size).toBe(0);
    expect([...documentNotes('FRA', flags(['readiness'])).values()].flat().every((n) => n.startsWith('A guide in Prepare'))).toBe(true);
  });

  it('documentNotes never notes a guide on another country', () => {
    expect([...documentNotes('ITA', flags(TOOLS)).values()].flat().some((n) => n.startsWith('A guide in Prepare'))).toBe(false);
  });

  it('standardHref matches the Cascade\'s names and links only where pageHref does: wherever the Cascade is, never at stage 0', () => {
    // whether a build links a standard's page is pageHref's decision (gates.ts), so standardHref
    // follows it and decides nothing itself; the pages are built wherever the Cascade is (8 October 2026)
    const local = { env: { ATLAS_OFFLINE: '1' } };
    const preview = { env: { ATLAS_OFFLINE: '1', VERCEL: '1', VERCEL_ENV: 'preview' } };
    const production = { env: { VERCEL: '1', VERCEL_ENV: 'production' } };
    for (const opts of [local, preview, production, flags(['cascade'])]) {
      expect(standardHref('ML-KEM', opts)).toBe(pageHref('/standards/fips-203', opts));
      expect(standardHref('FIPS 204', opts)).toBe(pageHref('/standards/fips-204', opts));
      expect(standardHref('BSI TR-02102', opts)).toBeNull();
      expect(standardHref('ML-KEM', opts)).toBe('/standards/fips-203');
    }
    expect(standardHref('ML-KEM', flags([]))).toBeNull();
  });

});

describe('preview builds', () => {
  it('keep a line whose annotation is still a lead as the country\'s own, as Target dates does', () => {
    const preview = { env: {} };
    const ita = connectedEvidence(profile('ITA'), preview).rows;
    // the seeded annotations are leads: nothing folds until Swann confirms them, in preview as in production
    expect(ita.find((r) => r.group === 'dates')).toMatchObject({ relation: 'own', count: 2 });
    expect(ita.some((r) => r.group === 'guidance' && r.relation === 'membership')).toBe(true);
    expect(datesFor(['ITA'], preview).filter((r) => r.origin === 'profile')).toHaveLength(2);
    const prod = connectedEvidence(profile('ITA'), flags(TOOLS)).rows.find((r) => r.group === 'dates');
    expect(prod?.count).toBe(2);
  });
});

describe('the dates group follows the Target dates model', () => {
  it('never says "no record" while Target dates holds dates for the place', () => {
    for (const [label, ids] of STATES.filter(([, t]) => t.includes('dates'))) {
      for (const p of profiles) {
        const r = connectedEvidence(p, flags(ids));
        if (datesFor([p.iso3], flags(ids)).length === 0) continue;
        expect(r.empty, `${label} ${p.iso3}`).not.toBe('no-record');
        // a dates row, or the roadmap's guidance row carrying the dates links in its place
        const reaches = r.rows.some((x) => x.group === 'dates' || x.links.some((l) => l.href.startsWith('/target-dates?')));
        expect(reaches, `${label} ${p.iso3}`).toBe(true);
      }
    }
  });

  it('says a Member State\'s roadmap targets once: the guidance row carries the dates links when it is shown', () => {
    const aut = connectedEvidence(profile('AUT'), flags(TOOLS)).rows;
    expect(aut.map((r) => `${r.group} ${r.relation}`)).toEqual(['guidance membership']);
    const guidance = aut.find((r) => r.group === 'guidance')!;
    expect(guidance.sentence).toBe('As an EU Member State, Austria is addressed by the EU coordinated roadmap; its targets for end 2026, 2030 and 2035 are recommendations.');
    expect(guidance.links.map((l) => l.href)).toEqual(['/prepare/guides/eu-roadmap', '/prepare/check#f=eu-roadmap', '/target-dates?in=AUT', '/prepare/exposure?j=EUU']);
    // without the guidance row, the dates row stands on its own
    expect(connectedEvidence(profile('AUT'), flags(['dates'])).rows.map((r) => r.group)).toEqual(['dates']);
    // a country with dates of its own keeps its dates row beside the roadmap's guidance row
    const deu = connectedEvidence(profile('DEU'), flags(TOOLS)).rows;
    expect(deu.filter((r) => r.group === 'dates' && r.relation === 'own').length).toBeGreaterThan(0);
    expect(deu.find((r) => r.group === 'guidance' && r.relation === 'membership')!.links.map((l) => l.label)).toEqual(['Read the guide', 'Mark these actions']);
  });

  it('with the Exposure Clock alone, gives a dates row to every place the Clock offers or reaches through the EU', () => {
    const offered = exposurePlaces(flags(['exposure']));
    const members = euMembers();
    for (const p of profiles) {
      if (!datesFor([p.iso3], flags(['exposure'])).length) continue;
      if (!offered.has(p.iso3) && !members.has(p.iso3)) continue;
      const r = connectedEvidence(p, flags(['exposure']));
      expect(r.rows.some((x) => x.group === 'dates' && x.links.some((l) => l.href.startsWith('/prepare/exposure?j='))), p.iso3).toBe(true);
    }
  });

  it('gives the EU its own roadmap dates, and a Member State with no line of its own the roadmap\'s, marked as membership', () => {
    const euu = connectedEvidence(profile('EUU'), flags(['dates'])).rows;
    expect(euu).toHaveLength(1);
    expect(euu[0]).toMatchObject({ group: 'dates', relation: 'own', count: 3, sentence: '3 target dates in the EU roadmap it publishes, 2026 to 2035.' });
    expect(euu[0].links.map((l) => l.href)).toEqual(['/target-dates?in=EUU']);
    const aut = connectedEvidence(profile('AUT'), flags(['dates', 'exposure'])).rows;
    expect(aut).toHaveLength(1);
    expect(aut[0]).toMatchObject({ relation: 'membership', sentence: 'As an EU Member State, Austria is addressed by the EU roadmap, with 3 target dates, 2026 to 2035.' });
    // Austria is not a place of its own in the Exposure Clock; the EU is
    expect(aut[0].links.map((l) => l.href)).toEqual(['/target-dates?in=AUT', '/prepare/exposure?j=EUU']);
  });

  describe('once Swann confirms the seeded rows', () => {
    // a copy of the data with every seeded annotation confirmed, as Swann would leave it
    let root: string;
    beforeAll(() => {
      const real = projectRoot();
      root = mkdtempSync(join(tmpdir(), 'site-evidence-'));
      for (const part of ['data/lab', 'data/profiles', 'data/results', 'data/countries.json']) cpSync(join(real, part), join(root, part), { recursive: true });
      const file = join(root, 'data/lab/annotations/annotations.json');
      const data = JSON.parse(readFileSync(file, 'utf8'));
      for (const d of data.dates) Object.assign(d, { verify: false, verifiedAt: '2026-10-01' });
      writeFileSync(file, JSON.stringify(data));
      // the flag states below start from every tool private, as flags() does
      writeAllPrivateRegistry(root, real);
    });
    const confirmed = (ids: string[]) => ({ root, env: flags(ids).env });

    it('folds the restated lines and shows the roadmap\'s dates as membership, never "no record"', () => {
      // the Exposure Clock's own row (the periods it reads for Italy) is a separate row of the group
      const clockPeriods = (x: { tool: string; relation: string }) => x.tool === 'exposure' && x.relation === 'own';
      for (const ids of [['dates'], ['exposure'], ['dates', 'exposure']]) {
        const r = connectedEvidence(profile('ITA'), confirmed(ids));
        expect(r.empty).toBeNull();
        expect(r.rows.some(clockPeriods)).toBe(ids.includes('exposure'));
        const dates = r.rows.filter((x) => x.group === 'dates' && !clockPeriods(x));
        expect(dates).toHaveLength(1);
        expect(dates[0].relation).toBe('membership');
        expect(dates[0].sentence).toBe('As an EU Member State, Italy is addressed by the EU roadmap, with 3 target dates, 2026 to 2035.');
      }
      // with the guidance row shown, the roadmap's targets are said there once, with the dates links
      const all = connectedEvidence(profile('ITA'), confirmed(TOOLS)).rows;
      expect(all.filter((x) => x.group === 'dates' && !clockPeriods(x))).toEqual([]);
      expect(all.find((x) => x.group === 'guidance' && x.relation === 'membership')!.links.map((l) => l.href)).toContain('/target-dates?in=ITA');
      // Target dates draws each year once, by the same rule
      const rows = datesFor(['ITA'], confirmed(['dates']));
      expect(rows.filter((x) => x.origin === 'profile')).toEqual([]);
      expect(rows.filter((x) => x.restated).map((x) => x.year)).toEqual([2030, 2035]);
    });

    it('counts a line as the country\'s own exactly when Target dates keeps it as a profile row', () => {
      for (const p of profiles) {
        const own = connectedEvidence(p, confirmed(['dates'])).rows.find((x) => x.group === 'dates' && x.relation === 'own' && x.sentence.includes('migration timeline'));
        const kept = datesFor([p.iso3], confirmed(['dates'])).filter((x) => x.origin === 'profile').length;
        expect(own?.count ?? 0, p.iso3).toBe(kept);
      }
    });
  });
});

describe('joins', () => {
  it('resolves an issuer alias to the organisation as the documents record it', async () => {
    const { resolveIssuer, issuerAliasesFor } = await import('./joins');
    expect(resolveIssuer('National Cyber Security Centre')).toEqual(
      expect.arrayContaining([{ issuingOrg: 'NCSC', iso3: 'GBR' }, { issuingOrg: 'NCSC-NL', iso3: 'NLD' }]),
    );
    expect(resolveIssuer('  canadian centre for cyber security ')).toEqual([{ issuingOrg: 'CCCS', iso3: 'CAN' }]);
    expect(resolveIssuer('NCSC')).toContainEqual({ issuingOrg: 'NCSC', iso3: 'GBR' });
    expect(resolveIssuer('No such body')).toEqual([]);
    // "ANSSI" also finds the joint statement recorded under ANSSI with its co-signers
    expect(resolveIssuer('ANSSI').map((r) => r.issuingOrg)).toEqual(
      expect.arrayContaining(['ANSSI', 'ANSSI (with BSI, NCSC-NL and other EU member states)']),
    );
    expect(issuerAliasesFor('CCCS', 'CAN')).toEqual(['Canadian Centre for Cyber Security', 'Cyber Centre']);
  });

  it('finds the Atlas record of each mapped guide, issued in the guide’s own jurisdiction', async () => {
    const { guideRecords } = await import('./joins');
    for (const g of guides()) {
      for (const d of guideRecords(g.id)) expect(d.country).toBe(g.jurisdiction);
    }
    expect(guideRecords('anssi-faq').map((d) => d.country)).toEqual(['FRA']);
  });
});

describe('mirror', () => {
  it('finds no difference between a profile and its own JSON copy, and names a changed field', async () => {
    const { mirrorDiff, readJsonProfile } = await import('./mirror');
    const deu = readJsonProfile('DEU')!;
    expect(mirrorDiff(deu)).toEqual([]);
    expect(mirrorDiff({ ...deu, lastUpdated: `${deu.lastUpdated}T00:00:00.000Z` })).toEqual([]);
    expect(mirrorDiff({ ...deu, migrationTimeline: `${deu.migrationTimeline}\r\n` })).toEqual([]);
    expect(mirrorDiff({ ...deu, lastUpdated: '2020-01-01' }).map((d) => d.field)).toEqual(['lastUpdated']);
    expect(mirrorDiff({ ...deu, migrationTimeline: '2040 | Something else' }).map((d) => d.field)).toEqual(['migrationTimeline']);
    expect(mirrorDiff({ iso3: 'ZZZ', migrationTimeline: null, lastUpdated: null }).map((d) => d.field)).toEqual(['profile']);
  });

  it('names documents that differ between Notion and the JSON copy', async () => {
    const { documentsMirrorDiff } = await import('./mirror');
    const json = readDocumentEntries().map((d) => ({ url: d.url as string | null, title: d.title as string, country: d.country as string | null, year: d.year as number | null }));
    expect(documentsMirrorDiff(json, json)).toEqual([]);
    const gbr = json.find((d) => d.country === 'GBR' && d.year !== null)!;
    const notion = [...json.map((d) => (d === gbr ? { ...d, url: `${d.url}/`, year: null } : d)), { url: 'https://example.org/new', title: 'New', country: 'SVK', year: 2026 }];
    const diff = documentsMirrorDiff(notion, json);
    // a trailing slash is the same document; the year that differs and the missing one are named
    expect(diff).toContainEqual({ kind: 'field', iso3: 'GBR', url: `${gbr.url}/`, field: 'year', notion: null, json: String(gbr.year) });
    expect(diff).toContainEqual({ kind: 'missing', iso3: 'SVK', url: 'https://example.org/new', title: 'New' });
    expect(diff.filter((d) => d.kind === 'count').map((d) => d.iso3)).toEqual(['SVK']);
  });
});

describe('the profile page readings (spec 7.1)', () => {
  const preview = { env: { ATLAS_OFFLINE: '1' } };
  const production = flags([]);

  it('reads a line that starts with "Proposal" as "Proposal, not law", with no bindingness label and no status', async () => {
    const { readRules } = await import('./evidence');
    const lines = readRules('ZZZ', 'Proposal for a regulation on something | EU | binding-law\nA law | national | binding-law', preview);
    expect(lines[0]).toMatchObject({ proposal: true, bindingness: null, status: null });
    expect(lines[1]).toMatchObject({ proposal: false, bindingness: { key: 'binding-law', label: 'Binding law', binding: true } });
    // the EU's own proposal line, as recorded on its profile
    const euu = readRules('EUU', profile('EUU').mainRegulation, preview).filter((r) => /^proposal/i.test(r.instrument));
    expect(euu.length).toBeGreaterThan(0);
    for (const r of euu) expect(r).toMatchObject({ proposal: true, bindingness: null });
  });

  it('keeps Status and Bindingness apart, and links no line to EU rules, in preview as in production', async () => {
    const { readRules } = await import('./evidence');
    const deu = readRules('DEU', profile('DEU').mainRegulation, preview);
    expect(deu.map((r) => r.bindingness?.label)).toEqual(['Binding law', 'Binding law', 'Guidance', 'Guidance']);
    for (const r of deu) expect(r.status).toBeNull(); // no annotation records a lifecycle status for them
    // EU rules has left the site: a line carries no address at all, whichever build reads it
    for (const opts of [preview, production, flags(['rulebook'])]) {
      for (const r of readRules('DEU', profile('DEU').mainRegulation, opts)) expect(Object.keys(r)).not.toContain('article');
    }
  });

  it('words the rail\'s bindingness without a year, leaving proposals out of a derived reading', async () => {
    const { bindingWords, readRules } = await import('./evidence');
    expect(bindingWords('binding', []).words).toBe('Binding instruments recorded');
    expect(bindingWords('soft-only', []).words).toBe('Soft law and guidance only');
    expect(bindingWords('none', []).words).toBe('None recorded');
    const onlyProposal = readRules('ZZZ', 'Proposal for a regulation | EU | binding-law\nA guide | national | guidance', preview);
    expect(bindingWords(null, onlyProposal).words).toBe('Soft law and guidance only');
    for (const p of profiles) expect(bindingWords(p.mainRegulation ? 'binding' : null, []).words ?? '').not.toMatch(/\d{4}/);
  });

  it('gives Germany four dates, 2026 to 2035, each saying its kind and bindingness are not recorded', async () => {
    const { readTimeline, timelineSpan } = await import('./evidence');
    const lines = readTimeline('DEU', profile('DEU').migrationTimeline, true, preview);
    expect(timelineSpan(lines)).toEqual({ dates: 4, from: 2026, to: 2035, latest: null });
    for (const l of lines) expect(l).toMatchObject({ meta: ['kind and bindingness not recorded'], open: false, lead: false });
  });

  it('says once what every timeline line shares, and leaves each row only its own words', async () => {
    const { foldTimelineMeta, readTimeline } = await import('./evidence');
    const deu = foldTimelineMeta(readTimeline('DEU', profile('DEU').migrationTimeline, true, preview));
    expect(deu).toMatchObject({ shared: ['kind and bindingness not recorded'], lead: false });
    for (const r of deu.rows) expect(r).toEqual({ meta: [], lead: false });
    // Italy in preview: kind differs, the lane and the roadmap are shared, and every line is a lead
    const ita = foldTimelineMeta(readTimeline('ITA', profile('ITA').migrationTimeline, true, preview));
    expect(ita.shared).toEqual(['set in guidance', 'From the EU coordinated roadmap, addressed to Member States']);
    expect(ita.lead).toBe(true);
    expect(ita.rows).toEqual([
      { meta: ['priority systems'], lead: false },
      { meta: ['completion'], lead: false },
    ]);
    // one line keeps its words; nothing is lost or invented across every profile
    for (const p of profiles) {
      const lines = readTimeline(p.iso3, p.migrationTimeline, euMembers().has(p.iso3), preview);
      const fold = foldTimelineMeta(lines);
      if (lines.length === 1) expect(fold.shared).toEqual([]);
      lines.forEach((l, i) => {
        expect([...fold.shared, ...fold.rows[i].meta].sort(), p.iso3).toEqual([...l.meta].sort());
        expect(fold.lead || fold.rows[i].lead, p.iso3).toBe(l.lead);
      });
    }
  });

  it('says which of kind and bindingness is not recorded, and never infers either', async () => {
    const { readTimeline } = await import('./evidence');
    for (const p of profiles) {
      for (const l of readTimeline(p.iso3, p.migrationTimeline, euMembers().has(p.iso3), preview)) {
        const recorded = !!l.kind || !!l.bindingness || l.status === 'proposal';
        if (!recorded) expect(l.meta[0], p.iso3).toBe('kind and bindingness not recorded');
        else if (!l.kind) expect(l.meta[0], p.iso3).toBe('kind not recorded');
        else if (!l.bindingness && l.status !== 'proposal') expect(l.meta[1], p.iso3).toBe('bindingness not recorded');
      }
    }
  });

  it('marks Italy\'s restated roadmap lines in preview, as unconfirmed, and drops them in production', async () => {
    const { readTimeline, timelineSpan } = await import('./evidence');
    const lines = readTimeline('ITA', profile('ITA').migrationTimeline, true, preview);
    expect(lines.map((l) => l.meta)).toEqual([
      ['priority systems', 'set in guidance', 'From the EU coordinated roadmap, addressed to Member States'],
      ['completion', 'set in guidance', 'From the EU coordinated roadmap, addressed to Member States'],
    ]);
    // a lead is not folded, so the marker stays solid, as the Dates row counts the lines as Italy's own
    for (const l of lines) expect(l).toMatchObject({ open: false, lead: true });
    expect(timelineSpan(lines)?.latest).toEqual({ year: '2035', words: 'completion, in guidance (not a legal deadline)', lead: true });
    const prod = readTimeline('ITA', profile('ITA').migrationTimeline, true, production);
    for (const l of prod) expect(l).toMatchObject({ meta: ['kind and bindingness not recorded'], open: false, lead: false });
    expect(timelineSpan(prod)).toEqual({ dates: 2, from: 2030, to: 2035, latest: null });
  });

  it('draws a line open on the timeline exactly when Across the Atlas reads it as reaching through membership', async () => {
    const { readTimeline } = await import('./evidence');
    const real = projectRoot();
    const root = mkdtempSync(join(tmpdir(), 'site-timeline-'));
    for (const part of ['data/lab', 'data/profiles', 'data/results', 'data/countries.json']) cpSync(join(real, part), join(root, part), { recursive: true });
    const file = join(root, 'data/lab/annotations/annotations.json');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    for (const d of data.dates) Object.assign(d, { verify: false, verifiedAt: '2026-10-01' });
    writeFileSync(file, JSON.stringify(data));
    // the Target dates flag state below starts from every tool private, as flags() does
    writeAllPrivateRegistry(root, real);
    for (const [opts, open, relation] of [
      [preview, false, 'own'],
      [{ root, env: { ATLAS_OFFLINE: '1' } }, true, 'membership'],
    ] as const) {
      const lines = readTimeline('ITA', profile('ITA').migrationTimeline, true, opts);
      for (const l of lines) expect(l.open).toBe(open);
      const dates = connectedEvidence(profile('ITA'), { root: STAGE0, ...opts, env: { ...opts.env, ATLAS_FORCE_PUBLIC: 'dates', VERCEL_ENV: 'production' } }).rows.find((r) => r.group === 'dates');
      expect(dates?.relation).toBe(relation);
    }
  });

  it('links the timeline to Target dates only where Target dates holds every line, as the dates row does', async () => {
    const { timelineLinks } = await import('./evidence');
    const hrefs = (iso3: string, opts: { env: Record<string, string> }) => timelineLinks(iso3, profile(iso3).migrationTimeline, opts).map((l) => l.href);
    expect(hrefs('DEU', flags(['dates', 'exposure']))).toEqual(['/target-dates?in=DEU', '/prepare/exposure?j=DEU']);
    expect(hrefs('DEU', flags([]))).toEqual([]);
    // every place's link agrees with its dates row in a production build
    for (const p of profiles) {
      const row = connectedEvidence(p, flags(['dates'])).rows.find((r) => r.group === 'dates' && r.relation === 'own' && r.sentence.includes('migration timeline'));
      const compare = timelineLinks(p.iso3, p.migrationTimeline, flags(['dates'])).some((l) => l.href.startsWith('/target-dates?'));
      if (row) expect(compare, p.iso3).toBe(true);
      if (compare) expect(datesFor([p.iso3], flags(['dates'])).length, p.iso3).toBeGreaterThan(0);
    }
  });

  it('marks the one dates row the profile timeline already says, with the timeline\'s own links', async () => {
    const { isTimelineRow, timelineLinks } = await import('./evidence');
    for (const p of profiles) {
      const rows = connectedEvidence(p, flags(TOOLS)).rows;
      const marked = rows.filter(isTimelineRow);
      expect(marked.length, p.iso3).toBeLessThanOrEqual(1);
      for (const r of marked) {
        expect(r).toMatchObject({ group: 'dates', relation: 'own' });
        expect(r.sentence, p.iso3).toContain('migration timeline');
        expect(r.links.map((l) => l.href), p.iso3).toEqual(timelineLinks(p.iso3, p.migrationTimeline, flags(TOOLS)).map((l) => l.href));
      }
      for (const r of rows.filter((x) => !isTimelineRow(x))) expect(r.sentence, p.iso3).not.toContain('on its migration timeline');
    }
  });

  it('names the guide in each guide link for a screen reader, so two rows\' links differ', () => {
    const fra = connectedEvidence(profile('FRA'), flags(TOOLS)).rows.filter((r) => r.group === 'guidance');
    expect(fra.length).toBe(2);
    const names = fra.flatMap((r) => r.links.filter((l) => l.href.startsWith('/prepare/guides/') || l.href.startsWith('/prepare/check')).map((l) => `${l.label}${l.hint ?? ''}`));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Read the guide: the ANSSI FAQ');
  });

  it('never calls a date a deadline, and says "not a legal deadline" only beside guidance', async () => {
    const { readTimeline, timelineSpan } = await import('./evidence');
    for (const p of profiles) {
      const lines = readTimeline(p.iso3, p.migrationTimeline, euMembers().has(p.iso3), preview);
      for (const l of lines) for (const w of l.meta) expect(w).not.toMatch(/deadline/i);
      const latest = timelineSpan(lines)?.latest;
      if (latest && /deadline/.test(latest.words)) expect(latest.words).toContain('in guidance (not a legal deadline)');
    }
  });
});
