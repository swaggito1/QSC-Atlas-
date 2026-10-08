import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cap, cleanUrl, extractHtml, normaliseText, runWatch, sparqlToLines, zenodoToLines, MAX_SNAPSHOT_BYTES } from './watch.mjs';

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'lab-watch-'));
  mkdirSync(join(root, 'data/lab/watch'), { recursive: true });
  return root;
}
const page = (body) => `<html><body><header>Menu</header><main>${body}</main><footer>Footer</footer></body></html>`;
const fakeFetch = (bodies) => {
  let i = 0;
  return async () => {
    const b = bodies[Math.min(i++, bodies.length - 1)];
    if (b instanceof Error) throw b;
    return { ok: true, status: 200, text: async () => b, json: async () => JSON.parse(b), arrayBuffer: async () => Buffer.from(b) };
  };
};
const src = { id: 'example', tool: 'cascade', kind: 'html', url: 'https://example.org/page', class: 'trusted-institutional', enabled: true };
const noGit = () => null;

describe('normalising', () => {
  it('collapses whitespace, drops render stamps and keeps content dates', () => {
    const t = normaliseText('  Published  13 August 2024 \n\n\n\nPage generated at 12:00:01\nNext line\t\there');
    expect(t).toBe('Published 13 August 2024\n\nNext line here\n');
  });
  it('strips tracking and cache-busting parameters and fragments from links', () => {
    expect(cleanUrl('/doc?utm_source=x&id=3&v=17#top', 'https://example.org/a')).toBe('https://example.org/doc?id=3');
  });
  it('extracts main content without menus, footers or cookie banners', () => {
    const t = extractHtml(page('<p>Text <a href="/x?fbclid=1">link</a></p><div id="cookie-consent">Accept</div>'), { url: 'https://example.org/' });
    expect(t).toBe('Text link <https://example.org/x>\n');
  });
  it('reports a selector that no longer matches instead of hashing the whole page', () => {
    expect(() => extractHtml(page('<p>x</p>'), { extract: '.publications' })).toThrow(/matched nothing/);
  });
  it('writes SPARQL bindings and Zenodo versions as sorted lines', () => {
    expect(sparqlToLines({ head: { vars: ['a'] }, results: { bindings: [{ a: { value: 'b' } }, { a: { value: 'a' } }] } })).toBe('a\na\nb\n');
    expect(zenodoToLines({ hits: { hits: [{ id: 2, doi: 'd2', metadata: { version: '2', publication_date: '2025-01-01' } }] } })).toContain('2\t2\t2025-01-01\td2');
  });
  it('caps a snapshot at 500 KB and says so', () => {
    const r = cap('x'.repeat(MAX_SNAPSHOT_BYTES + 10));
    expect(r.truncated).toBe(true);
    expect(r.text.endsWith('[truncated at 500 KB]\n')).toBe(true);
  });
});

