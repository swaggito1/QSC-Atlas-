export const meta = {
  name: 'qsc-atlas-scan-region',
  description: 'Firecrawl-free discovery+classify for priority 1&2 countries, by region (WebSearch only)',
  phases: [
    { title: 'A. Asia-Pacific' },
    { title: 'B. Middle East & Africa' },
    { title: 'C. Europe (non-EU) & Eurasia' },
    { title: 'D. Latin America' },
  ],
}

const ROOT = '/Users/swannashworth/qsc-atlas'

const SCHEMA = {
  type: 'object',
  required: ['iso3', 'candidates', 'kept', 'included', 'flagged', 'notes'],
  properties: {
    iso3: { type: 'string' },
    candidates: { type: 'number' },
    kept: { type: 'number' },
    included: { type: 'number' },
    flagged: { type: 'number' },
    notes: { type: 'string', description: 'standout finds, search-locale limits, docs belonging to other countries, thin/empty (1-3 sentences)' },
  },
}

const prompt = (c) => `You are gathering and classifying official post-quantum-cryptography (PQC) documents for ${c.name} (ISO3: ${c.iso3}) for the QSC Atlas. Today's date is 2026-06-12.

CRITICAL: Do NOT use Firecrawl or scripts/scrape-country.mjs. Use the WebSearch tool for discovery (it is free) and WebFetch only to disambiguate a borderline source. If WebSearch/WebFetch are not in your tool list, load them first via ToolSearch (query "select:WebSearch,WebFetch").

Read first (binding): ${ROOT}/scraper/SCRAPER_BRIEF.md and ${ROOT}/data/trusted-domains.json

Institution hints for ${c.name} (verify and expand - not exhaustive): ${c.hints}

STEP 1 - confirm the institutions: national cyber security agency, national standards body, the ministry/agency leading digital or cryptographic policy, central bank, parliament, and the native-language phrase(s) for "post-quantum cryptography" / "quantum-safe cryptography".

STEP 2 - search with WebSearch (~8-14 queries). Combine: (i) generic English queries; (ii) NATIVE-LANGUAGE queries using the term(s) from step 1 - this is often DECISIVE for non-English countries; (iii) institution-scoped queries: pass the official domains via WebSearch's allowed_domains parameter, or put site: in the query. Collect every UNIQUE candidate (title, url, snippet/description). Write the raw unique candidates as a JSON array [{title,url,description}] to ${ROOT}/data/candidates/${c.iso3}.json

STEP 3 - classify per SCRAPER_BRIEF.md. Keep only candidates passing BOTH tests: (a) INSTITUTIONAL issuer DOMESTIC to ${c.name} - government body, ministry, national agency, regulator, central bank, parliament, or standards organisation. EXCLUDE vendors, consultancies, law firms, think tanks, universities, journalism, blogs, social media, and any other country's / EU / international-body documents (NIST, CISA, NSA, NCSC-UK, ENISA, ETSI, ISO, ITU, GSMA, G7, etc. - drop them, they belong to other entries). (b) EXPLICIT PQC reference - names post-quantum / quantum-safe cryptography, PQC, or migration to quantum-resistant algorithms. A general cyber/quantum doc with no PQC mention does NOT qualify.
Fields per kept doc: country="${c.iso3}"; tier T1-T4 by institutional function; docType EXACTLY one of Strategy, Regulation, Guidance, Standard, Roadmap, Report, Advisory, Evaluation, Announcement, Bibliometric; year NEVER invented (only if visibly in title/description/URL, else null); url copied VERBATIM from the search result; dedupe by URL; prefer the actual document over index/listing pages; included=true ONLY for clearly official government/standards institutions (on trusted-domains incl. subdomains, or an unambiguous official national government domain), else included=false (draft for human review); if a source might not qualify at all prefer included=false over dropping; drop only clearly non-qualifying sources. title=concise English (translate if needed); issuingOrg=short name; summary=1-2 factual sentences drawn from the source.
SELF-AUDIT every kept entry before writing: url verbatim? year actually visible (else null)? issuer institutional AND domestic to ${c.name}? explicit PQC? docType one of the ten and tier T1-T4? no duplicate URLs? Remove/fix anything that fails.
Write the kept array to ${ROOT}/data/results/${c.iso3}.json (write [] if none qualify - a zero-document finding is valid; do NOT pad).

NOTE on search locale: US-locale WebSearch may under-return for China, Russia, Arabic-script, and some Asian-script countries. Lean hard on native-language terms and official-domain scoping (allowed_domains), and state in your report if the harvest is likely incomplete due to search-locale limits (so a human can do a targeted follow-up).

Return concise stats (candidates/kept/included/flagged), the standout domestic finds with issuers, whether the harvest is thin/empty, any likely search-locale gaps, and any strong candidates that belonged to OTHER countries (for routing).`

