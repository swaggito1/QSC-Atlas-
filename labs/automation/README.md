# Automation templates

These are the original templates. Prompt 00 installed them on 30 September 2026, with the action versions checked and pinned (checkout v7, setup-node v7, upload-artifact v7, download-artifact v8, claude-code-action v1) and Node 24 on the runners. The live copies are `.github/workflows/lab-*.yml`, `.claude/skills/lab-triage/SKILL.md` and `scripts/lab/vercel-ignore.sh`: edit those, not these.

| Template | Installs to | Runs | Does |
|---|---|---|---|
| `lab-watch.yml.template` | `.github/workflows/lab-watch.yml` | Mondays 05:17 UTC, or by hand | Fetches every enabled watchlist source, commits updated snapshots, and when anything changed runs the triage skill and opens one pull request per proposal. |
| `lab-gate.yml.template` | `.github/workflows/lab-gate.yml` | Every pull request | Validation, invariant tests, style scan on changed files, Astro build; enables auto-merge only for graduated pairs. |
| `lab-ledger.yml.template` | `.github/workflows/lab-ledger.yml` | When a `lab-watch` pull request closes | Appends one row to `labs/ledger/trust-ledger.csv` from the review and divergence labels. |
| `lab-monthly.yml.template` | `.github/workflows/lab-monthly.yml` | 1st of each month, 04:23 UTC | Ledger report, automatic demotions, graduation proposals, freshness issue. |
| `lab-triage.SKILL.md.template` | `.claude/skills/lab-triage/SKILL.md` | Called by the watch workflow | Instructions Claude follows when turning a detected change into proposals. |
| `vercel-ignore.sh.template` | `scripts/lab/vercel-ignore.sh` | Every Vercel build | Skips a production build when a commit touches only snapshots, the ledger or watch state. |

Secrets the workflows expect, set in the GitHub repository settings: `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, uses Swann's Claude subscription) or `ANTHROPIC_API_KEY` (billed through the Claude Console), and `LAB_BOT_TOKEN`, a fine-grained personal access token limited to this repository with contents and pull requests write access. The bot token is needed because pull requests opened with the default `GITHUB_TOKEN` do not trigger other workflows, so the gate would never run on them.

GitHub disables scheduled workflows in a public repository after 60 days without repository activity. The weekly snapshot commits count as activity, so this should not bite, but the monthly report checks that the last watch run is less than 10 days old and says so if it is not.
