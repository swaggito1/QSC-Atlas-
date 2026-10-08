// /data/finder.json: the country finder's list, built once at build time from the same
// collection the profile pages come from, so every entry opens a page that exists.
// Name, ISO3, posture key and the aliases in data/site/country-aliases.json; under 20 KB.

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { POSTURE_META } from '../../lib/process';
import { buildFinderData } from '../../scripts/finder';
import countries from '../../../data/countries.json';
import aliasFile from '../../../data/site/country-aliases.json';

const NO_POSTURE = 'No posture recorded';

export const GET: APIRoute = async () => {
  const names = new Map((countries as { iso3: string; name: string }[]).map((c) => [c.iso3, c.name]));
  const rows = (await getCollection('countries')).map((c) => ({
    iso3: c.data.iso3,
    name: c.data.country || names.get(c.data.iso3) || '',
    posture: c.data.coordinationPosture,
  }));
  const data = buildFinderData(rows, aliasFile.aliases, POSTURE_META, NO_POSTURE);
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
