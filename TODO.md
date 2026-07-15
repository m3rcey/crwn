# TODO — Josh

Two lists. **Do Now** is one-shot work. **Ongoing** is never done.

A third list at the bottom, **On Claude's plate**, exists so you know what you are *not*
responsible for. Do not work those.

> **Done means DELETED.** Not ticked, not struck through, gone. Git remembers what was done and
> when; this file is only for what is still true. A list you have to read past is a list you
> stop reading.
>
> **Priority is not vibes.** P0 uses the definition from CLAUDE.md: *blocks artist acquisition
> or breaks money flows.* Everything else is P1 or P2.
>
> **Claude maintains this file.** Any time it creates work only you can do (a migration, an
> env var, a pricing call, a legal call), it must add it here in the same commit. If you find
> a founder-blocking task that is not in this file, that is a Claude bug, and say so.

---

## Do Now

### P0 — money flows or acquisition are blocked

- [ ] **DECIDE: keep ManyChat Pro at $39/mo. Trial ends ~2026-07-27.**

      **The funnel is LIVE and verified end to end** (2026-07-14): a real comment produced a
      real lead, a real DM conversation, a correctly parsed answer, a real result, a real
      result-page view with a recalculation, and a real Cal.com booking that cancelled her
      nurture sequence. Every row checked in the database, not just the DMs.

      So this is an informed decision now, not a bet.

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

### P1 — real risk or real friction, but nothing is on fire

- [ ] **Fix the funnel's 24h reach. (Decision is made: `MANYCHAT_MESSAGE_TAG` stays UNSET,
      permanently.)** Why unset is now the only correct value, not just the safe default: as of
      Apr 27 2026 Meta sunset the `ACCOUNT_UPDATE` / `CONFIRMED_EVENT_UPDATE` /
      `POST_PURCHASE_UPDATE` tags (they return error 100), and `HUMAN_AGENT` is human-only (an
      automated send carrying it is blocked and risks a ban). There is no tag that legitimately
      powers automated promo DMs outside 24h. Encoded in `src/lib/manychat/client.ts`.

      The real problem the tag was meant to solve, still open: the nurture sequence
      (`personal_nudge` day 4, `offer_call` day 7, no-show ladder +2/+5) is out-of-window for
      Instagram-only leads, who are most of them and have no email, so those sends silently
      resolve `sent: false`. Three fixes, in order:

      1. **Confirm `MANYCHAT_MESSAGE_TAG` is NOT set in Vercel** (Settings, Environment
         Variables). If a past value holds a sunset tag, every out-of-window send is hard-failing
         with error 100 right now. Delete the var if it exists. (I cannot read it: Vercel hides
         env values from the CLI.)
      2. **Add an in-window email/phone capture step to the ManyChat flow.** Ask for it while she
         is still replying (offer to send her result there). The dispatcher already falls back to
         email/SMS, which have no 24h window; it just usually has nothing to fall back to. This
         makes the whole multi-day tail reachable. Lives in ManyChat, not code.
      3. **Decide whether to front-load the call CTA into the first 24h.** Product call: the money
         ask (`offer_call`) lands day 7, guaranteed out-of-window for IG-only leads. A CTA inside
         the in-window conversation is the compliant way to make it land.

- [ ] **Privacy policy: disclose the Instagram funnel.** Needs you or counsel, not Claude.
      The exact list of what is now collected and what likely needs disclosing is in
      `docs/acquisition/acquisition-deployment-checklist.md` §3. Short version: Instagram
      identity, DM answers, AI-derived classifications, lead scores, and that ManyChat and
      Anthropic are processors.


---

## Ongoing

Things that are never finished. Cadence, then the thing.

### Every time Claude ships

- **Apply any new SQL migration.** Claude cannot. It will always hand you the exact file path.
  If it shipped code that needs a migration and did not tell you, that is a bug.
- **Set any new env var** it names. It cannot touch Vercel.

### After every sales call

