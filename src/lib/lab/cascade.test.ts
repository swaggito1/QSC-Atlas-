import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectRoot } from './load';
import { OUTSIDE, PHONE, VIEW, WORD, boxesMeet, computeOrbit, inView, nameBox, squareBox, textBox, yearFraction } from './cascade-layout';
import { aggregateLinks, bentArc, byDate, cascadeStateToSearch, counter, counterLines, documentEvidence, drawnEdges, filterOf, forkSet, frameFacts, linkOf, linkWidth, litSet, monthOf, months, onOrBefore, parseCascadeState, resolveLocators } from './cascade';
import { loadCascade, nationalShort } from './cascade-data';

const jurisdictions = [
  { iso3: 'USA', name: 'United States', posture: 'NIST-bloc', role: 'setter', opacity: 1 },
  { iso3: 'GBR', name: 'United Kingdom', posture: 'NIST-bloc', role: 'contextualiser', opacity: 1 },
  { iso3: 'FRA', name: 'France', posture: 'EU', role: 'contextualiser', opacity: 1 },
  { iso3: 'CHN', name: 'China', posture: 'sovereign-bloc', role: 'sovereign-developer', opacity: 0.74 },
];
const edges = [
  { id: 'usa-203', from: 'USA', to: 'FIPS-203', relation: 'adopts', date: '2024-08-13', preStandardOnly: false },
  { id: 'gbr-203', from: 'GBR', to: 'FIPS-203', relation: 'profiles', date: '2025-03-20', preStandardOnly: false },
  { id: 'fra-kyber', from: 'FRA', to: 'FIPS-203', relation: 'references', date: '2022-04', preStandardOnly: true },
  { id: 'chn-ngcc', from: 'CHN', to: 'CHN-NGCC', relation: 'fork', date: '2025-02-05', preStandardOnly: false },
];
const layout = () =>
  computeOrbit({
    jurisdictions,
    edges,
    nistStandards: [{ id: 'FIPS-203', label: 'FIPS 203' }],
    nationalStandards: [{ id: 'CHN-NGCC', label: 'NGCC', iso3: 'CHN' }],
    endYear: 2026,
  });

describe('the orbit layout', () => {
  it('is deterministic: the same data gives the same coordinates', () => {
    expect(JSON.stringify(layout())).toBe(JSON.stringify(layout()));
    expect(layout().nodes.map((n) => [n.iso3, n.x, n.y])).toMatchSnapshot();
  });
  it('places a jurisdiction by the date of its first NIST link, and one with none outside the rings', () => {
    const n = Object.fromEntries(layout().nodes.map((x) => [x.iso3, x]));
    expect(n.FRA.radius).toBeLessThan(n.USA.radius); // 2022 before 2024
    expect(n.USA.radius).toBeLessThan(n.GBR.radius);
    expect(n.CHN.radius).toBe(layout().outside); // a fork is not a NIST link
  });
  it('reads dates of any precision as the middle of the period', () => {
    expect(yearFraction('2024')).toBe(2024.5);
    expect(yearFraction('2024-07')).toBeCloseTo(2024.54, 2);
  });
});

