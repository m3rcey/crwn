#!/usr/bin/env bash
# Stop hook: task-complete email.
# Emails Josh (joshn.wms@gmail.com) via Resend when a SUBSTANTIVE turn ends.
# "Substantive" = more than CRWN_NOTIFY_MIN_SECONDS (default 120s) elapsed since
# the prompt was submitted (UserPromptSubmit stamps .last-prompt-ts). Quick Q&A
# turns stay silent. One email per prompt: if another Stop hook (build gate)
# blocks the turn and Stop fires again, .last-notify-ts dedupes the send.
# Never blocks the turn: every failure path exits 0.

set -uo pipefail

REPO=/home/merce/workspace-crwn
cd "$REPO" 2>/dev/null || exit 0

TS_FILE="$REPO/.claude/hooks/.last-prompt-ts"
SENT_FILE="$REPO/.claude/hooks/.last-notify-ts"

[[ -f "$TS_FILE" ]] || exit 0
TS=$(cat "$TS_FILE" 2>/dev/null)
[[ "$TS" =~ ^[0-9]+$ ]] || exit 0

# Dedup: already emailed for this prompt.
[[ -f "$SENT_FILE" && "$(cat "$SENT_FILE" 2>/dev/null)" == "$TS" ]] && exit 0

NOW=$(date +%s)
ELAPSED=$(( NOW - TS ))
MIN=${CRWN_NOTIFY_MIN_SECONDS:-120}
(( ELAPSED >= MIN )) || exit 0

# Resend key from .env.local (never committed, never echoed).
KEY=$(grep -m1 '^RESEND_API_KEY=' "$REPO/.env.local" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
[[ -n "$KEY" ]] || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log -1 --pretty='%h %s' 2>/dev/null || echo "none")
MINUTES=$(( (ELAPSED + 30) / 60 ))

# Build payload with python3 (no jq in this WSL) so commit messages with
# quotes or unicode cannot break the JSON.
PAYLOAD=$(BRANCH="$BRANCH" LAST_COMMIT="$LAST_COMMIT" MINUTES="$MINUTES" python3 - <<'PY'
import json, os
branch = os.environ["BRANCH"]
commit = os.environ["LAST_COMMIT"]
minutes = os.environ["MINUTES"]
body = (
    f"Claude Code finished a task in workspace-crwn.\n\n"
    f"Branch: {branch}\n"
    f"Last commit: {commit}\n"
    f"Time on task: about {minutes} min\n\n"
    f"Open the session for details."
)
print(json.dumps({
    "from": "CRWN <hello@thecrwn.app>",
    "to": ["joshn.wms@gmail.com"],
    "subject": f"Claude finished a task ({branch}, {minutes}m)",
    "text": body,
}))
PY
) || exit 0

RESP=$(curl -sS -m 15 -X POST "https://api.resend.com/emails" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>/dev/null)

# Mark sent only on success (Resend returns {"id": "..."}). On failure the next
# Stop for this prompt retries once more.
if [[ "$RESP" == *'"id"'* ]]; then
  echo "$TS" > "$SENT_FILE"
fi

exit 0
