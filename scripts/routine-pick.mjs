import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';

// Print the next batch of countries for the scheduled routine to (re)scrape.
// Policy: stalest first (never-scraped count as infinitely stale), tie-broken by
// the priority field in countries.json. Deterministic, so the routine has a fixed
// worklist and the credit cost per run is bounded by --batch.
// Usage: node scripts/routine-pick.mjs [--batch N]   (default 5)

const args = process.argv.slice(2);
const batchIdx = args.indexOf('--batch');
const batch = batchIdx >= 0 ? Number(args[batchIdx + 1]) || 5 : 5;

const countries = JSON.parse(readFileSync(join(ROOT, 'data', 'countries.json'), 'utf8'));
const coverage = JSON.parse(readFileSync(join(ROOT, 'data', 'coverage.json'), 'utf8'));

const now = Date.now();
const scored = countries.map((c) => {
  const last = coverage[c.iso3]?.lastScraped ? Date.parse(coverage[c.iso3].lastScraped) : 0;
  return {
    iso3: c.iso3,
    name: c.name,
    priority: c.priority ?? 99,
    last,
    ageDays: last ? (now - last) / 86400000 : Infinity,
  };
});

scored.sort((a, b) => b.ageDays - a.ageDays || a.priority - b.priority || a.iso3.localeCompare(b.iso3));

const picked = scored.slice(0, batch).map((s) => ({
  iso3: s.iso3,
  name: s.name,
  lastScraped: s.last ? new Date(s.last).toISOString().slice(0, 10) : 'never',
}));

console.log(JSON.stringify(picked, null, 2));
