# Context 05: sources and endpoints

Every external source the lab tools read, how to reach it, what the terms allow, and whether its address has been confirmed. "Confirmed" means the address was seen working in a search or fetch on 30 September 2026. "To confirm" means it is the expected address and the first run of prompt 00 must check it and correct `labs/config/watchlist.yaml` if it is wrong. Never invent a replacement address: search for it, and if it cannot be found, leave the entry disabled and report it.

## EU law: CELLAR and EUR-Lex (Rulebook, Exposure Clock)

The Publications Office's CELLAR repository stores the content and RDF metadata of everything on EUR-Lex and offers a public SPARQL endpoint for reuse: `http://publications.europa.eu/webapi/rdf/sparql` (confirmed). It accepts SPARQL 1.1 over GET or POST; set `Accept: application/sparql-results+json` for JSON. Metadata follows the Common Data Model (CDM) ontology. The `eurlex` R package by Michal Ovádek shows working query patterns for acts, dates, amendments and national transposition measures (`https://michalovadek.github.io/eurlex/`, confirmed); port the patterns to Node rather than adding R to the site build. The advanced query editor is at `https://op.europa.eu/en/advanced-sparql-query-editor` (to confirm). EU legal texts are reusable under the Commission's reuse policy (Decision 2011/833/EU); cite EUR-Lex as the source.

Article text: `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:<CELEX>` (to confirm; EUR-Lex sometimes refuses automated clients, in which case fetch the manifestation through CELLAR by content negotiation on the work URI). European Legislation Identifier URIs take the form `http://data.europa.eu/eli/dir/2022/2555/oj`.

| Instrument | CELEX | Status to confirm |
|---|---|---|
| NIS2 Directive (EU) 2022/2555 | 32022L2555 | in force; transposition deadline 17 October 2024 |
| CER Directive (EU) 2022/2557 | 32022L2557 | in force |
| DORA Regulation (EU) 2022/2554 | 32022R2554 | applies from 17 January 2025 |
| Cyber Resilience Act Regulation (EU) 2024/2847 | 32024R2847 | reporting obligations apply from 11 September 2026 |
| AI Act Regulation (EU) 2024/1689 | 32024R1689 | check whether the Digital Omnibus on AI changed the dates for high-risk obligations and Article 73 |
| GDPR Regulation (EU) 2016/679 | 32016R0679 | in force |
| Council Decision (CFSP) 2019/797 (cyber sanctions) | 32019D0797 | in force; confirm current extension |
| Commission Recommendation (EU) 2024/1101 (PQC coordinated roadmap) | 32024H1101 | soft law |
| NIS2 implementing rules on technical measures, Commission Implementing Regulation (EU) 2024/2690 | 32024R2690 | to confirm number and scope |
| DORA delegated rules on incident reporting time limits | to resolve | find the delegated or implementing act that sets the 4, 24 and 72 hour limits and record its CELEX |

Proposals: the Commission's page for COM(2026) 13, the NIS2 targeted amendments of 20 January 2026, is `https://digital-strategy.ec.europa.eu/en/library/proposal-directive-regards-simplification-measures-and-alignment-cybersecurity-act` (confirmed). Resolve the interinstitutional procedure numbers for COM(2026) 13, the Cybersecurity Act revision published the same day, and the Digital Omnibus proposals, then track their stage through the European Parliament's Legislative Observatory, `https://oeil.secure.europarl.europa.eu/oeil/en/` (to confirm), and through CELLAR procedure metadata.

## quantum timing (Exposure Clock)

Quantum Threat Timeline Report 2025, Mosca and Piani, Global Risk Institute with evolutionQ: summary page `https://www.evolutionq.com/publications/quantum-threat-timeline-research-report-2025` (confirmed); the Global Risk Institute hosts the report and its briefings. Briefings of 19 March 2026 (`https://globalriskinstitute.org/publication/quantum-briefing-developments-in-quantum-technology-and-in-regulations-addressing-the-quantum-threat/`, confirmed) and 22 June 2026 (`https://globalriskinstitute.org/publication/quantum-briefing-recent-quantum-computing-progress-and-its-implications-for-cybersecurity/`, confirmed). The report is copyright material: display its figures as cited facts with a link, do not reproduce its charts.

Mosca, M. (2018). Cybersecurity in an era with quantum computers: Will we be ready? *IEEE Security & Privacy*, 16(5), 38 to 41. Confirm the DOI before citing it.

Jurisdiction deadlines come from the Atlas profiles and their documents in `data/results/`. Expected primary pages to watch: NCSC UK PQC migration timelines, `https://www.ncsc.gov.uk/guidance/pqc-migration-timelines` (to confirm); the EU coordinated implementation roadmap on the Commission's digital strategy site (to find and confirm); NIST IR 8547, `https://csrc.nist.gov/pubs/ir/8547/ipd` (to confirm, and check whether a final version has replaced the draft).

## standards (Standards Cascade)

NIST post-quantum cryptography project, `https://csrc.nist.gov/projects/post-quantum-cryptography` (to confirm), and the FIPS pages `https://csrc.nist.gov/pubs/fips/203/final`, `/204/final`, `/205/final` (to confirm). NIST publications are US government works and free to reuse. The Atlas's own document corpus in `data/results/*.json` is the main evidence for who references what; external standards bodies (ETSI, ISO/IEC, IETF) enter the Cascade only through documents that name them.

## scholarly metadata (optional)

OpenAlex requires a free API key since 13 February 2026 and meters list queries. Only needed if a later version of the Cascade adds research output; not part of the first build.

## Atlas internal sources

`data/profiles/*.json`, `data/results/*.json`, `data/countries.json`, `data/trusted-domains.json`. These are read at build time. Changes to them arrive through the existing scraper routine and Swann's reviews, and the watch pipeline treats a merged change to `data/results/` as an event that may create Cascade candidates.
