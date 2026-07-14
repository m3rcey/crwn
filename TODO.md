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

- [x] ~~**Set up the Cal.com webhook.**~~ **DONE 2026-07-14, verified end to end in
      production.** A real booking through the tracked link landed attributed to the right lead,
      both pending nurture messages flipped to `skipped / converted_booked_call`, the
      confirmation DM queued, and the booking pushed her score into `sales_priority`. The loop
      is closed.

- [ ] **Add `CALCOM_API_KEY` to Vercel (P1, not blocking).**

      Same value as your local `.env.local`. Production ticked, then redeploy.

      Bookings already work without it. What it buys you is the **"Cal.com" tick in the config
      strip turning green**, because that check asks Cal.com what secret it stored and compares
      it to the one Vercel is running with. Right now it cannot reach Cal.com, so it honestly
      reports grey ("could not check") rather than a fake green.

      This is worth having. The webhook fails closed, so a *mistyped* secret and a *missing*
      one both return 401 and look identical from outside. That is exactly what silently ate
      the first test booking, and this check is what catches it next time in one glance.

- [ ] **After every sales call, mark whether they showed up.**

      In **/admin → Acquisition → Calls**: **Showed up** / **No-show**. The buttons only appear
      once the call has actually finished, so there is nothing to mis-click beforehand.

      You can also tick **No-show** on the booking in Cal.com itself. Same effect, same
      idempotency key, so using both places cannot double-send. Note Cal.com greys that control
      out until the meeting time has passed, which is the same rule.

      Un-marking a no-show (in either place) cancels the follow-up ladder, so a mis-click is
      recoverable as long as you fix it before 5am, when the dispatcher runs.

      This is the one step in the funnel that stays manual, and it is deliberate: an unsent
      message costs nothing, a wrong one costs the artist.

      A no-show ladder only fires when *you* say she did not turn up. Nothing infers it,
      because "sorry we missed you" sent to the artist who *was* on the call, and had a good
      conversation with you, is humiliating and unrecoverable. An unsent message costs nothing.
      A wrong one costs the artist.

      Mark it and the automation takes over: a warm no-guilt DM within the day, a second one
      two days later naming the money, then a clean breakup on day five that offers to take her
      off the list. After that CRWN stops for good.

- [ ] **DECIDE: keep ManyChat Pro at $39/mo. Trial ends ~2026-07-27.**
      **The funnel is LIVE and verified end to end** (2026-07-14): a real comment produced a
      real lead, a real DM conversation, a correctly parsed answer, a real result, and a real
      result-page view with a recalculation. Every row checked in the database, not just the
      DMs.

      So this is now an informed decision, not a bet.

      **The maths, from your own calculator:** one converted 40k-listener artist nets ~$3,892/mo
      direct, which is ~$311/mo to CRWN at the 8% Pro fee. ManyChat Pro pays for itself about
      eight times over on a **single** conversion. One artist in a year and it has paid for
      itself; zero artists and $39/mo was a cheap, fast way to learn the channel does not work.

      **If you let the trial lapse, the funnel stops dead.** External Request disappears and
      ManyChat can no longer reach CRWN at all. Everything CRWN-side keeps working and stays
      dark, so nothing is lost, but no leads arrive.

      **Do NOT downgrade to Essential.** It has neither External Request nor the API.

      **Watch the Active Contacts cap:** Pro is 2,500/mo, and every Instagram lead who DMs
      burns one. Fine for launch. If a Reel genuinely pops, that is the first wall you hit, and
      it is ManyChat's, not CRWN's.

