export const meta = {
  name: 'qsc-atlas-classify-remaining',
  description: 'Classify QSC candidates for the 25 remaining countries (classify + self-audit in one agent)',
  phases: [
    { title: 'Classify', detail: 'one classify-and-self-audit agent per country, writes data/results/<ISO3>.json' },
  ],
}

const ROOT = '/Users/swannashworth/qsc-atlas'

const SCHEMA = {
  type: 'object',
  required: ['iso3', 'candidates', 'kept', 'included', 'flagged', 'notes'],
  properties: {
    iso3: { type: 'string' },
    candidates: { type: 'number', description: 'number of candidate entries read' },
    kept: { type: 'number', description: 'entries written to the results file' },
    included: { type: 'number', description: 'entries with included=true' },
    flagged: { type: 'number', description: 'entries with included=false (drafts)' },
    notes: { type: 'string', description: 'standout finds, cross-country/EU docs spotted, and whether the harvest is thin (1-3 sentences)' },
  },
}

const prompt = (c) => `You are the classification step of the QSC Atlas scraper pipeline, and you must also self-audit your own output before writing. Country: ${c.name} (ISO3: ${c.iso3}).

Read these files first:
1. ${ROOT}/scraper/SCRAPER_BRIEF.md  (the classification rules - binding)
2. ${ROOT}/data/candidates/${c.iso3}.json  (web-search candidates: title, url, description)
3. ${ROOT}/data/trusted-domains.json  (domains whose documents may be auto-included)

Task: decide which candidates qualify as official quantum-safe-cryptography (QSC/PQC) documents for ${c.name}, then write the qualifying ones as a JSON array to ${ROOT}/data/results/${c.iso3}.json. Write an empty array [] if none qualify (many smaller countries will legitimately yield 0-3 documents; that is a valid finding, not a failure - do NOT pad).

BINDING RULES:
- BOTH inclusion tests must hold: (a) INSTITUTIONAL issuer - a government body, ministry, national cyber agency, regulator, central bank, parliament, or standards organisation; (b) EXPLICIT PQC reference - the document names post-quantum / quantum-safe cryptography, PQC, or migration to quantum-resistant algorithms. Exclude vendors, consultancies, law firms, think tanks, journalism, LinkedIn/Medium/blogs, universities and academic papers.
- The document must belong to ${c.name} ITSELF. The candidate pools for smaller countries are dominated by other countries' documents (NIST/CISA/NSA = USA, NCSC = UK, ANSSI = France, BSI = Germany) and by EU-level documents (europa.eu, ENISA, ETSI, European Commission). Exclude ALL of these here - they belong to other entries. International bodies (G7, UN, OECD, BIS, GSMA, WEF, NATO) belong to no country: exclude. When in doubt about whether a domain is domestic to ${c.name}, it probably is not - drop it.
- country field = "${c.iso3}" exactly.
- tier: T1-T4 by institutional FUNCTION (T1 sets/formalises expectations: agencies, ministries, parliament, regulators; T2 operational translation: operators, banks, vendors-in-programme; T3 independent evaluation/testing/certification; T4 research capacity).
- docType: EXACTLY one of Strategy, Regulation, Guidance, Standard, Roadmap, Report, Advisory, Evaluation, Announcement, Bibliometric.
- year: NEVER invent. Use a year ONLY if it is visibly stated in the candidate's title, description, or URL (e.g. a 4-digit year in the title or a date string in the URL path). Otherwise null.
- included: true ONLY for clearly official government/standards institutions (on the trusted-domains list incl. subdomains, or an unambiguously official national government domain such as a .gov.* / ministry domain). Use false to flag a legitimate-but-uncertain institutional source as a draft for human review. If you are unsure whether something qualifies at all, prefer included:false over dropping it; only drop clearly non-qualifying sources.
- url: copy VERBATIM from the candidates file - never construct, complete, or modify a URL. Deduplicate by URL. Prefer the actual document over a bare index/listing page; keep only the most final/recent of near-duplicate versions.
- title: concise English title (translate if not English); issuingOrg: the institution's short name; summary: 1-2 factual sentences drawn from the candidate's content, no speculation.

SELF-AUDIT before writing (re-check every entry you intend to keep): is the URL verbatim from the candidates file? Is the year actually visible in the source text (else null)? Is the issuer genuinely institutional AND domestic to ${c.name} (else drop or, if EU/international, drop)? Is there an explicit PQC reference (else drop, or included:false with the doubt noted in summary if institutional and plausibly relevant)? Is docType one of the ten allowed values and tier one of T1-T4? Any duplicate URLs? Remove or fix anything that fails.

Object shape per document: {title, country, issuingOrg, year, docType, tier, url, summary, included}. Write valid JSON.

After writing, return the structured stats. In notes: name any standout domestic institutional find, list which other countries / EU the strong candidates actually belonged to (so the orchestrator can confirm routing), and say plainly if the harvest is thin or empty.`

const COUNTRIES = [
  { iso3: 'KOR', name: 'South Korea' }, { iso3: 'CHE', name: 'Switzerland' },
  { iso3: 'ESP', name: 'Spain' }, { iso3: 'POL', name: 'Poland' },
  { iso3: 'SWE', name: 'Sweden' }, { iso3: 'DNK', name: 'Denmark' },
  { iso3: 'FIN', name: 'Finland' }, { iso3: 'IRL', name: 'Ireland' },
  { iso3: 'AUT', name: 'Austria' }, { iso3: 'BEL', name: 'Belgium' },
  { iso3: 'CZE', name: 'Czechia' }, { iso3: 'PRT', name: 'Portugal' },
  { iso3: 'GRC', name: 'Greece' }, { iso3: 'HUN', name: 'Hungary' },
  { iso3: 'ROU', name: 'Romania' }, { iso3: 'BGR', name: 'Bulgaria' },
  { iso3: 'HRV', name: 'Croatia' }, { iso3: 'SVK', name: 'Slovakia' },
  { iso3: 'SVN', name: 'Slovenia' }, { iso3: 'EST', name: 'Estonia' },
  { iso3: 'LVA', name: 'Latvia' }, { iso3: 'LTU', name: 'Lithuania' },
  { iso3: 'LUX', name: 'Luxembourg' }, { iso3: 'CYP', name: 'Cyprus' },
  { iso3: 'MLT', name: 'Malta' },
]

phase('Classify')
const results = await parallel(
  COUNTRIES.map((c) => () =>
    agent(prompt(c), { label: `classify:${c.iso3}`, phase: 'Classify', schema: SCHEMA })
      .then((r) => r ?? { iso3: c.iso3, candidates: 0, kept: 0, included: 0, flagged: 0, notes: 'agent returned null (killed or terminal error)' })
  ),
)
const done = results.filter(Boolean)
log(`Classified ${done.length}/${COUNTRIES.length} remaining countries`)
return done
