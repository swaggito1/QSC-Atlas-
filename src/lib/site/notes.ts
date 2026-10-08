// qscatlas.org: the notes, one short piece for each page as it goes public (Swann, 4 October 2026).
//
// The Atlas's new pages go public one by one, each announced by a short note on the site and in
// the CEPS newsletter. Swann writes each note in Markdown, src/content/notes/<slug>.md, with this
// frontmatter (noteSchema below):
//   title    the note's title
//   date     the day it is published, YYYY-MM-DD
//   summary  one sentence, used in the list, the feed and the meta description
//   pages    what the note introduces: tool ids from data/lab/tools.json or site paths
//   draft    true until the note is finished (the default)
//   image    optional: a file in public/notes/, written /notes/<file>; alt is then required
//
// The publishing rule (noteState): a note is published in a build when it is finished (draft:
// false) and every page it introduces is built in that build, through shown() for a tool id and
// pageHref() for a path (gates.ts). In production a tool is shown only once its public flag is
// true, so releasing a page and its note is one step: Swann sets the page's public flag, and its
// finished note appears with it. Any other note (a draft, or a note whose page is not built) is
// listed in a local build only (VERCEL_ENV and VERCEL unset), marked "Draft", and never in a
// preview or production build. A listed note is public when a production build would publish it
// too; one that is not (a preview's notes until their pages are public, every draft) carries the
// preview line and noindex, as the pages it introduces do.
//
// The pages (src/pages/notes) follow these lists alone: /notes and /notes/<slug> exist when a
// note is listed, the feed /notes/rss.xml when one is published. routes.ts never answers for an
// address under /notes (it cannot import this module: gates.ts imports it, and plain Node loads
// it), so every link to them comes from notesHref(), noteHref() and feedHref() here.
//
// Server code only. The files are read synchronously, so the header can ask whether the section
// exists; src/content.config.ts reads them through the same reader and schema for the bodies.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { isLocalBuild, projectRoot, toolState } from '../lab/load';
import type { LoadOptions } from '../lab/load';
import { siteOrigin } from './config';
import { pageTitle } from './meta';
import { gatePublic, link, pageHref, productionBuild, shown } from './gates';
import { NOTES_ROOT, allFiles, allPages, cleanPath, isGatedPath, isLocalGate, isNotesPath, isStaticPath } from './routes';

/** Where the notes live, relative to the project root. */
export const NOTES_DIR = 'src/content/notes';
/** The feed's file name under /notes. */
export const FEED_FILE = 'rss.xml';

/** Every word the notes pages and the feed show, for Swann to approve in one place. */
export const NOTES_COPY = {
  title: 'Notes',
  lede: 'Short notes on pages new to the Atlas, newest first.',
  introduces: 'Introduces',
  draft: 'Draft',
  back: 'All notes',
} as const;

export interface NoteOptions extends LoadOptions {
  notesDir?: string; // the folder of note files; defaults to src/content/notes under the root
  publicDir?: string; // the folder images are checked in; defaults to public/ under the root
}

export interface Note {
  slug: string; // the file name without .md, and the address: /notes/<slug>
  file: string; // the file, relative to the project root
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  pages: string[];
  draft: boolean;
  image?: string;
  alt?: string;
  body: string; // the Markdown under the frontmatter
}

/** A note's state in one build: published, listed as a draft (local builds only), or hidden. */
export type NoteState = 'published' | 'draft' | 'hidden';

export interface ListedNote extends Note {
  state: 'published' | 'draft';
  public: boolean; // a production build would publish it too
}

// ---- what a note may introduce ---------------------------------------------------------

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PATH = /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/;
const IMAGE = /^\/notes\/[a-z0-9]+(?:-[a-z0-9]+)*\.(?:png|jpe?g|webp|avif|svg)$/;

// The names of the fixed pages a note may introduce, as the header and the footer already call
// them. A gated page takes its name from the manifest and a profile from data/countries.json; a
// fixed page missing here is refused, so add its name before a note introduces it.
const PAGE_NAMES: Record<string, string> = {
  '/countries': 'Countries',
  '/map': 'Map',
  '/documents': 'Documents',
  '/methodology': 'Methodology',
  '/about': 'About',
  '/who': 'How to read the Atlas',
  '/about/changes': 'What changed',
};

const root = (opts: LoadOptions) => opts.root ?? projectRoot();

/** A page of the manifest kept to Swann's machine: never on a deployed Atlas. */
const keptLocal = (p: { section: string; gate: string | null }) => p.section === 'research' || p.section === 'elsewhere' || isLocalGate(p.gate);

