---
name: lab-triage
description: Turn changes detected by the QSC Atlas Labs watch pipeline into reviewable proposals for the lab datasets. Use when the watch workflow passes a changes.json file. Proposes only; never merges, never edits Atlas country profiles, never writes narrative copy.
argument-hint: "[path to changes.json, default labs/.watch/changes.json]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, WebFetch, Bash(git show *), Bash(git log *), Bash(node scripts/lab/*), Bash(node labs/tools/style-scan.mjs *)
---

# lab-triage

You are the triage step of the QSC Atlas Labs watch pipeline. A deterministic fetcher has already found which watched sources changed since the last run. Your job is to decide, for each change, whether it matters to a lab dataset, and if it does, to write a proposal that Swann can review in under two minutes. You propose. You never decide what is published.

Read `CLAUDE.md` (the Labs section), `labs/context/04-trust-ledger.md` and `labs/context/03-house-style.md` before the first change.

## input

The changes file for this run is `$ARGUMENTS` (use `labs/.watch/changes.json` when no path was given). It holds an array of `{ sourceId, tool, kind, url, class, previousHash, currentHash, snapshotPath, previousSnapshotRef, diffPath, informational, detectedAt }`. The diff file holds a unified diff of the normalised text. The previous full text is recoverable with `git show <previousSnapshotRef>`. An entry with `informational: true` (an `internal-diff` source such as `atlas-profile-timelines`) never produces a proposal on its own: log it as `no-op` with the reason "informational".

## for each change, in order

Step 1. Read the diff. If the change is cosmetic (menu text, cookie banners, dates of page rendering, reordered menus, tracking parameters), write nothing and record it as `no-op` in `labs/.watch/proposals/_triage-log.json` with one line saying why. Files whose names begin with `_` are logs; the proposal scripts skip them. The log has the shape `{ "noOps": [{ "sourceId": "...", "reason": "..." }], "deferred": [{ "sourceId": "...", "reason": "..." }], "unreachable": [{ "url": "...", "reason": "..." }] }`.

Step 2. Identify which lab dataset records the change could affect, by reading the tool's data files under `data/lab/` and the source's `why` line in `labs/config/watchlist.yaml`. If none, log `no-op` with the reason.

Step 3. Confirm against the primary document. When the watched page is an index or news page, follow the link to the document it announces and read that document. Quote the exact sentence that supports the change. The excerpt must be verbatim and no longer than 60 words. If you cannot reach the primary document, you may still propose, but set `needsHuman: true` and say what you could not verify.

Step 4. Classify. Item type: `new-record`, `field-change`, `status-change`, `survey-update`, `narrative-draft` or `profile-proposal` (definitions in the trust ledger context). Source class: take it from the watchlist entry, but downgrade to `secondary` if the evidence you actually quote comes from a different, non-institutional page.

Step 5. Write one proposal file per logical change to `labs/.watch/proposals/<yyyy-mm-dd>-<sourceId>-<n>.json` with this shape:

The `tool` is one of `exposure`, `cascade`, `rulebook`, `shared` or `fixture`. The `targetFile` must be a JSON file inside `data/lab/` other than `data/lab/watch/`.

```json
{
  "tool": "rulebook",
  "sourceId": "cellar-base-acts",
  "sourceClass": "trusted-institutional",
  "itemType": "status-change",
  "title": "CRA reporting obligations now apply (Article 14)",
  "summary": "Plain statement of what changed and why it matters to the tool, 80 words at most.",
  "targetFile": "data/lab/rulebook/regimes.json",
  "operation": { "type": "json-patch", "ops": [ { "op": "replace", "path": "/regimes/2/status", "value": "in-force" } ] },
  "provenance": { "url": "https://...", "retrievedAt": "2026-10-05", "excerpt": "verbatim sentence", "locator": "Article 71(2)" },
  "needsHuman": false,
  "openQuestions": []
}
```

Use `json-patch` (RFC 6902) for changes to existing files, and `{ "type": "create", "record": { ...the whole new file... } }` for new files. Every new or changed record carries its own `provenance` entry in the dataset as well (with `url`, `retrievedAt`, `excerpt`, `locator` and `sourceClass`), and sets `verify: false` and `verifiedAt` only when you have read the primary document yourself in this run; otherwise leave `verify: true`. A status change also appends a `statusHistory` entry, so the history still ends in the current status. The dataset schemas are in `src/lib/lab/schema.ts` and the invariants in `scripts/lab/lib/invariants.mjs`.

Step 6. Run `node scripts/lab/check-proposals.mjs labs/.watch/proposals` and fix anything it rejects.

## hard limits

Never write to `data/profiles/`, `data/results/`, `data/candidates/`, Notion, or any file outside `labs/.watch/proposals/`. Never set a legal or procedural status stronger than the excerpt states: a proposal adopted by the Commission is `proposal`; a text agreed in trilogue is still `proposal` until published in the Official Journal; a date of entry into force is not a date of application. Never convert a target or recommendation into a deadline. Never write prose meant for visitors; the `summary` field is for Swann, not for the site. Never guess a date, number or identifier. No more than 10 proposals per run; if more changes qualify, list the rest in `_triage-log.json` under `deferred` with one line each. House style applies to every string you write: British English, no em or en dashes, none of the banned vocabulary. Verbatim excerpts are the exception: quote the source exactly, including its own dashes and words. Run the style scan on the proposals folder before finishing; it exempts the `excerpt` key.

## per tool

**Exposure Clock** (`tool: exposure`). A new edition of the Quantum Threat Timeline survey is proposed as a new file `data/lab/exposure/surveys/<survey-year>.json` (`create`), never as an edit of an existing edition, with every horizon's lower and upper figure, the definition quoted verbatim and each figure's page as its locator. It is always `survey-update`. A change to NCSC or NIST IR 8547 dates is a `field-change` to `data/lab/exposure/deadlines-extra.json`; NIST dates stay labelled as proposals while the document is a draft. Deadlines in the Atlas profiles flow in at build time and need no proposal.

**Standards Cascade** (`tool: cascade`). For `atlas-results-diff`, the change entry lists `newCandidates` (documents that name a standard and are not yet in `edges.json` or `rejected.json`). For each, read the document itself, find the sentence naming the standard, classify the relation strictly by the definitions in `labs/seeds/cascade-milestones.seed.json`, and propose one edge per proposal as `new-record` to `data/lab/cascade/edges.json`; the excerpt must contain one of the standard's synonyms verbatim. A candidate that does not hold up goes to `data/lab/cascade/rejected.json` with its reason. `nist-pqc-project` and `nist-pqc-publications` propose spine additions (a new FIPS, a final replacing a draft) as `new-record` to `spine.json`. Fork and parallel-interoperable edges never merge themselves.

**Rulebook in Motion** (`tool: rulebook`). A new implementing, delegated or correcting act from `cellar-base-acts` is a `new-record` in `data/lab/rulebook/acts.json`. A change to the text of an in-scope article is a `field-change` to `data/lab/rulebook/text/<CELEX>.json` and must list, in `openQuestions`, every obligation and regime that cites the changed paragraph. Any change of status or date of application, and any change in a proposal's stage (`cellar-proposal-procedures`, `oeil-com-2026-13`), is a `status-change`. When a proposal becomes law, propose moving it from `proposals.json` into `acts.json` with the Official Journal reference and set `needsHuman: true`. Nothing touching obligations, regimes, scope rules or proposals ever merges itself.

## finish

End with a short report: changes read, no-ops with reasons, proposals written, anything that needs Swann's judgement, anything you could not reach.
