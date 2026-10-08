import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTools } from '../lab/load';
import { allPrivateRoot, otherSitesRoot } from '../lab/registry-fixture';
import { pageHref } from './gates';
import {
  NOTES_COPY,
  feedHref,
  introducedPages,
  listedNotes,
  noteHref,
  noteSchema,
  noteSitemapPaths,
  noteSources,
  noteState,
  notesFeed,
  notesHref,
  notesListPublic,
  pageName,
  pageProblem,
  publishedNotes,
  readNotes,
  rssDate,
} from './notes';
import { isNotesPath, isStaticPath } from './routes';

// The builds a note can be in. Vercel sets VERCEL=1 and VERCEL_ENV on every build; a local build
// (Swann's machine) sets neither; the matrix forces tools public offline, with no VERCEL.
const PRODUCTION = { VERCEL: '1', VERCEL_ENV: 'production' };
const PREVIEW = { VERCEL: '1', VERCEL_ENV: 'preview' };
const LOCAL = {};
const forced = (ids: string) => ({ VERCEL_ENV: 'production', ATLAS_OFFLINE: '1', ATLAS_FORCE_PUBLIC: ids });
// the real registry with every tool private again (src/lib/lab/registry-fixture.ts): the
// publishing rule is tested from there, so "once its page is public" means the page named
const STAGE0 = allPrivateRoot();
const at0 = (env: Record<string, string>) => ({ root: STAGE0, env });

