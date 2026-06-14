import { loadEnv } from './lib/env.mjs';
import { notion } from './lib/notion-write.mjs';

// Read-only audit of the live Notion data: distributions and consistency checks
// across ATLAS_COUNTRIES and ATLAS_DOCUMENTS. Usage: node scripts/review-notion.mjs

loadEnv();
const C = process.env.NOTION_DB_COUNTRIES;
const D = process.env.NOTION_DB_DOCUMENTS;

const txt = (p) => {
  const a = p?.rich_text ?? p?.title ?? [];
  return a.map((t) => t.plain_text).join('').trim();
};
const sel = (p) => p?.select?.name ?? '';

async function queryAll(ds) {
  let cursor;
  const rows = [];
  do {
    const r = await notion.dataSources.query({ data_source_id: ds, start_cursor: cursor, page_size: 100 });
    rows.push(...r.results);
    cursor = r.has_more ? r.next_cursor ?? undefined : undefined;
  } while (cursor);
  return rows;
}

const tally = (arr) =>
  Object.entries(
    arr.reduce((m, v) => ((m[v || '(blank)'] = (m[v || '(blank)'] || 0) + 1), m), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');

const countries = await queryAll(C);
const rows = countries.map((row) => ({
  iso3: txt(row.properties['ISO3']),
  name: txt(row.properties['Country']),
  process: sel(row.properties['Dominant Standards Process']),
  secondary: sel(row.properties['Secondary Process']),
  status: sel(row.properties['Data Status']),
  conf: sel(row.properties['Confidence']),
  ver: sel(row.properties['Verification Status']),
  basis: txt(row.properties['Classification Basis']),
}));

const docs = await queryAll(D);
const incByCountry = {};
let included = 0;
for (const d of docs) {
  const on = !!d.properties['Included']?.checkbox;
  if (on) included++;
  const c = txt(d.properties['Country']) || sel(d.properties['Country']);
  if (on && c) incByCountry[c] = (incByCountry[c] || 0) + 1;
}

console.log(`COUNTRIES: ${rows.length} rows`);
console.log(`  Dominant process : ${tally(rows.map((r) => r.process))}`);
console.log(`  Data Status      : ${tally(rows.map((r) => r.status))}`);
console.log(`  Confidence       : ${tally(rows.map((r) => r.conf))}`);
console.log(`  Verification     : ${tally(rows.map((r) => r.ver))}`);

const coloured = rows.filter((r) => r.process);
console.log(`\nColoured (process set): ${coloured.length}`);
console.log(`  Two-label: ${coloured.filter((r) => r.secondary).map((r) => `${r.iso3} ${r.process}+${r.secondary}`).join(', ') || 'none'}`);

const EU = ['AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX','MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE'];
console.log('\n--- CONSISTENCY CHECKS ---');
console.log(`coloured w/o Classification Basis : ${coloured.filter((r) => !r.basis).map((r) => r.iso3).join(', ') || 'none'}`);
console.log(`coloured w/o Confidence           : ${coloured.filter((r) => !r.conf).map((r) => r.iso3).join(', ') || 'none'}`);
console.log(`coloured but Data Status not set  : ${coloured.filter((r) => r.status !== 'Partial' && r.status !== 'Complete').map((r) => `${r.iso3}(${r.status || 'blank'})`).join(', ') || 'none'}`);
console.log(`coloured but 0 Included docs      : ${coloured.filter((r) => !incByCountry[r.iso3]).map((r) => r.iso3).join(', ') || 'none'}`);
console.log(`EU member not classified EU       : ${rows.filter((r) => EU.includes(r.iso3) && r.process !== 'EU').map((r) => `${r.iso3}(${r.process || 'blank'})`).join(', ') || 'none'}`);
console.log(`Data Status=Partial but 0 docs    : ${rows.filter((r) => r.status === 'Partial' && !incByCountry[r.iso3]).map((r) => r.iso3).join(', ') || 'none'}`);

console.log('\n--- COLOURED COUNTRIES ---');
for (const r of coloured.sort((a, b) => a.process.localeCompare(b.process) || a.iso3.localeCompare(b.iso3)))
  console.log(`  ${r.iso3}  ${(r.name || '').padEnd(22)} ${(r.process + (r.secondary ? '+' + r.secondary : '')).padEnd(16)} conf=${(r.conf || '-').padEnd(7)} ver=${r.ver || '-'}  docs=${incByCountry[r.iso3] || 0}`);

console.log(`\nDOCUMENTS: ${docs.length} rows, ${included} Included`);
