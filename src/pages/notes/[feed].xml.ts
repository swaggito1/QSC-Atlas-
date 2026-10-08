// /notes/rss.xml: the RSS 2.0 feed of the notes this build publishes (publishedNotes() in
// src/lib/site/notes.ts), for the CEPS newsletter: per note its title, its address as link and
// guid, its day as pubDate and its summary as description. Never a draft. Generated only when the
// build publishes a note, so a production build has no feed until the first note goes out with its
// page. Written by hand (notesFeed), with no package.

import type { APIRoute } from 'astro';
import { FEED_FILE, feedHref, notesFeed, publishedNotes } from '../../lib/site/notes';

const FEED = FEED_FILE.replace(/\.xml$/, '');

export function getStaticPaths() {
  return feedHref() ? [{ params: { feed: FEED } }] : [];
}

export const GET: APIRoute = ({ params }) => {
  if (params.feed !== FEED || !feedHref()) return new Response(null, { status: 404 });
  return new Response(notesFeed(publishedNotes()), { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
