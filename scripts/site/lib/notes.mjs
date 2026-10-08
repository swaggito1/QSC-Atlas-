// qscatlas.org site checks: the notes as their files hold them (src/content/notes), read here
// apart from the site's own reader (src/lib/site/notes.ts), so a check never takes the build's
// word for what a build should contain. Only the fields the expectations need: the file name (the
// address /notes/<slug>), draft (only an explicit false finishes a note), the pages it introduces
// and its image. Whether a note is valid is the build's own concern: an invalid note fails it.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ROOT } from './common.mjs';

export const NOTES_DIR = join('src', 'content', 'notes');

/** Every note file's { slug, draft, pages, image }, in file-name order. */
export function readNoteFronts(root = ROOT, dir = join(root, NOTES_DIR)) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), 'utf8');
      const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
      const raw = m ? parse(m[1]) : null;
      const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
      return {
        slug: f.slice(0, -'.md'.length),
        draft: data.draft !== false,
        pages: Array.isArray(data.pages) ? data.pages.map((p) => String(p).trim()) : [],
        image: typeof data.image === 'string' ? data.image : null,
      };
    });
}