// Fixture notes live in a temporary folder only: src/content/notes never holds an invented note.
type Front = Record<string, unknown>;
const yaml = (front: Front) =>
  Object.entries(front)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : typeof v === 'string' ? JSON.stringify(v) : String(v)}`)
    .join('\n');
const note = (front: Front, body = 'Fixture body for the tests.') => `---\n${yaml(front)}\n---\n${body}\n`;
const BASE = { title: 'Fixture note', date: '2026-10-04', summary: 'A fixture note for the tests.', pages: ['readiness'], draft: false };

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'notes-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

/** The problems the schema finds in one frontmatter, as "field: message". */
function problems(front: Front, opts = {}): string[] {
  const parsed = noteSchema(opts).safeParse(front);
  return parsed.success ? [] : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

describe('the frontmatter', () => {
  it('accepts a finished note and defaults draft to true', () => {
    expect(problems(BASE)).toEqual([]);
    const { draft, ...rest } = BASE;
    const parsed = noteSchema().parse(rest);
    expect(parsed.draft).toBe(true);
    expect(draft).toBe(false);
  });

  it('keeps an unquoted day that a YAML reader turned into a date as the day written', () => {
    expect(noteSchema().parse({ ...BASE, date: new Date('2026-10-04T00:00:00Z') }).date).toBe('2026-10-04');
  });

  it('refuses a date that is not a real day written YYYY-MM-DD', () => {
    for (const date of ['4 October 2026', '2026-02-30', '2026-13-01', '2026-10-4']) {
      expect(problems({ ...BASE, date }), date).toEqual(['date: write the date as YYYY-MM-DD, a real day']);
    }
  });

  it('wants a title and a summary of one sentence', () => {
    expect(problems({ ...BASE, title: ' ' })).toEqual(['title: give the note a title']);
    expect(problems({ ...BASE, summary: 'One sentence. Then another one.' })).toEqual(['summary: keep the summary to one sentence']);
    expect(problems({ ...BASE, summary: 'One sentence that names version 2.1 of a guide.' })).toEqual([]);
  });

  it('refuses a field it does not know, such as slug, which would change the address', () => {
    expect(problems({ ...BASE, slug: 'other' })[0]).toMatch(/Unrecognized key/);
  });

  it('takes an image only as a file in public/notes, and only with its alt text', () => {
    const pub = mkdtempSync(join(tmpdir(), 'notes-public-'));
    mkdirSync(join(pub, 'notes'));
    writeFileSync(join(pub, 'notes', 'fixture.png'), '');
    const opts = { publicDir: pub };
    expect(problems({ ...BASE, image: '/notes/fixture.png', alt: 'A fixture image' }, opts)).toEqual([]);
    expect(problems({ ...BASE, image: '/notes/fixture.png' }, opts)).toEqual(['alt: an image needs its alt text']);
    expect(problems({ ...BASE, alt: 'A fixture image' }, opts)).toEqual(['alt: alt goes with an image: add the image or remove alt']);
    expect(problems({ ...BASE, image: '/notes/missing.png', alt: 'x' }, opts)).toEqual(['image: /notes/missing.png is not a file in public/notes/']);
    expect(problems({ ...BASE, image: 'public/notes/fixture.png', alt: 'x' }, opts)[0]).toMatch(/^image: write the image as \/notes\/<file>/);
  });
});

describe('what a note may introduce', () => {
  it('accepts an Atlas tool id, a gated page, a guide, a profile and a named fixed page', () => {
    for (const ref of ['readiness', 'exposure', 'cascade', 'dates', '/prepare', '/prepare/guides', '/prepare/guides/eu-roadmap', '/standards/cascade', '/countries/deu', '/documents', '/methodology']) {
      expect(pageProblem(ref), ref).toBeNull();
    }
  });

  it('refuses an unknown tool, a tool of another site, an unknown path and a malformed one', () => {
    expect(pageProblem('readyness')).toBe('"readyness" is no tool id in data/lab/tools.json');
    // the real tools of another site, and a fixture ai and research entry (src/lib/lab/registry-fixture.ts)
    const sites = { root: otherSitesRoot() };
    const others = loadTools(sites).tools.filter((x) => (x.site ?? 'atlas') !== 'atlas');
    expect(others.map((t) => t.id)).toEqual(expect.arrayContaining(['rulebook', 'fixture-ai', 'fixture-research']));
    for (const t of others) {
      expect(pageProblem(t.id, sites), t.id).toBe(`"${t.id}" is a tool of another site and is never on the Atlas`);
    }
    expect(pageProblem('/prepare/nowhere')).toBe('"/prepare/nowhere" is no page of the Atlas');
    expect(pageProblem('/countries/zzz')).toBe('"/countries/zzz" is no page of the Atlas');
    expect(pageProblem('/prepare/inventory-template.csv')).toMatch(/is not a plain site path/);
    for (const ref of ['/prepare/', '/documents?country=DEU', '/about#team', '/Documents']) expect(pageProblem(ref), ref).toMatch(/is not a plain site path/);
    expect(pageProblem('Readiness Check')).toMatch(/is neither a tool id/);
  });

  it('refuses a notes address, the pages kept to Swann\'s machine and a fixed page with no name', () => {
    expect(pageProblem('/notes')).toBe('"/notes" is a notes address; a note introduces other pages');
    for (const ref of ['/research/fixture-research', '/elsewhere/eu-rules']) {
      expect(pageProblem(ref, { root: otherSitesRoot() }), ref).toBe(`"${ref}" is kept to Swann's machine and is never on the Atlas`);
    }
    // the Standards overview (5 October 2026) and the page of each standard (8 October 2026) are
    // pages of the Atlas, gated with the Cascade
    expect(pageProblem('/standards')).toBeNull();
    expect(pageProblem('/standards/fips-203')).toBeNull();
    expect(pageProblem('/')).toMatch(/has no name for its link/);
  });

  it('names each page as its link shows it', () => {
    expect(pageName('readiness')).toBe('Readiness Check');
    expect(pageName('/prepare/check')).toBe('Readiness Check');
    expect(pageName('/prepare/guides')).toBe('The guides');
    expect(pageName('/prepare/guides/eu-roadmap')).toBe('EU roadmap');
    expect(pageName('/countries/deu')).toBe('Germany');
    expect(pageName('/documents')).toBe('Documents');
  });

  it('refuses a duplicate and an empty list', () => {
    expect(problems({ ...BASE, pages: ['readiness', 'readiness'] })).toEqual(['pages.1: "readiness" is named twice']);
    expect(problems({ ...BASE, pages: [] })).toEqual(['pages: name at least one page the note introduces']);
  });
});

