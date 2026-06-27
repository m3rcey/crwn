#!/usr/bin/env bash
# Stop hook: enforces CLAUDE.md problem-solving loop in every substantive response.
# Reads the transcript, extracts the last assistant message text, and exits 2
# (blocking) if the three loop markers are not all present.

set -uo pipefail

INPUT=$(cat)

LAST_TEXT=$(python3 - "$INPUT" <<'PYEOF'
import json, sys, os

try:
    payload = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)

path = payload.get("transcript_path", "")
if not path or not os.path.isfile(path):
    sys.exit(0)

def is_user_prompt(rec):
    # A genuine user prompt (turn boundary) vs a tool_result-only user record.
    if rec.get("type") != "user":
        return False
    content = rec.get("message", {}).get("content", "")
    if isinstance(content, str):
        return True
    if isinstance(content, list):
        types = [c.get("type") for c in content if isinstance(c, dict)]
        if types and all(t == "tool_result" for t in types):
            return False
        return True
    return False

records = []
try:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except Exception:
                continue
except Exception:
    sys.exit(0)

# Start of the current turn = just after the last genuine user prompt.
start = 0
for i, rec in enumerate(records):
    if is_user_prompt(rec):
        start = i + 1

# Concatenate ALL assistant text in the current turn (across tool-call splits),
# so markers anywhere in the response satisfy the check.
texts = []
for rec in records[start:]:
    if rec.get("type") != "assistant":
        continue
    content = rec.get("message", {}).get("content", "")
    if isinstance(content, list):
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                texts.append(c.get("text", ""))
    elif content:
        texts.append(str(content))

print("\n".join(texts), end="")
PYEOF
)

# Skip trivially short responses (one-line acknowledgments, tool-only turns).
if [[ ${#LAST_TEXT} -lt 120 ]]; then
  exit 0
fi

# Require all three loop markers (case-insensitive).
has_triage=0
has_first=0
has_five=0

echo "$LAST_TEXT" | grep -qiE "triage" && has_triage=1
echo "$LAST_TEXT" | grep -qiE "first principles" && has_first=1
echo "$LAST_TEXT" | grep -qiE "5-step|five-step|5 step|five step" && has_five=1

if [[ $has_triage -eq 1 && $has_first -eq 1 && $has_five -eq 1 ]]; then
  exit 0
fi

missing=()
[[ $has_triage -eq 0 ]] && missing+=("Triage")
[[ $has_first -eq 0 ]] && missing+=("First principles")
[[ $has_five -eq 0 ]] && missing+=("5-step pass")

cat >&2 <<EOF
CLAUDE.md violation: your previous response did not visibly run the problem-solving loop.

Missing markers: ${missing[*]}

REQUIRED in every substantive response:
  - Triage (most-critical-first): which problem matters most right now
  - First principles: list what you know is true, reason up from there
  - 5-step pass: 1) question the requirement, 2) delete, 3) simplify, 4) accelerate, 5) automate

Redo the response. Surface each section with its label and apply it to the user's actual request. Do not just append the labels as a footer. Reason through each step on this specific task.
EOF
exit 2
