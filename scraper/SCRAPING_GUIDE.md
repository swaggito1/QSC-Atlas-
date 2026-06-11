# QSC Atlas: Scraper Operator's Guide

This is the full manual for running the QSC document scraper. It is written so a
fresh Claude Code session (opened in `~/qsc-atlas`) can run a batch of countries
end to end without any prior context. Read this file and `scraper/SCRAPER_BRIEF.md`
first, then follow the per-country workflow.

## What the scraper does

For a given country it:
1. searches the web for that country's official quantum-safe-cryptography (QSC, also
   called post-quantum cryptography / PQC) documents, using Firecrawl;
2. classifies each candidate (is it institutional, what tier, what document type);
3. writes the qualifying documents into the Notion database `ATLAS_DOCUMENTS`, which
   the public Atlas site renders.

It is deliberately credit-frugal: search runs WITHOUT page-scraping by default, and
only three queries per country.

## Prerequisites (already set up)

- The project lives at `~/qsc-atlas`. Node is installed.
- `~/qsc-atlas/.env` holds the secrets (never commit it): `NOTION_TOKEN`,
  `FIRECRAWL_API_KEY`, the three `NOTION_DB_*` ids, and (once deployed)
  `DEPLOY_HOOK_URL`.
- All scripts are run from the project root: `cd ~/qsc-atlas`.

## The per-country workflow (three steps)

For each country, identified by its ISO3 code (for example `GBR`, `FRA`, `USA`):

### Step 1: gather candidates (Firecrawl)
```
node scripts/scrape-country.mjs <ISO3>
```
This runs three targeted searches and writes `data/candidates/<ISO3>.json`
(title, url, description for each unique result). It prints a compact list to the
screen. Cost: roughly 3 to 5 Firecrawl credits (search only, no page scraping).

### Step 2: classify (this is where Claude's judgement goes)
Read `data/candidates/<ISO3>.json` and apply the rules in `scraper/SCRAPER_BRIEF.md`.
Keep only sources that pass BOTH inclusion tests:
- INSTITUTIONAL issuer (government body, national agency, regulator, parliament, or a
  standards organisation). Exclude vendors, consultancies, think tanks, journalism,
  LinkedIn, Medium, and other countries' documents.
- EXPLICIT PQC reference (the document names post-quantum / quantum-safe cryptography
  or cryptographic migration).

For each kept source, produce an object with:
`title, country (the ISO3), issuingOrg, year (or null), docType, tier, url, summary,
included`.
- `docType` must be one of: Strategy, Regulation, Guidance, Standard, Roadmap, Report,
  Advisory, Evaluation, Announcement, Bibliometric.
- `tier` is T1 to T4 by institutional function (see SCRAPER_BRIEF.md).
- `included`: set `true` for a clearly official government or standards body (these are
  usually on `data/trusted-domains.json`); set `false` to flag a legitimate but
  less-certain institution as a draft for human review. If you omit `included`, the
  ingest step auto-sets it from the trusted-domain list.

Write the array to `data/results/<ISO3>.json`.

### Step 3: ingest into Notion
```
node scripts/ingest.mjs <ISO3> data/results/<ISO3>.json
```
This:
- adds each new document to `ATLAS_DOCUMENTS`, de-duplicating by URL (re-running is safe);
- creates or updates the country's row in `ATLAS_COUNTRIES` (it sets only Country, ISO3,
  and Data Status, never the analytical profile fields);
- updates the ledger `data/coverage.json`;
- fires the Vercel deploy hook if `DEPLOY_HOOK_URL` is set and at least one included
  document was added.

## Running a batch

Pick countries from `data/countries.json` (197 entries, each with a `priority` of 1, 2,
or 3; priority 1 is the most QSC-active). Work through them in priority order. For each
ISO3, do steps 1 to 3. Skip a country quickly if step 1 returns nothing relevant
(record it as covered so it is not retried every run).