describe('the counter line', () => {
  const nist = ['FIPS-203'];
  it('counts only what is dated on or before the month shown', () => {
    expect(counter(edges, '2023-01', 'all', nist)).toEqual({ n: 1, m: 0, k: 0, kn: 0 });
    expect(counter(edges, '2024-08', 'all', nist)).toEqual({ n: 2, m: 0, k: 0, kn: 0 });
    expect(counter(edges, '2026-09', 'all', nist)).toEqual({ n: 3, m: 1, k: 1, kn: 0 });
  });
  it('respects the group filter', () => {
    expect(counter(edges, '2026-09', 'all', nist, new Set(['FRA']))).toEqual({ n: 1, m: 0, k: 0, kn: 0 });
  });
  it('maps both national-process relations to the fork filter', () => {
    expect(filterOf('parallel-interoperable')).toBe('fork');
    expect(filterOf('participates')).toBeNull();
  });
  it('says "of these" about the national processes only when they are all among the first number', () => {
    const copy = {
      counter: '{n} named {standard} by {month}.',
      counterNone: 'none named {standard} by {month}.',
      counterMore: 'Of these, {m} added, and {k} ran their own.',
      counterRequirements: 'Of these, {m} added.',
      counterOwnOnly: 'Of all checked, {k} ran their own.',
    };
    const vars = { month: 'September 2026', standard: 'FIPS 203' };
    // China runs its own process and names no NIST standard: never counted "of these"
    expect(counterLines(counter(edges, '2026-09', 'all', nist), copy, vars)).toEqual(['3 named FIPS 203 by September 2026.', 'Of these, 1 added. Of all checked, 1 ran their own.']);
    const both = [...edges, { id: 'chn-203', from: 'CHN', to: 'FIPS-203', relation: 'references', date: '2025-06-01', preStandardOnly: false }];
    expect(counterLines(counter(both, '2026-09', 'all', nist), copy, vars)[1]).toBe('Of these, 1 added, and 1 ran their own.');
    expect(counterLines(counter(edges, '2026-09', 'all', nist, new Set(['CHN'])), copy, vars)).toEqual(['none named FIPS 203 by September 2026.', 'Of all checked, 1 ran their own.']);
    expect(counterLines(counter(edges, '2023-01', 'all', nist), copy, vars)[1]).toBe('Of these, 0 added, and 0 ran their own.');
  });
});

describe('the Cascade URL state', () => {
  const all = months('2026-09');
  const defaults = { view: 'orbit' as const, std: 'all', rel: ['adopts', 'profiles', 'references', 'fork'] as never, group: 'all' as const, t: '2026-09', fork: false, sel: null };
  it('runs monthly from December 2016', () => {
    expect(all[0]).toBe('2016-12');
    expect(all[all.length - 1]).toBe('2026-09');
  });
  it('round-trips a view', () => {
    const st = { ...defaults, view: 'map' as const, std: 'FIPS-204', group: 'nato' as const, t: '2024-08', fork: true, sel: 'FRA' };
    expect(parseCascadeState(cascadeStateToSearch(st, defaults), defaults, all)).toEqual(st);
  });
  it('keeps the month in a copied link after the data moves on', () => {
    const link = cascadeStateToSearch({ ...defaults, sel: 'FRA' }, defaults); // copied at the latest month
    const later = { ...defaults, t: '2027-03' };
    expect(parseCascadeState(link, later, months('2027-03')).t).toBe('2026-09');
  });
  it('keeps the kinds shown in one order, without repeats, so an equal choice writes the same link', () => {
    expect(parseCascadeState('?rel=fork,adopts,fork,nonsense', defaults, all).rel).toEqual(['adopts', 'fork']);
    const reordered = parseCascadeState('?rel=references,fork,profiles,adopts', defaults, all);
    expect(cascadeStateToSearch(reordered, defaults)).not.toContain('rel=');
    const none = parseCascadeState('?rel=', defaults, all);
    expect(none.rel).toEqual([]);
    expect(parseCascadeState(cascadeStateToSearch(none, defaults), defaults, all).rel).toEqual([]);
  });
  it('falls back to the defaults for an empty or unknown value', () => {
    const st = parseCascadeState('?view=table&std=&group=g7&t=2026-9&fork=yes&sel=', defaults, all);
    expect(st).toEqual(defaults);
    expect(parseCascadeState('?sel=fra', defaults, all).sel).toBe('FRA');
  });
});

