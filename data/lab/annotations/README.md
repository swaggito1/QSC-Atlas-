# Annotations

`annotations.json` records what the country profile fields do not: the kind of each migration
timeline line, its lifecycle status and bindingness, which guide it restates, and the scope of each
regulation line. It is a sidecar, so no automation ever edits a profile field (`data/profiles/*.json`
or the Notion ATLAS_COUNTRIES rows) to add this information.

## What a row says

`dates[]` describes one line of a profile's Migration Timeline:

| Field | Meaning |
|---|---|
| `id` | Stable id, `{iso3}-{year}-{what}` in lower case. |
| `iso3` | The profile the line belongs to. |
| `year` | The year of the line, as the profile gives it. |
| `match` | A piece of the line's label, exactly as written in the profile. |
| `kind` | `plan`, `priority`, `complete`, `procurement` or `other`: the milestone kinds already used in `data/lab/readiness/readiness.json`, and no others. |
| `restates` | The id of a guide in `readiness.json` when the line repeats that guide's target (for example `eu-roadmap`), else `null`. |
| `status` | Lifecycle status of the instrument that sets the date (`LifecycleStatus`), or `null` when not recorded. |
| `bindingness` | Bindingness of that instrument (`binding-law`, `binding-by-market-access`, `soft-law`, `guidance`), or `null`. A separate axis from status. |
| `scope` | A short note on what the date covers, or `null`. |

`instruments[]` describes one line of a profile's Main Regulation: `iso3`, `match` (a piece of the
instrument's name), `pqcScope` (`pqc-specific`, `general-cyber` or `null`) and `status`.

Every row carries the lab evidence fields: `verify`, `verifiedAt` and `provenance` (source URL,
retrieval date, a verbatim excerpt of no more than 60 words, and the source class).

## Matching

Each row must match exactly one line of the profile: the line's year equals `year` and its label
contains `match`. A row with `restates` set must name a guide that reaches the profile (a guide
issued for that country, or the EU roadmap for an EU Member State) and has a milestone in that
year. `npm run lab:validate` fails otherwise (`scripts/lab/invariants/site.mjs`). When a profile
line is reworded in Notion and the dump refreshes `data/profiles`, the row stops matching and the
check names it.

## Leads, and Swann's confirmation

A row with `verify: true` is a lead. Production builds strip it, exactly as `loadDataset` strips
every other lab lead. Preview builds use it, and mark what rests on it: the profile line keeps its
own row, carries the row's kind and bindingness, is flagged as a lead (`lead: true`, drawn dotted
in ink-faint) and names the guide it may repeat (`restates`). A lead never folds a line into a
guide's row, so in preview the year shows twice, once as the dotted profile line and once as the
guide's own target, until Swann confirms it.

Swann confirms each row himself: he reads the source, then sets `verify: false` and `verifiedAt`
to the day he checked it. Nothing else in the build sets those two fields.

What a confirmed row changes: the profile timeline and Target dates show the kind and bindingness
beside the year, and a line with `restates` set is drawn once, as the guide's own target reaching
the country through EU membership, instead of twice. One rule decides that fold for Target dates
and for the profile's Across the Atlas block (`foldLines` in `src/lib/site/dates.ts`), so the two
never disagree: a folded line no longer counts among the country's own dates, and a country left
with no line of its own shows the guide's dates instead, marked "As an EU Member State".

## The seeded rows (1 October 2026)

Twenty-four leads, two for each of the twelve EU profiles whose timeline repeats the 2030 and 2035
targets of the EU coordinated roadmap and nothing else: BEL, CYP, CZE, DNK, GRC, HRV, IRL, ITA, LVA,
PRT, ROU and SVN. Each profile has the same two lines:

- `2030 | High-risk use cases migrated`, annotated as kind `priority`;
- `2035 | Full migration of all systems complete`, annotated as kind `complete`.

Both restate `eu-roadmap`, with the roadmap's status (`published`) and bindingness (`soft-law`).
Their provenance is copied unchanged from the roadmap's 2030 and 2035 milestones in `readiness.json`.

Before confirming these rows, Swann may want to weigh the following.