- [x] ~~**Rotate `CRON_SECRET` and DELETE `NEXT_PUBLIC_CRON_SECRET` in Vercel.**~~
      **DONE 2026-07-12.** The cron secret is no longer in the browser bundle, and the old
      (public) value has been rotated out. Details kept below for the record.

      **What was wrong:** `AiManagerCard.tsx` is a **client component** and was sending
      `Authorization: Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`. Anything prefixed
      `NEXT_PUBLIC_` is compiled into the browser bundle, so that value was being served in
      plain text to every visitor. `/api/cron/weekly-payout` authenticates with
      `Bearer ${process.env.CRON_SECRET}`. **If the two vars held the same value, your cron
      secret was public and anyone could have triggered the payout cron.**

      **What Claude changed:** `/api/ai-manager/generate` now accepts EITHER the cron secret
      (server to server) OR the artist's own session cookie, verified with
      `requireArtistOwner`. The client sends no secret at all. There is nothing left in the
      bundle to leak.

      **Your steps, in this order:**
      1. Confirm the fix is deployed (the refresh button in the AI Manager card still works).
      2. **Delete `NEXT_PUBLIC_CRON_SECRET`** from Vercel. Nothing reads it any more.
      3. **Rotate `CRON_SECRET`** to a fresh value (`openssl rand -hex 32`). Redeploy.
      4. Assume the old value was public. If anything in your Stripe history looks like an
         off-schedule payout run, that is where to look first.

- [ ] **DECISION: upgrade ManyChat to Pro, or the Instagram engine cannot run at all.**
      Confirmed 2026-07-12 from the ManyChat Settings screen: **API access is Pro-only**, and
      so is the **External Request** action.

      This is not "no follow-up without Pro". It is worse than that:
      - **External Request** is how ManyChat *calls CRWN*. Without it, ManyChat can auto-DM a
        commenter but **cannot reach CRWN at all**, so the engine never receives an event.
      - **API Key** is how CRWN *sends the follow-up DM back*. Without it, follow-up reaches
        nobody (a cold IG lead has no email).

      Both are load-bearing. Free ManyChat cannot run this architecture.

      **The alternative is worse:** integrating Meta's Instagram Messaging API directly means
      an app review, Meta's permissions process, and hand-rolling the messaging-window logic
      ManyChat already handles. Weeks of work and far more risk, to avoid a small monthly fee.

      **THE PLAN IS "PRO", $39/mo. Verified 2026-07-12, not guessed.** Essential ($17) does
      NOT work: its "unlimited custom automations" means unlimited flows, not outbound HTTP.
      ManyChat's own docs are explicit that External Request and API access are both Pro-and-
      above. The $22 gap between Essential and Pro is exactly the feature this build needs.

      **Take the 14-day free trial first.** Wire the whole thing, run yourself through the
      funnel end to end, confirm it works, and spend nothing. Then decide with evidence.

      **Do NOT downgrade to Essential later.** External Request would vanish and the live
      funnel would silently stop reaching CRWN. Pro is the permanent floor.

      **Is it worth it:** a 40k-listener artist nets ~$3,892/mo direct on your own calculator.
      At the 8% Pro fee that is ~$311/mo to CRWN from ONE converted artist. ManyChat Pro pays
      for itself about eight times over on a single conversion. One artist in a year and it
      has paid for itself; zero artists and $39/mo was a cheap way to learn that fast.

      **Watch the Active Contacts cap:** Pro is 2,500/mo, and every Instagram lead who DMs
      burns one. Fine for launch. If a Reel genuinely pops, that is the ceiling you hit first,
      not anything in CRWN.

      This is a paid dependency Claude introduced and did not price up front. That was a miss.
      Everything else below is free and already verified working in production.

- [ ] **Run the acquisition migration.** Supabase SQL editor:
      `supabase/schema-phase2-instagram-acquisition-engine.sql`
      It self-verifies. Expect: `OK: acquisition engine tables + RLS + indexes created. Flag is OFF (dark).`

- [ ] **Set `MANYCHAT_WEBHOOK_SECRET` in Vercel.** `openssl rand -hex 32`. Redeploy.
      Without it the webhook rejects **every** request (fail-closed, by design).

- [ ] **Set `MANYCHAT_API_TOKEN` in Vercel.** *(Blocked on ManyChat Pro, above.)*
      ManyChat → Settings → API → **Generate Your API Key**. There is nothing to copy until
      you generate it, and the button is Pro-gated.
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

