import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './lib/env.mjs';

// Generates data/countries.json (the global work list) from the world-countries
// dataset, tagging each with a scrape priority. Re-run with: node scripts/gen-countries.mjs

const require = createRequire(import.meta.url);
let data;
try {
  data = require('world-countries');
} catch {
  data = require('world-countries/countries.json');
}
if (!Array.isArray(data)) data = data.default ?? data.countries ?? [];

// Priority 1: countries with substantial known QSC/PQC institutional activity.
const P1 = new Set([
  'USA', 'GBR', 'FRA', 'DEU', 'NLD', 'CAN', 'AUS', 'JPN', 'KOR', 'SGP', 'CHE',
  'ITA', 'ESP', 'BEL', 'SWE', 'NOR', 'FIN', 'DNK', 'IRL', 'AUT', 'POL', 'CZE',
  'NZL', 'ISR', 'IND', 'CHN', 'BRA', 'EST', 'LUX', 'PRT',
]);
// Priority 2: broader G20 / EU / OECD likely to have some material.
const P2 = new Set([
  'MEX', 'ZAF', 'TUR', 'SAU', 'ARE', 'IDN', 'MYS', 'THA', 'VNM', 'PHL', 'TWN',
  'RUS', 'UKR', 'GRC', 'HUN', 'ROU', 'SVK', 'SVN', 'HRV', 'BGR', 'LTU', 'LVA',
  'ISL', 'CYP', 'MLT', 'QAT', 'CHL', 'ARG', 'COL',
]);

const priority = (iso3) => (P1.has(iso3) ? 1 : P2.has(iso3) ? 2 : 3);

const countries = data
  .filter((c) => c.cca3 && c.independent !== false)
  .map((c) => ({
    iso3: c.cca3,
    iso2: c.cca2,
    name: c.name?.common ?? c.cca3,
    priority: priority(c.cca3),
  }))
  .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));

// Supranational entities the thesis treats as actors (not rendered on the country map).
const supranational = [
  { iso3: 'EUU', iso2: 'EU', name: 'European Union', priority: 1, supranational: true },
  { iso3: 'NATO', iso2: 'NATO', name: 'NATO', priority: 1, supranational: true },
];

const out = [...supranational, ...countries];
mkdirSync(join(ROOT, 'data'), { recursive: true });
writeFileSync(join(ROOT, 'data', 'countries.json'), JSON.stringify(out, null, 2) + '\n');

const byP = (p) => out.filter((c) => c.priority === p).length;
console.log(
  `Wrote ${out.length} entries to data/countries.json (P1=${byP(1)}, P2=${byP(2)}, P3=${byP(3)})`,
);
