// The Documents index and its two downloads (spec 9).
//
// The downloads are checked against the included documents as the offline build reads them
// (data/results through the JSON mirror's own mapping), read once here so a routine writing to
// data/results during the run cannot make the two sides differ. No count is fixed in this file:
// the scraper routine adds documents, and the rules must hold for whatever the copy holds.

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../lab/load';
import { documentEntry, readProfileEntries } from '../../loaders/json-mirror';
import { docId } from './docid';
import { loadIssuerAliases } from './joins';
import {
  CSV_COLUMNS,
  FIELDS,
  NO_FILTERS,
  PAGE_SIZE,
  YEAR_NONE,
  aliasTargets,
  choiceChange,
  choiceCount,
  csvCell,
  documentRows,
  documentsCensus,
  documentsCsv,
  documentsJson,
  documentsPage,
  filterOptions,
  filterQuery,
  filterRows,
  fold,
  fromHistory,
  hashTarget,
  hasFilters,
  historyStep,
  issuerTable,
  linkNote,
  matchesOrg,
  moreLabel,
  orgFits,
  parseCsv,
  placeNames,
  readFilters,
  rowHtml,
  safeHref,
  searchChange,
  statusText,
} from './documents';
import type { DocFilters, DocumentInput, DocumentRow, ViewState } from './documents';

const root = projectRoot();

// ---- the included documents, read once ------------------------------------------------------

type Raw = Record<string, unknown>;
const rawRows: Raw[] = readdirSync(join(root, 'data', 'results'))
  .filter((f) => f.endsWith('.json'))
  .sort()
  .flatMap((f) => {
    const rows = JSON.parse(readFileSync(join(root, 'data', 'results', f), 'utf8'));
    return Array.isArray(rows) ? (rows as Raw[]) : [];
  });

// what the offline loader would put in the documents collection: included rows, first of each id
const included: DocumentInput[] = (() => {
  const seen = new Set<string>();
  const out: DocumentInput[] = [];
  for (const raw of rawRows) {
    const entry = documentEntry(raw);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry as unknown as DocumentInput);
  }
  return out;
})();

const countries = JSON.parse(readFileSync(join(root, 'data', 'countries.json'), 'utf8')) as { iso3: string; name: string }[];
const names = placeNames(readProfileEntries(root) as unknown as { iso3: string; country: string }[], countries);
const rows = documentRows(included, names);
const table = issuerTable(loadIssuerAliases().aliases);
const AS_OF = '2026-10-01';

// the two dashes the house style keeps out, built from their code points so this file holds neither
const DASHES = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
const clean = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const filters = (f: Partial<DocFilters>): DocFilters => ({ ...NO_FILTERS, ...f });

