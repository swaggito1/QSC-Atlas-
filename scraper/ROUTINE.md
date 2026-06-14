# QSC Atlas: the scheduled scraper routine (Phase E)

The recurring job that keeps the Atlas current on its own. It refreshes the
**document layer** only. It never assigns or changes a country's camp, profile,
timeline, or any analytical field: those are gated and handled by the verification
cowork (see PROFILE_GUIDE.md and ../docs/REVIEWER_GUIDE.md).

This file is the recipe. The scheduled task (in the app's scheduled-tasks list)
runs a self-contained prompt that follows these steps each time it fires.

## What one run does

Working directory: `/Users/swannashworth/qsc-atlas`.

1. **Pick the batch (deterministic, bounded cost).**
   `node scripts/routine-pick.mjs --batch 5`
   Prints the next countries to do: stalest first, never-scraped count as stalest,
   tie-broken by priority. The `--batch` number is the hard cap on cost.

2. **For each country in the batch:**
   a. `node scripts/scrape-country.mjs <ISO3>`
      Firecrawl search; writes `data/candidates/<ISO3>.json` (one credit per query,
      roughly 6 to 9 queries). Add `--lite` for the cheapest pass (3 queries).
   b. Classify the candidates per `scraper/SCRAPER_BRIEF.md`: institutional
      issuers only, an explicit PQC/QSC reference required, assign Tier T1 to T4
      and a document type from the fixed vocabulary, write the array to
      `data/results/<ISO3>.json` in the shape
      `{ title, country, issuingOrg, year, docType, tier, url, summary, included }`.
   c. `node scripts/ingest.mjs <ISO3> data/results/<ISO3>.json`
      Upserts the documents (idempotent: existing rows are updated, not skipped),
      updates `data/coverage.json`, and fires the deploy hook if anything is included.

3. **Report** a short summary: countries done, documents added and updated, any
   country that returned nothing, and the approximate credits spent.

## The autonomy rules (from the brief)

- **Auto-include** (`included: true`): a document from an institution already on
  `data/trusted-domains.json`. These go live and fire the deploy hook.
- **Leave as draft** (`included: false`): a new institution, an uncertain or
  unverifiable source, or anything not clearly institutional. A human promotes it
  later.
- **Never**: invent a date, classify a camp, write a profile field, or write
  narrative prose. The routine touches documents, nothing else.

## Cost control

- Cost per run is about `batch x queries-per-country` credits. Keep `--batch`
  small; use `--lite` if credits are tight.
- The frequency is set by the scheduled task. To change cadence, batch, or to
  pause it, edit or disable the task in the app's scheduled-tasks list, or ask
  Claude to `update_scheduled_task`.

## Run it by hand

Any time, without waiting for the schedule:
`node scripts/routine-pick.mjs --batch 5` then the per-country steps above. Or just
ask Claude in a normal session to "run the QSC scraper routine for the next batch".
