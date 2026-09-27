---
name: astra-task-prompt
description: Write a prompt that hands a tedious, click-heavy task (dashboards, SaaS config, ManyChat, Meta, Stripe, Vercel, Supabase UI, form filling) to GPT-6 Astra running computer use, engineered to finish on the first run with the fewest stops and the least credit spend. Use when the founder says "have Astra do this", "give me a prompt for Astra", or hands off UI work Claude cannot do itself. Not for tasks Claude can do directly with its own tools, and not for code changes.
allowed-tools: Read, Grep, Glob, Bash, WebFetch, WebSearch, Write, Edit
---

# Astra task prompt

Astra is a capable operator with **zero context and a per-action credit cost**. Every question it
has to answer on its own is a place it stops, guesses, or explores. The prompt's job is to remove
those places before the run. A failed run costs more than the prompt took to write.

The failure this skill exists to prevent (2026-09-26): an Astra prompt said "stop if adding a
permission requires review", Meta's button read "Add to App Review", and Astra stopped a whole run
on a label the prompt could have pre-answered. Pre-answer the labels.

## 1. Do the recon yourself first (cheap for Claude, expensive for Astra)

Before writing a line, establish from the repo, docs, and read-only production probes:

- **The exact target state** and how to recognise it on screen ("status reads Live", "returns 200
  with message X"). If you cannot state the done-check, the prompt is not ready.
- **Every exact value** Astra will type: ids, slugs, keywords, URLs, copy, JSON bodies. Pull them
  from the canonical source (registry, adapters, schema), never from memory. Copy must obey the
  CLAUDE.md copy rules (no em dashes, loss-framed where it is marketing).
- **The documented procedure and its traps.** For ManyChat that is
  [docs/acquisition/manychat-setup-guide.md](../../../docs/acquisition/manychat-setup-guide.md).
  Search docs for the tool's name plus "trap", "error", "does not survive", "position".
- **A deterministic smoke check** that distinguishes success from the most likely silent failure
  (e.g. the new ManyChat flow returns the NEW tool's first question, not the cloned tool's).
- **What already exists** so Astra clones rather than builds (a working sibling is the best spec).

Ask the founder only for what recon cannot answer, and ask once, before handing off.

## 2. Structure (in this order, nothing else)

1. **One-paragraph mission:** what to do, where, logged in as whom, and the explicit instruction
   not to explore anything else. Name the order when there are several items (deadline first).
2. **Done means:** the observable end state per item.
3. **Values table:** every value that differs between items, copy-exact. Everything else is
   "unchanged from the source".
4. **Numbered steps** with the literal UI path and button labels. One action per step. Where a
   field must be built in several moves (pills, JSON), spell out each move.
5. **Known errors and the exact fix** (error text → action). This is what keeps Astra moving
   instead of stopping. Include every error signature in the docs for this surface.
6. **Stop only if:** a short list of true hazards: login/2FA, payment/plan change, anything
   irreversible or destructive, touching production things outside scope, the same step failing
   after N retries. Follow it with "Do not stop for anything else."
7. **Never:** the out-of-scope actions (editing sibling configs, sending messages, revealing
   secrets, changing copy beyond the table).
8. **Report:** a fixed, compact format, one line per item, pass/fail plus the evidence value.
   Ask for anything Claude will need next (e.g. which test contact it used, so it can be excluded
   from analytics).

## 3. Rules that cut fails and credits

- **Pre-answer ambiguity.** For every button, label, dialog or picker that could look like a
  hazard, say what it is and what to do ("'Add to App Review' only adds to a draft list; click it,
  close any form").
- **Give fallbacks, not questions.** "If the picker shows only specific posts, look for 'any post'
  in the same dropdown" beats "ask me if unsure".
- **Bound retries.** "Redo step 5 at most twice, then report" prevents loops that burn credits.
- **Forbid exploration explicitly.** No reading docs, browsing settings, or opening unrelated
  items. Astra does not need the why; keep rationale out of the prompt unless it changes an action.
- **Astra never SEES a secret, not just never reports one.** It works from screenshots and every
  screenshot leaves the machine, so a secret revealed on screen ("Show" on an app secret) or
  pasted into a visible field (a Vercel value box) is already exposed. Split the task into stages
  (worked example: [docs/fan-automations/astra-instagram-go-live.md](../../../docs/fan-automations/astra-instagram-go-live.md)):
  1. **Claude generates its own secrets** into a git-ignored `~/workspace-crwn/.env.<feature>`
     (umask 077), printing only names and lengths.
  2. **Josh reveals provider secrets with Astra NOT running** and pastes each into a `read -rsp`
     one-liner that appends to that file. The one-liner MUST check the length and refuse
     otherwise: a hidden paste gives no feedback, and the first real run saved a 67-character
     secret where 32 were expected (several invisible pastes). Tell Josh the password
     re-prompt before "Show" is normal.
  3. **Claude moves values to the destination** without a screen: `printf '%s' "$val" | npx
     vercel env add NAME production --sensitive` in WSL (after Josh's one-time
     `npx vercel login`), refuse to overwrite an existing var, redeploy with
     `vercel redeploy <latest prod url> --target production` (never `vercel --prod` from the
     dirty tree), then probe production.
  4. **Astra gets only non-secret UI work.** A low-value value it must paste (a webhook verify
     token) goes by `... | clip.exe` from the file, and Claude rotates it after the run.
  Put a table in the doc header saying who handles each value and how. The prompt's Never list
  forbids Show, copying tokens, opening the env files, and opening the destination dashboard.
- **Name every test identity. Never write "any contact / any user / any account".** A smoke test
  runs for real against whoever is selected. On 2026-09-27 "pick any contact" made Astra run two
  ManyChat Test Requests as a real lead (@blizzbugaddi, mid-conversation), opening two sessions
  that would have hijacked their next reply. If the founder's own test identity is not known,
  ask for it BEFORE handing off, and tell Astra to stop if that exact identity is not selectable.
  Known: the founder's ManyChat test contact is **M3rcey** (Instagram `m3rcey`); the funnel audit
  already excludes its sessions.
- **Protect experiments.** If a test is running, list what must stay identical (copy pattern,
  button label, structure) so the new item does not add a variable.
- **Prefer cloning a working sibling** over building from scratch; state which few fields change.
- **Deadline-first ordering** when items have different deadlines.

## 4. Deliver

- Save the prompt as `docs/<area>/astra-<task>.md` (header: who it is for, deadline, then a line
  "Paste everything below the line", then `---`, then the prompt).
- Add or update the TODO.md item so it links the file and says "send Claude Astra's report".
- In chat, open with the audience line ("Written for: GPT-6 Astra (computer use)"), link the file,
  and state the done-check and the known risk in two lines. Do not paste the whole prompt into
  chat unless asked; the file is the artifact.
- When the report comes back, verify independently where Claude can (API reads, production
  probes, the funnel audit) before calling the task done.
