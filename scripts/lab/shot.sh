#!/bin/bash
# QSC Atlas: screenshot a page of the local dev server. A thin wrapper around shot.mjs, which
# drives headless Chrome at a true device width, waits for hydration, reports horizontal
# overflow and runs one Chrome at a time. Nothing leaves the machine.
# Usage: bash scripts/lab/shot.sh URL OUT.png [WIDTH] [HEIGHT] [--full]
# Chrome needs to run outside the command sandbox (it creates its own sockets).
exec node "$(dirname "$0")/shot.mjs" "$@"
