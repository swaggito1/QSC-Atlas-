import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { docId, normaliseUrl, sha1Hex } from './docid';
import { projectRoot } from '../lab/load';

const resultsDir = join(projectRoot(), 'data', 'results');
const rows: { url: string | null; country: string }[] = readdirSync(resultsDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .flatMap((f) => JSON.parse(readFileSync(join(resultsDir, f), 'utf8')));

describe('sha1Hex', () => {
  it('agrees with node:crypto on ASCII, UTF-8 and long input', () => {
    for (const s of ['', 'abc', 'https://cyber.gouv.fr/faq-pqc', 'Кодиеум 新一代商用密码算法', 'x'.repeat(1000)]) {
      expect(sha1Hex(s)).toBe(createHash('sha1').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('normaliseUrl', () => {
  it('trims, lower-cases the host, and drops the fragment and trailing slashes', () => {
    expect(normaliseUrl('  HTTPS://Cyber.Gouv.FR/Faq-PQC/#top ')).toBe('https://cyber.gouv.fr/Faq-PQC');
    expect(normaliseUrl('https://example.org/')).toBe('https://example.org');
    expect(normaliseUrl('https://example.org/a/?b=1')).toBe('https://example.org/a?b=1');
  });

  it('keeps the case of the path and the query', () => {
    expect(normaliseUrl('https://x.org/Doc?ID=A')).toBe('https://x.org/Doc?ID=A');
  });
});

describe('docId', () => {
  it('is "d" plus ten hex characters', () => {
    expect(docId('https://www.ncsc.gov.uk/guidance/pqc-migration-timelines')).toMatch(/^d[0-9a-f]{10}$/);
  });

  it('is identical with and without a trailing slash, a fragment or host capitals', () => {
    const base = 'https://cyber.gouv.fr/enjeux-technologiques/cryptographie-post-quantique/faq-pqc';
    expect(docId(base + '/')).toBe(docId(base));
    expect(docId(base + '#section')).toBe(docId(base));
    expect(docId(base.replace('cyber.gouv.fr', 'CYBER.gouv.fr'))).toBe(docId(base));
  });

  it(`is unique across all ${rows.length} rows in data/results`, () => {
    expect(rows.length).toBeGreaterThanOrEqual(714);
    const ids = new Map<string, string>();
    const clashes: string[] = [];
    for (const r of rows) {
      expect(r.url, `a row in ${r.country} has no URL`).toBeTruthy();
      const id = docId(r.url!);
      if (ids.has(id) && ids.get(id) !== r.url) clashes.push(`${id}: ${ids.get(id)} and ${r.url}`);
      if (ids.has(id) && ids.get(id) === r.url) clashes.push(`${id}: ${r.url} appears twice`);
      ids.set(id, r.url!);
    }
    expect(clashes).toEqual([]);
    expect(ids.size).toBe(rows.length);
  });
});

describe('the offline documents collection (ATLAS_OFFLINE=1)', () => {
  it('holds every included row once, keyed by its docId', async () => {
    const { readDocumentEntries } = await import('../../loaders/json-mirror');
    const entries = readDocumentEntries();
    const included = rows.filter((r) => (r as { included?: boolean }).included === true);
    expect(entries.length).toBe(included.length);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    for (const e of entries) {
      expect(e.id).toBe(docId(e.url as string));
      expect(e.included).toBe(true);
      expect(Object.keys(e).sort()).toEqual(['country', 'docType', 'id', 'included', 'issuingOrg', 'summary', 'tier', 'title', 'url', 'year']);
    }
  });
});
