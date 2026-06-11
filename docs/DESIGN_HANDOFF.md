# Handoff to Claude Design

Read `qsc-atlas-3-design-brief.md` in this folder first; it is the authoritative visual
specification. `qsc-atlas-1-architecture.md` explains how the system works. This note
covers only what has been built since those briefs were written, so you know what you
are restyling versus building.

## State of the build

The site is live at https://qsc-atlas.vercel.app and deploys automatically on every
push to `main`. It is an Astro static site; content comes from Notion at build time.
Real data exists for the United Kingdom (see `/countries/gbr` live) and more countries
are being added by a scraper pipeline on an ongoing basis.

## What exists (structure, not finished design)

- Design tokens: `src/styles/global.css` holds the colour, type, spacing, and radius
  tokens from the design brief as CSS variables. Treat them as the starting point the
  brief describes; refine deliberately.
- Site shell: `src/layouts/Base.astro` (header, nav, footer).
- Components (`src/components/`):
  - `ProcessChip.astro` and `ProcessLegend.astro`: the colour-to-label encoding,
    driven by `src/lib/process.ts` (the single source of truth for the five process
    colours and plain-language labels).
  - `MigrationTimeline.astro`: working fixed-axis (2025 to 2036) timeline with empty
    state. Proven against the UK three-milestone shape; still needs the compressed
    2030 shape checked when Australia data lands.
  - `ProfilePanel.astro`: the seven profile sections in the brief's order, with calm
    empty states. Currently rendered as a full page (`/countries/<iso3>`), NOT yet as
    the slide-in panel over the map.
  - `MapView.tsx`: a PLACEHOLDER. It renders a country list, not a map. Replacing this
    with the real react-simple-maps world map, coloured by Dominant Standards Process,
    with hover/click and the sliding profile panel, is the main piece of design build
    work. `react-simple-maps` is not yet installed; choose and pin it (or propose an
    alternative) when you build.
  - `DocumentsTool.tsx`: working search (Fuse.js) and filters; needs its visual layer
    and the mobile card reflow brought up to the brief.
- Pages: `/` (map hero), `/countries`, `/countries/[iso3]`, `/analysis`, `/documents`,
  `/about`. All functional with real data and graceful empty states.

## Data contract (do not change shapes silently)

Countries arrive typed from `src/content.config.ts`: `iso3`, `country`, `summary`,
`dominantProcess` (NIST | ETSI | ISO | Sovereign | Mixed | null), `migrationTimeline`
(parse with `parseTimeline` from `src/lib/parse.ts`), `targetCompletion`,
`hybridDeployment`, `govActors` / `processParticipation` (parse with `parseNameRole`),
`dataStatus` (Complete | Partial | Placeholder). Placeholder countries are greyed on
the map, not omitted (decided). Map join is by ISO3; the `mapX`/`mapY` fields are
legacy and can be ignored (flag for deletion if unused).

## Constraints that bind the visual work

- Monochrome instrument; colour ONLY encodes standards process (see the brief's
  design thesis). British English. No em-dashes or en-dashes anywhere.
- No theoretical vocabulary visible to visitors.
- Respect reduced motion; keyboard access for map and documents tool; colour never
  the only carrier (labels everywhere).
- Run locally: `npm install && npm run dev` (needs `.env` with NOTION_TOKEN; without
  it the site builds with empty collections and full empty states, which is fine for
  pure visual work).
