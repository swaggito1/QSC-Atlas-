// The Standards Cascade's choice of standards body (Swann, 5 October 2026: "the potential to use
// other standards than NIST, don't put it default"). NIST stays the default and its view is the
// Cascade exactly as it was; each other body the Standards overview groups is drawn from its own
// verified standards and the verified documents of governments naming them, never a lead and
// never a standards body's own document; such a body has no seat and no line on the globe or the
// map; and the choice travels in the address beside the other choices.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { latestVerifiedAt, projectRoot } from './load';
import { allPrivateRoot } from './registry-fixture';
import { OUTSIDE, PHONE, boxesMeet, textBox } from './cascade-layout';
import { RELATIONS, aggregateLinks, cascadeStateToSearch, counter, counterLinesBody, geoLines, months, parseCascadeState, periodEnd } from './cascade';
import type { CascadeState } from './cascade';
import { cascadeIslandBodies, loadCascade, loadCascadeBodies, loadCascadeBody } from './cascade-data';
import { CASCADE_MIN_GOVERNMENTS, cascadeBodyOptions, fill, plain, standardsBodyIssuers, standardsCopy, standardsOverviewModel } from '../site/standards';
import { standardsRecords } from '../site/joins';

const root = projectRoot();
const now = new Date('2026-10-05T12:00:00Z');
const site = 'https://example.org';
// a build on Swann's machine, a preview deployment and a production build
const local = { root, env: { ATLAS_OFFLINE: '1' } };
const preview = { root, env: { VERCEL: '1', VERCEL_ENV: 'preview', ATLAS_OFFLINE: '1' } };
const production = { root, env: { VERCEL: '1', VERCEL_ENV: 'production', ATLAS_OFFLINE: '1' } };
const copy = standardsCopy(local);
// every record, leads included, to check what the views leave out
const records = standardsRecords(local);
const recordOf = new Map(records.edges.map((e) => [e.id, e]));
const standardOf = new Map(records.standards.map((s) => [s.id, s]));

describe('the default view', () => {
  it('is the NIST Cascade, exactly as loadCascade() gives it', () => {
    for (const opts of [local, preview, production]) {
      const nist = loadCascadeBody('nist', opts, now, site)!;
      const { body, ...rest } = nist;
      expect(body.id).toBe('nist');
      expect(rest).toEqual(loadCascade(opts, now, site));
      expect(JSON.stringify(rest)).toBe(JSON.stringify(loadCascade(opts, now, site)));
    }
    // the Cascade is read from cold in three builds here, which a full parallel run can slow past the default 5 s
  }, 30_000);
  it('is the first option, and the views of the other bodies leave its props as they are', () => {
    const options = cascadeBodyOptions(preview);
    expect(options[0].id).toBe('nist');
    const nist = loadCascade(preview, now, site);
    const before = JSON.stringify(nist);
    const island = cascadeIslandBodies(nist, loadCascadeBodies(preview, now, site), options);
    expect(JSON.stringify(nist)).toBe(before);
    expect(island.views.nist).toBeUndefined();
  });
  it('writes no body to the address, and an address without one opens NIST', () => {
    const all = months('2026-10');
    const defaults: CascadeState = { view: 'orbit', std: 'all', rel: [...RELATIONS], group: 'all', t: '2026-10', fork: false, sel: null };
    expect(cascadeStateToSearch(defaults, defaults)).toBe('?t=2026-10');
    expect(cascadeStateToSearch({ ...defaults, body: 'nist' }, defaults)).toBe('?t=2026-10');
    expect(parseCascadeState('?t=2026-10&sel=FRA', defaults, all).body).toBeUndefined();
  });
});

describe('the choice of standards body', () => {
  const options = cascadeBodyOptions(preview);
  it('offers NIST, then every body the overview groups that two governments\' documents cite, in its order', () => {
    expect(options.map((o) => o.id)).toEqual(['nist', 'ietf', 'etsi', 'iso-iec']);
    expect(options.map((o) => o.label)).toEqual(['NIST', 'IETF and IRTF', 'ETSI', 'ISO/IEC']);
    expect(options.find((o) => o.id === 'ietf')).toMatchObject({ bodyIds: ['ietf', 'irtf'], labelOr: 'IETF or IRTF' });
    // the national processes belong to the NIST view and are never a body of their own here
    for (const id of ['kpqc', 'iccs', 'tc26']) expect(options.some((o) => o.bodyIds.includes(id))).toBe(false);
  });
  it('is the same in a local, a preview and a production build', () => {
    expect(cascadeBodyOptions(local)).toEqual(options);
    expect(cascadeBodyOptions(production)).toEqual(options);
  });
});

