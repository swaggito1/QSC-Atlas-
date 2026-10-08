// /data/documents.csv: the Documents index as a spreadsheet (spec 9). The same rows as
// /data/documents.json, in the same order, one line each, with the as-of date in the last
// column of every line. UTF-8 with a byte order mark, so accented names open correctly.
// Linked from /documents and from About (#data).

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { documentRows, documentsCsv, placeNames } from '../../lib/site/documents';
import { todayIso } from '../../lib/site/meta';
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
  return new Response(documentsCsv(rows, asOf), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
};
