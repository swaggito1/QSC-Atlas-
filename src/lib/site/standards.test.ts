// The Standards section (spec 8): the overview of standards (/standards, the section's front page
// since 5 October 2026) and the page of each standard are computed from the standards records,
// list governments alphabetically, link every document, and never let a lead or a candidate
// count in a preview or production build; a build on Swann's machine shows the overview's leads,
// each marked. The overview (5 October 2026) and the page of each standard (8 October 2026) are
// built wherever the Cascade is: locally, in a preview and, since the Cascade went public on
// 8 October 2026, in production. The page of a standard opens the Cascade on its body.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cascadeBodyOptions, cascadeLinks, possessive, standardPageModel, standardsCopy, standardsOverviewModel, standardsWithPages } from './standards';
import { builtPages, standardsWithVerifiedEdges } from './routes';
import { atlasDocuments, cascadeFiles, standardsRecords } from './joins';
import { docId } from './docid';
import { projectRoot } from '../lab/load';
import { allPrivateRoot } from '../lab/registry-fixture';
import { loadCascade, loadCascadeBody } from '../lab/cascade-data';

const root = projectRoot();
// a build on Swann's machine (no VERCEL, no VERCEL_ENV), the only kind that has these pages
const preview = { root, env: { ATLAS_OFFLINE: '1' } };
// a preview deployment: verified records only
const deployed = { root, env: { VERCEL: '1', VERCEL_ENV: 'preview' } };
// a production deployment of the real registry, where the Cascade is public since 8 October 2026
const production = { root, env: { VERCEL: '1', VERCEL_ENV: 'production' } };
const copy = standardsCopy(preview);

describe('the standards that have a page', () => {
  it('are exactly those with at least one verified document naming them, as the routes compute them', () => {
    const ids = standardsWithPages(preview);
    expect(ids).toEqual(standardsWithVerifiedEdges(preview).map((s) => s.id));
    const pages = builtPages(preview).filter((p) => p.key === 'standard').map((p) => p.props?.standardId);
    expect([...pages].sort()).toEqual([...ids].sort());
  });
  it('are 43 today, and never the Chinese or the Russian national process', () => {
    const ids = standardsWithPages(preview);
    expect(ids).toHaveLength(43);
    // the same 43 in a local build, a preview and production (8 October 2026)
    for (const opts of [preview, deployed, production]) {
      const pages = builtPages(opts).filter((p) => p.key === 'standard').map((p) => p.props?.standardId as string);
      expect([...pages].sort(), JSON.stringify(opts.env)).toEqual([...ids].sort());
      expect(standardsWithPages(opts), JSON.stringify(opts.env)).toEqual(ids);
    }
    expect(ids).not.toContain('CHN-NGCC');
    expect(ids).not.toContain('RUS-GOST-PQ');
    expect(standardPageModel('CHN-NGCC', preview)).toBeNull();
    expect(standardPageModel('RUS-GOST-PQ', preview)).toBeNull();
  });
});

