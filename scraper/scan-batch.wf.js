export const meta = {
  name: 'qsc-atlas-scan-batch',
  description: 'Firecrawl-free discovery+classify for one batch of priority-3 countries (WebSearch only)',
  phases: [{ title: 'Scan batch' }],
}

const ROOT = '/Users/swannashworth/qsc-atlas'

const SCHEMA = {
  type: 'object',
  required: ['iso3', 'candidates', 'kept', 'included', 'flagged', 'notes', 'documents'],
  properties: {
    iso3: { type: 'string' },
    candidates: { type: 'number' },
    kept: { type: 'number' },
    included: { type: 'number' },
    flagged: { type: 'number' },
    notes: { type: 'string', description: 'standout find, search-locale gap, or empty (1-2 sentences)' },
    documents: {
      type: 'array',
      description: 'the classified kept documents (empty array if none qualify); THIS is the deliverable',
      items: {
        type: 'object',
        required: ['title', 'country', 'issuingOrg', 'year', 'docType', 'tier', 'url', 'summary', 'included'],
        properties: {
          title: { type: 'string' },
          country: { type: 'string' },
          issuingOrg: { type: ['string', 'null'] },
          year: { type: ['number', 'null'] },
          docType: { type: 'string' },
          tier: { type: 'string' },
          url: { type: 'string' },
          summary: { type: 'string' },
          included: { type: 'boolean' },
        },
      },
    },
  },
}

