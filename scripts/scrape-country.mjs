import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { search } from './lib/firecrawl.mjs';

// Gather candidate official QSC pages for one country via Firecrawl search.
// Writes data/candidates/<ISO3>.json (full markdown) and prints a compact list
// to stdout for the classifier. Usage: node scripts/scrape-country.mjs <ISO3>

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const queriesFor = (name) => [
  `${name} post-quantum cryptography government guidance`,
  `${name} national cyber security agency post-quantum migration`,
  `${name} quantum-safe cryptography strategy roadmap`,
];

async function main() {
  const iso3 = (process.argv[2] ?? '').toUpperCase();
  if (!iso3) {
    console.error('Usage: node scripts/scrape-country.mjs <ISO3>');
    process.exit(1);
  }
  const countries = loadJson(join(ROOT, 'data', 'countries.json'));
  const country = countries.find((c) => c.iso3 === iso3);
  if (!country) {
    console.error(`Unknown ISO3: ${iso3}`);
    process.exit(1);
  }

  const seen = new Set();
  const candidates = [];
  for (const q of queriesFor(country.name)) {
    let results = [];
    try {
      results = await search(q, { limit: 6 });
    } catch (e) {
      console.error(`  search failed for "${q}": ${e?.message ?? e}`);
    }
    for (const r of results) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      candidates.push({
        title: r.title,
        url: r.url,
        description: r.description,
        markdown: (r.markdown ?? '').slice(0, 6000),
      });
    }
    console.error(`  "${q}" -> ${results.length} results (${candidates.length} unique so far)`);
  }

  const outDir = join(ROOT, 'data', 'candidates');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${iso3}.json`), JSON.stringify(candidates, null, 2) + '\n');
  console.error(`\nWrote ${candidates.length} candidates to data/candidates/${iso3}.json`);

  // Compact list (no markdown) to stdout for the classifier agent.
  console.log(
    JSON.stringify(
      candidates.map(({ title, url, description }) => ({ title, url, description })),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error('scrape failed:', e?.message ?? e);
  process.exit(1);
});
