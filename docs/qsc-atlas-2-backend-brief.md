# QSC Atlas — Claude Code backend brief (v3)

Read `qsc-atlas-1-architecture.md` first. It explains how Notion, Astro, GitHub, Vercel, and the Cowork routine fit together. This brief is the build instruction set for the backend, the Notion data layer, the page logic, and the deploy pipeline. The visual layer is specified separately in `qsc-atlas-3-design-brief.md` and built in Claude Design; your job is to produce clean structure and component stubs that the design work drops into, not to make it look finished.

## what we are building

A public static website, the QSC Atlas, presenting the empirical institutional findings of a master's thesis on quantum-safe cryptography (QSC) governance. No theoretical framework is ever visible. No Triple Helix, no Governance of Expectations, no code families, no helix strength scores, no imbalance metrics. The visitor sees, for each country: which post-quantum standards dominate, which international standards processes the country takes part in, and where one exists, the country's migration timeline.

## scope

Institutional documents only. Government bodies, national agencies, and standards organisations. No academic sources, no industry sources. Profiles carry no actor groupings beyond governmental and standards bodies, no publication counts, no research keywords, no institutional coupling.

Global coverage. Every country for which institutional QSC documents exist, not a fixed sample. The narrow per-country payload is what makes worldwide scale feasible.

No readiness stage. The Stage concept from earlier drafts is deleted entirely. It is neither the map variable nor a profile field.

## stack (decided, do not re-litigate)

Astro static site generator. Notion as headless CMS, three databases that already exist (IDs below), schemas revised per this brief. A React island for the interactive map using react-simple-maps, no Mapbox key. A client-side search index for the documents tool. GitHub repository, Vercel hosting with continuous deployment and a deploy hook. British English in all visible copy and any prose you write for me. No em-dashes or en-dashes anywhere.

## Notion databases (live, "QSC Data Analysis 26" workspace)

Parent page ID: `3311f6db-4681-81d2-8368-e60b41316b71`

### ATLAS_COUNTRIES — `562cfd22-fff9-422e-9683-83c14642b49f`

The schema must be revised. Delete these properties: Stage, Industry Actors, Academic Actors, Publications, Top Institutions, Research Keywords, Institutionally Coupled, Coupling Note. The final schema is:

- Country (title)
- ISO3 (text, three-letter country code, drives the map join)
- Summary (text, one paragraph, plain-language institutional posture)
- Gov Actors (text, governmental and standards bodies only, one per line as "name | role")
- Standard Families (text, comma-separated, e.g. "NIST FIPS 203/204/205, ETSI TS 103 744")
- Algorithms (text, e.g. "ML-KEM, ML-DSA, SLH-DSA")
- Dominant Standards Process (select: NIST / ETSI / ISO / Sovereign / Mixed) — this is the map colour variable
- Process Participation (text, international processes the country is in, one per line as "process | role", e.g. "ISO/IEC JTC 1 SC 27 | participating member")
- Hybrid Deployment (select: Required / Recommended / Under evaluation / Discouraged / None stated) — note "Discouraged" is deliberate, some agencies advise against hybrid
- Migration Timeline (text, the new element, see below)
- Target Completion (select: 2030 / 2035 / Phased, no fixed end / None stated)
- Map X (number), Map Y (number)
- Last Updated (date)
- Data Status (select: Complete / Partial / Placeholder)

Flag to me whether you revise the schema in place via the Notion connector or whether I should do it manually before you start. The deletion is destructive, so wait for my go-ahead before removing any property that may hold data I want for the thesis.

#### the Migration Timeline field

Captures a country's official migration milestones where institutional documents state them. Format: one milestone per line as "year | milestone", for example:

```
2028 | Discovery complete, migration plan defined
2031 | High-priority systems migrated
2035 | Full migration complete
```

Parse this into a structured array of {year, label} objects for the timeline visual. Rules:
- Years may be a single year ("2030") or an open marker ("Phased"). Handle both.
- Where a country has published no timeline, the field is left empty and the profile must show a plain "no published migration timeline" state rather than an empty component.
- Timeline dates are factual claims and must come from the sourced institutional document, never filled from memory. Treat any date I have not confirmed against a document as provisional. Do not invent or interpolate milestones.

For reference, the real spread looks like this (UK 2028/2031/2035, EU high-risk 2030 then full 2035, US CNSA 2.0 full 2035, Australia 2026 plan/2028 begin/2030 complete, France phased with standalone not before 2030). The visual must cope with both the three-milestone shape and the compressed-to-2030 shape.

