// /data/documents.json: the Documents index as data (spec 9). Every included document, in the
// order the page lists them, with its stable id, place, issuer, year, type, tier, URL and
// summary, plus the as-of date and what the fields and tiers mean. Built once at build time from
// the same collection as /documents; the page's "Show 50 more" and its filters load this file.
// Linked from About (#data); /data/documents.csv carries the same rows.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { documentRows, documentsJson, placeNames } from '../../lib/site/documents';
import { todayIso } from '../../lib/site/meta';
import { absoluteUrl } from '../../lib/site/config';
import countries from '../../../data/countries.json';

export const GET: APIRoute = async () => {
  const [docs, profiles] = await Promise.all([getCollection('documents'), getCollection('countries')]);
  const names = placeNames(
    profiles.map((p) => p.data),
    countries as { iso3: string; name: string }[],
  );
  const rows = documentRows(
    docs.map((d) => d.data),
    names,
  );
  // the index as built today: documents carry no date of their own, and a profile's Updated
  // date says nothing about documents added since, so the snapshot day is the honest as-of
  const asOf = todayIso();
  const body = documentsJson(rows, { asOf, source: absoluteUrl('/documents') });
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
