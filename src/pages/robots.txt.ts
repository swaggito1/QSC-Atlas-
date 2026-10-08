// robots.txt (spec 14.4 and 17): a production build allows every crawler and names the sitemap;
// any other build (a preview deployment, a local build) asks every crawler to stay out, so a
// preview page is never indexed even when someone shares its link. The rule is robotsTxt() in
// src/lib/site/routes.ts, where the routes test covers it.
import type { APIRoute } from 'astro';
import { absoluteUrl } from '../lib/site/config';
import { robotsTxt } from '../lib/site/routes';

export const GET: APIRoute = () =>
  new Response(robotsTxt(absoluteUrl('/sitemap.xml')), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
