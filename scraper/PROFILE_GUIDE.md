# QSC Atlas: Profile Elaboration Guide (the "mise en forme")

After a country's documents are scraped and ingested, its profile in ATLAS_COUNTRIES
still has only Country, ISO3, and Data Status. This guide covers the second pass:
deriving the analytical profile fields from the ingested documents so the country
renders fully on the Atlas (like the United Kingdom).

## The iron rule

Every field value must be attested by an ingested institutional document for that
country (`data/results/<ISO3>.json`, plus `data/candidates/<ISO3>.json` for the raw
descriptions). NEVER fill a field from general knowledge alone. If the documents do
not state it, leave the field out: the site renders calm empty states ("no published
migration timeline", "None stated") and absence is itself information. Profiles
written this way are still DRAFTS for human review; Data Status stays "Partial"
until the researcher confirms it.

## Workflow

1. Read `data/results/<ISO3>.json` (what was ingested, with summaries) and
   `data/candidates/<ISO3>.json` (raw search descriptions).
2. Draft `data/profiles/<ISO3>.json` per the shape below, applying the field rules.
3. Validate and write: `node scripts/update-profile.mjs data/profiles/<ISO3>.json`
   (add `--deploy` on the last one to rebuild the live site once).
4. Tell the user which fields you could NOT attest, so they know what to review.

## Profile shape (data/profiles/<ISO3>.json)

```json
{
  "iso3": "GBR",
  "summary": "One plain-language paragraph on the country's institutional posture.",
  "dominantProcess": "NIST | ETSI | ISO | Sovereign | Mixed",
  "standardFamilies": "NIST FIPS 203, FIPS 204, FIPS 205",
  "algorithms": "ML-KEM, ML-DSA, SLH-DSA",
  "processParticipation": "process | role, one per line",
  "hybridDeployment": "Required | Recommended | Under evaluation | Discouraged | None stated",
  "migrationTimeline": "2028 | milestone\n2031 | milestone\n2035 | milestone",
  "targetCompletion": "2030 | 2035 | Phased (no fixed end) | None stated",
  "govActors": "NCSC | UK national technical authority for cyber security",
  "dataStatus": "Partial",
  "provenance": ["which document attests which field - free text, not written to Notion"]
}
```

Omit any field you cannot attest. Only the keys present are written; existing Notion
values for omitted keys are untouched.

## Field rules

- summary: one paragraph, serif reading voice, plain terms, no theory vocabulary,
  British English, no em-dashes or en-dashes. State who the lead institution is and
  what the country's posture is.
- dominantProcess: which standards camp the country's official guidance aligns with.
  NIST if it adopts the NIST FIPS suite; Sovereign if it runs its own scheme list;
  Mixed if its agency blends camps (own doctrine plus NIST algorithms, for example).
  This colours the map, so be conservative: if genuinely unclear, omit (country shows
  as no-data rather than wrongly coloured).
- standardFamilies / algorithms: comma-separated, only families and algorithms the
  documents name.
- hybridDeployment: the agency's stated stance on hybrid (classical + post-quantum)
  deployment. This varies meaningfully by country (some require it, some advise
  against it); only set it when a document states the position.
- migrationTimeline: one "year | milestone" per line, only dated milestones stated in
  institutional documents. The site renders these on a fixed 2025-2036 axis.
- targetCompletion: the official end date if stated; "Phased (no fixed end)" when the
  documents describe phases without a terminal date.
- govActors: "name | role" per line, governmental and standards bodies only - these
  become links into the documents tool, so use the same issuingOrg names as the
  document rows.
- dataStatus: "Partial" after elaboration (researcher review pending); "Placeholder"
  if the country has no included documents (profile left empty deliberately);
  "Complete" is set only by the researcher.

## Countries with no included documents

If every scraped document for a country was flagged (included: false) or nothing
qualified, write only `{ "iso3": "...", "dataStatus": "Placeholder" }`. The country
stays greyed on the map. Note it for a later re-scrape with `--deep`.