describe("another body's view", () => {
  for (const [name, opts] of [
    ['preview', preview],
    ['production', production],
    ['local', local],
  ] as const) {
    const views = loadCascadeBodies(opts, now, site);
    it(`draws only that body's verified standards and the verified edges naming them (${name})`, () => {
      expect(views.map((v) => v.body.id)).toEqual(['ietf', 'etsi', 'iso-iec']);
      for (const v of views) {
        expect(v.standards.length).toBeGreaterThan(0);
        expect(v.edges.length).toBeGreaterThan(0);
        const ids = new Set(v.standards.map((s) => s.id));
        for (const s of v.standards) {
          const rec = standardOf.get(s.id)!;
          expect(v.body.bodyIds, s.id).toContain(rec.bodyId);
          expect(rec.verify, s.id).toBe(false);
          expect(rec.national, s.id).toBeNull();
          expect(s.centre).toBe(true);
        }
        // every verified standard of the body, in the order of the standards file
        expect(v.standards.map((s) => s.id)).toEqual(records.standards.filter((s) => !s.verify && !s.national && v.body.bodyIds.includes(s.bodyId)).map((s) => s.id));
        for (const e of v.edges) {
          expect(ids.has(e.to), e.id).toBe(true);
          expect(recordOf.get(e.id)!.verify, e.id).toBe(false);
          expect(e.verified).toBe(true);
          expect(['adopts', 'profiles', 'references']).toContain(e.relation);
        }
        expect(v.nistIds).toEqual([...ids]);
      }
    });
  }

  const views = loadCascadeBodies(preview, now, site);
  const byId = Object.fromEntries(views.map((v) => [v.body.id, v]));

  it('never counts a lead: the BSI lead on ISO/IEC 18033-2 Amd 2 places no one', () => {
    const lead = records.edges.find((e) => e.verify && e.to === 'ISO-IEC-18033-2-AMD2');
    expect(lead, 'the lead this test relies on').toBeTruthy();
    const iso = byId['iso-iec'];
    expect(iso.edges.some((e) => e.id === lead!.id)).toBe(false);
    for (const v of views) for (const e of v.edges) expect(recordOf.get(e.id)!.verify).toBe(false);
    expect(iso.orbit.nodes.find((n) => n.iso3 === lead!.from)!.firstNistEdge).toBeNull();
  });

  it("never counts a standards body's own document as a government citing it", () => {
    const own = records.edges.find((e) => !e.verify && e.to === 'ETSI-TS-103-744' && plain(e.issuingOrg) === 'etsi');
    expect(own, 'ETSI TR 104 239-2, filed under the EU').toBeTruthy();
    expect(byId.etsi.edges.some((e) => e.id === own!.id)).toBe(false);
    const bodies = standardsBodyIssuers(preview);
    for (const v of views) for (const e of v.edges) expect(bodies.has(plain(e.issuingOrg)), `${v.body.id} ${e.id}`).toBe(false);
  });

  it('places each government by its first verified document naming one of the body’s standards, the rest outside', () => {
    for (const v of views) {
      const first = new Map<string, string>();
      for (const e of v.edges) if (!first.has(e.from) || periodEnd(e.date) < periodEnd(first.get(e.from)!)) first.set(e.from, e.date);
      for (const n of v.orbit.nodes) {
        expect(n.firstNistEdge, `${v.body.id} ${n.iso3}`).toBe(first.get(n.iso3) ?? null);
        if (!first.has(n.iso3)) expect(n.radius).toBe(OUTSIDE);
      }
      expect(v.orbit.national).toEqual([]);
      expect(v.orbit.phoneLinks).toEqual({});
    }
    expect([...new Set(byId.etsi.edges.map((e) => e.from))].sort()).toEqual(['DEU', 'EUU', 'FRA', 'GBR']);
    expect([...new Set(byId['iso-iec'].edges.map((e) => e.from))].sort()).toEqual(['ESP', 'ITA']);
  });

  it('never offers a body that a single government cites: it stays on the overview only', () => {
    // ITU-T and ANSI X9 are cited by the EU alone, CEN-CENELEC by Luxembourg alone (5 October 2026)
    for (const id of ['itu-t', 'x9', 'cen-cenelec']) {
      expect(cascadeBodyOptions(preview).map((o) => o.id)).not.toContain(id);
      expect(loadCascadeBody(id, preview, now, site)).toBeNull();
    }
    expect(CASCADE_MIN_GOVERNMENTS).toBe(2);
  });

  it('has no seat and no line on the globe or the map; NIST keeps its centre and its lines', () => {
    const nist = loadCascade(preview, now, site);
    const linesOf = (d: { edges: typeof nist.edges; standards: typeof nist.standards }) =>
      aggregateLinks(d.edges, new Set(d.standards.filter((s) => s.centre).map((s) => s.id)), new Set(d.standards.filter((s) => s.national).map((s) => s.id)));
    expect(nist.geo.nist).toEqual([-77.218506, 39.14004]);
    expect(geoLines(linesOf(nist), nist.geo.nist).length).toBeGreaterThan(0);
    expect(geoLines(linesOf(nist), nist.geo.nist).some((l) => l.kind === 'own')).toBe(false);
    for (const v of views) {
      expect(v.geo.nist, v.body.id).toBeNull();
      const lines = linesOf(v);
      expect(lines.length).toBeGreaterThan(0); // the orbit draws them, from its abstract centre
      expect(geoLines(lines, v.geo.nist)).toEqual([]);
      // every citing country has a place to be marked at, and nothing else is added
      for (const iso3 of new Set(v.edges.map((e) => e.from))) expect(v.geo.lonlat[iso3], `${v.body.id} ${iso3}`).toBeTruthy();
    }
  });

  it('keeps the coordination events and dates the body’s own standards from their records', () => {
    const coordination = records.spine.filter((s) => !s.verify && s.date && s.kind === 'coordination').map((s) => s.id);
    for (const v of views) {
      expect(v.spine.filter((s) => s.kind === 'coordination').map((s) => s.id).sort()).toEqual([...coordination].sort());
      expect(v.spine.every((s) => s.kind === 'coordination' || s.kind === 'standard')).toBe(true);
      for (const s of v.spine.filter((x) => x.kind === 'standard')) {
        const rec = records.standards.find((x) => `standard-${x.id.toLowerCase()}` === s.id)!;
        expect(s.date).toBe(rec.statusDate);
        expect(s.label.startsWith(rec.label)).toBe(true);
      }
      expect(v.spine.filter((x) => x.kind === 'standard')).toHaveLength(v.standards.filter((s) => standardOf.get(s.id)!.statusDate).length);
      const ends = v.spine.map((s) => periodEnd(s.date));
      expect(ends).toEqual([...ends].sort());
    }
  });

  it('counts only what it draws: the as-of date, the documents and the events', () => {
    for (const v of views) {
      const coordination = records.spine.filter((s) => !s.verify && s.date && s.kind === 'coordination');
      const standards = records.standards.filter((s) => v.standards.some((x) => x.id === s.id));
      const edges = records.edges.filter((e) => v.edges.some((x) => x.id === e.id));
      expect(v.asOf).toBe(latestVerifiedAt({ coordination, standards, edges }));
      expect(v.endMonth).toBe(v.asOf!.slice(0, 7));
      expect(v.lineDocs).toBe(new Set(v.edges.map((e) => e.documentUrl)).size);
      expect(v.sources.at(-1)!.url).toBe('https://example.org/documents');
    }
    // the ETSI view reads the ENISA and ECCG documents and the BSI, NCSC and Arcep ones, never ETSI's own
    expect(byId.etsi.lineDocs).toBe(6);
  });

  it('sends the island each edge and each country once, and every view can find its edges', () => {
    const nist = loadCascade(preview, now, site);
    const island = cascadeIslandBodies(nist, views, cascadeBodyOptions(preview));
    const nistIds = new Set(nist.edges.map((e) => e.id));
    const extra = island.extraEdges.map((e) => e.id);
    expect(new Set(extra).size).toBe(extra.length);
    for (const id of extra) expect(nistIds.has(id)).toBe(false);
    const pool = new Set([...nistIds, ...extra]);
    for (const [id, v] of Object.entries(island.views)) for (const e of v.edgeIds) expect(pool.has(e), `${id} ${e}`).toBe(true);
    for (const iso3 of Object.keys(island.extraInfo)) expect(nist.info[iso3]).toBeUndefined();
    // Estonia has no posture, so the NIST view does not draw it; the IETF and IRTF view does
    expect(island.extraInfo.EST?.iso3).toBe('EST');
    expect(island.options.map((o) => o.id)).toEqual(['nist', 'ietf', 'etsi', 'iso-iec']);
  });
});