### Daily-ish, now that the Instagram engine is LIVE

- [ ] **Sanity-check the lead scores as real leads arrive.** The bands in `leadScoring.ts` were
      calibrated with zero data and have already been wrong once: the very first real lead
      (100k monthly listeners, opened her result, edited the assumptions) scored **20** and was
      filed **"unqualified"**, so no alert fired.

      Two bugs caused it, both fixed: behavior was never counted (the orchestrator passed a
      hardcoded blank), and `reach_without_ownership` (CRWN's entire thesis) was worth zero
      points. That lead now scores 43.

      **Keep watching.** The `worth` funnel asks ONE question, so it can never learn goal or
      blocker, which means it must recognise a hot lead from reach plus behavior alone. If a
      lead you would personally chase is banded `nurture` or `unqualified`, that is a scoring
      bug, not a bad lead. Tell Claude.

### Daily-ish, once the Instagram engine is live

- [ ] **Answer high-intent lead alerts.** The engine emails you (once per lead, ever) when a
      lead scores into `sales_priority`. It has deliberately stopped automating at that point
      because the lead is too warm for a robot. Go talk to them.

- [ ] **Work the "Needs you" queue.** `/admin` → **Acquisition** → **Needs you**.
      When CRWN cannot understand a lead's answers, it stops asking rather than looping, and
      hands them to a person. That person is you. Reply to them on Instagram, then hit
      **Handled** (or **Not a lead**, which stops every channel for them immediately).

### Weekly

- [ ] **Check the "Failed" tab.** `/admin` → **Acquisition** → **Failed**. Should be empty.
      Each row has a **Retry** button. A pile of `dm_rejected` means the ManyChat token is
      wrong.

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

**Four routes self-fetch through Vercel's auth wall.** `cron/ai-manager` (line 178),
`admin/agent/briefing` (150), `admin/agent/autonomous` (52) and `admin/agent/execute` (425)
build a base url from `https://${VERCEL_URL}`, the protected deployment origin, which answers
every path with an http 200 html page instead of the API. This is the same bug that made the
RLS canary email you a false LEAK on Jul 13. Two of them also have an operator-precedence bug
(`A || B ? C : D` parses as `(A || B) ? C : D`), so they use `VERCEL_URL` even when
`NEXT_PUBLIC_SITE_URL` is set. Not urgent, no data is exposed, but those self-calls are
probably silently doing nothing. Ask and I will fix them.

The Instagram acquisition engine is feature-complete: ingress,
identity, Claude extraction with a complete deterministic fallback, the calculator handoff,
secure result links, claiming, follow-up automation, retention, and the admin panel. What
remains is entirely on your side of the line (the list at the top of this file), plus tuning
with real leads once they exist.

### Done

- ~~**Fix the client-side cron secret**~~ in `AiManagerCard.tsx`. The route now takes a session
  cookie; the client holds no secret. Your half is the P0 item above.
- ~~**Result page cannot recalculate.**~~ The `worth` result page now renders the **real
  `/worth` calculator** with her numbers already in it, presets and sliders live. Corrections
  persist (`input_data` moves, `original_input_data` never does) and are re-run **server-side**
  so a browser can never write a figure into a result. One component now serves the homepage,
  `/worth`, and the personalized result, so the numbers cannot drift between them.
- ~~**CLAUDE.md stale about `TIER_PRICING`.**~~ Fixed: it is correct at $9.99 Pro / $99 label.
- ~~**Admin acquisition panel.**~~ `/admin` → **Acquisition**. Three tabs: **Leads** (the
  funnel), **Needs you** (the human-review queue), **Failed** (dead-lettered jobs, with a
  Retry button). This is what retired the two raw SQL queries from your Ongoing list.
- **Auto-claim through signup** works via `ClaimRedeemer`, but `/signup` still ignores
  `?next`. Deliberate: `/welcome` and `useAuth` are the two files that broke onboarding
  silently for months, and a claim feature does not justify touching them.
