import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { updateCountryProfile } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Write a country's analytical profile (the "mise en forme") into ATLAS_COUNTRIES.
// Usage: node scripts/update-profile.mjs <profile.json> [more.json ...] [--deploy]
// Profile shape and rules: scraper/PROFILE_GUIDE.md. Validates select values and
// the "year | milestone" / "name | role" line formats before writing.

loadEnv();
const COUNTRIES_DS = process.env.NOTION_DB_COUNTRIES;

const PROCESSES = ['NIST', 'EU', 'ETSI', 'ISO', 'Sovereign', 'Mixed'];
const HYBRID = ['Required', 'Recommended', 'Under evaluation', 'Discouraged', 'None stated'];
const TARGETS = ['2030', '2035', 'Phased (no fixed end)', 'None stated'];
const STATUSES = ['Complete', 'Partial', 'Placeholder'];
const LEGAL_STATUS = ['binding', 'soft-only', 'none'];
const INSTRUMENT_STATUS = ['binding-law', 'binding-by-market-access', 'soft-law', 'guidance'];

function validate(p) {
  const errs = [];
  if (!p.iso3 || !/^[A-Z]{3,4}$/.test(p.iso3)) errs.push(`bad iso3: ${p.iso3}`);
  if (p.dominantProcess && !PROCESSES.includes(p.dominantProcess))
    errs.push(`dominantProcess must be one of ${PROCESSES.join('/')}`);
  if (p.hybridDeployment && !HYBRID.includes(p.hybridDeployment))
    errs.push(`hybridDeployment must be one of ${HYBRID.join('/')}`);
  if (p.targetCompletion && !TARGETS.includes(p.targetCompletion))
    errs.push(`targetCompletion must be one of ${TARGETS.join('/')}`);
  if (p.dataStatus && !STATUSES.includes(p.dataStatus))
    errs.push(`dataStatus must be one of ${STATUSES.join('/')}`);
  if (p.legalStatus && !LEGAL_STATUS.includes(p.legalStatus))
    errs.push(`legalStatus must be one of ${LEGAL_STATUS.join('/')}`);
  if (p.mainRegulation) {
    for (const line of String(p.mainRegulation).split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 3) errs.push(`mainRegulation needs "instrument | level | status": "${line}"`);
      else if (!INSTRUMENT_STATUS.includes(parts[2]))
        errs.push(`mainRegulation status must be one of ${INSTRUMENT_STATUS.join('/')}: "${line}"`);
    }
  }
  for (const key of ['migrationTimeline', 'govActors', 'processParticipation']) {
    if (!p[key]) continue;
    for (const line of String(p[key]).split('\n')) {
      if (line.trim() && !line.includes('|')) errs.push(`${key} line missing " | ": "${line}"`);
    }
  }
  return errs;
}

async function main() {
  const args = process.argv.slice(2);
  const deploy = args.includes('--deploy');
  const files = args.filter((a) => !a.startsWith('--'));
  if (!files.length) {
    console.error('Usage: node scripts/update-profile.mjs <profile.json> [more.json ...] [--deploy]');
    process.exit(1);
  }
  const countries = JSON.parse(readFileSync(join(ROOT, 'data', 'countries.json'), 'utf8'));

  let wrote = 0;
  for (const file of files) {
    const p = JSON.parse(readFileSync(file, 'utf8'));
    const errs = validate(p);
    if (errs.length) {
      console.error(`SKIP ${file}:\n  - ${errs.join('\n  - ')}`);
      continue;
    }
    const name = countries.find((c) => c.iso3 === p.iso3)?.name ?? p.iso3;
    const id = await updateCountryProfile(COUNTRIES_DS, p.iso3, name, p);
    wrote++;
    console.log(`✓ ${p.iso3} (${name}) profile written${p.dataStatus ? ` [${p.dataStatus}]` : ''} -> ${id}`);
  }
  console.log(`\n${wrote}/${files.length} profiles written.`);
  if (deploy && wrote > 0) await fireDeployHook();
}

main().catch((e) => {
  console.error('update-profile failed:', e?.message ?? e);
  process.exit(1);
});