describe('the counter in another body’s view', () => {
  const edges = [
    { from: 'FRA', to: 'RFC-9370', relation: 'references', date: '2026-02-02' },
    { from: 'DEU', to: 'RFC-9370', relation: 'profiles', date: '2026-01-23' },
    { from: 'ITA', to: 'RFC-9370', relation: 'references', date: '2026-05-12', verified: false },
  ];
  const c = { counter: '{n} named {standard} by {month}.', counterNone: 'none named {standard} by {month}.', counterRequirements: 'Of these, {m} added.', counterMore: 'and {k} ran their own.', counterOwnOnly: '{k} ran their own.' };
  it('never speaks of a national process, and adds a second sentence only for national requirements', () => {
    const vars = { month: 'October 2026', standard: 'IETF standards' };
    expect(counterLinesBody(counter(edges, '2026-10', 'all', ['RFC-9370']), c, vars)).toEqual(['2 named IETF standards by October 2026.', 'Of these, 1 added.']);
    expect(counterLinesBody(counter(edges.slice(0, 1), '2026-10', 'all', ['RFC-9370']), c, vars)).toEqual(['1 named IETF standards by October 2026.', '']);
    expect(counterLinesBody(counter(edges, '2025-01', 'all', ['RFC-9370']), c, vars)).toEqual(['none named IETF standards by October 2026.', '']);
  });
});