// All 137 remaining priority-3 countries, in batches of ~25. Select with args (batch number 1..6).
const BATCHES = [[{"iso3":"AFG","name":"Afghanistan"},{"iso3":"ALB","name":"Albania"},{"iso3":"DZA","name":"Algeria"},{"iso3":"AND","name":"Andorra"},{"iso3":"AGO","name":"Angola"},{"iso3":"ATG","name":"Antigua and Barbuda"},{"iso3":"ARM","name":"Armenia"},{"iso3":"AZE","name":"Azerbaijan"},{"iso3":"BHS","name":"Bahamas"},{"iso3":"BHR","name":"Bahrain"},{"iso3":"BGD","name":"Bangladesh"},{"iso3":"BRB","name":"Barbados"},{"iso3":"BLR","name":"Belarus"},{"iso3":"BLZ","name":"Belize"},{"iso3":"BEN","name":"Benin"},{"iso3":"BTN","name":"Bhutan"},{"iso3":"BOL","name":"Bolivia"},{"iso3":"BIH","name":"Bosnia and Herzegovina"},{"iso3":"BWA","name":"Botswana"},{"iso3":"BRN","name":"Brunei"},{"iso3":"BFA","name":"Burkina Faso"},{"iso3":"BDI","name":"Burundi"},{"iso3":"KHM","name":"Cambodia"},{"iso3":"CMR","name":"Cameroon"},{"iso3":"CPV","name":"Cape Verde"}],[{"iso3":"CAF","name":"Central African Republic"},{"iso3":"TCD","name":"Chad"},{"iso3":"COM","name":"Comoros"},{"iso3":"CRI","name":"Costa Rica"},{"iso3":"CUB","name":"Cuba"},{"iso3":"DJI","name":"Djibouti"},{"iso3":"DMA","name":"Dominica"},{"iso3":"DOM","name":"Dominican Republic"},{"iso3":"COD","name":"DR Congo"},{"iso3":"ECU","name":"Ecuador"},{"iso3":"EGY","name":"Egypt"},{"iso3":"SLV","name":"El Salvador"},{"iso3":"GNQ","name":"Equatorial Guinea"},{"iso3":"ERI","name":"Eritrea"},{"iso3":"SWZ","name":"Eswatini"},{"iso3":"ETH","name":"Ethiopia"},{"iso3":"FJI","name":"Fiji"},{"iso3":"GAB","name":"Gabon"},{"iso3":"GMB","name":"Gambia"},{"iso3":"GEO","name":"Georgia"},{"iso3":"GHA","name":"Ghana"},{"iso3":"GRD","name":"Grenada"},{"iso3":"GTM","name":"Guatemala"},{"iso3":"GIN","name":"Guinea"},{"iso3":"GNB","name":"Guinea-Bissau"}],[{"iso3":"GUY","name":"Guyana"},{"iso3":"HTI","name":"Haiti"},{"iso3":"HND","name":"Honduras"},{"iso3":"IRN","name":"Iran"},{"iso3":"IRQ","name":"Iraq"},{"iso3":"CIV","name":"Ivory Coast"},{"iso3":"JAM","name":"Jamaica"},{"iso3":"JOR","name":"Jordan"},{"iso3":"KAZ","name":"Kazakhstan"},{"iso3":"KEN","name":"Kenya"},{"iso3":"KIR","name":"Kiribati"},{"iso3":"UNK","name":"Kosovo"},{"iso3":"KWT","name":"Kuwait"},{"iso3":"KGZ","name":"Kyrgyzstan"},{"iso3":"LAO","name":"Laos"},{"iso3":"LBN","name":"Lebanon"},{"iso3":"LSO","name":"Lesotho"},{"iso3":"LBR","name":"Liberia"},{"iso3":"LBY","name":"Libya"},{"iso3":"LIE","name":"Liechtenstein"},{"iso3":"MDG","name":"Madagascar"},{"iso3":"MWI","name":"Malawi"},{"iso3":"MDV","name":"Maldives"},{"iso3":"MLI","name":"Mali"},{"iso3":"MHL","name":"Marshall Islands"}],[{"iso3":"MRT","name":"Mauritania"},{"iso3":"MUS","name":"Mauritius"},{"iso3":"FSM","name":"Micronesia"},{"iso3":"MDA","name":"Moldova"},{"iso3":"MCO","name":"Monaco"},{"iso3":"MNG","name":"Mongolia"},{"iso3":"MNE","name":"Montenegro"},{"iso3":"MAR","name":"Morocco"},{"iso3":"MOZ","name":"Mozambique"},{"iso3":"MMR","name":"Myanmar"},{"iso3":"NAM","name":"Namibia"},{"iso3":"NRU","name":"Nauru"},{"iso3":"NPL","name":"Nepal"},{"iso3":"NIC","name":"Nicaragua"},{"iso3":"NER","name":"Niger"},{"iso3":"NGA","name":"Nigeria"},{"iso3":"PRK","name":"North Korea"},{"iso3":"MKD","name":"North Macedonia"},{"iso3":"OMN","name":"Oman"},{"iso3":"PAK","name":"Pakistan"},{"iso3":"PLW","name":"Palau"},{"iso3":"PAN","name":"Panama"},{"iso3":"PNG","name":"Papua New Guinea"},{"iso3":"PRY","name":"Paraguay"},{"iso3":"PER","name":"Peru"}],[{"iso3":"COG","name":"Republic of the Congo"},{"iso3":"RWA","name":"Rwanda"},{"iso3":"KNA","name":"Saint Kitts and Nevis"},{"iso3":"LCA","name":"Saint Lucia"},{"iso3":"VCT","name":"Saint Vincent and the Grenadines"},{"iso3":"WSM","name":"Samoa"},{"iso3":"SMR","name":"San Marino"},{"iso3":"STP","name":"São Tomé and Príncipe"},{"iso3":"SEN","name":"Senegal"},{"iso3":"SRB","name":"Serbia"},{"iso3":"SYC","name":"Seychelles"},{"iso3":"SLE","name":"Sierra Leone"},{"iso3":"SLB","name":"Solomon Islands"},{"iso3":"SOM","name":"Somalia"},{"iso3":"SSD","name":"South Sudan"},{"iso3":"LKA","name":"Sri Lanka"},{"iso3":"SDN","name":"Sudan"},{"iso3":"SUR","name":"Suriname"},{"iso3":"SYR","name":"Syria"},{"iso3":"TJK","name":"Tajikistan"},{"iso3":"TZA","name":"Tanzania"},{"iso3":"TLS","name":"Timor-Leste"},{"iso3":"TGO","name":"Togo"},{"iso3":"TON","name":"Tonga"},{"iso3":"TTO","name":"Trinidad and Tobago"}],[{"iso3":"TUN","name":"Tunisia"},{"iso3":"TKM","name":"Turkmenistan"},{"iso3":"TUV","name":"Tuvalu"},{"iso3":"UGA","name":"Uganda"},{"iso3":"URY","name":"Uruguay"},{"iso3":"UZB","name":"Uzbekistan"},{"iso3":"VUT","name":"Vanuatu"},{"iso3":"VAT","name":"Vatican City"},{"iso3":"VEN","name":"Venezuela"},{"iso3":"YEM","name":"Yemen"},{"iso3":"ZMB","name":"Zambia"},{"iso3":"ZWE","name":"Zimbabwe"}]]