- **Mark whether they showed up.** `/admin` → **Acquisition** → **Calls**: **Showed up** or
  **No-show**. The buttons only appear once the call has actually finished, so there is nothing
  to mis-click beforehand. You can also tick **No-show** on the booking in Cal.com itself: same
  effect, same idempotency key, so using both places cannot double-send.

  **Nothing infers a no-show.** It fires only when *you* say so, because "sorry we missed you"
  sent to the artist who *was* on the call, and had a good conversation with you, is
  humiliating and unrecoverable. An unsent message costs nothing. A wrong one costs the artist.

  Mark it and the automation takes over: a warm no-guilt DM within the day, a second two days
  later naming the money, then a clean breakup on day five that offers to take her off the
  list. After that CRWN stops for good. Un-marking it (in either place) cancels the ladder, so
  a mis-click is recoverable until 5am, when the dispatcher runs.

### Daily-ish, now that the Instagram engine is LIVE

- **Answer high-intent lead alerts.** The engine emails you (once per lead, ever) when a lead
  scores into `sales_priority`. It deliberately stops automating at that point because the lead
  is too warm for a robot. Go talk to them.

- **Work the "Needs you" queue.** `/admin` → **Acquisition** → **Needs you**. When CRWN cannot
  understand a lead's answers, it stops asking rather than looping, and hands them to a person.
  That person is you. Reply on Instagram, then hit **Handled** (or **Not a lead**, which stops
  every channel for them immediately).

- **Sanity-check the lead scores as real leads arrive.** The bands in `leadScoring.ts` were
  calibrated with zero data and have already been wrong once: the very first real lead (100k
  monthly listeners, opened her result, edited the assumptions) scored **20** and was filed
  **"unqualified"**, so no alert fired.

  Two bugs caused it, both fixed. **Keep watching.** The `worth` funnel asks ONE question, so
  it can never learn goal or blocker, which means it must recognise a hot lead from reach plus
  behavior alone. If a lead you would personally chase is banded `nurture` or `unqualified`,
  that is a scoring bug, not a bad lead. Tell Claude.

### Weekly

- **Check the "Failed" tab.** `/admin` → **Acquisition** → **Failed**. Should be empty. Each
  row has a **Retry** button. A pile of `dm_rejected` means the ManyChat token is wrong.

- **Watch for the onboarding canary email.** `/api/cron/onboarding-health` runs daily at 07:00
  and emails joshn.wms@gmail.com **the moment the artist signup path breaks.** It exists
  because that path once broke silently for months. **If it emails you, drop everything.**
  Silence is good news; the alarm is the whole product.

### Monthly

- **Rotate `MANYCHAT_WEBHOOK_SECRET`** (Vercel + the ManyChat header). Cheap, and the webhook
  is an unsigned shared-secret endpoint by necessity: ManyChat cannot HMAC-sign.

- **Skim the lead score bands.** The thresholds in `leadScoring.ts` are conservative first
  guesses made with zero real leads. Once you have 50, they are tunable with evidence. One
  file, one place.

### Whenever you add a cron

- **Never more frequent than daily.** Vercel Hobby blocks *all* deployments if you do.
  `vercel.json` already has 25 entries and nearly every hour slot is taken. The house pattern
  is to **piggyback** an existing cron, not add one.

---

## On Claude's plate (not yours)

Listed so you know what you are not carrying. Ask for any of these to jump the queue.

**Nothing is queued.** The Instagram acquisition engine is feature-complete and verified in
production: ingress, identity, Claude extraction with a complete deterministic fallback, the
calculator handoff, secure result links, claiming, follow-up automation, booking detection, the
no-show ladder, retention, and the admin panel. What remains is entirely on your side of the
line (the list at the top of this file), plus tuning with real leads once they exist.

One known limitation, and it is deliberate: **`/signup` ignores `?next`.** Auto-claim through
signup works via `ClaimRedeemer` instead. `/welcome` and `useAuth` are the two files that broke
onboarding silently for months, and a claim feature does not justify touching them.
