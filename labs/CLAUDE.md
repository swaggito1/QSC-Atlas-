# QSC Atlas Labs: standing rules for Claude Code

These rules bind every session that builds or maintains the lab tools. Prompt 00 merges them into the repository's root `CLAUDE.md` under a "Labs" heading so they load on every run, including runs inside GitHub Actions.

## who you are working for

Swann Ashworth, Associate Research Assistant in the Cybersecurity@CEPS unit in Brussels, who built and maintains the QSC Atlas with Dr Lorenzo Pupillo. Swann keeps final analytical and editorial authority. You build, verify and propose; he decides. At every fork the prompt names, stop and ask. He vibe codes, so explain each terminal command in one line before running anything that installs, deletes, pushes or touches secrets.

## facts and dates

Never write a date, deadline, probability, article number, standard identifier or legal status that you have not read in a source during this session. Every such value in the lab data carries a provenance record: source URL, retrieval date, a verbatim excerpt of no more than 60 words, and the source class. A seed record marked `verify: true` is a lead, not a fact, until you have confirmed it and set `verify: false` with a `verifiedAt` date. When a source cannot be reached, leave the record unverified and say so; do not fill the gap from memory.

## legal status is the highest-risk field

Keep the lifecycle status vocabulary exact (`LifecycleStatus` in `src/lib/lab/types.ts`): `proposal`, `adopted`, `in-force`, `applies-from`, `repealed`, `withdrawn`, and for soft instruments `published` and `superseded`. It is a separate axis from the bindingness vocabulary the Atlas already uses in `src/lib/regulation.ts` (`binding-law`, `binding-by-market-access`, `soft-law`, `guidance`); never mix the two. A Commission proposal is never rendered as law. A target date is never rendered as a legal deadline unless the instrument makes it binding. Misreading a status is the most serious error class in the trust ledger, and a single occurrence demotes the source class that produced it.

## what the automation may and may not touch

The watch and triage routine proposes changes through pull requests and never merges its own work unless `labs/config/autonomy.yaml` marks that source class and item type as graduated. It never modifies Atlas country profile fields (`data/profiles/*.json` or the Notion ATLAS_COUNTRIES rows), never changes a coordination posture, standards role, migration timeline, legal status or target completion, and never writes narrative prose for publication. The internal `analyticalNote` field is never read into any lab page.

## visible copy

British English. No em dashes or en dashes anywhere, in copy, code comments, commit messages, YAML or JSON. Write ranges as "2025 to 2036". Active voice, varied sentence length, prose first. None of these words in anything a visitor or reader sees: delve, robust, leverage, foster, holistic, comprehensive, landscape, realm, moreover, furthermore, additionally, notably, crucial, pivotal, intricate, seamless, underscore, navigate, tapestry, nuanced, multifaceted; nor the phrases bottom line, taken together, perhaps most importantly, put simply, here's the thing, at its core. <!-- style-scan-ignore --> Use sparingly: "not X but Y" pivots, sentence-final "X, not Y." contrasts, enumeration openers, spatial verbs for abstractions (sits, lands, lives) and architecture metaphors (load-bearing, forcing function, machinery). No theoretical vocabulary a visitor can see: no Triple Helix, Governance of Expectations, code families, helix strength, imbalance metrics, or "standard-maker, contextualiser, taker" outside the role badge the Atlas already uses. One exception: a verbatim excerpt from a source keeps the source's own punctuation and words, because a quotation that has been edited is no longer evidence. The scanner exempts the JSON keys `excerpt`, `documentTitle`, `definitionVerbatim`, `sourceTitle` and `quote` for that reason, and nothing else. Run `node labs/tools/style-scan.mjs <paths> --exclude=data/lab/watch` before every commit that touches copy; a HARD finding blocks the commit.

## design

The Atlas is a monochrome instrument: ink on warm paper. Colour appears in exactly one role, encoding a jurisdiction's coordination posture (NIST-led ecosystem, EU coordinated roadmap, Sovereign bloc, Engaged but unaligned), using `POSTURE_META` in `src/lib/process.ts`. The lab tools obey the same rule. Everything else is ink, greys, weight, dash pattern and the solid versus open marker convention. Use the tokens in `src/styles/global.css` and the three faces already loaded: Newsreader for reading, Schibsted Grotesk for the instrument, Spline Sans Mono for dates, codes and numbers. Respect reduced motion. Every chart has a text or table alternative. Colour is never the only carrier of meaning.

## branding, attribution and release gates

The Atlas carries the CEPS name. Each lab page has a byline field. No lab tool goes to production until Swann confirms in writing in the pull request that Lorenzo Pupillo has no objection to the tool appearing under the Atlas and CEPS name with Swann's byline. Until then, tools ship to preview deployments only, controlled by the `public` flag in `data/lab/tools.json`.

## commands you will use

`npm run dev`, `npm run build`, `npm run lab:validate`, `npm run lab:test`, `npm run lab:check` (validate, test and style scan together), `node scripts/lab/watch.mjs --dry-run`. Prompt 00 creates the `lab:*` scripts.

## when something is unclear

Say what you do not know, propose the smallest reversible step, and ask. Do not re-litigate decisions recorded in `docs/qsc-atlas-2-backend-brief.md`, `docs/CLASSIFICATION_MODEL.md` or `docs/REGULATORY_LAYER_SPEC.md` without flagging it first.
