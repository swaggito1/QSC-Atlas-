import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadEnv } from './lib/env.mjs';
import { notion, getSchema } from './lib/notion-write.mjs';
import { fireDeployHook } from './lib/deploy-hook.mjs';

// Apply the Fable-5 verification verdicts in data/verify/<ISO3>.json to the local
// results files and to the existing ATLAS_DOCUMENTS rows (matched by URL).
// Verdicts: confirm/publish -> Included=true; draft/drop -> Included=false;
// fix -> apply correctedFields (+ Included=true unless correctedFields says otherwise).
// Usage: node scripts/apply-verdicts.mjs [ISO3 ...]   (default: all verify files)

loadEnv();
const DOCUMENTS_DS = process.env.NOTION_DB_DOCUMENTS;
const findByType = (props, type) => {
  for (const [n, d] of Object.entries(props)) if (d.type === type) return n;
  return null;
};

async function main() {
  const resultsDir = join(ROOT, 'data', 'results');
  const verifyDir = join(ROOT, 'data', 'verify');
  const isoArgs = process.argv.slice(2).map((s) => s.toUpperCase()).filter(Boolean);
  const verifyFiles = readdirSync(verifyDir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => isoArgs.length === 0 || isoArgs.includes(f.replace('.json', '')));

  const tally = { confirm: 0, publish: 0, draft: 0, drop: 0, fix: 0, unknown: 0 };
  const urlActions = new Map(); // url -> { included, fields }

  for (const vf of verifyFiles) {
    const iso = vf.replace('.json', '');
    let verdicts;
    try { verdicts = JSON.parse(readFileSync(join(verifyDir, vf), 'utf8')); } catch { continue; }
    if (!Array.isArray(verdicts)) continue;
    const rp = join(resultsDir, iso + '.json');
    if (!existsSync(rp)) continue;
    const docs = JSON.parse(readFileSync(rp, 'utf8'));
    const byUrl = new Map(docs.map((d) => [(d.url || '').trim(), d]));

    for (const v of verdicts) {
      const url = (v.url || '').trim();
      if (!url) continue;
      const doc = byUrl.get(url);
      if (!doc) continue;
      const cf = v.correctedFields || {};
      let included;
      switch (v.verdict) {
        case 'confirm': case 'publish': included = true; break;
        case 'draft': case 'drop': included = false; break;
        case 'fix': included = cf.included !== undefined ? cf.included : true; break;
        default: tally.unknown++; continue;
      }
      tally[v.verdict] = (tally[v.verdict] || 0) + 1;
      for (const [k, val] of Object.entries(cf)) if (k !== 'included') doc[k] = val;
      doc.included = included;
      const fields = { included };
      for (const [k, val] of Object.entries(cf)) if (k !== 'included') fields[k] = val;
      urlActions.set(url, { included, fields });
    }
    writeFileSync(rp, JSON.stringify(docs, null, 2) + '\n');
  }
  console.log('verdicts applied to local results:', JSON.stringify(tally));
  if (urlActions.size === 0) { console.log('no Notion updates needed.'); return; }

  const props = await getSchema(DOCUMENTS_DS);
  const urlName = findByType(props, 'url');
  const pageByUrl = new Map();
  let cursor;
  do {
    const res = await notion.dataSources.query({ data_source_id: DOCUMENTS_DS, start_cursor: cursor, page_size: 100 });
    for (const page of res.results) {
      const u = urlName && page.properties?.[urlName]?.url;
      if (u) pageByUrl.set(u.trim(), page);
    }
    cursor = res.has_more ? res.next_cursor ?? undefined : undefined;
  } while (cursor);

  let updated = 0, missing = 0;
  for (const [url, action] of urlActions) {
    const page = pageByUrl.get(url);
    if (!page) { missing++; continue; }
    const cf = action.fields;
    const payload = { Included: { checkbox: !!action.included } };
    if (cf.year !== undefined) payload['Year'] = cf.year === null ? { number: null } : (Number.isFinite(Number(cf.year)) ? { number: Number(cf.year) } : { number: null });
    if (cf.tier) payload['Tier'] = { select: { name: String(cf.tier) } };
    if (cf.docType) payload['Document Type'] = { select: { name: String(cf.docType) } };
    if (cf.issuingOrg) payload['Issuing Organisation'] = { rich_text: [{ text: { content: String(cf.issuingOrg).slice(0, 2000) } }] };
    if (cf.title) payload['Title'] = { title: [{ text: { content: String(cf.title).slice(0, 2000) } }] };
    if (cf.summary) payload['Summary'] = { rich_text: [{ text: { content: String(cf.summary).slice(0, 2000) } }] };
    await notion.pages.update({ page_id: page.id, properties: payload });
    updated++;
  }
  console.log(`notion: updated ${updated}, missing ${missing} (urls not found).`);
  if (updated > 0) await fireDeployHook();
}

main().catch((e) => { console.error('apply failed:', e?.message ?? e); process.exit(1); });
