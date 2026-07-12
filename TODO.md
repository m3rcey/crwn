# TODO — Josh

Two lists. **Do Now** is one-shot work; tick it and it's gone. **Ongoing** is never done.

A third list at the bottom, **On Claude's plate**, exists so you know what you are *not*
responsible for. Do not work those.

> **Priority is not vibes.** P0 uses the definition from CLAUDE.md: *blocks artist acquisition
> or breaks money flows.* Everything else is P1 or P2.
>
> **Claude maintains this file.** Any time it creates work only you can do (a migration, an
> env var, a pricing call, a legal call), it must add it here in the same commit. If you find
> a founder-blocking task that is not in this file, that is a Claude bug, and say so.

---

## Do Now

### P0 — money flows or acquisition are blocked

- [ ] **Check whether `NEXT_PUBLIC_CRON_SECRET` and `CRON_SECRET` hold the same value in Vercel.**
      This is the most urgent item on the page and it takes two minutes.

      `AiManagerCard.tsx:194` is a **client component** that sends
      `Authorization: Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`. Anything prefixed
      `NEXT_PUBLIC_` is compiled into the browser bundle, so that value is **readable in
      plain text by every visitor to the site.**

      `/api/cron/weekly-payout` authenticates with `Bearer ${process.env.CRON_SECRET}`.

      **If the two vars hold the same value, your cron secret is public and anyone can
      trigger the payout cron.** Claude cannot read Vercel env values, so only you can
      confirm this.

      - If they are the same → **rotate `CRON_SECRET` now**, and tell Claude to fix the
        client-side call (it belongs behind an authenticated server route, not a bearer token
        in a React component).
      - If they differ → the AI Manager refresh button has been silently failing auth. Still
        needs the same fix, but it is not an emergency.

- [ ] **Run the acquisition migration.** Supabase SQL editor:
      `supabase/schema-phase2-instagram-acquisition-engine.sql`
      It self-verifies. Expect: `OK: acquisition engine tables + RLS + indexes created. Flag is OFF (dark).`

- [ ] **Set `MANYCHAT_WEBHOOK_SECRET` in Vercel.** `openssl rand -hex 32`. Redeploy.
      Without it the webhook rejects **every** request (fail-closed, by design).

- [ ] **Set `MANYCHAT_API_TOKEN` in Vercel.** ManyChat → Settings → API.
      **Without it, follow-up reaches nobody.** A cold Instagram lead has no email, so the
      Instagram DM is the only channel that exists.

- [ ] **Set `ANTHROPIC_API_KEY` in Vercel.**
      Not optional in practice. Without it, the deterministic parser reads `"40k"` fine but
      cannot read `"honestly not that many"`, and those leads escalate to **you** as
      `human_review` after 3 tries. No key means your vaguest leads land in your inbox
      instead of converting.

- [ ] **Configure the ManyChat flow.** Follow `docs/acquisition/manychat-setup-guide.md`
      exactly. It is written to be followed without rebuilding any CRWN logic.

- [ ] **Smoke test with the flag still OFF.** Every ManyChat External Request should return
      **503 / `engine_disabled`**. That proves URL, secret, and field mapping are right while
      CRWN refuses to write a single row. 401 = wrong secret. 400 = read `error_code`.

- [ ] **Flip the engine on.**
      ```sql
      UPDATE admin_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'acquisition_engine';
      ```
      Kill switch is the same statement with `false`. Instant, no deploy.

- [ ] **Run one real lead through end to end.** Your own Instagram. Comment → DM → question →
      result link → open it → save it.

### P1 — real risk or real friction, but nothing is on fire

- [ ] **Decide the DM messaging-window policy.** Meta only lets you message a lead for 24
      hours after *her* last interaction. Outside that window, sends are rejected and CRWN
      treats it as terminal (it does not retry, on purpose).

      If you want to reach leads *after* 24h you need a Meta-approved message tag, set as
      `MANYCHAT_MESSAGE_TAG`. **Do not set one without confirming with Meta which tag your
      use case legitimately qualifies for** — misusing a tag gets apps banned. Leaving it
      unset is the safe default and is what ships today.

- [ ] **Privacy policy: disclose the Instagram funnel.** Needs you or counsel, not Claude.
      The exact list of what is now collected and what likely needs disclosing is in
      `docs/acquisition/acquisition-deployment-checklist.md` §3. Short version: Instagram
      identity, DM answers, AI-derived classifications, lead scores, and that ManyChat and
      Anthropic are processors.

