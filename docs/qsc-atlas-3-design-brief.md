# QSC Atlas — Claude Design front-end brief

Read `qsc-atlas-1-architecture.md` for how the site works and `qsc-atlas-2-backend-brief.md` for the data and pages. This document specifies the visual layer: the look, the components, the states, and the copy voice. Claude Code builds the structure and the component stubs; you own how it looks and feels. Where this brief pins down a choice, follow it. Where it leaves an axis free, make a deliberate choice for this subject rather than a templated default.

## what this is and who it is for

A public research instrument presenting, country by country, how governments are migrating to quantum-safe cryptography: which post-quantum standards dominate, which international standards processes a country joins, and where one exists, its migration timeline. The audience is policy people, journalists, procurement and security leads, and the occasional researcher. It also functions as the shop window for a consulting practice, so it must read as authoritative and current, never as a hobby project or a flashy startup landing page.

It belongs to the same body of work as a master's thesis whose figures are minimalist and monochrome. The Atlas should look like it came from the same hand.

## the design thesis (the one thing to get right)

This is a monochrome instrument. The entire interface is ink on paper: blacks, greys, off-white. Colour enters in exactly one role and never any other: encoding which standards process a country aligns with. The map is coloured by that. Small echoes of the same colour appear in a country's profile. Nowhere else does colour appear as decoration, mood, or brand flourish. When a visitor sees colour, it always means "standards camp".

This is the signature and the discipline. It makes the map the hero, it makes the geopolitical pattern (who is in the NIST orbit, who follows ETSI, who runs a sovereign track) the thing people remember, and it keeps the whole thing looking like a serious instrument rather than a dashboard template. Spend the boldness here. Keep everything else quiet.

The hero of the site is the map itself, not a headline or a hero banner. A visitor should land and immediately see the world coloured by standards alignment, with the legend telling them what the colours mean. The thesis of the page is visual: the world is splitting into cryptographic standards camps with different deadlines.

## token system (a starting point, refine deliberately)

### colour

Neutrals (the whole interface):
- Ink (primary text): `#1A1A1A`
- Ink muted (secondary text, labels): `#5C5C5C`
- Hairline (rules, borders): `#D8D6D0`
- Paper (page background): `#F7F5F0` (a warm off-white, not pure white, not the AI-default cream)
- Surface (panels, cards): `#FFFFFF`

Standards-process encoding (the only functional colour, used on the map and as small profile echoes):
- NIST: `#2B4C7E` (deep blue)
- ETSI: `#2E7D6F` (teal green)
- ISO: `#B07A2B` (ochre)
- Sovereign: `#7A3B5E` (aubergine)
- Mixed: `#6B7280` (neutral slate)
- No data on map: `#E7E5DF` (faint, recedes)

Verify this categorical set is distinguishable under common colour vision deficiencies, and never let colour be the only carrier: the legend is always labelled in words, and a country's process is always stated in text in its profile. Reinforce map categories with a labelled legend and, if needed, a hairline border on selected countries rather than relying on hue alone.

### type

Two registers, and the split itself carries meaning. A precise grotesque runs the instrument (navigation, map legend, labels, the documents table, all UI and data). A serif runs the reading layer (the country summary paragraph, blog posts, the about page). The grotesque says operate this; the serif says read this. A monospace carries dates and codes so numeric data reads as precise instrument output.

Recommended, with rationale, refine if you have a stronger pairing:
- Instrument and UI grotesque: Public Sans, or IBM Plex Sans. Public Sans is a government design-system face, which quietly suits an atlas of standards bodies without being a gimmick.
- Editorial serif: Spectral, or Newsreader. Elegant, readable at length, not the overused high-contrast display serif.
- Data monospace: IBM Plex Mono, for years on the timeline, tier codes, and numeric fields.

Set a clear type scale with intentional weights. Display sizes should be restrained, this is an instrument, not a magazine cover.

### spacing, radius, motion

Spacing on a calm, generous scale; let the data breathe, this is not a dense broadsheet. Border radius minimal to none; sharp edges suit an instrument, but avoid the hairline-rule broadsheet cliche by using whitespace rather than ruled boxes to separate things. Motion is sparing and functional: the profile panel slides in, map hover gives a quiet response, nothing animates for atmosphere. Respect reduced-motion preferences.

## global frame

### header and navigation

A slim top bar: the Atlas wordmark on the left, primary navigation on the right (Map, Countries, Analysis, Documents, About). Keep it quiet, one hairline beneath it at most. The wordmark is typographic, no logo mark needed.

### footer

Minimal: a one-line description of what the Atlas is, a methodology link, the get-a-briefing link, and a plain note on who maintains it and when it was last updated. No social-media clutter.

### page shell and responsive

