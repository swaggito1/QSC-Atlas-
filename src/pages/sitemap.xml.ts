// sitemap.xml (spec 2 and 17): the built pages a search engine may index, and nothing else.
// It lists the static pages (not the 404 page, and not an address vercel.json redirects), every
// country profile except the Placeholder ones (they carry noindex), and, in a production build
// only, the gated pages that build generates (all of them public there) and the public notes
// (noteSitemapPaths() in src/lib/site/notes.ts: never a draft). A preview build lists no gated
// page and no note: each carries noindex until its tool is public. The rule is sitemapPaths() in
// src/lib/site/routes.ts, where the routes test covers it.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { absoluteUrl } from '../lib/site/config';
import { noteSitemapPaths } from '../lib/site/notes';
import { sitemapPaths } from '../lib/site/routes';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const GET: APIRoute = async () => {
  const profiles = (await getCollection('countries')).map((c) => ({ iso3: c.data.iso3, dataStatus: c.data.dataStatus }));
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...sitemapPaths(profiles, {}, noteSitemapPaths()).map((p) => `  <url><loc>${escapeXml(absoluteUrl(p))}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