const countryCache = new Map<string, { stamp: string; names: Map<string, string> }>();

/** The country names by lower-case ISO3, from data/countries.json. */
function countryNames(opts: LoadOptions): Map<string, string> {
  const abs = join(root(opts), 'data', 'countries.json');
  const stamp = existsSync(abs) ? `${statSync(abs).mtimeMs}` : '-';
  const hit = countryCache.get(abs);
  if (hit && hit.stamp === stamp) return hit.names;
  const names = new Map<string, string>();
  if (stamp !== '-') {
    const list = JSON.parse(readFileSync(abs, 'utf8')) as { iso3?: unknown; name?: unknown }[];
    for (const c of Array.isArray(list) ? list : []) {
      if (typeof c.iso3 === 'string' && typeof c.name === 'string') names.set(c.iso3.toLowerCase(), c.name);
    }
  }
  countryCache.set(abs, { stamp, names });
  return names;
}

/**
 * The name of a page a note introduces, as the note page's link shows it: a tool's title, a
 * gated page's title, a country's name, or a fixed page's name. Null for anything else.
 */
export function pageName(ref: string, opts: LoadOptions = {}): string | null {
  if (!ref.startsWith('/')) return toolState(opts).tools.find((t) => t.id === ref)?.title ?? null;
  const path = cleanPath(ref);
  const page = allPages(opts).find((p) => p.path === path);
  if (page) return page.title;
  const profile = /^\/countries\/([a-z]{3})$/.exec(path);
  if (profile) return countryNames(opts).get(profile[1]) ?? null;
  return PAGE_NAMES[path] ?? null;
}

/**
 * Why an entry of a note's pages names nothing a note may introduce, or null when it is fine:
 * a tool id of the Atlas in data/lab/tools.json, or the plain path of a page of the Atlas (a
 * gated page of the manifest, a country profile, or a fixed page with a name). Never a notes
 * address, a page kept to Swann's machine or a tool of another site, since those would keep
 * the note from ever being published on the Atlas.
 */
export function pageProblem(ref: string, opts: LoadOptions = {}): string | null {
  if (ref.startsWith('/')) {
    if (!PATH.test(ref)) return `"${ref}" is not a plain site path (lower case, no trailing slash, query or hash)`;
    if (isNotesPath(ref)) return `"${ref}" is a notes address; a note introduces other pages`;
    const page = allPages(opts).find((p) => p.path === ref);
    if (page) return keptLocal(page) ? `"${ref}" is kept to Swann's machine and is never on the Atlas` : null;
    if (allFiles().some((f) => f.path === ref) || isGatedPath(ref, opts) || !isStaticPath(ref, opts)) return `"${ref}" is no page of the Atlas`;
    if (!pageName(ref, opts)) return `"${ref}" has no name for its link; add it to PAGE_NAMES in src/lib/site/notes.ts first`;
    return null;
  }
  if (!SLUG.test(ref)) return `"${ref}" is neither a tool id from data/lab/tools.json nor a site path starting with /`;
  const tool = toolState(opts).tools.find((t) => t.id === ref);
  if (!tool) return `"${ref}" is no tool id in data/lab/tools.json`;
  if ((tool.site ?? 'atlas') !== 'atlas') return `"${ref}" is a tool of another site and is never on the Atlas`;
  return null;
}

// ---- the frontmatter -----------------------------------------------------------------------

function isDay(s: string): boolean {
  if (!DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// YAML 1.1 readers turn an unquoted 2026-10-04 into a date; the note keeps the day as written
const toDay = (v: unknown) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v.toISOString().slice(0, 10) : v);

/** One sentence: no full stop, question or exclamation mark followed by a new capitalised sentence. */
const oneSentence = (s: string) => !/[.!?]["'\u2019\u201d)]?\s+[A-Z]/.test(s);

const publicDir = (opts: NoteOptions) => opts.publicDir ?? join(root(opts), 'public');

/**
 * The frontmatter of a note, checked: the fields above and no other, a real day, a summary of one
 * sentence, at least one page and every page one a note may introduce (pageProblem), an image
 * only as a file that exists in public/notes/ and only with its alt text. draft defaults to true,
 * so a note is finished only when it says so.
 */
export function noteSchema(opts: NoteOptions = {}) {
  return z
    .object({
      title: z.string().trim().min(1, 'give the note a title'),
      date: z.preprocess(toDay, z.string().refine(isDay, 'write the date as YYYY-MM-DD, a real day')),
      summary: z.string().trim().min(1, 'write a summary of one sentence').refine(oneSentence, 'keep the summary to one sentence'),
      pages: z
        .array(z.string().trim())
        .min(1, 'name at least one page the note introduces')
        .superRefine((pages, ctx) => {
          const seen = new Set<string>();
          pages.forEach((ref, i) => {
            if (seen.has(ref)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i], message: `"${ref}" is named twice` });
            seen.add(ref);
            const problem = pageProblem(ref, opts);
            if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i], message: problem });
          });
        }),
      draft: z.boolean().default(true),
      image: z.string().regex(IMAGE, 'write the image as /notes/<file>: a lower-case .png, .jpg, .webp, .avif or .svg file in public/notes/').optional(),
      alt: z.string().trim().min(1, 'describe the image in alt').optional(),
    })
    .strict()
    .superRefine((d, ctx) => {
      if (d.image && !d.alt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alt'], message: 'an image needs its alt text' });
      if (d.alt && !d.image) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['alt'], message: 'alt goes with an image: add the image or remove alt' });
      if (d.image && !existsSync(join(publicDir(opts), d.image))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['image'], message: `${d.image} is not a file in public/notes/` });
    });
}