1. The roadmap's 2035 milestone covers medium-risk use cases, and low-risk ones "as much as
   feasible". The profile line says "Full migration of all systems complete", which says more
   than the source. Confirming the row keeps the profile wording; relabelling the line in Notion
   is the other option (decision 5 in the structure specification).
2. None of the twelve profiles names a national instrument behind these years. If a national
   source turns up for any of them, the row should drop `restates` and cite that source instead.

## Leads added on 1 October 2026 (target-dates package)

Five more leads, each read at its source in the session that added it (retrieved 1 October 2026,
the excerpts verbatim):

| Row | Profile line | Kind | Restates | Read at |
|---|---|---|---|---|
| `gbr-2028-ncsc-timelines` | 2028, Complete discovery of systems and services using cryptography | `plan` | `ncsc-timelines` | NCSC, Timelines for migration to post-quantum cryptography, key milestones "By 2028" |
| `gbr-2031-ncsc-timelines` | 2031, Complete migration of highest-priority systems and services | `priority` | `ncsc-timelines` | the same page, "By 2031" |
| `gbr-2035-ncsc-timelines` | 2035, Complete migration of all systems, services and products | `complete` | `ncsc-timelines` | the same page, "By 2035" |
| `can-2031-ca-roadmap` | 2031, High-priority Government of Canada systems migrated | `priority` | `ca-roadmap` | Cyber Centre, ITSM.40.001, section 4 |
| `can-2035-ca-roadmap` | 2035, Remaining Government of Canada systems migrated | `complete` | `ca-roadmap` | the same page, section 4 |

Each carries its guide's status (`published`) and bindingness (`guidance`), with a second excerpt
for that reading: the NCSC calls its dates "indicative timelines", and the Cyber Centre calls its
document a "recommended roadmap". The two Canadian rows also carry the scope the page states,
"Federal departments and agencies".

Before confirming them, Swann may want to weigh the following.

1. The Canadian page also uses "must" in places ("Every organization managing information
   technology (IT) systems must migrate", "The departmental PQC migration plan must identify").
   The rows keep the guide record's `guidance`; the Canada question in decision 5 (the profile's
   "requires" against the Readiness copy's "recommended") applies here too.
2. The Canadian profile's 2026 line (procurement clauses, ITSM.00.501) has no row: its source is
   a different document, which was not read in this session.

## Lines that repeat a guide but carry no row

These lines also repeat a guide's target, and no row annotates them, so Target dates draws each
of those years twice: once as the profile line and once as the guide's own row. Each is a
candidate lead for Swann.

- ESP, FIN, FRA, HUN, NLD and POL: the 2030 and 2035 lines end "(EU coordinated roadmap)". No row
  was added, because the roadmap PDF could not be fetched in the session that added the leads
  above (the request failed at the TLS step through the sandbox proxy), and a new row's
  provenance must be read in the session that writes it.
- LUX: the 2030 line repeats the EU roadmap's 2030 target and calls it an "EU deadline", which
  the roadmap, a soft-law text, does not set. Target dates shows the line in the profile's own
  words, with its kind and bindingness "not recorded", so the word "deadline" appears there once.
  Rewording the line in Notion is Swann's call; a lead row with `restates: "eu-roadmap"` would
  draw the year once after he confirms it.

## Places whose lines wait for a re-read

The structure specification (6.3) keeps the United States' rows as leads until they are re-read
at the primary sources. `REREAD` in `src/lib/site/dates.ts` holds that list (today only `USA`).
A profile line of such a place with no annotation is marked as a lead: preview builds draw it
dotted, and production builds leave it out, so the United States is not offered under "Where you
operate" there and its name in the search says why. A confirmed row in this file (with
`verify: false`) lifts the rule for the line it matches, and only that line.

## Until Swann confirms

In production the leads are stripped, so each of the twelve EU profiles shows its two lines as its
own, with kind and bindingness "not recorded", beside the roadmap's rows that reach it through EU
membership. In preview the same two lines show dotted, as leads, with the kind and bindingness the
row proposes. Confirming a row is what draws the year once. The GBR and CAN leads behave the same
way, beside the NCSC's and the Cyber Centre's own rows.