describe('the files', () => {
  it('reads every note, newest first, with its slug and body', () => {
    const dir = folder({
      'older-note.md': note({ ...BASE, title: 'Older', date: '2026-10-01' }),
      'newer-note.md': note({ ...BASE, title: 'Newer', date: '2026-10-05' }, 'Line one.\n\nLine two.'),
      'notes.txt': 'not a note',
      '.gitkeep': '',
    });
    const notes = readNotes({ notesDir: dir });
    expect(notes.map((n) => n.slug)).toEqual(['newer-note', 'older-note']);
    expect(notes[0]).toMatchObject({ title: 'Newer', date: '2026-10-05', draft: false, pages: ['readiness'], body: 'Line one.\n\nLine two.\n' });
  });

  it('names the file and the field of a note that fails', () => {
    const dir = folder({ 'bad-note.md': note({ ...BASE, pages: ['nowhere'] }) });
    expect(() => readNotes({ notesDir: dir })).toThrow(/bad-note\.md is not a valid note: pages\.0: "nowhere" is no tool id/);
  });

  it('refuses a file name that is not an address, and a file with no frontmatter', () => {
    expect(() => noteSources({ notesDir: folder({ 'My Note.md': note(BASE) }) })).toThrow(/My Note\.md: name the file in lower case/);
    expect(() => noteSources({ notesDir: folder({ 'plain.md': 'Just text.' }) })).toThrow(/plain\.md: the file must start with its frontmatter/);
  });

  it('reads every real note without an error, and keeps no note under another address', () => {
    const real = readNotes();
    for (const n of real) {
      expect(n.file).toBe(`src/content/notes/${n.slug}.md`);
      expect(isNotesPath(`/notes/${n.slug}`)).toBe(true);
    }
  });
});

describe('the publishing rule', () => {
  const finished = { draft: false, pages: ['readiness'] };
  const draft = { draft: true, pages: ['readiness'] };

  it('publishes a finished note in production only once every page it introduces is public', () => {
    expect(noteState(finished, at0(PRODUCTION))).toBe('hidden');
    expect(noteState(finished, at0(forced('readiness')))).toBe('published');
    expect(noteState({ draft: false, pages: ['readiness', 'exposure'] }, at0(forced('readiness')))).toBe('hidden');
    expect(noteState({ draft: false, pages: ['readiness', 'exposure'] }, at0(forced('readiness,exposure')))).toBe('published');
  });

  it('follows a tool\'s requirements, as shown() does', () => {
    expect(noteState({ draft: false, pages: ['suppliers'] }, at0(forced('suppliers')))).toBe('hidden');
    expect(noteState({ draft: false, pages: ['suppliers'] }, at0(forced('suppliers,readiness')))).toBe('published');
  });

  it('reads a path through pageHref() and the gates: a gated page waits on its gate, a fixed page is always built', () => {
    expect(noteState({ draft: false, pages: ['/prepare/guides'] }, at0(PRODUCTION))).toBe('hidden');
    expect(noteState({ draft: false, pages: ['/prepare/guides/eu-roadmap'] }, at0(forced('readiness')))).toBe('published');
    expect(noteState({ draft: false, pages: ['/standards/cascade'] }, at0(forced('cascade')))).toBe('published');
    expect(noteState({ draft: false, pages: ['/standards/fips-203'] }, at0(PRODUCTION))).toBe('hidden');
    expect(noteState({ draft: false, pages: ['/standards/fips-203'] }, at0(forced('cascade')))).toBe('published');
    expect(noteState({ draft: false, pages: ['/documents'] }, at0(PRODUCTION))).toBe('published');
  });

  it('publishes a finished note in a preview and a local build, where every Atlas page is built', () => {
    expect(noteState(finished, { env: PREVIEW })).toBe('published');
    expect(noteState(finished, { env: LOCAL })).toBe('published');
  });

  it('lists a draft in a local build only, and never publishes it', () => {
    expect(noteState(draft, { env: LOCAL })).toBe('draft');
    for (const env of [PRODUCTION, PREVIEW, forced('readiness'), { VERCEL_ENV: 'development' }]) {
      expect(noteState(draft, { env }), JSON.stringify(env)).toBe('hidden');
    }
    // a note with no draft field is a draft
    expect(noteState({ draft: undefined as unknown as boolean, pages: ['/documents'] }, { env: PRODUCTION })).toBe('hidden');
  });
});