describe('the downloads', () => {
  const json = JSON.parse(documentsJson(rows, { asOf: AS_OF, source: 'https://qsc-atlas.vercel.app/documents' }));
  const csv = parseCsv(documentsCsv(rows, AS_OF));
  const [header, ...lines] = csv;

  it('hold exactly the included documents, one row each', () => {
    // counted straight from the files, not through the page's own functions
    const ids = new Set(rawRows.filter((r) => r.included === true && clean(r.title) && clean(r.url)).map((r) => docId(String(r.url))));
    expect(included.length).toBeGreaterThan(0);
    expect(ids.size).toBe(included.length);
    expect(json.count).toBe(ids.size);
    expect(json.documents).toHaveLength(ids.size);
    expect(lines).toHaveLength(ids.size);
    expect(new Set(json.documents.map((d: DocumentRow) => d.id))).toEqual(ids);
    expect(new Set(lines.map((l) => l[0]))).toEqual(ids);
  });

  it('never include a document that is not included', () => {
    const excluded = new Set(rawRows.filter((r) => r.included !== true && clean(r.url)).map((r) => docId(String(r.url))));
    const includedIds = new Set(included.map((d) => docId(d.url!)));
    for (const d of json.documents as DocumentRow[]) {
      if (excluded.has(d.id)) expect(includedIds.has(d.id), d.id).toBe(true); // the same URL included elsewhere
    }
  });

  it('carry each document as the records hold it', () => {
    const byId = new Map((json.documents as DocumentRow[]).map((d) => [d.id, d]));
    for (const d of included) {
      const row = byId.get(docId(d.url!))!;
      expect(row, d.url!).toBeDefined();
      expect(row.title).toBe(clean(d.title));
      expect(row.country).toBe(clean(d.country)?.toUpperCase() ?? null);
      expect(row.issuingOrg).toBe(clean(d.issuingOrg));
      expect(row.year).toBe(d.year);
      expect(row.docType).toBe(clean(d.docType));
      expect(row.tier).toBe(clean(d.tier));
      expect(row.url).toBe(clean(d.url));
      expect(row.summary).toBe(clean(d.summary));
      expect(row.place).toBe(names.get(row.country!) ?? row.country);
    }
  });

  it('agree with each other, row for row and field for field, in the same order', () => {
    expect(header).toEqual([...CSV_COLUMNS]);
    expect(json.fields).toEqual([...FIELDS]);
    lines.forEach((line, i) => {
      const row = json.documents[i] as DocumentRow;
      FIELDS.forEach((f, j) => expect(line[j], `${row.id} ${f}`).toBe(row[f] === null ? '' : String(row[f])));
    });
  });

  it('both carry the as-of date: once in the JSON, on every line of the CSV', () => {
    expect(json.asOf).toBe(AS_OF);
    expect(json.asOfMeaning).toMatch(/built/);
    const at = CSV_COLUMNS.indexOf('asOf');
    for (const line of lines) expect(line[at]).toBe(AS_OF);
  });

  it('give the link pattern for a row and the meaning of each tier', () => {
    expect(json.rowLink).toBe('https://qsc-atlas.vercel.app/documents#doc-{id}');
    expect(Object.keys(json.tiers)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('write a CSV that spreadsheet programs read: BOM, CRLF, quoted cells', () => {
    const text = documentsCsv(rows.slice(0, 2), AS_OF);
    expect(text.startsWith('\uFEFFid,title,')).toBe(true);
    expect(text.endsWith('\r\n')).toBe(true);
    expect(csvCell('a, "b"\nc')).toBe('"a, ""b""\nc"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(2026)).toBe('2026');
    const tricky: DocumentRow = { ...rows[0], title: 'A "quoted", title', summary: 'Line one\r\nline two, with a comma' };
    const back = parseCsv(documentsCsv([tricky], AS_OF));
    expect(back[1][1]).toBe('A "quoted", title');
    expect(back[1][9]).toBe('Line one\r\nline two, with a comma');
  });

  it('contain no em or en dash outside the documents’ own words', () => {
    const body = documentsJson([], { asOf: AS_OF, source: 'https://example.org/documents' });
    expect(body).not.toMatch(DASHES);
  });
});

describe('the rows', () => {
  it('have unique ids, the #doc- anchors', () => {
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const r of rows) expect(r.id).toMatch(/^d[0-9a-f]{10}$/);
  });

  it('run by place, then newest first with no year last, never by any count', () => {
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1];
      const b = rows[i];
      const byPlace = (a.place ?? '').localeCompare(b.place ?? '', 'en', { sensitivity: 'base' });
      expect(byPlace, `${a.place} before ${b.place}`).toBeLessThanOrEqual(0);
      if (byPlace === 0 && a.year !== null) expect(b.year === null || b.year <= a.year).toBe(true);
      if (byPlace === 0 && a.year === null) expect(b.year).toBeNull();
    }
  });

  it('keep the first of two documents at the same address', () => {
    const doc: DocumentInput = { title: 'A', country: 'deu', issuingOrg: 'BSI', year: 2025, docType: 'Guidance', tier: 'T1', url: 'https://example.org/a/', summary: null };
    const twice = documentRows([doc, { ...doc, title: 'B', url: 'https://EXAMPLE.org/a#top' }], new Map([['DEU', 'Germany']]));
    expect(twice).toHaveLength(1);
    expect(twice[0]).toMatchObject({ title: 'A', country: 'DEU', place: 'Germany' });
  });

  it('count records, places and tier 3 or 4 for the lede, and nothing per place', () => {
    const c = documentsCensus(rows);
    expect(Object.keys(c).sort()).toEqual(['lowerTier', 'places', 'records']);
    expect(c.records).toBe(rows.length);
    expect(c.places).toBe(new Set(rows.map((r) => r.country)).size);
    expect(c.lowerTier).toBe(rows.filter((r) => r.tier === 'T3' || r.tier === 'T4').length);
  });
});

describe('the filters in the URL', () => {
  it('read and write ?country= ?org= ?type= ?tier= ?year= ?q=', () => {
    const f = readFilters('?country=deu&type=Guidance&utm=x');
    expect(f).toEqual(filters({ country: 'DEU', type: 'Guidance' }));
    expect(filterQuery(f)).toBe('?country=DEU&type=Guidance');
    expect(readFilters(filterQuery(f))).toEqual(f);
    expect(filterQuery(NO_FILTERS)).toBe('');
    expect(readFilters('?q=%20ml-kem%20%20hybrid ').q).toBe('ml-kem hybrid');
    expect(readFilters('?year=None').year).toBe(YEAR_NONE);
    // the order is fixed, whatever order the link wrote
    expect(filterQuery(readFilters('?q=a&year=2025&tier=T1&type=Guidance&org=BSI&country=DEU'))).toBe(
      '?country=DEU&org=BSI&type=Guidance&tier=T1&year=2025&q=a',
    );
    expect(hasFilters(NO_FILTERS)).toBe(false);
    expect(choiceCount(filters({ country: 'DEU', q: 'x' }))).toBe(1);
  });

  it('?country=DEU&type=Guidance gives Germany’s guidance and nothing else', () => {
    const got = filterRows(rows, readFilters('?country=DEU&type=Guidance'), table);
    const want = rows.filter((r) => r.country === 'DEU' && r.docType === 'Guidance');
    expect(got.map((r) => r.id)).toEqual(want.map((r) => r.id));
    // the type matches without regard to case, as a hand-typed link may spell it
    expect(filterRows(rows, readFilters('?country=deu&type=guidance'), table)).toEqual(got);
  });

  it('?org=NCSC returns the NCSC’s documents', () => {
    // every document recorded under that name, in whichever country the records place it: the
    // routine may record another country's centre as "NCSC" too, so no country is assumed here
    const got = filterRows(rows, readFilters('?org=NCSC'), table);
    const want = rows.filter((r) => fold(r.issuingOrg ?? '') === 'ncsc');
    expect(got.map((r) => r.id)).toEqual(want.map((r) => r.id));
    expect(got.some((r) => r.country === 'GBR')).toBe(true);
    expect(filterRows(rows, readFilters('?org=ncsc'), table)).toEqual(got);
    // with a country, only that country's NCSC
    const uk = filterRows(rows, readFilters('?country=GBR&org=NCSC'), table);
    expect(uk.length).toBeGreaterThan(0);
    expect(uk.every((r) => r.country === 'GBR')).toBe(true);
    expect(uk.map((r) => r.id)).toEqual(got.filter((r) => r.country === 'GBR').map((r) => r.id));
  });

  it('?org= goes through the alias table', () => {
    const got = filterRows(rows, readFilters('?org=National%20Cyber%20Security%20Centre'), table);
    const orgs = new Set(got.map((r) => `${r.issuingOrg} ${r.country}`));
    expect(orgs).toEqual(new Set(['NCSC GBR', 'NCSC-NL NLD'].filter((o) => rows.some((r) => `${r.issuingOrg} ${r.country}` === o))));
    // an alias reaches an organisation only in the country the table names
    expect(matchesOrg({ issuingOrg: 'NCSC', country: 'NZL' }, 'National Cyber Security Centre', table)).toBe(false);
    expect(matchesOrg({ issuingOrg: 'BSI', country: 'DEU' }, 'Federal Office for Information Security', table)).toBe(true);
  });

  it('search titles and summaries only, every word, without regard to case or accents', () => {
    const base: DocumentRow = { ...rows[0], id: 'd0000000001', title: 'Cryptographie post-quantique', summary: 'Feuille de route', issuingOrg: 'Agence spéciale' };
    const set = [base];
    const q = (s: string) => filterRows(set, filters({ q: s }), table).length;
    expect(q('CRYPTOGRAPHIE route')).toBe(1);
    expect(q('cryptographie absent')).toBe(0);
    expect(q('speciale')).toBe(0); // the issuer is not searched
    expect(q('quantiqué')).toBe(1);
  });

  it('?year=none finds the documents with no year recorded', () => {
    const got = filterRows(rows, filters({ year: YEAR_NONE }), table);
    expect(got.every((r) => r.year === null)).toBe(true);
    expect(got.length).toBe(rows.filter((r) => r.year === null).length);
  });

  it('a choice adds a history entry; a search adds one, then updates it while typing', () => {
    expect(historyStep('choice', false)).toBe('push');
    expect(historyStep('choice', true)).toBe('push');
    expect(historyStep('search', false)).toBe('push');
    expect(historyStep('search', true)).toBe('replace');
  });

  it('the back button restores the previous filter, and the search field with it', () => {
    // a browser history in miniature: the page's script writes entries with filterQuery, and
    // Back reads the previous one with fromHistory, as its popstate handler does
    const entries: string[] = [];
    let at = -1;
    const write = (step: 'push' | 'replace', f: DocFilters) => {
      if (step === 'push') {
        entries.splice(at + 1);
        entries.push(filterQuery(f));
        at += 1;
      } else entries[at] = filterQuery(f);
    };
    const back = () => fromHistory(entries[--at]);
    const fits = (org: string, country: string) => orgFits(org, country, filterOptions(rows).issuers, table);

    // a reload of /documents?country=DEU&type=Guidance restores that view
    entries.push('?country=DEU&type=Guidance');
    at = 0;
    let state: ViewState = fromHistory(entries[0]).next;
    expect(state.filters).toEqual(filters({ country: 'DEU', type: 'Guidance' }));

    const choose = (key: 'country' | 'org' | 'type' | 'tier' | 'year', value: string) => {
      const c = choiceChange(state, key, value, fits);
      state = c.next;
      write(c.step, state.filters);
    };
    const type = (text: string) => {
      const c = searchChange(state, text);
      if (!c) return null;
      state = c.next;
      write(c.step, state.filters);
      return c.step;
    };

    choose('tier', 'T1');
    expect(type('kyb')).toBe('push');
    expect(type('kyber')).toBe('replace'); // one entry for the whole search, not one per letter
    expect(type(' kyber  ')).toBeNull(); // the same words: nothing to write
    expect(entries).toEqual(['?country=DEU&type=Guidance', '?country=DEU&type=Guidance&tier=T1', '?country=DEU&type=Guidance&tier=T1&q=kyber']);

    // Back, with the search field still focused: the filters and the field both lose the search
    let b = back();
    expect(b.next.filters).toEqual(filters({ country: 'DEU', type: 'Guidance', tier: 'T1' }));
    expect(b.field).toBe('');
    expect(b.next.typing).toBe(false);
    state = b.next;
    // Back again: the view the reload opened
    b = back();
    expect(b.next.filters).toEqual(filters({ country: 'DEU', type: 'Guidance' }));
    state = b.next;
    // a search typed after Back starts its own entry, and drops the forward ones
    expect(type('hybrid')).toBe('push');
    expect(entries).toEqual(['?country=DEU&type=Guidance', '?country=DEU&type=Guidance&q=hybrid']);
    // Back from there gives the search field its words back when the entry holds them
    entries.push('?q=ml-kem');
    at = entries.length - 1;
    expect(fromHistory(entries[at]).field).toBe('ml-kem');
    // every entry reads back as the filters that wrote it
    for (const e of entries) expect(filterQuery(readFilters(e))).toBe(e);
  });

  it('a new country drops an issuer that has no document there, and keeps one that has', () => {
    const issuers: [string, string[]][] = [
      ['BSI', ['DEU']],
      ['NCSC', ['GBR']],
    ];
    const aliasTable = issuerTable([{ alias: 'National Cyber Security Centre', issuingOrg: 'NCSC-NL', iso3: 'NLD' }]);
    const fitsHere = (org: string, country: string) => orgFits(org, country, issuers, aliasTable);
    const start: ViewState = { filters: filters({ org: 'BSI', q: 'x' }), typing: true };
    expect(choiceChange(start, 'country', 'DEU', fitsHere)).toEqual({ next: { filters: filters({ country: 'DEU', org: 'BSI', q: 'x' }), typing: false }, step: 'push' });
    expect(choiceChange(start, 'country', 'FRA', fitsHere).next.filters.org).toBe('');
    expect(fitsHere('National Cyber Security Centre', 'NLD')).toBe(true);
    expect(fitsHere('National Cyber Security Centre', 'DEU')).toBe(false);
    expect(fitsHere('', 'DEU')).toBe(true);
    expect(fitsHere('BSI', '')).toBe(true);
  });

  it('a #doc- hash names a row', () => {
    expect(hashTarget('#doc-d0123456789')).toBe('d0123456789');
    expect(hashTarget('#doc-')).toBeNull();
    expect(hashTarget('#cite')).toBeNull();
    expect(hashTarget('#doc-x"><script>')).toBeNull();
  });
});

describe('the words on the page', () => {
  it('says what the search covers, and never "full text" or "Every institutional source"', () => {
    const page = readFileSync(join(root, 'src', 'pages', 'documents', 'index.astro'), 'utf8');
    expect(page).toContain('Search titles and summaries');
    expect(page).not.toMatch(/full[- ]text/i);
    expect(page).not.toMatch(/every institutional source/i);
    const tool = readFileSync(join(root, 'src', 'components', 'DocumentsTool.tsx'), 'utf8');
    expect(tool).not.toMatch(/full[- ]text/i);
  });

  it('the line over the rows names the filters and their counts', () => {
    const places = { DEU: 'Germany' };
    expect(statusText(NO_FILTERS, { matched: 600, shown: 50, total: 600 }, places, table)).toBe(
      'Showing 50 of 600 documents, by country, then newest first.',
    );
    expect(statusText(NO_FILTERS, { matched: 40, shown: 40, total: 40 }, places, table)).toBe(
      'Showing all 40 documents, by country, then newest first.',
    );
    expect(statusText(filters({ country: 'DEU', type: 'Guidance' }), { matched: 7, shown: 7, total: 600 }, places, table)).toBe(
      '7 of 600 documents: Germany · Guidance.',
    );
    expect(statusText(filters({ org: 'National Cyber Security Centre' }), { matched: 9, shown: 9, total: 600 }, places, table)).toBe(
      '9 of 600 documents: issued by National Cyber Security Centre (recorded as NCSC and NCSC-NL).',
    );
    // with a country, the line names only the organisation the view can hold
    expect(
      statusText(filters({ country: 'NLD', org: 'National Cyber Security Centre' }), { matched: 5, shown: 5, total: 600 }, { NLD: 'Netherlands' }, table),
    ).toBe('5 of 600 documents: Netherlands · issued by National Cyber Security Centre (recorded as NCSC-NL).');
    expect(aliasTargets('National Cyber Security Centre', table, 'gbr')).toEqual(['NCSC']);
    expect(statusText(filters({ tier: 'T3', year: YEAR_NONE }), { matched: 80, shown: 50, total: 600 }, places, table)).toBe(
      '80 of 600 documents: tier 3 · year not recorded. Showing the first 50.',
    );
    // the empty states say what was asked: words alone, choices alone, or both
    expect(statusText(filters({ q: 'kyber' }), { matched: 0, shown: 0, total: 600 }, places, table)).toBe('No title or summary holds every word of “kyber”.');
    expect(statusText(filters({ country: 'DEU' }), { matched: 0, shown: 0, total: 600 }, places, table)).toBe('No document matches these filters.');
    expect(statusText(filters({ country: 'DEU', q: 'kyber' }), { matched: 0, shown: 0, total: 600 }, places, table)).toBe(
      'No document matches these filters and words.',
    );
    for (const s of [moreLabel(120), moreLabel(12), moreLabel(1)]) expect(s).not.toMatch(DASHES);
    expect(moreLabel(120)).toBe('Show 50 more');
    expect(moreLabel(12)).toBe('Show the last 12');
    expect(moreLabel(0)).toBe('');
  });
});

describe('a row', () => {
  const ctx = { places: { DEU: ['Germany', '/countries/deu'] as [string, string | null] }, notes: { d0123456789: ['A guide in Prepare: NCSC timelines'] } };
  const row: DocumentRow = {
    id: 'd0123456789',
    title: 'Quantum <b>safe</b> & "sound"',
    country: 'DEU',
    place: 'Germany',
    issuingOrg: 'BSI',
    year: null,
    docType: 'Guidance',
    tier: 'T1',
    url: 'https://www.bsi.bund.de/x?a=1&b=2',
    summary: 'A <script>alert(1)</script> summary',
  };

  it('carries its anchor, links its title to the source and its country to the profile', () => {
    const html = rowHtml(row, ctx);
    expect(html).toContain('id="doc-d0123456789"');
    expect(html).toContain('<a class="dx-title row-link" href="https://www.bsi.bund.de/x?a=1&amp;b=2">');
    expect(html).toContain('<td class="dx-place"><span class="dx-k">Country: </span><a class="row-link" href="/countries/deu">Germany</a></td>');
    expect(html).toContain('<li>A guide in Prepare: NCSC timelines</li>');
    expect(html).toContain('not recorded');
  });

  it('names each value for a screen reader, since the column heads leave narrow screens', () => {
    const html = rowHtml(row, ctx);
    for (const name of ['Country', 'Issuer', 'Year', 'Type', 'Tier']) expect(html).toContain(`<span class="dx-k">${name}: </span>`);
    // the visible "year" before "not recorded" is for the eye; a screen reader hears "Year: not recorded"
    expect(html).toContain('<td class="dx-year"><span class="dx-k">Year: </span><span class="dx-nr"><span class="dx-lbl" aria-hidden="true">year </span>not recorded</span></td>');
    expect(rowHtml({ ...row, docType: null }, ctx)).toContain('<span class="dx-lbl" aria-hidden="true">type </span>not recorded');
  });

  it('links the standards and guides its notes name, and nothing else', () => {
    const links: [string, string | null][] = [
      ['FIPS 203', '/standards/fips-203'],
      ['FIPS 204', '/standards/fips-204'],
      ['HQC', null], // a page this build does not have: named, not linked
      ['NCSC timelines', '/prepare/guides/ncsc-timelines'],
    ];
    expect(linkNote('Named in the Standards Cascade: FIPS 203 and FIPS 204', links)).toEqual([
      'Named in the Standards Cascade: ',
      ['FIPS 203', '/standards/fips-203'],
      ' and ',
      ['FIPS 204', '/standards/fips-204'],
    ]);
    expect(linkNote('Named in the Standards Cascade: HQC (selected, not yet published)', links)).toEqual([
      'Named in the Standards Cascade: HQC (selected, not yet published)',
    ]);
    // a name matches whole only
    expect(linkNote('FIPS 2030 and XFIPS 203', links)).toEqual(['FIPS 2030 and XFIPS 203']);
    const html = rowHtml(row, { ...ctx, notes: { d0123456789: [linkNote('A guide in Prepare: NCSC timelines', links)] } });
    expect(html).toContain('<li>A guide in Prepare: <a href="/prepare/guides/ncsc-timelines">NCSC timelines</a></li>');
    // a link's text and address are escaped like every other value
    expect(rowHtml(row, { ...ctx, notes: { d0123456789: [['<b>', ['"x"', '/a?b=1&c=2']]] } })).toContain(
      '<li>&lt;b&gt;<a href="/a?b=1&amp;c=2">&quot;x&quot;</a></li>',
    );
  });

  it('escapes every value and links only web addresses', () => {
    const html = rowHtml(row, ctx);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('Quantum &lt;b&gt;safe&lt;/b&gt; &amp; &quot;sound&quot;');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('  https://example.org/a ')).toBe('https://example.org/a');
    expect(rowHtml({ ...row, url: 'javascript:alert(1)' }, ctx)).not.toContain('href="javascript');
    // a place with no built profile is named, not linked
    expect(rowHtml({ ...row, country: 'XXX', place: 'Elsewhere' }, ctx)).toContain('<td class="dx-place"><span class="dx-k">Country: </span>Elsewhere</td>');
  });
});

