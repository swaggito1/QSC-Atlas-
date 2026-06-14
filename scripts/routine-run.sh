#!/bin/zsh
# Phase E, headless: run the QSC Atlas scraper routine through the Claude Code CLI.
# Invoked weekly by launchd (com.qsc-atlas.scraper). Updates DOCUMENTS only; the
# camp/profile layer stays gated. Logs each run to logs/routine-*.log.

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
export HOME="/Users/swannashworth"
cd /Users/swannashworth/qsc-atlas || exit 1

# Load secrets: ANTHROPIC_API_KEY for the CLI, plus FIRECRAWL_API_KEY / NOTION_TOKEN
# / DEPLOY_HOOK_URL for the node scripts.
set -a
[ -f .env ] && source ./.env
set +a

mkdir -p logs
LOG="logs/routine-$(date +%Y%m%d-%H%M%S).log"

{
  echo "=== QSC scraper routine: start $(date) ==="
  claude -p "Run the QSC Atlas scraper routine now. Follow /Users/swannashworth/qsc-atlas/scraper/ROUTINE.md exactly for the next batch of 5 countries. Documents only: do not assign or change any country's camp, profile, timeline, or analytical field. End with a concise summary: documents added or updated per country, anything that returned nothing, and approximate Firecrawl credits spent." \
    --allowedTools "Bash" "Read" "Write" "Edit" \
    --permission-mode acceptEdits
  echo "=== exit=$? : end $(date) ==="
} >> "$LOG" 2>&1
