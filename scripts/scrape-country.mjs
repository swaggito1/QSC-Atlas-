import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { search } from './lib/firecrawl.mjs';

// Gather candidate official QSC pages for one country via Firecrawl search.
// Writes data/candidates/<ISO3>.json (full markdown) and prints a compact list
// to stdout for the classifier.
//
// Usage: node scripts/scrape-country.mjs <ISO3> [--lite] [--deep] [--max N]
//   default: generic queries + site: dorks on institutional domains + native-language
//            terms from data/dorks.json (~6-9 queries, one credit each)
//   --lite   generic queries only (~3 queries, the old behaviour)
//   --deep   also dork the deepSites (parliament, central bank, regulators)
//   --max N  hard cap on query count (default 12)

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const PQC_TERMS = 'post-quantum OR PQC';

// Site-scoped dorks against known institutional domains beat generic searches:
// they surface agency position papers, parliamentary records, and native-language
// documents that never rank in an English web search. Config: data/dorks.json.
function buildQueries(country, dorks, { lite, deep, max }) {
  const generic = (dorks.generic ?? []).map((t) => t.replaceAll('{name}', country.name));
  const cfg = dorks.countries?.[country.iso3];
  if (lite || !cfg) return [...new Set(generic)].slice(0, max);

  const native = (cfg.terms ?? []).map((t) => ` OR "${t}"`).join('');
  const siteDorks = (domains) => (domains ?? []).map((d) => `site:${d} ${PQC_TERMS}${native}`);

  const queries = [
    ...siteDorks(cfg.sites),
    ...(cfg.terms ?? []).map((t) => `${country.name} "${t}"`),
    ...(cfg.extraQueries ?? []).map((t) => t.replaceAll('{name}', country.name)),
    ...generic,
    ...(deep ? siteDorks(cfg.deepSites) : []),
  ];
  return [...new Set(queries)].slice(0, max);
}

async function main() {
  const args = process.argv.slice(2);
  const iso3 = (args.find((a) => !a.startsWith('--')) ?? '').toUpperCase();
  const lite = args.includes('--lite');
  const deep = args.includes('--deep');
  const maxIdx = args.indexOf('--max');
  const max = maxIdx >= 0 ? Number(args[maxIdx + 1]) || 12 : 12;
  if (!iso3) {
    console.error('Usage: node scripts/scrape-country.mjs <ISO3> [--lite] [--deep] [--max N]');
    process.exit(1);
  }
  const countries = loadJson(join(ROOT, 'data', 'countries.json'));
  const country = countries.find((c) => c.iso3 === iso3);
  if (!country) {
    console.error(`Unknown ISO3: ${iso3}`);
    process.exit(1);
  }

  const dorks = loadJson(join(ROOT, 'data', 'dorks.json'));
  const queries = buildQueries(country, dorks, { lite, deep, max });
  console.error(`Query plan: ${queries.length} searches (~${queries.length} credits)`);

  const seen = new Set();
  const candidates = [];
  for (const q of queries) {
    let results = [];
    try {
      results = await search(q, { limit: 8 });
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