- [ ] **`check_rate_limit` has no checked-in migration.** The function exists only in
      production; nothing in `supabase/*.sql` defines it. If it ever gets dropped, every
      rate-limited route fails **closed** (safe, but the public forms all break). Worth
      exporting the definition into a migration file so it is reproducible.

### P2 — should happen, nothing breaks if it does not

- [ ] **Two webhooks are unsigned.** Resend (`/api/outreach/webhook`, `/api/outreach/inbound`)
      and Twilio inbound (`/api/sms/webhook`) accept unauthenticated POSTs. Known gap,
      pre-dates the acquisition work. Tell Claude when you want it closed.

- [ ] **Dead `empire` tier price IDs.** `STRIPE_PRICE_IDS` in `platformTier.ts` still
      references `STRIPE_CRWN_EMPIRE_PRICE_ID` / `_ANNUAL_PRICE_ID` for a tier that no longer
      exists. Harmless, but it is dead code pointing at dead env vars.

---

## Ongoing

Things that are never finished. Cadence, then the thing.

### Every time Claude ships

- [ ] **Apply any new SQL migration.** Claude cannot. It will always hand you the exact file
      path. If it shipped code that needs a migration and did not tell you, that is a bug.
- [ ] **Set any new env var** it names. It cannot touch Vercel.

### Daily-ish, once the Instagram engine is live

- [ ] **Answer high-intent lead alerts.** The engine emails you (once per lead, ever) when a
      lead scores into `sales_priority`. It has deliberately stopped automating at that point
      because the lead is too warm for a robot. Go talk to them.

- [ ] **Work the human-review queue.** When CRWN cannot understand a lead's answers, it stops
      asking rather than looping, and hands them to a person. That person is you. There is no
      admin UI yet, so for now:
      ```sql
      SELECT s.id, s.current_question_key, i.instagram_username, s.last_activity_at
      FROM lead_sessions s
      JOIN lead_identities i ON i.id = s.lead_identity_id
      WHERE s.state = 'human_review'
      ORDER BY s.last_activity_at DESC;
      ```
      (Claude owes you a UI for this. It is on its list.)

### Weekly

- [ ] **Check the acquisition dead-letter queue.** Should be empty.
      ```sql
      SELECT event_name, last_error_code, attempt_count, created_at
      FROM acquisition_events WHERE status = 'dead_letter' ORDER BY created_at DESC;
      ```
      A pile of `dm_rejected` means the ManyChat token is wrong.

- [ ] **Watch for the onboarding canary email.** `/api/cron/onboarding-health` runs daily at
      07:00 and emails joshn.wms@gmail.com **the moment the artist signup path breaks.** It
      exists because that path once broke silently for months. **If it emails you, drop
      everything.** Silence is good news; the alarm is the whole product.

### Monthly

- [ ] **Rotate `MANYCHAT_WEBHOOK_SECRET`** (Vercel + the ManyChat header). Cheap, and the
      webhook is an unsigned shared-secret endpoint by necessity: ManyChat cannot HMAC-sign.
- [ ] **Skim the lead score bands.** The thresholds in `leadScoring.ts` are conservative
      first guesses made with zero real leads. Once you have 50, they are tunable with
      evidence. One file, one place.

### Whenever you add a cron

- [ ] **Never more frequent than daily.** Vercel Hobby blocks *all* deployments if you do.
      `vercel.json` already has 25 entries and nearly every hour slot is taken. The house
      pattern is to **piggyback** an existing cron, not add one.

---

## On Claude's plate (not yours)

Listed so you know what you are not carrying. Ask for any of these to jump the queue.

- **Result page cannot recalculate.** The result page shows her numbers read-only. She cannot
  adjust an assumption and re-run it, which the spec required and which the DB already stores
  for (`original_input_data` is immutable and `input_data` was built to move). Claude built the
  storage and skipped the UI. **Next up.**
- **Admin acquisition panels.** Everything they would show is already recorded correctly. It
  is a read-only UI over existing data, so no schema risk. This is what would retire the two
  SQL queries in your Ongoing list above.
- **Fix the client-side cron secret** in `AiManagerCard.tsx` (see P0).
- **CLAUDE.md is stale about `TIER_PRICING`.** It claims the old $69/$175/$350 values and a
  dead Empire tier are still in the file. They are not — it is correct at $9.99 Pro / $99.
  Claude will fix the doc.
- **Auto-claim through signup** works via `ClaimRedeemer`, but `/signup` still ignores
  `?next`. Deliberate: `/welcome` and `useAuth` are the two files that broke onboarding
  silently for months, and a claim feature does not justify touching them.
