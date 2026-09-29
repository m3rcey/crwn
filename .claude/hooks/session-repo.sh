# Sourced by the Stop hooks. Sets REPO to the checkout THIS session works in and SESSION_ID to
# the session, both read from the hook input on stdin.
#
# Why: the hook commands in .claude/settings.local.json name the MAIN checkout's script paths,
# and Claude Code keeps using that file inside task worktrees (docs/PARALLEL_CLAUDE_SESSIONS.md).
# The input's cwd follows the worktree, so reading it is what makes a worktree session build and
# remind about its own tree instead of the main checkout (another session's work).
HOOK_INPUT=$(cat 2>/dev/null || true)
{ read -r _cwd; read -r SESSION_ID; } < <(printf '%s' "$HOOK_INPUT" | python3 -c '
import json, sys
try: d = json.load(sys.stdin)
except Exception: d = {}
print(d.get("cwd", "")); print(d.get("session_id", ""))' 2>/dev/null) || true
# A Windows-side session reports \\wsl.localhost\<distro>\home\...; map it back to the Linux path.
case "${_cwd:-}" in '\\'*) _cwd=$(printf '%s' "$_cwd" | sed -E 's#^\\\\wsl(\.localhost|\$)\\[^\\]+##; s#\\#/#g') ;; esac
MAIN_REPO=/home/merce/workspace-crwn
REPO=$(git -C "${_cwd:-$MAIN_REPO}" rev-parse --show-toplevel 2>/dev/null || echo "$MAIN_REPO")
SESSION_ID=${SESSION_ID:-unknown}
