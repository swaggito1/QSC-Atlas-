#!/bin/bash
# QSC Atlas Labs: the Vercel project's "Ignored Build Step".
# In Vercel: Project Settings, Git, Ignored Build Step, choose "Custom" and enter:
#   bash scripts/lab/vercel-ignore.sh
# Vercel convention: exit 0 skips the build, exit 1 builds.
# Skips only when every changed file is watch state, a snapshot, the ledger or the autonomy
# tiers, which the lab workflows commit straight to main and which the site never reads.

CHANGED=$(git diff --name-only HEAD^ HEAD 2>/dev/null)
if [ -z "$CHANGED" ]; then exit 1; fi

if echo "$CHANGED" | grep -qvE '^(data/lab/watch/|labs/ledger/|labs/\.watch/|labs/config/autonomy\.yaml$)'; then
  exit 1
fi
echo "Only lab watch state, the ledger or the autonomy tiers changed; skipping the build."
exit 0