Comfortable max content width for reading pages; the map page goes full width. Breakpoints down to mobile are part of the quality floor, not optional. On mobile the navigation collapses, the map becomes tap-driven with the profile panel as a bottom sheet, and the documents table reflows to cards.

## page: map (the hero)

### default state

Full-width interactive world map on paper background. Each country with data is filled with its standards-process colour. Countries with no data sit in the faint no-data tone and recede. A legend, always visible, maps each colour to its plain-language meaning. The legend is the only place the process names appear as a key; keep the wording plain (for example "NIST-aligned", "ETSI-aligned", "ISO-aligned", "Sovereign track", "Mixed").

A short, quiet caption near the map states what it shows in one sentence, so a first-time visitor understands the colour instantly. No hero banner above it, the map is the hero.

### interaction

Hover (desktop) gives a subtle lift or outline and a small tooltip with the country name and its process. Click selects the country, applies a hairline outline, and slides the profile panel in from the right. Clicking the background or a close control dismisses the panel. Selecting a country from the legend could optionally filter the map to that camp, confirm with me before adding that.

### mobile

The map is tappable, pinch-zoom enabled. Tapping a country raises the profile as a bottom sheet that can be expanded to full height and dismissed by swipe or close. The legend sits as a collapsible key.

```
DESKTOP
┌───────────────────────────────────────────────────────────────┐
│  QSC Atlas              Map  Countries  Analysis  Docs  About   │
├───────────────────────────────────────────────────────────────┤
│                                                                 │
│        [ world map, countries filled by standards process ]     │
│                                                  ┌────────────┐ │
│                                                  │ PROFILE     │ │
│   what this shows: one line                      │ PANEL       │ │
│                                                  │ slides in   │ │
│   ┌─ legend ───────────────┐                     │ on select   │ │
│   │ ■ NIST-aligned          │                    │             │ │
│   │ ■ ETSI-aligned          │                    │             │ │
│   │ ■ ISO-aligned           │                    │             │ │
│   │ ■ Sovereign track       │                    │             │ │
│   │ ■ Mixed                 │                    │             │ │
│   └─────────────────────────┘                    └────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## component: country profile panel

The panel is the heart of the site. It opens on the right (desktop) or as a bottom sheet (mobile). Section order, top to bottom:

1. Header: country name (serif display), and a small standards-process chip in the process colour with its plain label. This chip is one of the only colour echoes off the map.
2. Summary: the one-paragraph plain-language posture, set in the serif reading face. This is the human orientation, read it first.
3. Standards and algorithms: the dominant standard families and named algorithms, set as quiet labelled data in the grotesque. Plain presentation, not badges.
4. Hybrid stance: a single labelled line stating the country's position (Required, Recommended, Under evaluation, Discouraged, or None stated). This matters: some agencies require hybrid, some advise against it, and that contrast is one of the more interesting things the Atlas shows. Give it a clear, small, labelled treatment near the timeline.
5. Migration timeline: the visual specified below, or its empty state.
6. Standards-body actors: the governmental and standards bodies, each as "name, role". Each institution name is a link that opens the Documents page pre-filtered to that issuing organisation. Make the link affordance clear but quiet.
7. Key documents: the matching institutional documents for this country, most important first, each linking out to its source and also offering the in-Atlas filtered view. Show title, issuing organisation, year, and tier.

Close control top right. Keep the panel scrollable and the header sticky within it.

## component: migration timeline (the new element, specify carefully)

A horizontal timeline showing the country's official migration milestones, where institutional documents state them.

Layout and behaviour:
- A fixed shared axis from 2025 to 2036, so countries are visually comparable. A country that completes by 2030 visibly sits to the left of one finishing in 2035. That comparability is the analytical payoff, do not auto-scale per country.
- Milestones render as ticks or dots on the track at their year. Above each marker, the year in the monospace face. Below, a short label (for example "discovery and plan", "high-priority migration", "full migration").
- A quiet "today" indicator at the current year on the axis.
- The track is monochrome ink. The final or completion marker may carry the country's standards-process colour as a small echo, tying trajectory to alignment. That is the only colour permitted in the component.
- For "Phased, no fixed end" targets, show the milestones that exist and render the open end as a soft fade or an arrow past 2036 rather than a hard stop, with a small "phased" label.
- Keep it legible at panel width and reflow sensibly on mobile (the axis may rotate to vertical on narrow screens if that reads better, your call).

Empty state, used whenever a country has no published timeline: render a flat axis with the plain text "no published migration timeline" and no markers. Never show an empty or broken component. The absence of a timeline is itself information; present it calmly.

```
PANEL TIMELINE (fixed axis 2025 ─────────────────────────── 2036)

  hybrid: Required

       2028          2031               2035
        │             │                  │●        ← completion marker
  ──────┼─────────────┼──────────────────┼────────  carries process colour
        ▲today
   discovery      high-priority      full migration
   and plan        migration