export type NoteFrontmatter = z.output<ReturnType<typeof noteSchema>>;

// ---- the files -----------------------------------------------------------------------------

export interface NoteSource {
  slug: string;
  file: string; // relative to the project root
  text: string; // the whole file
  data: Record<string, unknown>; // the frontmatter as written, not yet checked
  body: string;
}

/** The folder of note files. */
export function notesDir(opts: NoteOptions = {}): string {
  return opts.notesDir ?? join(root(opts), NOTES_DIR);
}

/** The frontmatter and the body of a note file; throws when the file has no frontmatter. */
export function splitNote(text: string): { data: Record<string, unknown>; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) throw new Error('the file must start with its frontmatter between two lines of ---');
  const data = parseYaml(m[1]) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('the frontmatter must be a list of fields');
  return { data: data as Record<string, unknown>, body: m[2] };
}

const sourceCache = new Map<string, { stamp: string; sources: NoteSource[] }>();

/**
 * Every note file in the folder, parsed but not checked, in file-name order. Read again only when
 * a file is added, changed, removed or renamed (a hot reload in npm run dev). Throws, naming the
 * file, when a file name is not a slug or the frontmatter cannot be read.
 */
export function noteSources(opts: NoteOptions = {}): NoteSource[] {
  const dir = notesDir(opts);
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort();
  const stamp = names
    .map((f) => {
      const s = statSync(join(dir, f));
      return `${f}:${s.mtimeMs}:${s.size}`;
    })
    .join('|');
  const hit = sourceCache.get(dir);
  if (hit && hit.stamp === stamp) return hit.sources;
  const sources = names.map((name) => {
    const file = relative(root(opts), join(dir, name)).split('\\').join('/');
    const slug = name.slice(0, -'.md'.length);
    if (!SLUG.test(slug)) throw new Error(`${file}: name the file in lower case, words joined by hyphens (it becomes the address /notes/<name>)`);
    const text = readFileSync(join(dir, name), 'utf8');
    try {
      return { slug, file, text, ...splitNote(text) };
    } catch (e) {
      throw new Error(`${file}: ${(e as Error).message}`);
    }
  });
  sourceCache.set(dir, { stamp, sources });
  return sources;
}

/** Every note, checked against the schema, newest first (then by file name). Throws, naming the file and the field, on a note that fails. */
export function readNotes(opts: NoteOptions = {}): Note[] {
  const schema = noteSchema(opts);
  const notes = noteSources(opts).map((src) => {
    const parsed = schema.safeParse(src.data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(frontmatter)'}: ${i.message}`).join('; ');
      throw new Error(`${src.file} is not a valid note: ${issues}`);
    }
    return { slug: src.slug, file: src.file, body: src.body, ...parsed.data } as Note;
  });
  return notes.sort((a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1));
}

// ---- the publishing rule -------------------------------------------------------------------

/** Whether a page a note introduces is built in this build: shown() for a tool id, pageHref() for a path. */
export function pageBuilt(ref: string, opts: LoadOptions = {}): boolean {
  return ref.startsWith('/') ? pageHref(ref, opts) !== null : shown(ref, opts);
}

/** The gate a page waits on: the tool id itself, a manifest page's gate, or null for a page always built. */
function gateOf(ref: string, opts: LoadOptions): string | null {
  if (!ref.startsWith('/')) return ref;
  const path = cleanPath(ref);
  return allPages(opts).find((p) => p.path === path)?.gate ?? allFiles().find((f) => f.path === path)?.gate ?? null;
}

