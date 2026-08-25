#!/usr/bin/env bash
# Export the API keys the image/video generation scripts expect.
#
# Source this, don't run it:   source ./load-env.sh && node generate-images.mjs
#
# Why not `source .env.local` directly: that file is read by Next.js, not by a
# shell. It contains at least one value with unquoted spaces and one line that is
# not KEY=value at all, so sourcing it executes garbage and prints errors. This
# parses instead of executing: each line is split on the FIRST `=`, surrounding
# quotes are stripped, and anything that is not a well-formed KEY=VALUE is skipped.
#
# Only the keys the scripts actually read are exported. The rest of .env.local
# (Stripe, Supabase, Twilio) stays out of the environment on purpose.

_crwn_env_file="${CRWN_ENV_FILE:-/home/merce/workspace-crwn/.env.local}"

if [ ! -f "$_crwn_env_file" ]; then
  echo "load-env.sh: $_crwn_env_file not found" >&2
  return 1 2>/dev/null || exit 1
fi

for _crwn_key in GEMINI_API_KEY BRAVE_API_KEY; do
  _crwn_line=$(grep -m1 "^${_crwn_key}=" "$_crwn_env_file" || true)
  if [ -n "$_crwn_line" ]; then
    _crwn_val=${_crwn_line#*=}
    _crwn_val=${_crwn_val%$'\r'}                 # strip a CRLF tail
    _crwn_val=${_crwn_val#\"}; _crwn_val=${_crwn_val%\"}
    _crwn_val=${_crwn_val#\'}; _crwn_val=${_crwn_val%\'}
    export "${_crwn_key}=${_crwn_val}"
  fi
done

unset _crwn_env_file _crwn_key _crwn_line _crwn_val