describe('dates of different precision', () => {
  it('counts a year-only date from the end of its year, and a month from the end of its month', () => {
    expect(onOrBefore('2025', '2025-11')).toBe(false);
    expect(onOrBefore('2025', '2025-12')).toBe(true);
    expect(onOrBefore('2025-03', '2025-03')).toBe(true);
    expect(onOrBefore('2025-03-31', '2025-02')).toBe(false);
  });
  it('gives the month a date counts from, which places its mark on the time line', () => {
    expect(monthOf('2025')).toBe('2025-12');
    expect(monthOf('2025-04')).toBe('2025-04');
    expect(monthOf('2024-08-13')).toBe('2024-08');
  });
  it('orders records as the counter reads them: a year after its dated records, ties by id', () => {
    const rows = [
      { id: 'y', date: '2025' },
      { id: 'm', date: '2025-04' },
      { id: 'd', date: '2025-04-10' },
      { id: 'b', date: '2024-01-01' },
      { id: 'a', date: '2024-01-01' },
    ];
    expect([...rows].sort(byDate).map((r) => r.id)).toEqual(['a', 'b', 'd', 'm', 'y']);
  });
  it('places a jurisdiction by the record whose period ends first', () => {
    const o = computeOrbit({
      jurisdictions,
      edges: [
        { id: 'y', from: 'FRA', to: 'FIPS-203', relation: 'references', date: '2025', preStandardOnly: false },
        { id: 'd', from: 'FRA', to: 'FIPS-203', relation: 'references', date: '2025-03-01', preStandardOnly: false },
      ],
      nistStandards: [{ id: 'FIPS-203', label: 'FIPS 203' }],
      nationalStandards: [],
      endYear: 2026,
    });
    expect(o.nodes.find((n) => n.iso3 === 'FRA')!.firstNistEdge).toBe('2025-03-01');
  });
});

describe('what a frame states', () => {
  const nist = ['FIPS-203'];
  it('never changes with the Show switches, which only choose the lines drawn', () => {
    const all = ['adopts', 'profiles', 'references', 'fork'] as never[];
    const some = ['fork'] as never[];
    expect(drawnEdges(edges, { rel: some, std: 'all', group: null, t: '2026-09' }).length).toBeLessThan(drawnEdges(edges, { rel: all, std: 'all', group: null, t: '2026-09' }).length);
    const facts = frameFacts(edges, '2026-09', 'all', nist);
    expect(facts.counts).toEqual(counter(edges, '2026-09', 'all', nist));
    expect([...facts.lit].sort()).toEqual(['FRA', 'GBR', 'USA']);
  });
  it('rings a national process in the fork view only from its date', () => {
    const spine = [{ iso3: 'KOR', kind: 'sovereign', date: '2025-01-16', verified: true }];
    const roles = [{ iso3: 'CHN', role: 'sovereign-developer' }, { iso3: 'KOR', role: null }];
    expect([...forkSet({ roles, spine, edges: [], t: '2018-01' })]).toEqual(['CHN']);
    expect([...forkSet({ roles, spine, edges: [], t: '2025-01' })].sort()).toEqual(['CHN', 'KOR']);
  });
});

