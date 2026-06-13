export const meta = {
  name: 'qsc-atlas-verify-site',
  description: 'Independent Fable-5 verification of every live+draft document on the QSC Atlas against its source',
  phases: [
    { title: '1. Core & high-volume', model: 'fable' },
    { title: '2. Europe & North America', model: 'fable' },
    { title: '3. Smaller Europe & Mideast', model: 'fable' },
    { title: '4. Rest of world', model: 'fable' },
  ],
}

const ROOT = '/Users/swannashworth/qsc-atlas'

const SCHEMA = {
  type: 'object',
  required: ['iso3', 'total', 'confirm', 'publish', 'draft', 'drop', 'fix', 'problems'],
  properties: {
    iso3: { type: 'string' },
    total: { type: 'number' },
    confirm: { type: 'number' },
    publish: { type: 'number' },
    draft: { type: 'number' },
    drop: { type: 'number' },
    fix: { type: 'number' },
    problems: { type: 'string', description: 'the most important problems caught (wrong-country, invented year, non-institutional, dead link), or "none"' },
  },
}

const prompt = (iso3, name) => `You are an INDEPENDENT, adversarial verifier for the QSC Atlas. A different agent classified ${name} (${iso3})'s post-quantum-cryptography (PQC) documents; assume it may have made mistakes and your job is to catch them by checking every claim against the actual source. Today is 2026-06-12.

Read: ${ROOT}/data/results/${iso3}.json (the documents to verify), ${ROOT}/scraper/SCRAPER_BRIEF.md (the binding rules), and ${ROOT}/data/trusted-domains.json.

If WebFetch / WebSearch are not in your tool list, load them first via ToolSearch (query "select:WebFetch,WebSearch").

For EACH document in the results file, verify it against its source URL with WebFetch (use WebSearch to corroborate when WebFetch fails). Check:
1. RESOLVES: does the URL load real, on-topic content (not 404 / parking / login wall / unrelated page)? If WebFetch returns 403 / TLS / timeout (common for government sites that block bots), do NOT conclude it is dead - run a WebSearch on the title + issuer to corroborate it exists; only treat as dead if positively gone or the URL clearly resolves to something else.
2. ISSUER: who actually published it, and is that issuer BOTH (a) governmental / national agency / regulator / ministry / national standards body / parliament / central bank, AND (b) domestic to ${name}? Vendors, consultancies, law firms, think tanks, universities, journalism, blogs, social media, industry associations, research consortia, state-owned commercial enterprises, and other countries' / EU / international bodies (NIST, CISA, NCSC-UK, ENISA, ETSI, GSMA, G7, BIS) do NOT count as domestic government/standards bodies.
3. PQC: does the source EXPLICITLY reference post-quantum / quantum-safe cryptography, PQC, or migration to quantum-resistant algorithms? Quote the exact phrase. A document that only mentions "quantum computing" generally, or only QKD/quantum key distribution, does NOT pass.
4. YEAR: is the claimed year actually stated in the source (or correctly null)? Flag invented years.
5. FIELDS: country must equal "${iso3}"; docType must be one of [Strategy, Regulation, Guidance, Standard, Roadmap, Report, Advisory, Evaluation, Announcement, Bibliometric]; tier T1-T4 plausible for the issuer's function; summary accurate and not overclaiming.

Assign ONE verdict per document:
- "confirm" - accurate; official domestic government/agency/standards/parliament/central-bank issuer AND explicit PQC AND resolves. (Stays live.)
- "publish" - same standard as confirm (accurate, official, PQC-explicit, resolves) BUT the document is currently included=false; it should be promoted to live. Use this when the only reason it was a draft is that its official domain was not yet on the trusted list.
- "draft" - legitimate but borderline; keep hidden (included=false). Use for state-owned enterprises, vendors-in-programme, research institutes, consortia, or where issuer-officialness or PQC-explicitness is plausible but you could not confirm it.
- "drop" - the claim is WRONG: dead/404 with no corroboration, OR not domestic to ${name}, OR no explicit PQC reference in the source, OR issuer is non-institutional (vendor / journalism / academic / think-tank / industry association / international body). (Remove from the site.)
- "fix" - accurate and should be live or stay as classified, but a FIELD is wrong (invented year, wrong tier / docType / issuingOrg / title / country). Provide corrected fields.

Write a JSON array to ${ROOT}/data/verify/${iso3}.json with one object per document, in the same order as the results file:
  {"url": "...", "currentIncluded": true|false, "verdict": "confirm|publish|draft|drop|fix", "correctedFields": {<only changed fields>} or null, "reason": "one sentence", "evidence": "the exact PQC phrase quoted from the source, or the corroborating fact"}
EVERY document in the results file must appear EXACTLY once. Do not invent URLs; copy them verbatim from the results file.

Return the structured stats (counts per verdict) and, in problems, the most serious issues you caught (wrong-country attribution, invented year, non-institutional issuer, dead link) or "none".`