const REGIONS = {
  'A. Asia-Pacific': [
    { iso3: 'CHN', name: 'China', hints: 'OSCCA / 国家密码管理局 (oscca.gov.cn), TC260 全国网络安全标准化技术委员会 (standards), CAICT, MIIT, PBoC. Native: 后量子密码 / 抗量子密码 / 后量子密码学.' },
    { iso3: 'IND', name: 'India', hints: 'CERT-In (cert-in.org.in), MeitY (meity.gov.in), NCIIPC (nciipc.gov.in), TEC (tec.gov.in), DRDO, RBI, National Quantum Mission (dst.gov.in). English.' },
    { iso3: 'IDN', name: 'Indonesia', hints: 'BSSN - Badan Siber dan Sandi Negara (bssn.go.id), Kementerian Komdigi/Kominfo. Native: kriptografi pascakuantum / kriptografi pasca-kuantum.' },
    { iso3: 'MYS', name: 'Malaysia', hints: 'NACSA (nacsa.gov.my), CyberSecurity Malaysia (cybersecurity.my), MyDIGITAL, MCMC. Native: kriptografi pasca-kuantum.' },
    { iso3: 'PHL', name: 'Philippines', hints: 'DICT (dict.gov.ph), National Privacy Commission, CICC, Bangko Sentral ng Pilipinas. English.' },
    { iso3: 'THA', name: 'Thailand', hints: 'NCSA (ncsa.or.th), ETDA (etda.or.th), NBTC, Bank of Thailand. Native: การเข้ารหัสหลังควอนตัม / การเข้ารหัสแบบหลังควอนตัม.' },
    { iso3: 'VNM', name: 'Vietnam', hints: 'Cuc An toan thong tin / NCSC Vietnam (mic.gov.vn, khonggianmang.vn), Ban Co yeu Chinh phu / Government Cipher Committee (bcy.gov.vn). Native: mat ma hau luong tu.' },
  ],
  'B. Middle East & Africa': [
    { iso3: 'ISR', name: 'Israel', hints: 'INCD - Israel National Cyber Directorate (gov.il), Standards Institution of Israel (SII), Bank of Israel. Native (Hebrew): קריפטוגרפיה פוסט-קוונטית / הצפנה פוסט-קוונטית.' },
    { iso3: 'SAU', name: 'Saudi Arabia', hints: 'NCA - National Cybersecurity Authority (nca.gov.sa), SDAIA, CST/CITC, SASO (standards), SAMA (central bank). Native (Arabic): التشفير ما بعد الكم / تشفير ما بعد الكم.' },
    { iso3: 'ARE', name: 'United Arab Emirates', hints: 'UAE Cybersecurity Council (gov.ae), TDRA (tdra.gov.ae), DESC - Dubai Electronic Security Center (desc.gov.ae), Central Bank of the UAE. Native (Arabic): التشفير ما بعد الكم.' },
    { iso3: 'QAT', name: 'Qatar', hints: 'NCSA Qatar - National Cyber Security Agency (ncsa.gov.qa), MCIT (mcit.gov.qa), Qatar Central Bank. Native (Arabic): التشفير ما بعد الكم.' },
    { iso3: 'ZAF', name: 'South Africa', hints: 'SITA, CSIR, State Security Agency / cyber security hub, SABS (standards), South African Reserve Bank (resbank.co.za). English.' },
  ],
  'C. Europe (non-EU) & Eurasia': [
    { iso3: 'NATO', name: 'NATO', hints: 'SUPRANATURAL entity (like the EU). Treat NATO bodies as the institutional issuer: NATO HQ (nato.int), NCI Agency (ncia.nato.int), NATO Cyber Security Centre (NCSC). PQC / quantum-safe transition guidance and communiques.' },
    { iso3: 'TUR', name: 'Turkey', hints: 'TUBITAK BILGEM / UEKAE (bilgem.tubitak.gov.tr), USOM, BTK, TSE (standards), CBRT. Native: kuantum sonrasi kriptografi / post-kuantum kriptografi.' },
    { iso3: 'UKR', name: 'Ukraine', hints: 'SSSCIP / Derzhspetszviazok - State Service of Special Communications (cip.gov.ua), CERT-UA. Native: постквантова криптографія.' },
    { iso3: 'RUS', name: 'Russia', hints: 'FSB, FSTEC (fstec.ru), TC26 - Technical Committee for Standardization Cryptographic Protection (tc26.ru), Rosstandart, Bank of Russia (cbr.ru). Native: постквантовая криптография. Note: distinct GOST crypto ecosystem.' },
    { iso3: 'ISL', name: 'Iceland', hints: 'CERT-IS (cert.is), Fjarskiptastofa - Electronic Communications Office, Central Bank of Iceland. Native: skammtaorugg dulritun. Small country - may be empty.' },
  ],
  'D. Latin America': [
    { iso3: 'BRA', name: 'Brazil', hints: 'GSI/PR - Gabinete de Seguranca Institucional (gov.br/gsi), ITI - ICP-Brasil (gov.br/iti), CTIR Gov, ABNT (standards), Banco Central do Brasil (bcb.gov.br). Native (Portuguese): criptografia pos-quantica.' },
    { iso3: 'MEX', name: 'Mexico', hints: 'Guardia Nacional / CERT-MX, Banco de Mexico (banxico.org.mx), Secretaria de Seguridad. Native (Spanish): criptografia poscuantica / criptografia pos-cuantica. Weak national cyber agency - may be thin.' },
    { iso3: 'ARG', name: 'Argentina', hints: 'Direccion Nacional de Ciberseguridad (argentina.gob.ar), ARSAT, BCRA. Native (Spanish): criptografia poscuantica.' },
    { iso3: 'CHL', name: 'Chile', hints: 'CSIRT Chile (csirt.gob.cl), ANCI - new National Cybersecurity Agency, Banco Central de Chile. Native (Spanish): criptografia poscuantica.' },
    { iso3: 'COL', name: 'Colombia', hints: 'MinTIC (mintic.gov.co), ColCERT, CCOC, Banco de la Republica. Native (Spanish): criptografia poscuantica.' },
  ],
}

const out = []
for (const [region, list] of Object.entries(REGIONS)) {
  phase(region)
  const res = await parallel(
    list.map((c) => () =>
      agent(prompt(c), { label: `scan:${c.iso3}`, phase: region, schema: SCHEMA, agentType: 'general-purpose' })
        .then((r) => r ?? { iso3: c.iso3, candidates: 0, kept: 0, included: 0, flagged: 0, notes: 'agent returned null (killed or terminal error)' }),
    ),
  )
  out.push(...res)
  log(`${region}: ${res.filter((r) => r && r.kept > 0).length}/${list.length} countries with documents`)
}
return out.filter(Boolean)
