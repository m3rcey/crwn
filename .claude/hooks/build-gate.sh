#!/usr/bin/env bash
# Stop hook: build gate.
# Closes the execution loop on a real signal (the artifact), not on transcript prose.
# Runs `npm run build` INSIDE WSL, but only when src/ or supabase/ actually changed
# since the last build that passed. Blocks the turn (exit 2) with compiler output on failure.
#
# Why this replaced check-loop-markers.sh: that hook grep'd my own response for the
# words "triage" / "first principles" / "5-step" — it verified vocabulary, not behavior,
# and a loop that checks its own narration is a for-statement. See CLAUDE.md loop notes.

set -uo pipefail

REPO=/home/merce/workspace-crwn
cd "$REPO" 2>/dev/null || exit 0                     # never block on env weirdness
command -v npm >/dev/null 2>&1 || exit 0

# 1. Only gate turns that touched code. Clean tree (committed or untouched) -> pass.
DIRTY=$(git status --porcelain -- src supabase 2>/dev/null)
[[ -z "$DIRTY" ]] && exit 0

# 2. Skip if the code trees are byte-identical to the last build that passed.
CACHE="$REPO/.claude/hooks/.last-build-hash"
HASH=$( {
  git diff HEAD -- src supabase 2>/dev/null
  git ls-files --others --exclude-standard -z -- src supabase 2>/dev/null | xargs -0 -r cat 2>/dev/null
} | sha256sum | cut -d' ' -f1)
if [[ -f "$CACHE" && "$(cat "$CACHE" 2>/dev/null)" == "$HASH" ]]; then
  exit 0
fi

# 3. Build. Cache the hash only on success — a failing tree must re-run next turn.
LOG=/tmp/crwn-build-gate.log
if npm run build >"$LOG" 2>&1; then
  echo "$HASH" > "$CACHE"
  exit 0
fi

{
  echo "BUILD GATE FAILED — 'npm run build' did not pass. Fix before ending the turn."
  echo "(This gate only fires when src/ or supabase/ changed since the last passing build.)"
  echo
  echo "----- last 40 lines of build output -----"
  tail -40 "$LOG"
} >&2
exit 2
