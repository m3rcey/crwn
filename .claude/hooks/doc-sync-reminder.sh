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
  # Map changed code areas to the canonical docs that own their rules
  # (doc ownership: docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md). Static
  # path matching cannot judge semantic impact; it narrows WHERE to look, the
  # agent still judges WHETHER a doc claim changed.
  AREA_HITS=""
  area() { # $1 = grep -E pattern over changed paths, $2 = docs to name
    if echo "$CODE" | grep -qE "$1"; then AREA_HITS="${AREA_HITS}  - $2"$'\n'; fi
  }
  area 'src/lib/(stripe|earningsNet|webhookHandlers|teamSplits|referrals|platformTier)|src/app/api/stripe' \
       'money/Stripe change -> 07-BUSINESS-RULES, 05-DATABASE, 13-CURRENT-STATE'
  area 'src/lib/constraint|src/lib/ai/' \
       'Constraint/Manager change -> 02-FEATURE-MAP, 23-ZERO-TO-ONE-STRATEGY, 24-RECOMMENDATION-OUTCOME-LINKAGE'
  area 'src/app/setup|src/lib/onboarding|src/app/api/onboarding|useArtistSetup' \
       'onboarding change -> 19-ONBOARDING-FLOW (+ the setup section of CLAUDE.md)'
  area 'postWinReferral|campaignAttribution|attributionLookup|src/app/api/recruit|ReferralPersist' \
       'referral/attribution change -> 25-POST-WIN-REFERRAL, 22-VIRALITY-ENGINE-ARCHITECTURE, 07-BUSINESS-RULES'
  area 'src/lib/campaigns' \
       'Fan Drives change -> 22-VIRALITY-ENGINE-ARCHITECTURE (section 28 is what is live)'
  area 'src/lib/(popups|comms)|src/lib/notifications' \
       'pop-up/comms change -> 02-FEATURE-MAP (governance sections), 13-CURRENT-STATE'
  area 'src/app/api/admin|src/lib/analytics' \
       'admin/metrics change -> 13-CURRENT-STATE, 18-SOURCE-MAP (metric->source pins live in adminActivation.test.ts)'
  area 'src/lib/(fulfillment|promise|revenueRamp)' \
       'promises/ramp change -> 02-FEATURE-MAP (promise ownership), docs/REVENUE_RAMP.md'
  area 'src/lib/quests|artistRoadmap' \
       'quests/roadmap change -> 02-FEATURE-MAP, 19-ONBOARDING-FLOW'
  area 'src/lib/architecture|vitest\.architecture|supabase/' \
       'architecture-contract or migration change -> 26-PRODUCT-DRIFT-PREVENTION (registry + EXPECTED_MIGRATION_STATE; add a probe line for a new migration)'
  {
    echo "SYNC REMINDER: the latest commit(s) changed code under src/ or supabase/."
    echo "Before ending the turn, reconcile the derived state:"
    if [[ -z "$DOCS" ]] && [[ -n "$AREA_HITS" ]]; then
      echo "Canonical docs this change most likely touches (judge each, do not update blindly):"
      printf '%s' "$AREA_HITS"
    elif [[ -z "$DOCS" ]]; then
      echo "  - docs/crwn-brain/**  (routes/flows, business rules, database, security, source map, current-state, feature map)"
    fi
    if [[ -z "$DOCS" ]]; then
      echo "  - CLAUDE.md            (if a rule, flow, or convention changed)"
      echo "  - public/sw.js CACHE_NAME bump  (if the change is user-facing frontend)"
    fi
    echo "  - TODO.md             (ADD any founder-only work this created: a migration to run, an env var, a secret to rotate, a pricing/legal call, a dark-launched flag to flip. DELETE items it completed. Never leave done items.)"
    echo "  - npm run verify:architecture  (2.5s; run it if the change touches anything the invariant registry names)"
    echo "If updates are warranted, make them now and commit. If none are needed, say so briefly and continue."
    echo
    echo "Changed src files in this range:"
    echo "$CODE" | sed 's/^/  /'
  } >&2
  exit 2
fi

exit 0
