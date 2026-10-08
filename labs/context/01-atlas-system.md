# Context 01: what already exists in the Atlas repository

Read this before touching code. It records the repository as it stood on 5 August 2026 in the Desktop copy, read on 30 September 2026. Where the canonical repository has moved on, trust the repository over this file and note the difference in your report.

## the system

The QSC Atlas is a static Astro 5 site hosted on Vercel at `https://qsc-atlas.vercel.app`, with React 18 islands, `d3-geo` and `topojson-client` for the map, `fuse.js` for document search and `world-countries` for names. Content comes from Notion, read at build time by a custom loader (`src/loaders/notion.ts`); `src/content.config.ts` wires two collections, countries and documents, and the blog data source ID appears only in `.env.example`. Pushing to `main` on GitHub triggers a Vercel build; a Vercel deploy hook (`DEPLOY_HOOK_URL`, fired by `scripts/lib/deploy-hook.mjs`) rebuilds after Notion edits. The architecture is written up in `docs/qsc-atlas-1-architecture.md`, the backend decisions in `docs/qsc-atlas-2-backend-brief.md`, the visual system in `docs/qsc-atlas-3-design-brief.md`.

Notion data source IDs, not secret: countries `562cfd22-fff9-422e-9683-83c14642b49f`, documents `a93c0811-fce2-4c11-b2ab-1c58998317b1`, blog `63e55bb6-8faa-4963-88ab-a5d2c2f1fe99`, under the "QSC Data Analysis 26" parent page `3311f6db-4681-81d2-8368-e60b41316b71`. Secrets in `.env` and in Vercel: `NOTION_TOKEN`, `FIRECRAWL_API_KEY`, `DEPLOY_HOOK_URL`. The build succeeds without `NOTION_TOKEN`, rendering empty collections and their empty states.

## the canonical data mirror

`docs/REVIEWER_GUIDE.md` names the JSON files as the canonical copy, with Notion as the published mirror. The lab tools read the JSON files directly, not Notion, so they can be tested offline and in CI.

| File | Shape | Notes |
|---|---|---|
| `data/countries.json` | array of `{ iso3, iso2, name, priority, supranational? }`, 197 rows | Includes `EUU` and `NATO` as supranational entities. |
| `data/profiles/<ISO3>.json` | one country profile | About 55 populated, the rest stubs of under 100 bytes. Fields below. |
| `data/results/<ISO3>.json` | array of included and draft documents | `{ title, country, issuingOrg, year, docType, tier, url, summary, included }`. FRA has 38 rows, USA 51. |
| `data/candidates/<ISO3>.json` | raw Firecrawl candidates | Input to classification; never treated as evidence. |
| `data/coverage.json` | `{ ISO3: { lastScraped, docCount, status } }` | Drives the scraper's stalest-first batch. |
| `data/trusted-domains.json` | `{ comment, domains: [...] }` | About 70 institutional domains whose documents auto-include. |
| `data/evaluations.json` | `{ ISO3: { relevance, coherence, effectiveness, efficiency, governance, impact } }` | The evaluative layer, scores 0 to 2. Not used by the labs. |

Profile fields in use: `iso3`, `country`, `summary`, `dominantProcess`, `secondaryProcess`, `coordinationPosture` (`EU`, `NIST-bloc`, `sovereign-bloc`, `engaged-unaligned`), `standardsRole` (`setter`, `contextualiser`, `taker`, `sovereign-developer`), `processParticipation` and `govActors` (one item per line, `name | role`), `hybridDeployment`, `migrationTimeline` (one milestone per line, `year | label`), `targetCompletion`, `mainRegulation` (one instrument per line, `instrument | level | status`), `legalStatus` (`binding`, `soft-only`, `none`), `obligation`, `analyticalNote` (internal, never published), `confidence` (`High`, `Medium`, `Low`), `verificationStatus` (`Unverified`, `Verified`, `Corrected`), `classificationBasis`, `dataStatus`, `lastUpdated`.

Parsers already exist in `src/lib/parse.ts`: `parseTimeline`, `parseNameRole`, `parseRegulation`. Derivations in `src/lib/regulation.ts` (`deriveLegalStatus`) and `src/lib/process.ts` (`POSTURE_META`, `ROLE_META`, `confidenceOpacity`). Reuse them; do not write parallel parsers.

