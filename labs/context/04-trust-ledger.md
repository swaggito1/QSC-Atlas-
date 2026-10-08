# Context 04: the trust ledger and the autonomy rules

Adapted for the labs from the shadow-mode ledger Swann designed in July 2026 for the Atlas maintenance routine. The principle is unchanged: autonomy is granted per source class on measured error rates, not on impressions, and some fields never become autonomous whatever the numbers say.

## what the routine proposes

Every change the watch and triage routine wants to make arrives as one pull request, labelled `lab-watch`, with the tool (`tool:exposure`, `tool:cascade`, `tool:rulebook`, `tool:shared`), the source class and the item type as labels, and a body that quotes the source.

## source classes

`trusted-institutional`: a domain listed in `data/trusted-domains.json`, plus `eur-lex.europa.eu`, `publications.europa.eu`, `op.europa.eu`, `oeil.secure.europarl.europa.eu`, `csrc.nist.gov`, `nist.gov`, `consilium.europa.eu` and `eca.europa.eu`. `new-institutional`: a government, regulator, parliament or standards body not yet on that list. `secondary`: everything else, including research institutes, datasets, law firms, journalism and vendors. The Global Risk Institute and evolutionQ survey is `secondary` for this purpose, however authoritative, because it is not the issuer of the instruments the tools describe.

## item types

`new-record` (a document, edge, incident event or instrument added), `field-change` (a value in an existing lab record changes), `status-change` (the legal or procedural status of an instrument changes), `survey-update` (new expert survey figures), `narrative-draft` (any prose meant for a visitor), `profile-proposal` (anything that would change an Atlas country profile field).

## how Swann records the outcome

Before merging or closing, Swann adds one `review:` label and, where the outcome was not `review:accept`, one `divergence:` label. `review:accept` means merged as proposed; `review:minor` means merged after a small correction; `review:substantive` means merged after rewriting; `review:reject` means closed. Divergence classes, most severe first: `divergence:status-misread` (a proposal treated as law, a draft as adopted, a target as a binding deadline, a withdrawn instrument as live), `divergence:factual` (wrong date, institution, instrument number, article, algorithm or standard), `divergence:attribution` (right fact, wrong source, or a secondary source presented as primary), `divergence:judgement` (factually clean but framed, weighted or placed differently from how Swann would), `divergence:style` (register or house-style drift). Judgement and style divergences are logged but do not count against graduation; they tune the triage instructions.

## the ledger file

`labs/ledger/trust-ledger.csv`, one row per closed `lab-watch` pull request, appended by the ledger workflow: `closed_at, pr, tool, source_url, source_class, item_type, proposed_action, would_auto_merge, reviewer_action, divergence, model, notes`. `would_auto_merge` records whether the item would have been eligible for auto-merge if its pair were already graduated: its item type and tool are not on the never-graduate list, and the gate checks passed. That is the shadow-mode evidence. A label added after closing still counts: the ledger workflow also runs when a closed pull request is labelled and updates that pull request's row.

## graduation and demotion

A source class and item type pair graduates to auto-merge when it shows at least 30 consecutive closed items with a combined `review:accept` and `review:minor` rate of 95 per cent or higher, and zero status misreads and zero factual errors across that run. Graduation is proposed by the monthly job as a pull request that edits `labs/config/autonomy.yaml`; Swann merges it or not. Any status misread or factual error, at any time including after graduation, demotes that pair to review for 60 days and resets its counter to zero. Demotion is applied automatically because it only reduces autonomy: the ledger workflow sets the pair to `review` with a `demoted_until` date the moment such a label is recorded, and the monthly job never proposes graduation for a pair before that date. The monthly job also ends the shadow window (moving every pair still in `shadow` to `review` once `shadow_days` have passed since `window.started_at`) and applies the model-change rule below.

## things that never graduate

`profile-proposal`, `status-change`, `survey-update` and `narrative-draft` items, in every class. Any record whose display would change a legal deadline, a probability, or a classification shown to a visitor. These always wait for Swann.

## model changes

The triage model is pinned in `labs/config/autonomy.yaml`. When the pinned model changes (`model.changed_at` in `autonomy.yaml`), the monthly job, and the ledger workflow if it runs first, return every graduated pair to `shadow` with a `reshadow_until` date 14 days on, whatever its record, because a new model is a new employee; after that date the pair returns to `auto-merge` only if its record since the change still meets the graduation rule.

## cadence

Weekly watch run. Swann reviews the week's pull requests in one session, about fifteen minutes when nothing is contentious. Monthly ledger report written to `labs/ledger/STATUS.md`: counts and rates per pair, any demotions applied, any graduations proposed, and one line noting whether error rates moved in a way that looks like a capability change.