Suggested first batch (priority 1, not yet done): `USA`, `FRA`, `DEU`, `AUS`, `JPN`,
`CAN`, `NLD`, `KOR`, `SGP`, `CHE`. (`GBR` is already done.)

Check what is already covered:
```
cat data/coverage.json
```

## Credit management (important)

- Each country costs about 3 to 5 Firecrawl credits (search only).
- Do NOT add `{ scrape: true }` to searches unless a specific page genuinely needs its
  full text; page-scraping multiplies the cost.
- A batch of 10 countries is roughly 30 to 50 credits. Size batches to your plan.

## Hard rules (do not break these)

- Institutional sources only; explicit PQC reference required.
- NEVER invent dates. Use a year only if the document states it; otherwise `null`.
- Do NOT auto-fill the country's analytical profile fields (Dominant Standards Process,
  Migration Timeline, Hybrid stance, Summary, Gov Actors). Those are set by a human
  after review. The scraper only adds documents and the bare country row.
- De-duplicate by URL (the ingest step also enforces this).
- If unsure whether a source qualifies, set `included: false` so it lands as a draft,
  rather than dropping it silently.

## Where data goes (the model)

`ATLAS_DOCUMENTS` (one row per source): Title, Country (ISO3), Issuing Organisation,
Year, Document Type, Tier (T1 to T4), URL, Summary, Included (checkbox). Only
`Included = true` rows appear on the public site.

`ATLAS_COUNTRIES` (one row per country): Country, ISO3, Data Status, plus the analytical
profile fields a human fills in later.

## Seeing the result

- Locally: restart the dev server so it re-fetches Notion. `rm -rf ~/qsc-atlas/.astro`
  then start the `qsc-atlas` preview (or `npm run dev`). The loader logs how many rows
  it loaded.
- Live (after deploy): if `DEPLOY_HOOK_URL` is set, ingest triggers a rebuild
  automatically; otherwise redeploy from the Vercel dashboard.

## Useful commands

- Regenerate the country work-list: `node scripts/gen-countries.mjs`
- List priority-1 countries:
  `node -e "console.log(require('./data/countries.json').filter(c=>c.priority===1).map(c=>c.iso3+' '+c.name).join('\n'))"`
- Test the Firecrawl key (1 cheap call):
  `node -e "import('./scripts/lib/firecrawl.mjs').then(m=>m.search('test post-quantum',{limit:2})).then(r=>console.log(r.length,'results'))"`

## Troubleshooting

- "FIRECRAWL_API_KEY is not set": add it to `.env` (get a key at firecrawl.dev).
- "NOTION_TOKEN not set": add it to `.env`; the integration must be shared with the
  "QSC Data Analysis 26" page in Notion.
- Notion `object_not_found`: the integration is not shared with the databases, or the
  wrong id is used. The `NOTION_DB_*` values are DATA SOURCE ids and are correct.
- Search returns junk: tighten the queries in `scripts/scrape-country.mjs`
  (`queriesFor`), or just exclude the junk during classification.

## Kickoff prompt for a new chat

Paste this into a fresh Claude Code session opened in `~/qsc-atlas`, replacing the
country list:

```
You are running the QSC Atlas scraper. Project root: ~/qsc-atlas.
First read scraper/SCRAPING_GUIDE.md and scraper/SCRAPER_BRIEF.md.
Then scrape these countries (ISO3): USA, FRA, DEU, AUS, JPN.
For each one, in order:
  1. node scripts/scrape-country.mjs <ISO3>
  2. Read data/candidates/<ISO3>.json, classify per SCRAPER_BRIEF.md (institutional
     + explicit PQC only; tier T1-T4; one of the allowed docTypes; 1-2 sentence
     summary; never invent dates), and write data/results/<ISO3>.json.
  3. node scripts/ingest.mjs <ISO3> data/results/<ISO3>.json
Stay credit-frugal (search only, no page scraping). Do NOT fill country profile
analytical fields. Give me a short summary per country (added / flagged / skipped).
```
