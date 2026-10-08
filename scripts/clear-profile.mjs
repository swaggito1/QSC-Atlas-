import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { notion, getSchema, findCountryByIso3 } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Reset a country's analytical profile to the PROFILE_GUIDE state for a country with
// no attested documents: only Country / ISO3 / Data Status = Placeholder survive.
// update-profile.mjs cannot do this (it skips empty values, so fields can never be
// blanked). Usage: node scripts/clear-profile.mjs AUT BGR ... [--deploy]

loadEnv();
const COUNTRIES_DS = process.env.NOTION_DB_COUNTRIES;

// analytical fields only - never touch the Country title or ISO3
const ANALYTICAL = ['Summary','Gov Actors','Standard Families','Algorithms','Dominant Standards Process',
  'Secondary Process','Process Participation','Hybrid Deployment','Migration Timeline','Target Completion',
  'Coordination Posture','Standards Role','Main Regulation','Legal Status','Obligation','Confidence'];

const emptyFor = (type) => {
  switch (type) {
    case 'select': return { select: null };
    case 'multi_select': return { multi_select: [] };
    case 'rich_text': return { rich_text: [] };
    case 'number': return { number: null };
    case 'date': return { date: null };
    case 'checkbox': return { checkbox: false };
    case 'url': return { url: null };
    default: return null;
  }
};

async function main() {
  const args = process.argv.slice(2);
  const deploy = args.includes('--deploy');
  const isos = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
  if (!isos.length) { console.error('usage: node scripts/clear-profile.mjs <ISO3...> [--deploy]'); process.exit(1); }

  const props = await getSchema(COUNTRIES_DS);
  let done = 0;
  for (const iso of isos) {
    const page = await findCountryByIso3(COUNTRIES_DS, iso);
    if (!page) { console.log(`  ${iso}: no Notion row, skipped`); continue; }
    const payload = {};
    const cleared = [];
    for (const name of ANALYTICAL) {
      const def = props[name];
      if (!def) continue;
      const val = emptyFor(def.type);
      if (val) { payload[name] = val; cleared.push(name); }
    }
    if (props['Data Status']) payload['Data Status'] = { select: { name: 'Placeholder' } };
    if (props['Last Updated']) payload['Last Updated'] = { date: { start: new Date().toISOString().slice(0, 10) } };
    await notion.pages.update({ page_id: page.id, properties: payload });
    writeFileSync(join(ROOT, 'data', 'profiles', iso + '.json'),
      JSON.stringify({ iso3: iso, dataStatus: 'Placeholder' }, null, 2) + '\n');
    done++;
    console.log(`  ${iso}: cleared ${cleared.length} fields -> Placeholder`);
  }
  console.log(`\n${done}/${isos.length} profiles reset.`);
  if (deploy && done > 0) await fireDeployHook();
}
main().catch((e) => { console.error('clear-profile failed:', e?.message ?? e); process.exit(1); });