describe('a watch run', () => {
  it('records a baseline on first sight and reports no change', async () => {
    const root = sandbox();
    const r = await runWatch({ root, sources: [src], fetchImpl: fakeFetch([page('<p>v1</p>')]), git: noGit });
    expect(r.changes).toEqual([]);
    expect(readFileSync(join(root, 'data/lab/watch/snapshots/example.txt'), 'utf8')).toBe('v1\n');
    expect(JSON.parse(readFileSync(join(root, 'data/lab/watch/state.json'), 'utf8')).sources.example.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('reports a change with a diff and a git reference to the previous snapshot', async () => {
    const root = sandbox();
    await runWatch({ root, sources: [src], fetchImpl: fakeFetch([page('<p>v1</p>')]), git: noGit });
    const git = (args) => (args[0] === 'log' ? 'abc123' : null);
    const r = await runWatch({ root, sources: [src], fetchImpl: fakeFetch([page('<p>v2</p>')]), git });
    expect(r.changes).toHaveLength(1);
    const c = r.changes[0];
    expect(Object.keys(c)).toEqual(expect.arrayContaining(['sourceId', 'tool', 'kind', 'url', 'class', 'previousHash', 'currentHash', 'snapshotPath', 'previousSnapshotRef', 'diffPath']));
    expect(c.previousSnapshotRef).toBe('abc123:data/lab/watch/snapshots/example.txt');
    const diff = readFileSync(join(root, c.diffPath), 'utf8');
    expect(diff).toContain('-v1');
    expect(diff).toContain('+v2');
  });

  it('never treats a failed fetch as a change, and counts consecutive failures', async () => {
    const root = sandbox();
    await runWatch({ root, sources: [src], fetchImpl: fakeFetch([page('<p>v1</p>')]), git: noGit });
    const fail = fakeFetch([new Error('HTTP 503')]);
    await runWatch({ root, sources: [src], fetchImpl: fail, backoffMs: 1, git: noGit });
    const r = await runWatch({ root, sources: [src], fetchImpl: fail, backoffMs: 1, git: noGit });
    expect(r.changes).toEqual([]);
    const st = JSON.parse(readFileSync(join(root, 'data/lab/watch/state.json'), 'utf8')).sources.example;
    expect(st.consecutiveFailures).toBe(2);
    expect(st.lastError).toMatch(/503/);
    expect(readFileSync(join(root, 'data/lab/watch/snapshots/example.txt'), 'utf8')).toBe('v1\n');
  });

  it('writes nothing in a dry run', async () => {
    const root = sandbox();
    const r = await runWatch({ root, sources: [src], fetchImpl: fakeFetch([page('<p>v1</p>')]), dryRun: true, git: noGit });
    expect([...r.writes.keys()]).toContain('data/lab/watch/snapshots/example.txt');
    expect(existsSync(join(root, 'data/lab/watch/snapshots/example.txt'))).toBe(false);
    expect(existsSync(join(root, 'data/lab/watch/state.json'))).toBe(false);
  });

  it('runs only the named sources, and skips disabled ones', async () => {
    const root = sandbox();
    const other = { ...src, id: 'other' };
    const off = { ...src, id: 'off', enabled: false };
    const r = await runWatch({ root, sources: [src, other, off], only: 'other,off', fetchImpl: fakeFetch([page('<p>x</p>')]), git: noGit });
    expect(r.log).toEqual(['off: disabled, skipped', 'other: baseline recorded (2 bytes)']);
  });

  it('reports an internal path whose last commit moved', async () => {
    const root = sandbox();
    const internal = { id: 'results', tool: 'cascade', kind: 'internal-diff', url: 'data/results/', class: 'trusted-institutional', enabled: true };
    await runWatch({ root, sources: [internal], git: () => 'c1' });
    const r = await runWatch({ root, sources: [internal], git: () => 'c2' });
    expect(r.changes[0]).toMatchObject({ sourceId: 'results', previousHash: 'c1', currentHash: 'c2', informational: true });
  });

  it('reads a local fixture file', async () => {
    const root = sandbox();
    mkdirSync(join(root, 'labs/fixtures'), { recursive: true });
    writeFileSync(join(root, 'labs/fixtures/f.html'), page('<p>fixture</p>'));
    await runWatch({ root, sources: [{ ...src, url: 'labs/fixtures/f.html' }], git: noGit });
    expect(readFileSync(join(root, 'data/lab/watch/snapshots/example.txt'), 'utf8')).toBe('fixture\n');
  });
});

describe('the Cascade candidate hook', () => {
  it('lists documents that name a standard and are not yet edges or rejected', async () => {
    const root = sandbox();
    mkdirSync(join(root, 'data/results'), { recursive: true });
    mkdirSync(join(root, 'data/lab/cascade'), { recursive: true });
    writeFileSync(join(root, 'data/results/FRA.json'), JSON.stringify([
      { title: 'Guide on ML-KEM', url: 'https://example.org/a', included: true, issuingOrg: 'ANSSI', year: 2026, summary: '' },
      { title: 'Old ML-KEM note', url: 'https://example.org/b', included: true, issuingOrg: 'ANSSI', year: 2025, summary: '' },
      { title: 'Draft on ML-KEM', url: 'https://example.org/c', included: false, issuingOrg: 'ANSSI', year: 2026, summary: '' },
    ]));
    writeFileSync(join(root, 'data/lab/cascade/standards.json'), JSON.stringify({ standards: [{ id: 'FIPS-203', synonyms: [{ text: 'ML-KEM', type: 'official' }] }] }));
    writeFileSync(join(root, 'data/lab/cascade/edges.json'), JSON.stringify({ edges: [{ documentUrl: 'https://example.org/b', to: 'FIPS-203' }] }));
    const src = { id: 'atlas-results-diff', tool: 'cascade', kind: 'internal-diff', url: 'data/results/', class: 'trusted-institutional', enabled: true, candidates: 'cascade', informational: false };
    await runWatch({ root, sources: [src], git: () => 'c1' });
    const r = await runWatch({ root, sources: [src], git: () => 'c2' });
    expect(r.changes[0].newCandidates.map((c) => c.docUrl)).toEqual(['https://example.org/a']);
    expect(r.changes[0].informational).toBe(false);
  });
});