/** Whether a page a note introduces is built and public: a production build would show it too. */
export function pagePublic(ref: string, opts: LoadOptions = {}): boolean {
  return pageBuilt(ref, opts) && gatePublic(gateOf(ref, opts), opts);
}

/**
 * A note's state in a build. Published: finished (draft false) and every page it introduces built
 * in this build. Otherwise a draft, listed in a local build only, or hidden in every other build.
 */
export function noteState(note: Pick<Note, 'draft' | 'pages'>, opts: LoadOptions = {}): NoteState {
  if (note.draft === false && note.pages.length > 0 && note.pages.every((p) => pageBuilt(p, opts))) return 'published';
  return isLocalBuild(opts.env ?? process.env) ? 'draft' : 'hidden';
}

/** The notes this build lists, newest first: the published ones, and the drafts of a local build. */
export function listedNotes(opts: NoteOptions = {}): ListedNote[] {
  const out: ListedNote[] = [];
  for (const note of readNotes(opts)) {
    const state = noteState(note, opts);
    if (state === 'hidden') continue;
    out.push({ ...note, state, public: state === 'published' && note.pages.every((p) => pagePublic(p, opts)) });
  }
  return out;
}

/** The notes this build publishes, newest first: the feed's, and never a draft. */
export function publishedNotes(opts: NoteOptions = {}): ListedNote[] {
  return listedNotes(opts).filter((n) => n.state === 'published');
}

/** /notes when this build lists a note, else null: the header's item and the list page follow it. */
export function notesHref(opts: NoteOptions = {}): string | null {
  return listedNotes(opts).length > 0 ? NOTES_ROOT : null;
}

/** A note's address when this build lists it, else null. */
export function noteHref(slug: string, opts: NoteOptions = {}): string | null {
  return listedNotes(opts).some((n) => n.slug === slug) ? `${NOTES_ROOT}/${slug}` : null;
}

/** /notes/rss.xml when this build publishes a note, else null. */
export function feedHref(opts: NoteOptions = {}): string | null {
  return publishedNotes(opts).length > 0 ? `${NOTES_ROOT}/${FEED_FILE}` : null;
}

/** Whether the list page is public: at least one note on it is (as a hub is when one of its pages is). */
export function notesListPublic(opts: NoteOptions = {}): boolean {
  return listedNotes(opts).some((n) => n.public);
}

/**
 * The notes addresses the sitemap lists: in a production build the list and each public note (none
 * while no note is public); none in any other build, which lists no gated page either.
 */
export function noteSitemapPaths(opts: NoteOptions = {}): string[] {
  if (!productionBuild(opts)) return [];
  const open = listedNotes(opts).filter((n) => n.public);
  return open.length ? [NOTES_ROOT, ...open.map((n) => `${NOTES_ROOT}/${n.slug}`)] : [];
}

/** The pages a note introduces, each with its name and its address in this build (null when not built). */
export function introducedPages(note: Pick<Note, 'pages'>, opts: LoadOptions = {}): { ref: string; name: string; href: string | null }[] {
  return note.pages.map((ref) => ({
    ref,
    name: pageName(ref, opts) ?? ref,
    href: ref.startsWith('/') ? pageHref(ref, opts) : link(ref, {}, opts),
  }));
}

// ---- the feed ------------------------------------------------------------------------------

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** "Sun, 04 Oct 2026 00:00:00 GMT" from "2026-10-04": the date format RSS 2.0 asks for. */
export function rssDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toUTCString();
}

/**
 * The RSS 2.0 feed of the given notes (publishedNotes() in a build): one item each with its
 * title, its address as link and guid, its day as pubDate and its summary as description.
 */
export function notesFeed(notes: Pick<Note, 'slug' | 'title' | 'date' | 'summary'>[], origin: string = siteOrigin()): string {
  const base = origin.replace(/\/+$/, '');
  const list = `${base}${NOTES_ROOT}`;
  const items = notes.map((n) => {
    const url = `${list}/${n.slug}`;
    return [
      '    <item>',
      `      <title>${escapeXml(n.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      `      <pubDate>${rssDate(n.date)}</pubDate>`,
      `      <description>${escapeXml(n.summary)}</description>`,
      '    </item>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(pageTitle(NOTES_COPY.title))}</title>`,
    `    <link>${escapeXml(list)}</link>`,
    `    <atom:link href="${escapeXml(`${list}/${FEED_FILE}`)}" rel="self" type="application/rss+xml"/>`,
    `    <description>${escapeXml(NOTES_COPY.lede)}</description>`,
    '    <language>en-GB</language>',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