## the document pipeline that already runs

`scraper/ROUTINE.md` describes a weekly routine launched by `launchd` through `scripts/routine-run.sh`, which runs `claude -p` headless from `/Users/swannashworth/qsc-atlas`. It picks the five stalest countries (`scripts/routine-pick.mjs --batch 5`), scrapes candidates with Firecrawl (`scripts/scrape-country.mjs`), classifies them under `scraper/SCRAPER_BRIEF.md` into `data/results/<ISO3>.json`, and upserts them to Notion with `scripts/ingest.mjs`, which fires the deploy hook when anything is included. It adds and updates documents only and never touches profiles. The labs must not break or duplicate this routine. The lab watch pipeline is a separate, cloud-scheduled layer that watches a small set of named sources for the lab datasets, and it reads the scraper's output as one of its inputs.

## the pages and components

Routes: `/` (hero with the globe), `/map`, `/countries`, `/countries/[iso3]`, `/methodology`, `/documents`, `/commentary`, `/about`, `/who`. Components of note: `AtlasMap.tsx` (d3-geo `geoNaturalEarth1` choropleth with posture and role recolouring), `HeroGlobe.tsx` (the "Standards in Orbit" concept from `docs/HERO_VISUAL_PROPOSAL.md`: countries as points, great-circle arcs from the standard-setter, rings around sovereign nodes), `MigrationTimeline.astro` (fixed 2025 to 2036 axis, final marker in the posture colour, calm empty state), `ProfilePanel.astro`, `DocumentsTool.tsx`, `CredibilityGauge.tsx`, `AxisMatrix.astro`, `ProcessChip.astro`, `ProcessLegend.astro`, `ReadingProgress.astro`. The site header links Map, Countries, Methodology, Documents, About.

## design tokens (from `src/styles/global.css`)

Neutrals: ink `#1a1a1a`, ink muted `#5c5c5c`, ink faint `#8a8a86`, hairline `#d8d6d0`, paper `#f7f5f0`, surface `#ffffff`, wash `#efece6`, wash strong `#e4e0d8`. Posture colours: NIST-led ecosystem `#2b4c7e`, EU coordinated roadmap `#5b54a8`, Sovereign bloc `#7a3b5e`, Engaged but unaligned `#6b7280`; no data `#e7e5df`. Role colours exist for the alternate map recolour only. Faces: `--font-reading` Newsreader, `--font-instrument` Schibsted Grotesk, `--font-mono` and `--font-label` Spline Sans Mono. Radius 2px. Motion tokens `--dur-fast` 150ms, `--dur-mid` 240ms, `--dur-panel` 280ms, `--dur-slow` 1100ms. Scroll-scene tokens exist (`--scene-min-h`, `--rail-w`).

## specifications worth reading before a given tool

`docs/CLASSIFICATION_MODEL.md` for posture and role (all four tools). `docs/REGULATORY_LAYER_SPEC.md` for the bindingness vocabulary of the regulatory layer (Exposure Clock, Rulebook); note that the labs add a separate lifecycle status (proposal, in force, applies from) and never merge the two. `docs/HERO_VISUAL_PROPOSAL.md` for the orbit vocabulary (Standards Cascade). `docs/ATLAS_ASSISTANT_SPEC.md` for the orientation-not-advice posture and grounding rules (Rulebook, Exposure Clock). `docs/METHODOLOGY_ISSUE.md` and `docs/CLASSIFICATION_VERIFICATION_MEMO.md` for why confidence must stay visible. `docs/MIDDLE_POWER_LAYER_SPEC.md` is not needed for the labs.

## known loose ends that affect the labs

The Desktop copy has no `.git` and is iCloud-evicted; the routine runs from `~/qsc-atlas`. `scraper/ROUTINE.md` has no commit or push step, and the architecture document says GitHub holds code rather than content, so it is not yet clear how updated `data/*.json` files reach `main` and therefore the Vercel build; prompt 00 establishes this at Step 0. Most profiles are `verificationStatus: Unverified` and `dataStatus: Partial`; the labs must surface confidence and verification rather than hide them. ETSI and ISO appear in the process colour map with no members. The France profile obligation cites ANSSI visa deadlines of 2027 and 2030; treat these as claims to verify before any lab tool displays them.