const PHASES = {
  '1. Core & high-volume': ['USA', 'EUU', 'JPN', 'FRA', 'DEU', 'GBR', 'NATO', 'ARE', 'IND', 'NLD', 'SGP', 'AUS', 'CHE', 'KOR'],
  '2. Europe & North America': ['CAN', 'ITA', 'ESP', 'BEL', 'SWE', 'DNK', 'POL', 'CZE', 'PRT', 'HUN', 'ROU', 'GRC', 'FIN'],
  '3. Smaller Europe & Mideast': ['IRL', 'LUX', 'LTU', 'LVA', 'EST', 'SVN', 'HRV', 'CYP', 'NOR', 'NZL', 'ISR', 'SAU'],
  '4. Rest of world': ['CHN', 'IDN', 'MYS', 'THA', 'VNM', 'TUR', 'UKR', 'RUS', 'BRA', 'CHL', 'ARG'],
}

const NAMES = {
  USA: 'United States', EUU: 'the European Union', JPN: 'Japan', FRA: 'France', DEU: 'Germany', GBR: 'the United Kingdom',
  NATO: 'NATO', ARE: 'the United Arab Emirates', IND: 'India', NLD: 'the Netherlands', SGP: 'Singapore', AUS: 'Australia',
  CHE: 'Switzerland', KOR: 'South Korea', CAN: 'Canada', ITA: 'Italy', ESP: 'Spain', BEL: 'Belgium', SWE: 'Sweden',
  DNK: 'Denmark', POL: 'Poland', CZE: 'Czechia', PRT: 'Portugal', HUN: 'Hungary', ROU: 'Romania', GRC: 'Greece',
  FIN: 'Finland', IRL: 'Ireland', LUX: 'Luxembourg', LTU: 'Lithuania', LVA: 'Latvia', EST: 'Estonia', SVN: 'Slovenia',
  HRV: 'Croatia', CYP: 'Cyprus', NOR: 'Norway', NZL: 'New Zealand', ISR: 'Israel', SAU: 'Saudi Arabia', CHN: 'China',
  IDN: 'Indonesia', MYS: 'Malaysia', THA: 'Thailand', VNM: 'Vietnam', TUR: 'Turkey', UKR: 'Ukraine', RUS: 'Russia',
  BRA: 'Brazil', CHL: 'Chile', ARG: 'Argentina',
}

const out = []
for (const [title, list] of Object.entries(PHASES)) {
  phase(title)
  const res = await parallel(
    list.map((iso3) => () =>
      agent(prompt(iso3, NAMES[iso3] ?? iso3), { label: `verify:${iso3}`, phase: title, schema: SCHEMA, model: 'fable', agentType: 'general-purpose' })
        .then((r) => r ?? { iso3, total: 0, confirm: 0, publish: 0, draft: 0, drop: 0, fix: 0, problems: 'agent returned null (killed or terminal error) - re-run this country' }),
    ),
  )
  out.push(...res)
  const drops = res.filter(Boolean).reduce((a, r) => a + (r.drop || 0), 0)
  const fixes = res.filter(Boolean).reduce((a, r) => a + (r.fix || 0), 0)
  const pubs = res.filter(Boolean).reduce((a, r) => a + (r.publish || 0), 0)
  log(`${title}: ${res.length} countries verified - ${drops} drop, ${fixes} fix, ${pubs} publish proposed`)
}
return out.filter(Boolean)