describe('what a build lists', () => {
  const dir = folder({
    'readiness-note.md': note({ ...BASE, title: 'Fixture for the Check', date: '2026-10-06', pages: ['readiness', '/prepare/guides'] }),
    'cascade-note.md': note({ ...BASE, title: 'Fixture for the Cascade', date: '2026-10-08', pages: ['cascade'] }),
    'draft-note.md': note({ ...BASE, title: 'Fixture draft', date: '2026-10-09', draft: true }),
  });
  const at = (env: Record<string, string>) => ({ ...at0(env), notesDir: dir });

  it('has no note, no list, no feed and no sitemap entry in an all-private production build', () => {
    const opts = at(PRODUCTION);
    expect(listedNotes(opts)).toEqual([]);
    expect(publishedNotes(opts)).toEqual([]);
    expect(notesHref(opts)).toBeNull();
    expect(noteHref('readiness-note', opts)).toBeNull();
    expect(feedHref(opts)).toBeNull();
    expect(noteSitemapPaths(opts)).toEqual([]);
  });

  it('publishes a note with its page in production, public, in the sitemap and the feed', () => {
    const opts = at(forced('readiness'));
    expect(listedNotes(opts).map((n) => [n.slug, n.state, n.public])).toEqual([['readiness-note', 'published', true]]);
    expect(notesHref(opts)).toBe('/notes');
    expect(noteHref('readiness-note', opts)).toBe('/notes/readiness-note');
    expect(noteHref('cascade-note', opts)).toBeNull();
    expect(feedHref(opts)).toBe('/notes/rss.xml');
    expect(notesListPublic(opts)).toBe(true);
    expect(noteSitemapPaths(opts)).toEqual(['/notes', '/notes/readiness-note']);
  });

  it('lists the finished notes in a preview, newest first, as previews: none public, none in the sitemap', () => {
    const opts = at(PREVIEW);
    expect(listedNotes(opts).map((n) => [n.slug, n.state, n.public])).toEqual([
      ['cascade-note', 'published', false],
      ['readiness-note', 'published', false],
    ]);
    expect(notesListPublic(opts)).toBe(false);
    expect(noteSitemapPaths(opts)).toEqual([]);
    expect(noteHref('draft-note', opts)).toBeNull();
  });

  it('adds the draft in a local build, marked as one, and keeps it out of the feed', () => {
    const opts = at(LOCAL);
    expect(listedNotes(opts).map((n) => [n.slug, n.state])).toEqual([
      ['draft-note', 'draft'],
      ['cascade-note', 'published'],
      ['readiness-note', 'published'],
    ]);
    expect(publishedNotes(opts).map((n) => n.slug)).toEqual(['cascade-note', 'readiness-note']);
    expect(noteHref('draft-note', opts)).toBe('/notes/draft-note');
  });

  it('builds the list for a draft alone in a local build, and nothing for it anywhere else', () => {
    const only = folder({ 'draft-note.md': note({ ...BASE, draft: true }) });
    expect(notesHref({ ...at0(LOCAL), notesDir: only })).toBe('/notes');
    expect(feedHref({ ...at0(LOCAL), notesDir: only })).toBeNull();
    for (const env of [PRODUCTION, PREVIEW, forced('readiness')]) {
      expect(notesHref({ ...at0(env), notesDir: only }), JSON.stringify(env)).toBeNull();
      expect(feedHref({ ...at0(env), notesDir: only }), JSON.stringify(env)).toBeNull();
    }
  });

  it('links each page a note introduces by its name, in the build that shows it', () => {
    const [readiness] = publishedNotes(at(forced('readiness')));
    expect(introducedPages(readiness, at0(forced('readiness')))).toEqual([
      { ref: 'readiness', name: 'Readiness Check', href: '/prepare/check' },
      { ref: '/prepare/guides', name: 'The guides', href: '/prepare/guides' },
    ]);
    expect(introducedPages(readiness, at0(PRODUCTION)).map((p) => p.href)).toEqual([null, null]);
  });

  it('publishes no note in production today: src/content/notes holds none (8 October 2026)', () => {
    // the real registry and the real notes folder, with the six Atlas tools public
    const real = { env: PRODUCTION };
    expect(readNotes()).toEqual([]);
    expect(listedNotes(real)).toEqual([]);
    expect(notesHref(real)).toBeNull();
    expect(feedHref(real)).toBeNull();
    expect(noteSitemapPaths(real)).toEqual([]);
  });
});

