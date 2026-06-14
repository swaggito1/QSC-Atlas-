import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { getExistingDocMap, updateDocument, createDocument, upsertCountry } from './lib/notion-write.mjs';
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

  const existing = await getExistingDocMap(DOCUMENTS_DS);

  let added = 0;
  let updated = 0;
  let lowRisk = 0;
  for (const raw of docs) {
    const url = (raw.url ?? '').trim();
    if (!url) {
      console.log(`  skip (no url): ${raw.title ?? '?'}`);
      continue;
    }
    const included = raw.included ?? isTrusted(url, trusted);
    const doc = {
      title: raw.title ?? '(untitled)',
      country: iso3,
      issuingOrg: raw.issuingOrg ?? null,
      year: raw.year ?? null,
      docType: raw.docType ?? null,
      tier: raw.tier ?? null,
      url,
      summary: raw.summary ?? null,
      included,
    };
    if (existing.has(url)) {
      await updateDocument(DOCUMENTS_DS, existing.get(url), doc);
      updated++;
      console.log(`  ~ ${raw.tier ?? '?'} ${raw.issuingOrg ?? ''}: ${raw.title}${included ? '' : ' [draft]'} (updated)`);
    } else {
      const page = await createDocument(DOCUMENTS_DS, doc);
      existing.set(url, page.id);
      added++;
      console.log(`  + ${raw.tier ?? '?'} ${raw.issuingOrg ?? ''}: ${raw.title}${included ? '' : ' [draft]'}`);
    }
    if (included) lowRisk++;
  }

  const dataStatus = added + updated > 0 ? 'Partial' : 'Placeholder';
  await upsertCountry(COUNTRIES_DS, { iso3, name: countryName, dataStatus });

  const covPath = join(ROOT, 'data', 'coverage.json');
  const coverage = loadJson(covPath);
  coverage[iso3] = {
    lastScraped: new Date().toISOString(),
    docCount: added + updated,
    status: dataStatus,
  };
  writeFileSync(covPath, JSON.stringify(coverage, null, 2) + '\n');

  console.log(`\n${iso3}: added ${added}, updated ${updated}, included ${lowRisk}.`);
  if (lowRisk > 0) await fireDeployHook();
}

main().catch((e) => {
  console.error('ingest failed:', e?.message ?? e);
  process.exit(1);
});
