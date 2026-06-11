# QSC scraper: per-country classification brief

You are scraping official quantum-safe-cryptography (QSC, also called post-quantum cryptography or PQC) documents for one country, then classifying each. Firecrawl has already gathered candidate pages (title, url, markdown) via `node scripts/scrape-country.mjs <ISO3>`. Your job is to decide which candidates qualify and output a clean JSON array for `node scripts/ingest.mjs <ISO3> <file.json>`.

## Inclusion threshold (BOTH must hold)

1. INSTITUTIONAL issuer only: a government body, national agency, regulator, parliament, or a standards organisation (for example NIST, ANSSI, BSI, NCSC, ENISA, ETSI, ISO, ITU). Exclude academic papers, vendor marketing, journalism, and blog commentary.
2. EXPLICIT QSC reference: the document must name post-quantum or quantum-safe cryptography, PQC, or migration to quantum-resistant algorithms. A general cyber strategy that does not mention PQC does NOT qualify.

If unsure whether a source is institutional or QSC-explicit, set `included` to false. It then becomes a draft for human review rather than being dropped.

## Tier (by institutional FUNCTION, not by publisher prestige)

- T1: sets, formalises, or scrutinises expectations. National cyber agencies, ministries, regulators, parliament, government strategies, binding directives, funding calls, certification announcements.
- T2: translates expectations into operational response. Telecom or bank PQC pilots, vendor products tied to a government programme, industry-association guidance, funded consortium projects.
- T3: independent evaluation, testing, certification. Evaluation labs, Common Criteria or EUCC certifications, security evaluation reports, testbeds.
- T4: research capacity and institutional coupling. Standards-committee participation, agency-advisory research, funded research programmes, NIST competition submissions. Publication count alone is never sufficient.

## Document type (use ONE of these exact values, matching the Notion options)

Strategy, Regulation, Guidance, Standard, Roadmap, Report, Advisory, Evaluation, Announcement, Bibliometric.

Map sensibly, for example: a national plan to Strategy; a binding rule or law to Regulation; "how to migrate" advice to Guidance; a technical standard to Standard; a dated migration plan to Roadmap; a certification or test result to Evaluation; a notice to Announcement.

## Rules

- One JSON object per qualifying document.
- Never invent dates. Use `year` only if stated in the document; otherwise null.
- `issuingOrg`: the publishing institution's short name (for example "ANSSI", "BSI", "NCSC").
- `summary`: one or two factual sentences describing what the document is, drawn from its content.
- Deduplicate by URL.
- `country`: the ISO3 code passed on the command line.

## Output shape (a JSON array)

```json
[
  {
    "title": "Migration to post-quantum cryptography",
    "country": "GBR",
    "issuingOrg": "NCSC",
    "year": 2024,
    "docType": "Guidance",
    "tier": "T1",
    "url": "https://www.ncsc.gov.uk/...",
    "summary": "NCSC guidance setting out a timeline and steps for UK organisations to migrate to post-quantum cryptography.",
    "included": true
  }
]
```

Write the array to a file and run: `node scripts/ingest.mjs <ISO3> <that-file.json>`