describe('the notes addresses', () => {
  it('are answered by notes.ts alone: routes.ts says no page under /notes is a fixed page, in any build', () => {
    for (const env of [PRODUCTION, PREVIEW, LOCAL]) {
      for (const path of ['/notes', '/notes/', '/notes/a-note', '/notes/rss.xml', '/notes/a/b']) {
        expect(isNotesPath(path), path).toBe(true);
        expect(isStaticPath(path, { env }), path).toBe(false);
        expect(pageHref(path, { env }), path).toBeNull();
      }
    }
    expect(isNotesPath('/notesx')).toBe(false);
    expect(isNotesPath('/documents')).toBe(false);
  });
});

describe('the feed', () => {
  const ORIGIN = 'https://qscatlas.org';
  const items = [
    { slug: 'second', title: 'Second & last <fixture>', date: '2026-10-08', summary: 'The summary of the second fixture.' },
    { slug: 'first', title: 'First fixture', date: '2026-10-04', summary: 'The summary of the first fixture.' },
  ];
  const xml = notesFeed(items, ORIGIN);

  it('is RSS 2.0 with the channel\'s title, link and description', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    expect(xml).toContain('<title>Notes · QSC Atlas</title>');
    expect(xml).toContain(`<link>${ORIGIN}/notes</link>`);
    expect(xml).toContain(`<atom:link href="${ORIGIN}/notes/rss.xml" rel="self" type="application/rss+xml"/>`);
    expect(xml).toContain(`<description>${NOTES_COPY.lede}</description>`);
  });

  it('gives each note its title, link, guid, pubDate and summary, in the order given, escaped', () => {
    const got = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    expect(got).toHaveLength(2);
    expect(got[0]).toContain('<title>Second &amp; last &lt;fixture&gt;</title>');
    expect(got[0]).toContain(`<link>${ORIGIN}/notes/second</link>`);
    expect(got[0]).toContain(`<guid isPermaLink="true">${ORIGIN}/notes/second</guid>`);
    expect(got[0]).toContain('<pubDate>Thu, 08 Oct 2026 00:00:00 GMT</pubDate>');
    expect(got[0]).toContain('<description>The summary of the second fixture.</description>');
    expect(got[1]).toContain(`<link>${ORIGIN}/notes/first</link>`);
    expect(rssDate('2026-10-04')).toBe('Sun, 04 Oct 2026 00:00:00 GMT');
  });

  it('holds the published notes of a build only, never a draft', () => {
    const dir = folder({
      'done-note.md': note({ ...BASE, title: 'Done fixture' }),
      'draft-note.md': note({ ...BASE, title: 'Draft fixture', draft: true }),
    });
    const local = notesFeed(publishedNotes({ env: LOCAL, notesDir: dir }), ORIGIN);
    expect(local).toContain('/notes/done-note</link>');
    expect(local).not.toContain('draft-note');
  });
});