describe('the address', () => {
  const all = months('2026-10');
  const defaults: CascadeState = { view: 'orbit', std: 'all', rel: [...RELATIONS], group: 'all', t: '2026-10', fork: false, sel: null };
  it('round-trips a body with the other choices, the body first', () => {
    const st: CascadeState = { ...defaults, body: 'etsi', view: 'map', std: 'ETSI-TR-103-619', group: 'eu', t: '2026-06', sel: 'FRA', rel: ['references'] };
    const search = cascadeStateToSearch(st, defaults);
    expect(search.startsWith('?body=etsi&')).toBe(true);
    expect(parseCascadeState(search, defaults, all)).toEqual(st);
    const withFork = { ...defaults, body: 'ietf', fork: true, sel: 'EST' };
    expect(parseCascadeState(cascadeStateToSearch(withFork, defaults), defaults, all)).toEqual(withFork);
  });
  it('reads a body in any case; the island maps an unknown one to NIST', () => {
    expect(parseCascadeState('?body=ETSI', defaults, all).body).toBe('etsi');
    expect(parseCascadeState('?body=', defaults, all).body).toBeUndefined();
  });
});

describe('the new words', () => {
  const keys = [
    'bodyLabel',
    'questionBody',
    'ledeBody',
    'bodyNote',
    'noBody',
    'tooltipFirstBody',
    'tooltipNoneBody',
    'counterAnyBody',
    'standardAllBody',
    'legendLinesBody',
    'legendNoLinesBody',
    'legendRingsBody',
    'legendGreyBody',
    'chartDescOrbitBody',
    'chartDescMapBody',
    'globeLabelBody',
    'hintMapBody',
    'hintGlobeBody',
    'shareSourceBody',
    'methodBody',
    'spineEventStatus',
    'spineEventRevision',
    'overviewCascadeLink',
  ];
  it('are in the copy file, and read whole for every body', () => {
    for (const k of keys) expect(copy[k], k).toMatch(/\S/);
    for (const o of cascadeBodyOptions(preview).filter((x) => x.id !== 'nist')) {
      for (const k of keys) {
        const text = fill(copy[k], { body: o.label, month: 'October 2026', n: 1, date: '2 February 2026', standard: 'RFC 9370', status: 'Published', lineDocs: 1, corpusSize: 2 });
        expect(text, `${k} for ${o.id}`).not.toMatch(/[{}]/);
      }
    }
    expect(fill(copy.questionBody, { body: 'IETF and IRTF' })).toBe('Who names IETF and IRTF post-quantum standards, and since when?');
    expect(fill(copy.noBody, { body: 'IETF or IRTF' })).toBe('no IETF or IRTF reference recorded');
  });
  it('keep each body’s name at the centre of its orbit clear of the year labels, at both sizes', () => {
    for (const v of loadCascadeBodies(preview, now, site)) {
      const c = v.orbit.centreLabel;
      for (const r of v.orbit.rings) {
        if (!r.label) continue;
        for (const [size, on] of [
          [1, r.label.wide],
          [PHONE, r.label.phone],
        ] as const) {
          if (!on) continue;
          const year = textBox(r.label.x, r.label.y, String(r.year), 'middle', size);
          expect(boxesMeet(year, textBox(c.x, c.y, v.body.label, c.anchor, size)), `${v.body.id} ${r.year}`).toBe(false);
        }
      }
    }
  });
});