describe("a jurisdiction's evidence", () => {
  const base = { from: 'GBR', relation: 'adopts', date: '2024-08-14', preStandardOnly: false, documentUrl: 'https://example.org/doc', documentTitle: 'Doc', issuingOrg: 'Org' };
  const ev = documentEvidence([
    { ...base, id: 'a', to: 'FIPS-203', passages: [{ excerpt: 'Table: ML-KEM FIPS 203 ML-DSA FIPS 204', locator: 'Table 1, p. 3' }, { excerpt: 'Use ML-KEM-768.', locator: 'Section 2, p. 4' }] },
    { ...base, id: 'b', to: 'FIPS-204', passages: [{ excerpt: 'Table: ML-KEM FIPS 203 ML-DSA FIPS 204', locator: 'Table 1, p. 3' }, { excerpt: 'Use ML-KEM-768.', locator: 'Section 2, p. 4' }] },
    { ...base, id: 'c', to: 'FIPS-205', passages: [{ excerpt: 'Table: ML-KEM FIPS 203 ML-DSA FIPS 204 SLH-DSA FIPS 205', locator: 'Table 1, p. 3' }] },
    { ...base, id: 'd', to: 'SP-800-208', passages: [{ excerpt: 'Hash signatures: LMS', locator: 'Table 1, p. 3' }] },
  ]);
  it('keeps every passage of an edge, each under its own locator', () => {
    const quotes = ev[0].groups.flatMap((g) => g.passages);
    expect(quotes.find((p) => p.excerpt === 'Use ML-KEM-768.')?.locator).toBe('Section 2, p. 4');
  });
  it('shows a passage held inside a longer one once, under every relation it supports', () => {
    const table = ev[0].groups.find((g) => g.passages.some((p) => p.excerpt.includes('SLH-DSA')))!;
    expect(table.edges.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(ev[0].groups.flatMap((g) => g.passages).filter((p) => p.excerpt.startsWith('Table')).length).toBe(1);
  });
  it('spells out a locator given relative to the one before it', () => {
    expect(resolveLocators(['Section 4, Agreed Schemes, Note 61', 'Same section, Note 60'])).toEqual(['Section 4, Agreed Schemes, Note 61', 'Section 4, Note 60']);
    expect(resolveLocators(['Attached guide, p. 5 (PDF p. 7), table X', 'Same page'])[1]).toBe('Attached guide, p. 5 (PDF p. 7)');
    expect(resolveLocators(['Slide "A", PDF p. 37', 'Same slide, recommendations'])[1]).toBe('Slide "A", PDF p. 37, recommendations');
  });
});

describe('the real Cascade data', () => {
  it('never lets an unverified link into a production build', () => {
    const d = loadCascade({ env: { VERCEL_ENV: 'production' } });
    expect(d.edges.every((e) => e.verified)).toBe(true);
  });
  it('draws no lead line and marks no event as being checked in a production build', () => {
    const d = loadCascade({ env: { VERCEL_ENV: 'production' } });
    const centre = new Set(d.standards.filter((s) => s.centre).map((s) => s.id));
    const national = new Set(d.standards.filter((s) => s.national).map((s) => s.id));
    expect(aggregateLinks(d.edges, centre, national).some((l) => l.lead || l.kind === 'lead')).toBe(false);
    expect(d.spine.every((s) => s.verified)).toBe(true);
    for (const e of d.edges) expect(e.passages.some((p) => p.excerpt)).toBe(true); // each link keeps a quote to show
  });
  it("names the Atlas's documents page on the site the build is for", () => {
    const d = loadCascade({}, new Date('2026-10-01T12:00:00Z'), 'https://example.org/');
    expect(d.sources.some((s) => s.url === 'https://example.org/documents')).toBe(true);
  });
});

describe('the lines: one per jurisdiction and kind of reference', () => {
  const centre = new Set(['FIPS-203', 'FIPS-204', 'NIST-IR-8547']);
  const national = new Set(['KOR-KPQC']);
  const doc = (id: string, over: Record<string, unknown>) => ({ id, from: 'FRA', to: 'FIPS-203', relation: 'references', date: '2024-01', preStandardOnly: false, documentUrl: `https://example.org/${id}`, ...over });
  const lines = [
    doc('a', {}),
    doc('a2', { to: 'FIPS-204', documentUrl: 'https://example.org/a' }), // the same document, a second standard
    doc('b', { preStandardOnly: true }),
    doc('c', { relation: 'adopts', preStandardOnly: true }),
    doc('d', { to: 'ETSI-TS-103-744' }), // another body's standard: listed, never drawn from NIST
    doc('e', { verified: false }),
    doc('f', { from: 'KOR', to: 'KOR-KPQC', relation: 'parallel-interoperable' }),
  ];
  const byKey = Object.fromEntries(aggregateLinks(lines, centre, national).map((l) => [l.key, l]));

  it('counts documents, not edges', () => {
    expect(byKey['FRA|references'].docs).toBe(2); // a (two standards) and b
  });
  it('dashes a line only while every document behind it names a pre-standard name', () => {
    expect(byKey['FRA|references'].pre).toBe(false);
    expect(byKey['FRA|adopts'].pre).toBe(true);
  });
  it('gives a lead its own dotted line, never added to a verified one', () => {
    expect(byKey['FRA|lead']).toMatchObject({ kind: 'lead', lead: true, docs: 1 });
  });
  it('draws no line from NIST for a standard NIST does not publish', () => {
    expect(linkOf(lines[4], centre, national)).toBeNull();
    expect(Object.keys(byKey).some((k) => k.includes('ETSI'))).toBe(false);
  });
  it('runs a national process to its own standard', () => {
    expect(byKey['KOR|own:KOR-KPQC']).toMatchObject({ kind: 'own', to: 'KOR-KPQC', path: 'KOR|own:KOR-KPQC' });
  });
  it('weighs one document at 1px and grows with the count', () => {
    expect(linkWidth(1)).toBe(1);
    expect(linkWidth(4)).toBeGreaterThan(linkWidth(2));
  });
  it('lights a jurisdiction from verified documents naming the chosen standard only', () => {
    expect([...litSet(lines, 'all', ['FIPS-203', 'FIPS-204'])].sort()).toEqual(['FRA']);
    expect(litSet([doc('x', { verified: false })], 'all', ['FIPS-203']).size).toBe(0);
    expect(litSet(lines, 'NIST-IR-8547', ['FIPS-203']).size).toBe(0);
  });
  it('never counts a lead', () => {
    expect(counter([{ from: 'FRA', to: 'FIPS-203', relation: 'adopts', date: '2024-01', verified: false }], '2026-09', 'all', ['FIPS-203'])).toEqual({ n: 0, m: 0, k: 0, kn: 0 });
  });
  it('bends a great circle apart but keeps its ends', () => {
    const a: [number, number] = [-77.22, 39.14];
    const b: [number, number] = [139.69, 35.69];
    const line = bentArc(a, b, 0.12);
    expect(line.coordinates[0]).toEqual(a);
    expect(line.coordinates[line.coordinates.length - 1][0]).toBeCloseTo(b[0], 1);
    expect(line.coordinates[line.coordinates.length - 1][1]).toBeCloseTo(b[1], 1);
  });
});

describe('the orbit labels and leads', () => {
  it('never places a jurisdiction by a lead', () => {
    const o = computeOrbit({
      jurisdictions,
      edges: [...edges, { id: 'gbr-lead', from: 'GBR', to: 'FIPS-203', relation: 'adopts', date: '2020-01', preStandardOnly: false, verified: false }],
      nistStandards: [{ id: 'FIPS-203', label: 'FIPS 203' }],
      nationalStandards: [],
      endYear: 2026,
    });
    const gbr = o.nodes.find((n) => n.iso3 === 'GBR')!;
    expect(gbr.firstNistEdge).toBe('2025-03-20');
    expect(o.links['GBR|lead']).toBeTruthy();
  });
  it('keeps a national standard clear of every node and inside the view', () => {
    const o = layout();
    for (const m of o.national) {
      for (const n of o.nodes) expect(Math.hypot(m.x - n.x, m.y - n.y)).toBeGreaterThan(n.size + 5);
      expect(m.x).toBeGreaterThan(VIEW.x);
      expect(m.x).toBeLessThan(VIEW.x + VIEW.w);
    }
  });
  it('puts the year labels inside the rings and the "none recorded" name above the ring', () => {
    const o = layout();
    expect(o.rings.filter((r) => r.label).every((r) => Math.hypot(r.label!.x - 500, r.label!.y - 0.35 * WORD - 500) <= OUTSIDE)).toBe(true);
    expect(o.noNist.y).toBeLessThan(500 - OUTSIDE);
    expect(o.noNist.y).toBeGreaterThan(VIEW.y);
  });
});

describe('the real Cascade lines', () => {
  const d = loadCascade();
  const centre = new Set(d.standards.filter((s) => s.centre).map((s) => s.id));
  const national = new Set(d.standards.filter((s) => s.national).map((s) => s.id));
  const lines = aggregateLinks(d.edges, centre, national);
  it('draws at most one line per jurisdiction and kind, each with a path on the orbit', () => {
    expect(new Set(lines.map((l) => l.key)).size).toBe(lines.length);
    expect(lines.length).toBeLessThan(d.edges.length);
    for (const l of lines) expect(d.orbit.links[l.path]).toBeTruthy();
  });
  it('sends the tooltips a short posture label for every jurisdiction with a posture', () => {
    for (const i of Object.values(d.info)) if (i.postureKey) expect(i.postureShort).toBeTruthy();
  });
  it('carries every provenance passage, and no locator relative to another', () => {
    for (const e of d.edges) {
      expect(e.passages.length).toBeGreaterThan(0);
      for (const p of e.passages) expect(p.locator).not.toMatch(/^Same\b/i);
    }
  });
  it('ends the slider at the month the data was last verified', () => {
    expect(d.endMonth).toBe(d.asOf!.slice(0, 7));
  });
  // the KpqC, NGCC and Kodieum tags and the names of the fork view, at the wide size and at the
  // phone size where every word is drawn twice as large: clear of one another, of every country's
  // marker and of the year labels shown at that size, and inside the view
  for (const size of [1, PHONE]) {
    it(`places the national standards and the names in the fork view clear of everything at ${size === 1 ? 'the wide' : 'the phone'} size`, () => {
      const o = d.orbit;
      const at = (m: (typeof o.national)[number]) => (size === 1 ? { x: m.x, y: m.y } : m.phoneAt);
      const items: { id: string; box: ReturnType<typeof squareBox> }[] = [];
      const fork = o.nodes.filter((n) => n.role === 'sovereign-developer' || o.national.some((m) => m.iso3 === n.iso3));
      for (const n of fork) items.push({ id: `name:${n.iso3}`, box: nameBox(size === 1 ? n.label : n.labelPhone, d.info[n.iso3]?.name ?? n.name, size) });
      for (const m of o.national) {
        items.push({ id: `square:${m.id}`, box: squareBox(at(m)) });
        items.push({ id: `label:${m.id}`, box: size === 1 ? textBox(m.lx, m.ly, m.label, m.anchor) : textBox(m.phone.x, m.phone.y, m.label, m.phone.anchor, PHONE) });
      }
      for (const r of o.rings) if (r.label && (size === 1 ? r.label.wide : r.label.phone)) items.push({ id: `year:${r.year}`, box: textBox(r.label.x, r.label.y, String(r.year), 'middle', size) });
      for (const a of items) {
        expect(inView(a.box), a.id).toBe(true);
        for (const b of items) if (a.id < b.id) expect(boxesMeet(a.box, b.box), `${a.id} meets ${b.id}`).toBe(false);
        for (const n of o.nodes) {
          if (a.id === `name:${n.iso3}`) continue;
          const r = n.role === 'sovereign-developer' ? n.size + 10 : n.size + 2;
          const dx = Math.max(a.box.x0 - n.x, 0, n.x - a.box.x1);
          const dy = Math.max(a.box.y0 - n.y, 0, n.y - a.box.y1);
          expect(dx * dx + dy * dy >= r * r, `${a.id} covers ${n.iso3}`).toBe(true);
        }
      }
    });
  }
  it('names every other year at the wide size and every fourth at the phone size, the last year always', () => {
    const o = d.orbit;
    const wide = o.rings.filter((r) => r.label?.wide).map((r) => r.year);
    const phone = o.rings.filter((r) => r.label?.phone).map((r) => r.year);
    const last = o.rings[o.rings.length - 1].year;
    expect(wide).toContain(last);
    expect(phone).toContain(last);
    for (const [a, b] of wide.slice(1).map((y, i) => [wide[i], y])) expect(b - a).toBeGreaterThanOrEqual(2);
    for (const [a, b] of phone.slice(1).map((y, i) => [phone[i], y])) expect(b - a).toBeGreaterThanOrEqual(4);
  });
  it('ties each national standard to its own country, and draws its line to the square at each size', () => {
    for (const m of d.orbit.national) expect(d.orbit.nodes.some((n) => n.iso3 === m.iso3)).toBe(true);
    for (const [path, dPhone] of Object.entries(d.orbit.phoneLinks)) {
      const m = d.orbit.national.find((x) => path.endsWith(`own:${x.id}`))!;
      expect(dPhone.endsWith(`${m.phoneAt.x},${m.phoneAt.y}`)).toBe(true);
      expect(d.orbit.links[path].endsWith(`${m.x},${m.y}`)).toBe(true);
    }
  });
  it('names each national standard on the orbit in Latin script, from its own record', () => {
    const short = Object.fromEntries(d.standards.filter((s) => s.national).map((s) => [s.id, s.short]));
    expect(short).toEqual({ 'KOR-KPQC': 'KpqC', 'CHN-NGCC': 'NGCC', 'RUS-GOST-PQ': 'Kodieum' });
    expect(nationalShort({ label: 'Plain label', synonyms: [{ text: 'Кодиеум' }] })).toBe('Plain label');
  });
});

// ---- leads in the data, a production build with the Cascade forced public ------------------------

describe('a production build with the Cascade forced public and leads in the data', () => {
  const root = projectRoot();
  let fixture = '';
  beforeAll(() => {
    // the repository as it is, with every candidate the search found added to the edges as a lead
    fixture = mkdtempSync(join(tmpdir(), 'qsc-cascade-'));
    for (const entry of readdirSync(root)) if (entry !== 'data' && entry !== 'node_modules' && !entry.startsWith('.')) symlinkSync(join(root, entry), join(fixture, entry));
    mkdirSync(join(fixture, 'data/lab/cascade'), { recursive: true });
    for (const entry of readdirSync(join(root, 'data'))) if (entry !== 'lab') symlinkSync(join(root, 'data', entry), join(fixture, 'data', entry));
    for (const entry of readdirSync(join(root, 'data/lab'))) if (entry !== 'cascade') symlinkSync(join(root, 'data/lab', entry), join(fixture, 'data/lab', entry));
    for (const entry of readdirSync(join(root, 'data/lab/cascade'))) if (entry !== 'edges.json') symlinkSync(join(root, 'data/lab/cascade', entry), join(fixture, 'data/lab/cascade', entry));
    const file = JSON.parse(readFileSync(join(root, 'data/lab/cascade/edges.json'), 'utf8'));
    const candidates = JSON.parse(readFileSync(join(root, 'data/lab/cascade/candidates.json'), 'utf8')).candidates as { docUrl: string; docTitle: string; issuingOrg: string | null; iso3: string; year: number | null; standardId: string }[];
    file.edges.push(
      ...candidates.map((c, i) => ({
        id: `candidate-${i}`,
        from: c.iso3,
        to: c.standardId,
        relation: 'adopts',
        preStandardOnly: false,
        date: String(c.year ?? 2026),
        precision: 'year',
        documentTitle: c.docTitle,
        documentUrl: c.docUrl,
        issuingOrg: c.issuingOrg ?? 'unknown',
        verify: true,
        verifiedAt: null,
        provenance: [],
      })),
    );
    writeFileSync(join(fixture, 'data/lab/cascade/edges.json'), JSON.stringify(file));
  });
  afterAll(() => rmSync(fixture, { recursive: true, force: true }));

  it('draws the leads, dotted, in a preview build only', () => {
    const d = loadCascade({ root: fixture, env: { ATLAS_OFFLINE: '1' } }, new Date('2026-10-01T12:00:00Z'), 'https://example.org');
    expect(d.edges.some((e) => !e.verified)).toBe(true);
    expect(Object.keys(d.orbit.links).some((k) => k.endsWith('|lead'))).toBe(true);
  });
  it('renders no candidate and no lead edge in production', () => {
    const env = { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'cascade' };
    const d = loadCascade({ root: fixture, env }, new Date('2026-10-01T12:00:00Z'), 'https://example.org');
    const real = loadCascade({ root, env: { VERCEL_ENV: 'production' } }, new Date('2026-10-01T12:00:00Z'), 'https://example.org');
    expect(d.edges.every((e) => e.verified)).toBe(true);
    expect(d.edges.map((e) => e.id)).toEqual(real.edges.map((e) => e.id));
    expect(d.edges.some((e) => e.id.startsWith('candidate-'))).toBe(false);
    expect(Object.keys(d.orbit.links).some((k) => k.endsWith('|lead'))).toBe(false);
    const centre = new Set(d.standards.filter((s) => s.centre).map((s) => s.id));
    const national = new Set(d.standards.filter((s) => s.national).map((s) => s.id));
    expect(aggregateLinks(d.edges, centre, national).some((l) => l.lead)).toBe(false);
    // the orbit is laid out from verified records alone: the same places as without the leads
    expect(d.orbit.nodes.map((n) => [n.iso3, n.x, n.y])).toEqual(real.orbit.nodes.map((n) => [n.iso3, n.x, n.y]));
  });
});