describe('the overview of standards', () => {
  const local = standardsOverviewModel(preview);
  const shown = standardsOverviewModel(deployed);
  const records = standardsRecords(preview);
  const ids = (m: ReturnType<typeof standardsOverviewModel>) => m.sections.flatMap((x) => x.rows.map((r) => r.id));
  const row = (m: ReturnType<typeof standardsOverviewModel>, id: string) => m.sections.flatMap((x) => x.rows).find((r) => r.id === id)!;

  it('groups the bodies in the order of the plan, the national processes last', () => {
    expect(local.sections.map((x) => x.id)).toEqual(['nist', 'ietf', 'etsi', 'iso-iec', 'itu-t', 'x9', 'cen-cenelec', 'national']);
    expect(local.sections.find((x) => x.id === 'ietf')!.heading).toBe(copy.overviewIetfHead);
    expect(local.sections.find((x) => x.id === 'ietf')!.bodies.map((b) => b.id)).toEqual(['ietf', 'irtf']);
    expect(local.sections.at(-1)!.heading).toBe(copy.nationalHead);
  });
  it('shows every record in a local build, each lead marked, in the order of the standards file', () => {
    expect(ids(local).sort()).toEqual(records.standards.map((s) => s.id).sort());
    for (const sec of local.sections) {
      const order = records.standards.map((s) => s.id);
      const mine = sec.rows.map((r) => r.id);
      expect(mine).toEqual([...mine].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
    for (const r of local.sections.flatMap((x) => x.rows)) expect(r.lead).toBe(records.standards.find((s) => s.id === r.id)!.verify);
    expect(local.leadsShown).toBe(true);
    expect(copy.leadMark).toBe('lead, not yet verified');
  });
  it('shows verified records only in a deployment, and leaves out a body with nothing to show', () => {
    expect(ids(shown).sort()).toEqual(records.standards.filter((s) => !s.verify).map((s) => s.id).sort());
    expect(shown.leadsShown).toBe(false);
    for (const sec of shown.sections) {
      expect(sec.rows.length).toBeGreaterThan(0);
      for (const r of sec.rows) {
        expect(r.lead).toBe(false);
        for (const d of r.docs) expect(d.lead).toBe(false);
      }
      for (const b of sec.bodies) expect(b.lead).toBe(false);
    }
  });
  it('names a standard\'s own page wherever the build has it: locally, in a preview and in production', () => {
    const inProduction = standardsOverviewModel(production);
    for (const [m, opts] of [[local, preview], [shown, deployed], [inProduction, production]] as const) {
      const built = new Set(builtPages(opts).map((p) => p.path));
      for (const r of m.sections.flatMap((x) => x.rows)) {
        const path = `/standards/${r.id.toLowerCase()}`;
        expect(r.href, `${r.id} in ${JSON.stringify(opts.env)}`).toBe(built.has(path) ? path : null);
      }
      expect(row(m, 'FIPS-203').href).toBe('/standards/fips-203');
      expect(row(m, 'RFC-10024').href).toBe('/standards/rfc-10024');
    }
    // an all-private production build has no standard page, so no row names one
    const stage0 = standardsOverviewModel({ root: allPrivateRoot(), env: production.env });
    for (const r of stage0.sections.flatMap((x) => x.rows)) expect(r.href, r.id).toBeNull();
  });
  it('says what kind of document each is, so a report never reads as a specification', () => {
    const kind = (m: typeof local, id: string) => row(m, id).facts[0].text;
    expect(kind(local, 'ETSI-TR-103-619')).toBe(copy.kindEtsiTr);
    expect(kind(shown, 'ETSI-TS-103-744')).toBe(copy.kindEtsiTs);
    expect(kind(shown, 'FIPS-203')).toBe(copy.kindFips);
    expect(kind(shown, 'FIPS-206')).toBe('Federal Information Processing Standard, not yet published');
    // the status words name the kind already, so it is not said twice
    expect(row(local, 'RFC-10024').facts.map((f) => f.text)).toEqual(['RFC, Proposed Standard', '']);
    expect(row(local, 'X9-146').facts[0].text).toBe('Standard, in development');
  });
  it('dates each status in the body\'s own record, else from a verified standards event', () => {
    expect(row(shown, 'FIPS-203').facts.at(-1)).toEqual({ text: '', mono: '13 August 2024' });
    expect(row(local, 'RFC-10024').facts.at(-1)).toEqual({ text: '', mono: 'August 2026' });
    expect(row(local, 'draft-ietf-tls-mlkem').facts.at(-1)).toEqual({ text: copy.statusRevision, mono: '16 September 2026' });
    // FIPS 206 has no status date of its own: the NIST selection of July 2022 gives it
    expect(row(shown, 'FIPS-206').facts.at(-1)).toEqual({ text: '', mono: 'July 2022' });
    // a version, where the record gives one, in mono beside the kind
    expect(row(shown, 'ETSI-TS-103-744').facts).toEqual([{ text: copy.kindEtsiTs }, { text: '', mono: 'V1.2.2' }, { text: 'Published' }, { text: '', mono: '5 February 2026' }]);
  });
  it('links what a standard builds on to that standard\'s row', () => {
    expect(row(local, 'RFC-10024').buildsOn).toEqual([
      { label: 'FIPS 203', href: '#std-fips-203' },
      { label: 'RFC 9954', href: '#std-rfc-9954' },
    ]);
    expect(local.sections.flatMap((x) => x.rows).some((r) => r.anchor === 'std-fips-203')).toBe(true);
  });
  it('lists the citing governments alphabetically, and never counts a standards body\'s own document', () => {
    for (const r of local.sections.flatMap((x) => x.rows)) {
      if (!r.cited.startsWith('Cited by ')) continue;
      const names = r.cited.slice('Cited by '.length).split(/, | and /);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    }
    // ETSI's own TR 104 239-2, filed under the EU, cites FIPS 203 and TS 103 744 for no government
    for (const id of ['FIPS-203', 'ETSI-TS-103-744']) for (const d of row(shown, id).docs) expect(d.issuer).not.toBe('ETSI');
    expect(row(shown, 'ETSI-TS-103-744').cited).toBe('Cited by European Union and Germany');
    expect(row(local, 'RFC-9954').cited).toBe('Cited by Estonia, European Union, France, Italy, Spain and United Kingdom');
  });
  it('gives each document its issuer, date and the identifier as it wrote it, where that differs', () => {
    const fra = row(local, 'RFC-10024').docs.find((d) => d.issuer === 'ANSSI')!;
    expect(fra.writtenAs).toBe('draft-ietf-tls-ecdhe-mlkem-01');
    expect(fra.lead).toBe(false);
    expect(fra.passages[0].excerpt).toContain('draft-ietf-tls-ecdhe-mlkem-01');
    const gbr = row(local, 'RFC-9370').docs.find((d) => d.country === 'United Kingdom')!;
    expect(gbr.writtenAs).toBeNull();
    // the date as the document prints it
    expect(row(local, 'RFC-9881').docs[0].dateText).toBe('12 May 2026');
  });
  it('runs a national process under its own government, with its own documents', () => {
    expect(row(shown, 'KOR-KPQC').cited).toBe(`South Korea ${copy.runsOwn}`);
    expect(row(shown, 'KOR-KPQC').docs.length).toBe(2);
    expect(row(shown, 'CHN-NGCC').docs).toEqual([]);
  });
  it('carries the note that the lists are not comparable across bodies, and no count of governments', () => {
    expect(shown.note).toBe(copy.overviewNote);
    for (const r of local.sections.flatMap((x) => x.rows)) for (const v of Object.values(r)) expect(typeof v).not.toBe('number');
  });
});

describe('the Cascade reads its own records only', () => {
  // the overview's records (cascade: false) never reach the Cascade, the profiles' standards rows
  // or the documents' notes, even where an edge names one of the Cascade's standards
  const records = standardsRecords(preview);
  const overviewOnly = new Set([...records.standards.filter((s) => !s.cascade).map((s) => s.id), ...records.edges.filter((e) => !e.cascade).map((e) => e.id)]);
  it('in every build, leads included', () => {
    expect(overviewOnly.size).toBeGreaterThan(0);
    for (const env of [{ ATLAS_OFFLINE: '1' }, { VERCEL: '1', VERCEL_ENV: 'preview' }, { VERCEL: '1', VERCEL_ENV: 'production' }]) {
      const d = loadCascade({ root, env }, new Date('2026-10-05T12:00:00Z'), 'https://example.org');
      for (const id of [...d.standards.map((s) => s.id), ...d.edges.map((e) => e.id)]) expect(overviewOnly.has(id), id).toBe(false);
      const f = cascadeFiles({ root, env });
      for (const id of [...f.standards.map((s) => s.id), ...f.edges.map((e) => e.id)]) expect(overviewOnly.has(id), id).toBe(false);
    }
    // three overview leads name ETSI TS 103 744, a standard of the Cascade's own
    expect(records.edges.filter((e) => !e.cascade && e.to === 'ETSI-TS-103-744').length).toBe(3);
    // the Cascade is read from cold in three builds here, which a full parallel run can slow past the default 5 s
  }, 30_000);
});

describe('the page of a standard', () => {
  const docs = new Map(atlasDocuments(preview).map((d) => [d.id, d]));
  const phrases = [copy.relPhraseAdopts, copy.relPhraseReferences, copy.relPhraseProfiles, copy.relPhraseParallel, copy.relPhraseFork];

  for (const id of standardsWithPages(preview)) {
    const p = standardPageModel(id, preview)!;
    it(`${id}: lists governments alphabetically, with the copy's relation phrases and working links`, () => {
      expect(p.namers.length).toBeGreaterThan(0);
      const names = p.namers.map((n) => n.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
      for (const n of p.namers) {
        expect(n.profileHref).toBe(`/countries/${n.iso3.toLowerCase()}`);
        expect(n.documentsHref).toBe(`/documents?country=${n.iso3}`);
        for (const g of n.groups) {
          // every phrase is one of the copy's, filled with the standard's name
          expect(phrases.some((t) => g.phrase.startsWith(t.replace('{standard}', p.short)))).toBe(true);
          for (const d of g.docs) {
            expect(d.href).toBe(`/documents?country=${n.iso3}#doc-${docId(d.url)}`);
            // the anchor names a document the documents page lists, under that country
            expect(docs.get(docId(d.url))?.country).toBe(n.iso3);
          }
        }
      }
    });
  }

  it('gives no count per government, so the list never reads as a tally', () => {
    const p = standardPageModel('FIPS-203', preview)!;
    for (const n of p.namers) for (const v of Object.values(n)) expect(typeof v).not.toBe('number');
  });
  it('says which earlier name a document used when it names the standard only by that name', () => {
    const p = standardPageModel('FIPS-203', preview)!;
    const deu = p.namers.find((n) => n.iso3 === 'DEU')!;
    expect(deu.groups.some((g) => g.phrase === 'names FIPS 203 under its earlier name, CRYSTALS-Kyber')).toBe(true);
  });
  it('opens the Cascade on the standard in its body\'s view, or on the government running its own process', () => {
    for (const opts of [preview, deployed, production]) {
      expect(standardPageModel('FIPS-203', opts)!.cascade.href).toBe('/standards/cascade?std=FIPS-203');
      expect(standardPageModel('KOR-KPQC', opts)!.cascade.href).toBe('/standards/cascade?sel=KOR&fork=1');
      // another body the Cascade offers (8 October 2026): its view, with the standard chosen
      expect(standardPageModel('RFC-10024', opts)!.cascade.href).toBe('/standards/cascade?body=ietf&std=RFC-10024');
      expect(standardPageModel('ETSI-TS-103-744', opts)!.cascade.href).toBe('/standards/cascade?body=etsi&std=ETSI-TS-103-744');
    }
    // no build without the Cascade links it
    expect(standardPageModel('RFC-10024', { root: allPrivateRoot(), env: production.env })!.cascade.href).toBeNull();
  });
  it('links each standard to the view of its body the Cascade offers, and offers no way in for any other body', () => {
    const offered = cascadeBodyOptions(preview);
    expect(offered.map((o) => o.id)).toEqual(expect.arrayContaining(['nist', 'ietf']));
    // each view is read once: the island receives every view the same way, whatever page links it
    const views = new Map<string, ReturnType<typeof loadCascadeBody>>();
    const viewOf = (body: string) => {
      if (!views.has(body)) views.set(body, loadCascadeBody(body, preview, new Date('2026-10-08T12:00:00Z'), 'https://example.org'));
      return views.get(body)!;
    };
    let others = 0;
    for (const id of standardsWithPages(preview)) {
      const s = standardsRecords(preview).standards.find((x) => x.id === id)!;
      if (s.national) continue;
      const option = offered.find((o) => o.bodyIds.includes(s.bodyId));
      const href = standardPageModel(id, preview)!.cascade.href;
      if (!option) {
        expect(href, id).toBeNull();
        others++;
        continue;
      }
      expect(href, id).toBe(option.id === 'nist' ? `/standards/cascade?std=${id}` : `/standards/cascade?body=${option.id}&std=${id}`);
      // the island opens on that view with the standard chosen: it is one of the view's own standards
      expect(viewOf(option.id)?.standards.find((x) => x.id === id), id).toMatchObject({ centre: true });
    }
    // ITU-T, ANSI X9 and CEN-CENELEC are not offered today, so some pages have no way in
    expect(others).toBeGreaterThan(0);
  });
  it('sets the status date beside the verb it dates, and gives a national process no start date', () => {
    expect(standardPageModel('FIPS-203', preview)!.facts).toEqual(['NIST', 'final since August 2024']);
    expect(standardPageModel('FIPS-206', preview)!.facts).toEqual(['NIST', 'selected July 2022, not yet published']);
    for (const id of standardsWithPages(preview)) {
      const p = standardPageModel(id, preview)!;
      if (!p.national) continue;
      // the earliest record the Atlas holds is not when the process began
      for (const f of p.facts) expect(f).not.toMatch(/\bsince\b/);
      expect(p.facts).toContain(copy.statusNational);
    }
    expect(standardPageModel('KOR-KPQC', preview)!.facts.some((f) => f.startsWith('first record '))).toBe(true);
  });
  it('lists only standards events, never a coordination event such as a migration timeline', () => {
    const { spine } = cascadeFiles(preview);
    const coordination = new Set(spine.filter((e) => e.kind === 'coordination').map((e) => e.id));
    expect(coordination.size).toBeGreaterThan(0);
    for (const id of standardsWithPages(preview)) {
      const p = standardPageModel(id, preview)!;
      for (const e of p.events) expect(coordination.has(e.id)).toBe(false);
      for (const src of p.sources) for (const e of spine.filter((x) => coordination.has(x.id))) expect(src.url).not.toBe(e.provenance[0]?.url);
    }
  });
});

describe('the links the Cascade island receives', () => {
  it('are built here, so the island holds no route of its own', () => {
    const l = cascadeLinks([{ iso3: 'NLD', name: 'Netherlands' }, { iso3: 'FRA', name: 'France' }], ['https://example.org/not-in-the-atlas'], preview);
    expect(l.countries.NLD).toMatchObject({ profile: '/countries/nld', documents: '/documents?country=NLD', profileLabel: 'Open the Netherlands profile', documentsLabel: 'The Netherlands’ documents' });
    expect(l.countries.FRA.documentsLabel).toBe('France’s documents');
    expect(l.records).toEqual({});
  });
  it('write a place in the possessive as British usage does', () => {
    expect(possessive('United States')).toBe('The United States’');
    expect(possessive('European Union')).toBe('The European Union’s');
    expect(possessive('Japan')).toBe('Japan’s');
  });
});

// ---- a production build with the Cascade forced public, and leads in the data ---------------------

describe('a production build with the Cascade forced public', () => {
  let fixture = '';
  beforeAll(() => {
    fixture = mkdtempSync(join(tmpdir(), 'qsc-standards-'));
    // the repository as it is, except for an edges file that also holds leads: every candidate
    // the search found, and a lead for a national process that has no verified document
    for (const entry of readdirSync(root)) {
      if (entry === 'data' || entry === 'node_modules' || entry.startsWith('.')) continue;
      symlinkSync(join(root, entry), join(fixture, entry));
    }
    mkdirSync(join(fixture, 'data', 'lab', 'cascade'), { recursive: true });
    for (const entry of readdirSync(join(root, 'data'))) if (entry !== 'lab') symlinkSync(join(root, 'data', entry), join(fixture, 'data', entry));
    for (const entry of readdirSync(join(root, 'data', 'lab'))) if (entry !== 'cascade') symlinkSync(join(root, 'data', 'lab', entry), join(fixture, 'data', 'lab', entry));
    for (const entry of readdirSync(join(root, 'data', 'lab', 'cascade'))) {
      if (entry !== 'edges.json') symlinkSync(join(root, 'data', 'lab', 'cascade', entry), join(fixture, 'data', 'lab', 'cascade', entry));
    }
    const edges = JSON.parse(readFileSync(join(root, 'data/lab/cascade/edges.json'), 'utf8'));
    const candidates = JSON.parse(readFileSync(join(root, 'data/lab/cascade/candidates.json'), 'utf8')).candidates as { docUrl: string; docTitle: string; issuingOrg: string | null; iso3: string; year: number | null; standardId: string }[];
    const lead = (i: number, over: Record<string, unknown>) => ({
      id: `lead-${i}`,
      relation: 'adopts',
      preStandardOnly: false,
      date: '2020',
      precision: 'year',
      documentTitle: 'A lead',
      documentUrl: `https://example.org/lead-${i}`,
      issuingOrg: 'Somebody',
      verify: true,
      verifiedAt: null,
      provenance: [],
      ...over,
    });
    edges.edges.push(
      ...candidates.map((c, i) => lead(i, { from: c.iso3, to: c.standardId, relation: 'references', date: String(c.year ?? 2026), documentTitle: c.docTitle, documentUrl: c.docUrl, issuingOrg: c.issuingOrg ?? 'unknown' })),
      lead(9001, { from: 'CHN', to: 'CHN-NGCC', relation: 'fork' }),
      lead(9002, { from: 'ITA', to: 'FIPS-203' }),
    );
    writeFileSync(join(fixture, 'data/lab/cascade/edges.json'), JSON.stringify(edges));
  });
  afterAll(() => rmSync(fixture, { recursive: true, force: true }));

  const prod = () => ({ root: fixture, env: { VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: 'cascade' } });

  it('builds the overview, the Cascade and the page of each standard with a verified document, never one for a lead', () => {
    for (const opts of [prod(), { root: fixture, env: { VERCEL: '1', VERCEL_ENV: 'preview' } }]) {
      const paths = builtPages(opts).map((p) => p.path);
      const standards = paths.filter((p) => p.startsWith('/standards/') && p !== '/standards/cascade');
      expect(paths).toEqual(expect.arrayContaining(['/standards', '/standards/cascade']));
      expect(standards.sort(), JSON.stringify(opts.env)).toEqual(standardsWithPages(deployed).map((id) => `/standards/${id.toLowerCase()}`).sort());
      expect(standards).toHaveLength(43);
      expect(paths).not.toContain('/standards/chn-ngcc');
    }
  });
  it('builds them locally, still only for the standards with a verified document', () => {
    const paths = builtPages({ root: fixture, env: { ATLAS_OFFLINE: '1' } }).map((p) => p.path);
    expect(paths).toContain('/standards');
    expect(paths).toContain('/standards/cascade');
    expect(paths.filter((p) => p.startsWith('/standards/') && p !== '/standards/cascade')).toHaveLength(43);
    expect(paths).not.toContain('/standards/chn-ngcc');
  });
  it('counts no lead and no candidate on the overview or on any page', () => {
    const real = standardsOverviewModel(deployed);
    const m = standardsOverviewModel(prod());
    const rows = (x: typeof m) => x.sections.flatMap((sec) => sec.rows.map((r) => [r.id, r.cited, r.docs.map((d) => d.url)]));
    expect(rows(m)).toEqual(rows(real));
    for (const r of m.sections.flatMap((sec) => sec.rows)) for (const d of r.docs) expect(d.url).not.toMatch(/example\.org\/lead-/);
    const p = standardPageModel('FIPS-203', prod())!;
    expect(p.namers.map((n) => n.iso3)).not.toContain('ITA');
    for (const n of p.namers) for (const g of n.groups) for (const d of g.docs) expect(d.url).not.toMatch(/example\.org\/lead-/);
  });
});