EMPTY STATE
  ─────────────────────────────────────────────────
  no published migration timeline
```

## page: country index

A browsable list or grid of every country with data, for visitors who prefer not to hunt on the map. Each entry shows the country name, its standards-process chip, its target-completion year, and a one-line clip of the summary. Clicking opens the same profile (either navigates to a country view or opens the panel). Allow simple sorting or grouping by standards process and by target year, since those are the two axes that carry meaning. Keep it calm and scannable.

## page: analysis (blog)

The change-over-time and commentary channel.

Listing: a clean reverse-chronological list of published posts, each with title (serif), date (monospace), a one-line excerpt, and tags. Tag filtering across the top. Restrained, editorial, lots of whitespace.

Post: a focused reading column in the serif face with a comfortable measure. Title, date, author, tags at the head. Body renders the Notion content. If a post references countries, offer quiet links back to those profiles. No sidebars competing for attention.

## page: documents (research tool)

This is a tool, not a static table. It must reward someone who came to find primary sources.

- A prominent search field at the top, searching across document title and summary. Results update as the query narrows.
- Filters alongside or above the results: country, document type, year, and tier. Multiple filters combine.
- Results as a table on desktop (title, issuing organisation, country, year, type, tier, link), reflowing to cards on mobile. Each row links out to the source and shows enough to judge relevance at a glance.
- The pre-filtered state: when a visitor arrives here by clicking an institution in a country profile, the issuing-organisation filter is already applied and clearly shown, with an obvious way to clear it and broaden the search. Make it evident why they are seeing a filtered set.

Keep the table quiet and readable: tier as a small monospace code, generous row spacing, hairline separation only where it aids scanning.

```
┌───────────────────────────────────────────────────────────────┐
│  Documents                                                      │
│  [ search title and summary…………………………… ]                       │
│  country ▾   type ▾   year ▾   tier ▾        showing: ANSSI ✕   │
├───────────────────────────────────────────────────────────────┤
│  title                       org        country  year  type  T  │
│  ─────────────────────────────────────────────────────────────│
│  Views on the PQC transition  ANSSI      France   2023  pos   T1 │
│  Follow-up position paper      ANSSI      France   2024  pos   T1 │
└───────────────────────────────────────────────────────────────┘
```

## page: about and get a briefing

Short. A plain-language note on what the Atlas covers and how the data is gathered (institutional documents only, how recency is maintained), written in the serif reading face. Then the consulting conversion point: a clear, low-key invitation to request a briefing, with a contact link or a minimal form. No hard sell. The authority of the instrument does the selling.

## states, everywhere

Loading: quiet skeletons or a simple progress indication, never a spinner-only blank.
Empty: every empty state is a calm statement of fact in the interface voice, the no-timeline state being the key example. An empty documents search says how to broaden, not just "no results".
Error: explain what happened and what to do, in the interface's voice, never an apology and never a raw error.
No data: countries without data recede on the map and, if reachable, their profile states plainly that no institutional documents are yet recorded.

## quality floor

Responsive to mobile. Visible keyboard focus on every interactive element. Reduced motion respected. Sufficient contrast throughout, and the standards-process colours checked for colour vision deficiency with text labels as backup. The map and the documents tool both usable by keyboard.

## copy voice

British English. No em-dashes or en-dashes. Active voice. Plain terms from the visitor's side of the screen. Never expose the underlying theoretical vocabulary or the raw database values as jargon: a visitor reads "NIST-aligned", not a code; "no published migration timeline", not a null. Labels label, summaries inform, nothing sells by adjective. Keep the register calm and exact, the way a good standards document reads.

## component inventory (the seams with Claude Code)

So the two of you agree on where the visual layer meets the structure:
- Site shell: header, navigation, footer, page container.
- MapView: the react-simple-maps island, fed country-to-process data and click handlers, emits the selected country.
- ProfilePanel: receives a country object, renders the seven sections, hosts the timeline and the institution links.
- MigrationTimeline: receives the parsed {year, label} array plus target-completion and process colour, renders the fixed-axis visual or the empty state.
- ProcessChip and ProcessLegend: the colour-to-label encoding, shared by map and panel.
- CountryIndex: the browsable grid with sort or group controls.
- BlogList and BlogPost: editorial listing and reading layouts.
- DocumentsTool: search field, filter controls, results table or cards, and the pre-filtered arrival state.
- BriefingCallout: the conversion point used on About and optionally in the footer.
- Shared states: Loading, Empty, Error primitives reused across the above.

## start here

Begin from the design thesis: build the map page and the profile panel first, since they carry the signature. Get the monochrome-with-functional-colour discipline right there, prove the migration timeline visual against both the three-milestone shape (UK style, finishing 2035) and the compressed shape (Australia style, finishing 2030), then carry the established system into the documents tool, the index, and the editorial pages.
