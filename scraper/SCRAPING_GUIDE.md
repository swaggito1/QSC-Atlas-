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
the query plan is capped per country (see Step 1 flags and Credit management).

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
node scripts/scrape-country.mjs <ISO3> [--lite] [--deep] [--max N]
```
This builds a query plan from `data/dorks.json` and writes `data/candidates/<ISO3>.json`
(title, url, description for each unique result). It prints a compact list to the
screen.

The default plan combines three kinds of query (site-scoped dorks find the agency
position papers, parliamentary records, and native-language documents that generic
English searches miss):
- `site:` dorks against the country's institutional domains (agency, parliament,
  standards body) listed in `data/dorks.json`;
- native-language PQC terms (for example "cryptographie post-quantique",
  "Post-Quanten-Kryptografie", "耐量子計算機暗号"), both OR-ed into the site dorks
  and searched on their own;
- the three generic English queries.

Flags: `--lite` runs only the generic queries (cheapest); `--deep` also dorks the
`deepSites` (parliament archives, central bank, regulators); `--max N` caps the
query count (default 12). Countries without a `dorks.json` entry fall back to the
generic queries; add an entry to upgrade them.

Cost: each query is roughly one Firecrawl credit (search only, no page scraping).
Default is ~6-9 credits per country, `--lite` ~3, `--deep` ~10-12. The script
prints the query plan and cost estimate before searching.

### Step 1, Firecrawl-free mode (preferred when credits are scarce)

`scrape-country.mjs` bills Firecrawl for every query. The discovery step can instead
be done with Claude's built-in `WebSearch`/`WebFetch` tools, which cost **zero
Firecrawl credits**. This is the preferred mode for large batches.

You cannot call `WebSearch` from a Node script (it is an agent tool), so discovery
moves into an agent. The pattern (see `scraper/scan-region.wf.js` for a full
multi-country example):

1. Give one agent a country: its name, ISO3, and institution hints (national cyber
   agency, standards body, ministry, central bank, parliament) plus the
   native-language phrase for "post-quantum cryptography".
2. The agent runs ~8-14 `WebSearch` queries: generic English, **native-language**
   (often decisive for non-English countries), and institution-scoped (via
   `allowed_domains`). It writes the unique hits to `data/candidates/<ISO3>.json`.
3. The same agent classifies per `SCRAPER_BRIEF.md` and writes
   `data/results/<ISO3>.json`, then you run `ingest.mjs` as normal.

`scan-region.wf.js` does this for a batch of countries grouped by region; run it with
the Workflow tool (`agentType: 'general-purpose'` so the subagents have WebSearch +
Write). Validated on NZL (English) and NOR (Norwegian, where native-language search
was decisive) before scaling. Ingest is unchanged and already Firecrawl-free.

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

- Each search query costs roughly 1 Firecrawl credit. Defaults per country:
  `--lite` ~3, default ~6-9, `--deep` ~10-12. The script prints the plan up front.
- Do NOT add `{ scrape: true }` to searches unless a specific page genuinely needs its
  full text; page-scraping multiplies the cost.
- A default batch of 10 countries is roughly 60 to 90 credits. Size batches to your
  plan; use `--lite` for low-priority countries, `--deep` for the QSC-active ones.
- Re-running a country is dedupe-safe (ingest skips known URLs), so it is fine to
  re-scrape a thin country with `--deep` later.

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
- Search returns junk: tighten the country's entry in `data/dorks.json` (sites,
  terms, extraQueries), or just exclude the junk during classification.
- A country's harvest is thin: add its agency/parliament/standards domains and
  native-language PQC terms to `data/dorks.json`, then re-run with `--deep`.

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

## Step 4 (end of every scraping session): hand off the mise en forme

The scraper only adds documents; the analytical profile fields (the "mise en forme")
are a second pass governed by `scraper/PROFILE_GUIDE.md`. End every scraping session
by printing a handoff block for the user to paste into the profile-elaboration
conversation (or a fresh session in `~/qsc-atlas`):

```
MISE EN FORME HANDOFF
Scraped this session: <ISO3 list, with included/flagged counts each>
No qualifying documents (set Placeholder): <ISO3 list or "none">
Inputs are on disk: data/results/<ISO3>.json and data/candidates/<ISO3>.json.
Next: follow scraper/PROFILE_GUIDE.md - draft data/profiles/<ISO3>.json for each
country, then run:
  node scripts/update-profile.mjs data/profiles/<A>.json data/profiles/<B>.json ... --deploy
Anything noteworthy for review: <one line per oddity, e.g. "JPN: only QKD material
found, flagged not-included; re-scrape with --deep">
```

Also commit the session's data files (results, candidates, coverage, dorks) so the
handoff is reproducible.
