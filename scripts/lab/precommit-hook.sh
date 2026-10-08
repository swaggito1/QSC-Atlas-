#!/bin/bash
# QSC Atlas Labs: a guard for Claude Code sessions (project hook in .claude/settings.json).
# Runs before every Bash tool call. When the command is a git commit and any lab file is
# staged or changed, it runs `npm run lab:check` and denies the commit if the checks fail,
# giving the failing output as the reason. Reads the PreToolUse input as JSON on stdin.

INPUT=$(cat)
# fast path: most commands are not commits
case "$INPUT" in *commit*) ;; *) exit 0 ;; esac

CMD=$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command ?? "")}catch{}})')
printf '%s' "$CMD" | grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]+[^;&|]*)?[[:space:]]commit([[:space:]]|$)' || exit 0

DIR="${CLAUDE_PROJECT_DIR:-$(printf '%s' "$INPUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).cwd ?? "")}catch{}})')}"
cd "$DIR" 2>/dev/null || exit 0

# a git that runs: LAB_GIT, then git on PATH, then GitHub Desktop's bundled git
GIT=""
for c in "$LAB_GIT" git "/Applications/GitHub Desktop.app/Contents/Resources/app/git/bin/git"; do
  [ -n "$c" ] && "$c" --version >/dev/null 2>&1 && { GIT="$c"; break; }
done
[ -z "$GIT" ] && exit 0

LAB='^(data/lab/|src/pages/lab/|src/components/lab/|src/lib/lab/|scripts/lab/|labs/|\.claude/skills/lab-triage/|\.github/workflows/lab-|CLAUDE\.md$)'
CHANGED=$( { "$GIT" diff --cached --name-only; "$GIT" diff --name-only; "$GIT" ls-files --others --exclude-standard; } 2>/dev/null | grep -E "$LAB" | grep -v '^data/lab/watch/' | sort -u)
[ -z "$CHANGED" ] && exit 0

if OUT=$(npm run --silent lab:check 2>&1); then exit 0; fi

REASON=$(printf 'npm run lab:check failed, so this commit is blocked. Lab files changed:\n%s\n\nFailing output (last 40 lines):\n%s\n' "$CHANGED" "$(printf '%s' "$OUT" | grep -vE '^\s*$' | tail -40)")
printf '%s' "$REASON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:s}})))'
exit 0
