export const meta = {
  name: 'qsc-atlas-delta-scan',
  description: 'Freshness/delta re-scan: find PQC docs published since last update, not already in the corpus',
  phases: [{ title: 'Delta scan' }],
}

const ROOT = '/Users/swannashworth/qsc-atlas'

const SCHEMA = {
  type: 'object',
  required: ['iso3', 'existingCount', 'newFound', 'newIncluded', 'documents', 'changeNote', 'upToDate'],
  properties: {
    iso3: { type: 'string' },
    existingCount: { type: 'number', description: 'documents already in the corpus for this country' },
    newFound: { type: 'number', description: 'qualifying documents found that are NOT already in the corpus' },
    newIncluded: { type: 'number' },
    documents: {
      type: 'array',
      description: 'ONLY the NEW documents (url not already in the corpus); empty if nothing new',
      items: {
        type: 'object',
        required: ['title', 'country', 'issuingOrg', 'year', 'docType', 'tier', 'url', 'summary', 'included'],
        properties: {
          title: { type: 'string' }, country: { type: 'string' },
          issuingOrg: { type: ['string', 'null'] }, year: { type: ['number', 'null'] },
          docType: { type: 'string' }, tier: { type: 'string' },
          url: { type: 'string' }, summary: { type: 'string' }, included: { type: 'boolean' },
        },
      },
    },
    changeNote: { type: 'string', description: 'note if an EXISTING corpus doc looks superseded/updated (new edition, draft->adopted, changed deadline), else "none"' },
    upToDate: { type: 'boolean', description: 'true if no new docs and no material change' },
  },
}

const BATCHES = [
[{"iso3":"USA","name":"United States"},{"iso3":"EUU","name":"European Union"},{"iso3":"FRA","name":"France"},{"iso3":"JPN","name":"Japan"},{"iso3":"DEU","name":"Germany"},{"iso3":"GBR","name":"United Kingdom"},{"iso3":"SGP","name":"Singapore"},{"iso3":"AUS","name":"Australia"},{"iso3":"NLD","name":"Netherlands"},{"iso3":"CHE","name":"Switzerland"},{"iso3":"NOR","name":"Norway"},{"iso3":"NATO","name":"NATO"},{"iso3":"KOR","name":"South Korea"},{"iso3":"BRA","name":"Brazil"},{"iso3":"ARE","name":"United Arab Emirates"},{"iso3":"CAN","name":"Canada"},{"iso3":"ESP","name":"Spain"},{"iso3":"ITA","name":"Italy"},{"iso3":"BEL","name":"Belgium"},{"iso3":"IND","name":"India"},{"iso3":"SWE","name":"Sweden"},{"iso3":"VNM","name":"Vietnam"},{"iso3":"DNK","name":"Denmark"},{"iso3":"LTU","name":"Lithuania"},{"iso3":"SAU","name":"Saudi Arabia"},{"iso3":"CZE","name":"Czechia"},{"iso3":"POL","name":"Poland"}],
[{"iso3":"CHN","name":"China"},{"iso3":"HUN","name":"Hungary"},{"iso3":"IDN","name":"Indonesia"},{"iso3":"MYS","name":"Malaysia"},{"iso3":"PRT","name":"Portugal"},{"iso3":"ROU","name":"Romania"},{"iso3":"THA","name":"Thailand"},{"iso3":"FIN","name":"Finland"},{"iso3":"GRC","name":"Greece"},{"iso3":"LUX","name":"Luxembourg"},{"iso3":"SVN","name":"Slovenia"},{"iso3":"ARG","name":"Argentina"},{"iso3":"CHL","name":"Chile"},{"iso3":"IRL","name":"Ireland"},{"iso3":"ISR","name":"Israel"},{"iso3":"LVA","name":"Latvia"},{"iso3":"NZL","name":"New Zealand"},{"iso3":"RUS","name":"Russia"},{"iso3":"TUR","name":"Türkiye"},{"iso3":"UKR","name":"Ukraine"},{"iso3":"BHR","name":"Bahrain"},{"iso3":"BRN","name":"Brunei"},{"iso3":"CYP","name":"Cyprus"},{"iso3":"DJI","name":"Djibouti"},{"iso3":"EST","name":"Estonia"},{"iso3":"GUY","name":"Guyana"},{"iso3":"HRV","name":"Croatia"}],
]

