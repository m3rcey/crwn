#!/usr/bin/env bash
# Stop hook: derived-state (docs + TODO) sync reminder.
#
# After a commit that changes code (src/ or supabase/), remind Claude ONCE (per
# commit range) to review whether the DERIVED state needs updating:
#   - TODO.md            (always: founder-only work created / items completed)
#   - docs/crwn-brain/** (only when the commit did not already touch them)
#   - CLAUDE.md, public/sw.js CACHE_NAME bump (same brain-gated bullet)
# This is a reminder, not an enforcer: it fires at most once per new code
# commit and never nags across later turns for the same commit.
#
# Loop-safe by two guards:
#   1. stop_hook_active  -> the Stop was itself triggered by a Stop-hook
#      continuation; Claude already saw the reminder this turn, so stay quiet.
#   2. .last-docsync-head sentinel -> the last HEAD we already looked at, so a
#      given commit is only ever reminded about once.
#
# Read-only git only (rev-parse / diff --name-only) so the colon-named-file
# hazard that breaks `git add -A` in this repo never applies here.

set -uo pipefail

REPO=/home/merce/workspace-crwn
cd "$REPO" 2>/dev/null || exit 0                      # never block on env weirdness
command -v git >/dev/null 2>&1 || exit 0

# Guard 1: don't re-fire on a Stop that a Stop hook already continued this turn.
INPUT=$(cat 2>/dev/null || echo "")
case "$INPUT" in
  *'"stop_hook_active":true'*|*'"stop_hook_active": true'*) exit 0 ;;
esac

# HEAD, with an inert test seam (DOCSYNC_TEST_HEAD is never set in production).
HEAD=${DOCSYNC_TEST_HEAD:-$(git rev-parse HEAD 2>/dev/null)}
[[ -z "$HEAD" ]] && exit 0
SENT="$REPO/.claude/hooks/.last-docsync-head"
LAST=$(cat "$SENT" 2>/dev/null || echo "")

# First run: record a baseline and stay quiet about pre-existing history.
if [[ -z "$LAST" ]]; then
  echo "$HEAD" > "$SENT"
  exit 0
fi

# Nothing new committed since we last looked (e.g. a pure conversation turn).
[[ "$HEAD" == "$LAST" ]] && exit 0

# Files changed across the new commit range. Fall back to the last commit if the
# range is invalid (amend/rebase/force moved the baseline off the graph).
CHANGED=$(git diff --name-only "$LAST..$HEAD" 2>/dev/null)
[[ -z "$CHANGED" ]] && CHANGED=$(git diff --name-only "HEAD~1..HEAD" 2>/dev/null)

# Advance the baseline now: remind at most once per commit range, no cross-turn nag.
echo "$HEAD" > "$SENT"

CODE=$(echo "$CHANGED" | grep -E '^(src|supabase)/' || true)
DOCS=$(echo "$CHANGED" | grep -E '^docs/crwn-brain/' || true)

# Remind on ANY code/supabase change (once per commit range; the sentinel is already advanced
# above, so this never nags across later turns for the same commit). The brain bullets are gated
# on the brain docs being untouched; the TODO bullet always fires on a code change, because
# founder-only work (a migration to run, an env var, a flag to flip) most often lands in a code
# commit and TODO.md has no other reminder.
if [[ -n "$CODE" ]]; then
  {
    echo "SYNC REMINDER: the latest commit(s) changed code under src/ or supabase/."
    echo "Before ending the turn, reconcile the derived state:"
    if [[ -z "$DOCS" ]]; then
      echo "  - docs/crwn-brain/**  (routes/flows, business rules, database, security, source map, current-state, feature map)"
      echo "  - CLAUDE.md            (if a rule, flow, or convention changed)"
      echo "  - public/sw.js CACHE_NAME bump  (if the change is user-facing frontend)"
    fi
    echo "  - TODO.md             (ADD any founder-only work this created: a migration to run, an env var, a secret to rotate, a pricing/legal call, a dark-launched flag to flip. DELETE items it completed. Never leave done items.)"
    echo "If updates are warranted, make them now and commit. If none are needed, say so briefly and continue."
    echo
    echo "Changed src files in this range:"
    echo "$CODE" | sed 's/^/  /'
  } >&2
  exit 2
fi

exit 0