const prompt = (c) => `Discover and classify official post-quantum-cryptography (PQC) documents for ${c.name} (ISO3: ${c.iso3}) for the QSC Atlas. Today is 2026-06-12. ${c.name} is a smaller / lower-PQC-activity country, so EXPECT few or zero qualifying documents - a clean empty result ([]) is the correct and common outcome; do NOT pad or stretch to find something.

Do NOT use Firecrawl. Use WebSearch (free) for discovery; WebFetch only to disambiguate one borderline source. If WebSearch/WebFetch are not in your tool list, load them via ToolSearch (query "select:WebSearch,WebFetch").

Read (binding): ${ROOT}/scraper/SCRAPER_BRIEF.md and ${ROOT}/data/trusted-domains.json

1. Identify ${c.name}'s national cyber security agency / CERT, national standards body, the ministry handling digital or cryptographic policy, central bank, and the native-language phrase for "post-quantum cryptography" / "quantum-safe cryptography" (if the country is not English-speaking).
2. Run ~6-10 WebSearch queries: generic English + native-language + institution/official-domain-scoped (pass official domains via allowed_domains). Collect the unique candidates.
3. Classify per SCRAPER_BRIEF.md. Keep ONLY documents passing BOTH: (a) issuer is an institution DOMESTIC to ${c.name} (government / ministry / national agency / regulator / central bank / parliament / national standards body) - EXCLUDE vendors, consultancies, journalism, academia/universities, blogs, social media, NGOs, and any other country's / international-body documents; (b) the source EXPLICITLY names post-quantum / quantum-safe cryptography, PQC, or migration to quantum-resistant algorithms - a general "quantum computing" mention or QKD/quantum-key-distribution does NOT count. Fields per kept doc: country="${c.iso3}"; tier T1-T4 by function; docType EXACTLY one of [Strategy, Regulation, Guidance, Standard, Roadmap, Report, Advisory, Evaluation, Announcement, Bibliometric]; year only if visibly stated in title/description/URL else null; url copied VERBATIM; dedupe by URL; included=true only for clearly official government/standards domains (trusted-domains incl. subdomains, or an unambiguous official national government domain), else included=false. Self-audit every kept entry (verbatim url? year visible else null? issuer institutional AND domestic? explicit PQC? docType/tier valid?).

CRITICAL DELIVERABLE: do NOT write any files. Return the kept documents in the "documents" field of your structured output (an empty array [] if none qualify - the usual case for these countries; do NOT pad to find something). Each document object must have exactly: title, country, issuingOrg, year, docType, tier, url, summary, included. Also return the counts and a one-line note. The "documents" array IS the deliverable - the orchestrator persists it; if you skip it the country is lost.`

const batchNum = (() => {
  let a = args
  if (typeof a === 'string') { try { a = JSON.parse(a) } catch { /* keep string */ } }
  let n
  if (typeof a === 'number') n = a
  else if (a && typeof a === 'object' && a.batch != null) n = Number(a.batch)
  else n = parseInt(a)
  return Number.isInteger(n) && n >= 1 && n <= BATCHES.length ? n : 1
})()

// CUSTOM run-list: when non-empty it overrides batch selection (used to run an exact set, e.g. a 30-country cap).
const CUSTOM = [{"iso3":"WSM","name":"Samoa"},{"iso3":"STP","name":"São Tomé and Príncipe"},{"iso3":"SRB","name":"Serbia"},{"iso3":"SYC","name":"Seychelles"},{"iso3":"SSD","name":"South Sudan"},{"iso3":"SUR","name":"Suriname"},{"iso3":"SYR","name":"Syria"},{"iso3":"TJK","name":"Tajikistan"},{"iso3":"TZA","name":"Tanzania"},{"iso3":"TLS","name":"Timor-Leste"},{"iso3":"TGO","name":"Togo"},{"iso3":"TON","name":"Tonga"},{"iso3":"TTO","name":"Trinidad and Tobago"},{"iso3":"TUN","name":"Tunisia"},{"iso3":"TKM","name":"Turkmenistan"},{"iso3":"TUV","name":"Tuvalu"},{"iso3":"UGA","name":"Uganda"},{"iso3":"URY","name":"Uruguay"},{"iso3":"UZB","name":"Uzbekistan"},{"iso3":"VUT","name":"Vanuatu"},{"iso3":"VAT","name":"Vatican City"},{"iso3":"VEN","name":"Venezuela"},{"iso3":"YEM","name":"Yemen"},{"iso3":"ZMB","name":"Zambia"},{"iso3":"ZWE","name":"Zimbabwe"}]

const list = CUSTOM.length ? CUSTOM : BATCHES[batchNum - 1]
const phaseTitle = CUSTOM.length ? ('Custom run (' + list.length + ' countries)') : ('Scan batch ' + batchNum + ' / ' + BATCHES.length + ' (' + list.length + ' countries)')
phase(phaseTitle)
log((CUSTOM.length ? 'Custom run: ' : ('Batch ' + batchNum + ': ')) + list.map((c) => c.iso3).join(' '))

const res = await parallel(
  list.map((c) => () =>
    agent(prompt(c), { label: `scan:${c.iso3}`, phase: phaseTitle, schema: SCHEMA, agentType: 'general-purpose' })
      .then((r) => r ?? { iso3: c.iso3, candidates: 0, kept: 0, included: 0, flagged: 0, notes: 'agent returned null (killed or terminal error) - re-run', documents: null }),
  ),
)
const withDocs = res.filter((r) => r && r.kept > 0).length
log('Batch ' + batchNum + ' done: ' + withDocs + '/' + list.length + ' countries with documents')
return res.filter(Boolean)
