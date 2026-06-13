import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { updateCountryProfile } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Classify EU member states as EU-aligned: they co-author and follow the NIS
// Cooperation Group coordinated PQC roadmap (high-risk by 2030, full by 2035).
// A partial write, so existing summaries and actors are preserved. France and
// Germany also carry a national secondary label. Run: node scripts/apply-eu.mjs [--deploy]

loadEnv();
const DS = process.env.NOTION_DB_COUNTRIES;

const EU = [
  'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU',
  'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD', 'POL', 'PRT',
  'ROU', 'SVK', 'SVN', 'ESP', 'SWE',
];
const SECONDARY = { FRA: 'Sovereign', DEU: 'Mixed' };

const TIMELINE = '2030 | High-risk use cases migrated\n2035 | Full migration of all systems complete';
const PARTICIPATION = 'NIS Cooperation Group | co-authored the EU coordinated PQC roadmap';

const countries = JSON.parse(readFileSync(join(ROOT, 'data', 'countries.json'), 'utf8'));
const nameOf = (iso) => countries.find((c) => c.iso3 === iso)?.name ?? iso;

async function main() {
  const deploy = process.argv.includes('--deploy');
  for (const iso of EU) {
    const fields = {
      dominantProcess: 'EU',
      migrationTimeline: TIMELINE,
      targetCompletion: '2035',
      processParticipation: PARTICIPATION,
      dataStatus: 'Partial',
    };
    if (SECONDARY[iso]) fields.secondaryProcess = SECONDARY[iso];
    await updateCountryProfile(DS, iso, nameOf(iso), fields);
    console.log(`EU-aligned: ${iso}${SECONDARY[iso] ? ` (+${SECONDARY[iso]})` : ''}`);
  }
  console.log(`\nClassified ${EU.length} EU member states as EU-aligned.`);
  if (deploy) await fireDeployHook();
}

main().catch((e) => {
  console.error('apply-eu failed:', e?.message ?? e);
  process.exit(1);
});