### ATLAS_BLOG — `63e55bb6-8faa-4963-88ab-a5d2c2f1fe99`

One row per article, body in the Notion page body. Properties: Title, Slug, Published (date), Status (Draft / Review / Published, build only Published), Tags (multi-select), Excerpt, Author, Countries Referenced. The blog is also the change-over-time channel; the Cowork routine drafts change-notes here.

### ATLAS_DOCUMENTS — `a93c0811-fce2-4c11-b2ab-1c58998317b1`

One row per institutional source. Properties: Title, Country, Issuing Organisation, Year, Document Type, Tier (T1 to T4), URL, Included (checkbox). Add one property: Summary (text, one or two sentences) so the documents search has something substantive to index. Institutional issuers only. This database powers the documents research tool.

## the pages

1. Map. Interactive world map, each country with data coloured by Dominant Standards Process, with a clear legend. Clicking a country slides in a profile panel. Panel section order: summary, governmental and standards-body actors, dominant standards and algorithms, hybrid stance, migration timeline (the visual, or the empty state), key institutional documents (the matching ATLAS_DOCUMENTS rows, most important first). The institution name in the actors and documents sections links through to the documents tool pre-filtered to that institution. Never surface theoretical labels or the raw select values in a way that reads as jargon.

2. Country index. Browsable list or grid of all countries, linking into profiles, for visitors who do not want to use the map.

3. Analysis (blog). Built from ATLAS_BLOG filtered to Published, with tag filtering. Post pages render the Notion body.

4. Documents (research tool). Not a static table. Build: full-text search across Title and Summary; filters by country, document type, year, and tier; and the cross-link where an institution clicked in a country profile lands here pre-filtered to that issuing organisation. Use a prebuilt client-side index (for example a JSON index searched with a small fuzzy library). Confirm the library choice with me before wiring it.

5. About and get a briefing. Short plain-language methodology plus the consulting conversion point. Minimal.

## Notion data layer

Use a Notion content loader for Astro that reads the three collection IDs at build time and exposes each as a typed content collection. Read the integration token from an environment variable (NOTION_TOKEN); do not hardcode it, and tell me exactly which variables to set and where, both in my local `.env` and in Vercel. Map every property to a typed schema. Parse the "name | role", "process | role", and "year | milestone" line formats into structured arrays. Build only Published blog entries. Handle Placeholder-status countries explicitly, either omitted from the live map or visibly greyed; flag the choice to me rather than deciding silently.

## Cowork automatic-update routine (separate deliverable, scaffold the hook here, I build the routine in Cowork)

Autonomy tier: draft plus auto-publish low-risk updates, flag the rest. Concrete rules, not the routine's own judgement:

Auto-publishable (low-risk) means a new document row from an issuing institution already present in the corpus and already on the trusted-domain list, where the routine only adds the row and a single factual changelog line to ATLAS_BLOG. These may be set to Published and may trigger the deploy hook.

Must be flagged for my review (left as Draft) means any of: a new institution not yet in the corpus, any change to a country's Dominant Standards Process, Process Participation, Migration Timeline, or Target Completion, any narrative blog prose beyond a factual changelog line, any document from a source the routine cannot verify against a known institutional domain, or anything the routine is uncertain about.

The routine never modifies ATLAS_COUNTRIES profile fields automatically. Build the data layer so that a Published row can trigger a Vercel rebuild via the deploy hook. The trusted-domain list is an editable config file I own; seed it from the issuing organisations already in ATLAS_DOCUMENTS.

## deploy loop

Initialise git, push to a new GitHub repository. Set up the Astro build for Vercel and document the dashboard steps I perform (import repo, set environment variables, deploy). Set up the deploy hook so editing Notion, or the Cowork routine publishing a row, can trigger a rebuild, and give me one short note on how to fire it (bookmark and POST). Add a `.gitignore` that excludes `.env`.

## standing constraints

British English in all visible copy and any prose you write for me. No em-dashes or en-dashes. No theoretical vocabulary anywhere a visitor can see it. At genuine forks (loader choice, search library, schema-revision method, Placeholder handling, map projection versus simple SVG), stop and ask rather than guessing. Walk me through terminal steps as we go; assume I am vibe coding and want to understand each command before I run it, but keep explanations short.

## start here

Read the architecture document. Read current Astro Notion-loader options and confirm the loader with me. Settle the ATLAS_COUNTRIES schema revision method and wait for my go-ahead on the destructive deletions. Then scaffold the project and build the map page first, coloured by Dominant Standards Process, with the profile panel including the migration timeline component.