describe('the page', () => {
  const page = documentsPage({
    rows,
    profileHref: (iso3) => `/countries/${iso3.toLowerCase()}`,
    notes: new Map([[rows[0].id, ['Named in the Standards Cascade: FIPS 203']]]),
    noteLinks: [['FIPS 203', '/standards/fips-203']],
    aliases: table,
    dataHref: '/data/documents.json',
  });

  it('draws the first 50 rows and leaves the rest to "Show 50 more"', () => {
    const drawn = page.firstHtml.match(/<tr class="dx-row"/g) ?? [];
    expect(drawn).toHaveLength(Math.min(PAGE_SIZE, rows.length));
    expect(page.more).toBe(rows.length > PAGE_SIZE ? moreLabel(rows.length - PAGE_SIZE) : '');
    expect(page.config.data).toBe('/data/documents.json');
    expect(page.config.total).toBe(rows.length);
  });

  it('stays light: the rows and the config it carries fit well inside the 150 KB page', () => {
    const bytes = new TextEncoder().encode(page.firstHtml + page.configJson).length;
    // the shell (header, menu, footer) is about 20 KB; this leaves room for it and the controls
    expect(bytes).toBeLessThan(100_000);
  });

  it('hands its script no closing script tag and only the notes of documents it lists', () => {
    expect(page.configJson).not.toMatch(/<\/script/i);
    expect(Object.keys(page.config.notes)).toEqual([rows[0].id]);
    expect(page.config.notes[rows[0].id]).toEqual([['Named in the Standards Cascade: ', ['FIPS 203', '/standards/fips-203']]]);
    expect(page.firstHtml).toContain('Named in the Standards Cascade: <a href="/standards/fips-203">FIPS 203</a>');
  });

  it('offers every country, issuer, type, tier and year the rows hold', () => {
    const o = filterOptions(rows);
    expect(o.places.map(([c]) => c).sort()).toEqual([...new Set(rows.map((r) => r.country!))].sort());
    expect(o.issuers.map(([n]) => n).sort()).toEqual([...new Set(rows.map((r) => r.issuingOrg!).filter(Boolean))].sort());
    expect(o.years).toEqual([...o.years].sort((a, b) => b - a));
    expect(o.yearUnknown).toBe(rows.some((r) => r.year === null));
  });
});
