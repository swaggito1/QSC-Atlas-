import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { getExistingDocUrls, createDocument, upsertCountry } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

loadEnv();

const COUNTRIES_DS = process.env.NOTION_DB_COUNTRIES;
const DOCUMENTS_DS = process.env.NOTION_DB_DOCUMENTS;

const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
const isTrusted = (url, domains) => {
  const host = domainOf(url);
  return domains.some((d) => host === d || host.endsWith('.' + d));
};

async function main() {
  const [iso3Arg, fileArg] = process.argv.slice(2);
  if (!iso3Arg || !fileArg) {
    console.error('Usage: node scripts/ingest.mjs <ISO3> <results.json>');
    process.exit(1);
  }
  const iso3 = iso3Arg.toUpperCase();
  const docs = loadJson(fileArg);
  if (!Array.isArray(docs)) {
    console.error('results file must be a JSON array');
    process.exit(1);
  }

  const countries = loadJson(join(ROOT, 'data', 'countries.json'));
  const countryName = countries.find((c) => c.iso3 === iso3)?.name ?? iso3;
  const trusted = loadJson(join(ROOT, 'data', 'trusted-domains.json')).domains ?? [];

  const existing = await getExistingDocUrls(DOCUMENTS_DS);

  let added = 0;
  let skipped = 0;
  let lowRisk = 0;
  for (const raw of docs) {
    const url = (raw.url ?? '').trim();
    if (!url) {
      console.log(`  skip (no url): ${raw.title ?? '?'}`);
      continue;
    }
    if (existing.has(url)) {
      skipped++;
      continue;
    }
    const included = raw.included ?? isTrusted(url, trusted);
    await createDocument(DOCUMENTS_DS, {
      title: raw.title ?? '(untitled)',
      country: iso3,
      issuingOrg: raw.issuingOrg ?? null,
      year: raw.year ?? null,
      docType: raw.docType ?? null,
      tier: raw.tier ?? null,
      url,
      summary: raw.summary ?? null,
      included,
    });
    existing.add(url);
    added++;
    if (included) lowRisk++;
    console.log(`  + ${raw.tier ?? '?'} ${raw.issuingOrg ?? ''}: ${raw.title}${included ? '' : ' [draft]'}`);
  }

  const dataStatus = added > 0 ? 'Partial' : 'Placeholder';
  await upsertCountry(COUNTRIES_DS, { iso3, name: countryName, dataStatus });

  const covPath = join(ROOT, 'data', 'coverage.json');
  const coverage = loadJson(covPath);
  coverage[iso3] = {
    lastScraped: new Date().toISOString(),
    docCount: (coverage[iso3]?.docCount ?? 0) + added,
    status: dataStatus,
  };
  writeFileSync(covPath, JSON.stringify(coverage, null, 2) + '\n');

  console.log(`\n${iso3}: added ${added}, skipped(dup) ${skipped}, included ${lowRisk}.`);
  if (lowRisk > 0) await fireDeployHook();
}

main().catch((e) => {
  console.error('ingest failed:', e?.message ?? e);
  process.exit(1);
});
