# QSC Atlas: reviewer onboarding

You are verifying the Atlas's analytical claims about each country against its
institutional documents, and recording a verdict. Read this first, then the
finalised rubric (see METHODOLOGY_ISSUE.md and whatever the methodology cowork
settles).

## Claims versus facts

- **Facts** (sourced; treat as given unless a URL is plainly wrong): the documents
  in ATLAS_DOCUMENTS, each with title, issuing organisation, year, tier, URL.
- **Claims** (your job to verify): the interpretive fields in ATLAS_COUNTRIES,
  chiefly **Dominant Standards Process** (the map colour), **Secondary Process**,
  **Summary**, **Migration Timeline**, **Hybrid stance**, **Target Completion**.

## Where the data lives

- Notion workspace "QSC Data Analysis 26": **ATLAS_COUNTRIES** (one row per country,
  the claims) and **ATLAS_DOCUMENTS** (the evidence, linked by Country = ISO3).
- Version-controlled mirror, the canonical copy: `data/profiles/<ISO3>.json` (claims)
  and `data/results/<ISO3>.json` (the included documents). Corrections made in Notion
  should be pulled back to the files (see the source-of-truth note below).
- Live site: https://qsc-atlas.vercel.app, where each country page shows its claim
  and its key documents.

## Fields provided for the review

- **Classification Basis** — the recorded reasoning behind the camp assignment.
- **Confidence** — High / Medium / Low. Work Low first.
- **Verification Status** — starts Unverified; set to Verified or Corrected.

## How to verify one country

1. Open the country's documents (ATLAS_DOCUMENTS filtered to that ISO3, or the
   country page) and read its Classification Basis and Dominant/Secondary Process.
2. Judge from the documents up: do the sources support that camp under the rubric?
3. Record the verdict in ATLAS_COUNTRIES:
   - Correct: set Verification Status = Verified.
   - Wrong: set Verification Status = Corrected, fix the field, and note why in
     Classification Basis.
4. Sanity-check Summary and Migration Timeline against the documents. No date or
   claim should appear that is not in a sourced institutional document.

## Priority order

1. **Lowest trust first** — low confidence or candidate-sourced: Turkey, Ukraine,
   Argentina, Brunei, Djibouti, Russia, Brazil, Thailand.
2. **NIST-by-default** — any country coloured NIST whose basis says "de facto" or
   "no scheme"; these are the softest calls.
3. **Sovereign** — China, Russia, Vietnam, Saudi Arabia, UAE, and Indonesia (Mixed):
   confirm the named national scheme is real and current.
4. **EU bloc** — membership-based, quickest: confirm each is an EU member and that
   the coordinated-roadmap basis holds.

## What not to touch

- The documents (facts). Flag a broken URL, but do not re-interpret a source.
- The site or scraper code. Corrections go in the data, never the code.

## Scope notes

- 54 countries are coloured; 111 are empty placeholders (no national PQC source was
  found) and need no review unless you want to spot-check that nothing was missed.
- ETSI and ISO are defined colours with no current members, pending the methodology
  decision.
- Everything is currently Data Status = Partial. Promote a country to Complete only
  once you have verified it.