describe('the overview', () => {
  it('links each body the Cascade offers to the Cascade on it, NIST without a parameter, and no national process', () => {
    const m = standardsOverviewModel(local);
    const links = Object.fromEntries(m.sections.map((s) => [s.id, s.cascade?.href ?? null]));
    expect(links).toEqual({
      nist: '/standards/cascade',
      ietf: '/standards/cascade?body=ietf',
      etsi: '/standards/cascade?body=etsi',
      'iso-iec': '/standards/cascade?body=iso-iec',
      'itu-t': null,
      x9: null,
      'cen-cenelec': null,
      national: null,
    });
    for (const s of m.sections) if (s.cascade) expect(s.cascade.label).toBe(copy.overviewCascadeLink);
  });
  it('names no Cascade link where the Cascade is not built (an all-private production build)', () => {
    // the real registry with every tool private again (src/lib/lab/registry-fixture.ts)
    const allPrivate = { ...production, root: allPrivateRoot() };
    for (const s of standardsOverviewModel(allPrivate).sections) expect(s.cascade).toBeNull();
  });
});

// ---- a body left with one government once a citation turns into a lead is not offered --------------

describe('a body whose second government\'s citation is a lead', () => {
  let fixture = '';
  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), 'qsc-cascade-bodies-'));
    for (const entry of readdirSync(root)) if (entry !== 'data' && entry !== 'node_modules' && !entry.startsWith('.')) symlinkSync(join(root, entry), join(fixture, entry));
    mkdirSync(join(fixture, 'data/lab/cascade'), { recursive: true });
    for (const entry of readdirSync(join(root, 'data'))) if (entry !== 'lab') symlinkSync(join(root, 'data', entry), join(fixture, 'data', entry));
    for (const entry of readdirSync(join(root, 'data/lab'))) if (entry !== 'cascade') symlinkSync(join(root, 'data/lab', entry), join(fixture, 'data/lab', entry));
    for (const entry of readdirSync(join(root, 'data/lab/cascade'))) if (entry !== 'edges.json') symlinkSync(join(root, 'data/lab/cascade', entry), join(fixture, 'data/lab/cascade', entry));
    // Italy's citation of ISO/IEC 14888-4 turned into a lead: Spain alone still cites an ISO/IEC standard
    const file = JSON.parse(readFileSync(join(root, 'data/lab/cascade/edges.json'), 'utf8'));
    for (const e of file.edges) if (e.to === 'ISO-IEC-14888-4') Object.assign(e, { verify: true, verifiedAt: null });
    writeFileSync(join(fixture, 'data/lab/cascade/edges.json'), JSON.stringify(file));
  });
  afterAll(() => rmSync(fixture, { recursive: true, force: true }));

  it('drops out of the choice in a local and a preview build, and its leads reach no view', () => {
    for (const env of [{ ATLAS_OFFLINE: '1' }, { VERCEL: '1', VERCEL_ENV: 'preview', ATLAS_OFFLINE: '1' }]) {
      const opts = { root: fixture, env };
      expect(cascadeBodyOptions(opts).map((o) => o.id)).not.toContain('iso-iec');
      expect(loadCascadeBody('iso-iec', opts, now, site)).toBeNull();
      for (const v of loadCascadeBodies(opts, now, site)) expect(v.edges.some((e) => e.to === 'ISO-IEC-14888-4')).toBe(false);
    }
  });
});