const prompt = (c) => `You are running a FRESHNESS / DELTA update for the QSC Atlas for ${c.name} (ISO3: ${c.iso3}). The corpus was last updated around 2026-06-22; find official PQC documents that are NEW since then and are NOT already stored.

Do NOT use Firecrawl. Use WebSearch (free) for discovery; WebFetch only to disambiguate a borderline source. If WebSearch/WebFetch are not in your tool list, load them via ToolSearch (query "select:WebSearch,WebFetch").

READ FIRST: ${ROOT}/data/results/${c.iso3}.json — the EXISTING corpus. Note every object's "url"; these are already stored and must NOT be returned again. Also read ${ROOT}/scraper/SCRAPER_BRIEF.md (binding rules) and ${ROOT}/data/trusted-domains.json.

SEARCH (WebSearch, ~6-12 queries): the country's national cyber agency, standards body, ministry, central bank, and parliament, in English AND the native language, for post-quantum / quantum-safe cryptography material. PRIORITISE the most recent items (2025-2026, and anything dated after mid-2025). Use institution-scoped queries via allowed_domains.

RETURN ONLY documents that (a) pass the brief's tests - institutional issuer DOMESTIC to ${c.name} + EXPLICIT post-quantum/quantum-safe cryptography reference (exclude vendors, journalism, academia, other countries'/EU/international-body docs) - AND (b) whose URL is NOT already in the corpus you read. Fields per new doc: title, country="${c.iso3}", issuingOrg, year (only if visibly stated, else null), docType (one of Strategy, Regulation, Guidance, Standard, Roadmap, Report, Advisory, Evaluation, Announcement, Bibliometric), tier (T1-T4), url (VERBATIM), summary (1-2 sentences), included (true only for clearly official government/standards domains, else false). Dedupe by URL.

If there is nothing new, return an EMPTY documents array and upToDate=true - that is the EXPECTED outcome for a recently-updated corpus. Do NOT re-list existing documents and do NOT pad.

ANALYSIS CHANGE CHECK: if an EXISTING corpus document looks SUPERSEDED or materially changed (a new edition published, a draft now adopted, a migration deadline changed, a new national strategy that shifts the country's posture), describe it in changeNote so the country's analysis can be refreshed; otherwise changeNote="none".

Return the structured stats, the documents array (NEW only), changeNote, and upToDate.`

const batchNum = (() => {
  let a = args
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { /* keep */ } }
  const n = typeof a === 'number' ? a : parseInt(a)
  return Number.isInteger(n) && n >= 1 && n <= BATCHES.length ? n : 1
})()

// CUSTOM run-list: when non-empty it overrides batch selection (e.g. re-running the countries a session limit killed).
const CUSTOM = [{"iso3":"CHL","name":"Chile"},{"iso3":"IRL","name":"Ireland"},{"iso3":"ISR","name":"Israel"},{"iso3":"LVA","name":"Latvia"},{"iso3":"NZL","name":"New Zealand"},{"iso3":"RUS","name":"Russia"},{"iso3":"TUR","name":"Türkiye"},{"iso3":"UKR","name":"Ukraine"},{"iso3":"BHR","name":"Bahrain"},{"iso3":"BRN","name":"Brunei"},{"iso3":"CYP","name":"Cyprus"},{"iso3":"DJI","name":"Djibouti"},{"iso3":"EST","name":"Estonia"},{"iso3":"GUY","name":"Guyana"},{"iso3":"HRV","name":"Croatia"}]

const list = CUSTOM.length ? CUSTOM : BATCHES[batchNum - 1]
const title = CUSTOM.length ? ('Delta re-run (' + list.length + ' countries)') : ('Delta batch ' + batchNum + '/' + BATCHES.length + ' (' + list.length + ' countries)')
phase(title)
log(title + ': ' + list.map((c) => c.iso3).join(' '))

const res = await parallel(
  list.map((c) => () =>
    agent(prompt(c), { label: `delta:${c.iso3}`, phase: title, schema: SCHEMA, agentType: 'general-purpose' })
      .then((r) => r ?? { iso3: c.iso3, existingCount: 0, newFound: 0, newIncluded: 0, documents: null, changeNote: 'none', upToDate: false }),
  ),
)
const changed = res.filter((r) => r && Array.isArray(r.documents) && r.documents.length > 0)
const notes = res.filter((r) => r && r.changeNote && r.changeNote !== 'none')
log('Delta batch ' + batchNum + ': ' + changed.length + ' countries with NEW docs; ' + notes.length + ' change-notes')
return res.filter(Boolean)
