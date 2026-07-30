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

### P1 — real risk or real friction, but nothing is on fire

- [ ] **Set `FOUNDER_ALERT_PHONE` in Vercel** (your cell, E.164 format, e.g. `+14045551234`).
      This is the number the new hot-lead SMS alert texts when a QUALIFIED artist on the
      opportunity calculator taps "Get a call now", gives a callback number, and consents.
      Twilio creds are already set; until this var exists the alert falls back to email to
      joshn.wms@gmail.com, so nothing is lost, just slower. Server-only var, never `NEXT_PUBLIC_`.

- [ ] **Decide whether the all-in-one calculator becomes the PRIMARY funnel.** The unified
      Opportunity Calculator is live at
      [`/tools/opportunity-calculator`](src/lib/opportunity/unifiedModel.ts) and models every
      opportunity in one overlap-safe model (details:
      [`docs/UNIFIED_OPPORTUNITY.md`](docs/UNIFIED_OPPORTUNITY.md)). It is registered as
      **secondary** on purpose: Own Your Fans is currently `primary` AND is the assigned experience
      of the running `oyf-signup-timing-v1` experiment, so promoting the new tool now would break
      that experiment's readout. To promote it once you have data, change `promotion` to `'primary'`
      and `promotionRank` to `0` for `opportunity-calculator` in
      [`src/lib/opportunityFunnels/registry.ts`](src/lib/opportunityFunnels/registry.ts), and demote
      Own Your Fans to `'secondary'`. One file, two lines. This is a marketing call, not a technical
      one, which is why it is yours.

- [ ] **Point your video funnels at it with `?from=`.** Each single-opportunity video can now open
      the all-in-one calculator with its own questions first, instead of a generic questionnaire.
      The links are exactly:
      `thecrwn.app/tools/opportunity-calculator?from=vault-revenue-planner` (also `worth`,
      `share-to-earn-planner`, `clip-to-earn-campaign-planner`, `own-your-fans-calculator`,
      `executive-producer-session`, `live-experience-calculator`). Anything else in `?from=` is
      ignored, so a typo degrades to the normal order rather than breaking. Nothing is required
      here: the existing per-tool links keep working untouched.

- [ ] **(Cosmetic) The all-in-one calculator is reusing the Streaming Loss hero photo.** It ships
      with `/tool-worth.jpg` because no bespoke shot exists yet. Same shared-placeholder pattern the
      Founder Window tool uses. Say the word and I will generate an on-brand one (dark charcoal +
      gold, artist aged 18 to 32) with the image skill.

- [ ] **Decision: how much MORE of the stack-migration on-ramp do we build?** Correction to the
      earlier version of this item: email-list CSV import ALREADY EXISTED (`/studio/fans` →
      Import Fans, `/api/fan-contacts/import`; the ICP doc claiming otherwise was wrong and is
      now fixed). As of 2026-07-30 option (a) is fully shipped: import now records a permission
      attestation, and imported contacts can be EMAILED an invite through the existing campaign
      sender (small test group first); the fan-invites migration ran 2026-07-30, so this is LIVE.
      Still unbuilt:
      **(b)** a Patreon member CSV import that pre-creates matching tiers and invites each
      member to claim their membership on CRWN;
      **(c)** (b) plus product/catalog import from Shopify/Gumroad.
      Say (b) or (c) and I will build it. This is a scope and priority call, which is why it is
      yours.

- [ ] **Confirm the revenue ramp actually seeded (5 minutes, needs a real artist account).**
      New artists now get a dated 12-month roadmap laid into their Promise Calendar when they
      finish setup, aimed at the number their calculator showed
      ([`docs/REVENUE_RAMP.md`](docs/REVENUE_RAMP.md)). It reuses the promise-calendar tables, so
      it only works if `schema-phase2-promise-calendar.sql` is applied in production (it should
      be, since tier benefits already seed promises). Seeding **fails silently by design** so it
      can never block an artist from entering CRWN, which also means a missing table looks like
      "no roadmap". Check: open [`/studio/promise`](src/app/\(main\)/studio/promise/page.tsx) on
      your `m3rcey` account and press **"Lay out my first year"**. If roadmap steps appear, it
      works. If nothing appears, run that migration and tell me.

- [ ] **(Recommended, when data exists) Turn on Resend open/click events for prospect nurture.** In
      the Resend dashboard, enable the **email.opened** and **email.clicked** events. The signed
      webhook already handles them; without them the admin panel's open/click rates stay at zero.
      Not blocking: sends and conversions still track. Full spec: [`docs/PROSPECT_NURTURE.md`](docs/PROSPECT_NURTURE.md).

- [ ] **(Optional, low priority) Per-video attribution for "Highest Converting Video."** CONFIRMED
      2026-07-26: ManyChat's "any post or reel" comment trigger does NOT expose the triggering post id
      (the External Request field picker has no post/media field), so the catch-all flows CANNOT carry
      the video. CRWN accepts `source_post_id` (any string) and records it as the funnel's video
      dimension; without it, video just groups under "unknown" and the funnel still works by source /
      campaign / calculator. The ONLY way to get per-video data is a **per-post** automation (trigger on
      one specific post), where you hardcode a readable label in the External Request body, e.g.
      `,"source_post_id":"kendrick-producer-reel"` right before `,"contact":`. Not worth doing broadly
      (one automation per video, forever). Do it ONLY for a hero video you want to measure.

- [ ] **(Optional) Permanently delete the two onboarding test artists.** They are ALREADY hidden
      from the homepage/Explore/public: I set `profiles.is_active = false` on both (2026-07-26), so
      the duplicate "Merce" tiles are gone. The dashboard delete failed with an empty `{}` error and
      the auth admin API returns `"Database error finding users"`, so a hard delete needs the SQL
      editor (which shows the real error). To fully remove them, run in Supabase → SQL Editor:

      ```sql
      delete from auth.users where id in (
        '2c8f96c0-63f8-4ceb-b848-87275f991c3d',  -- joshwilliams (Merce)
        'b0857804-c4ad-4946-b30a-1d7a65edb7fb'   -- joshnwmsonboardhgmailcom (Merce)
      );
      ```
      If it errors with a `foreign key constraint … on table …`, paste that line to Claude for the
      one-line cleanup. **Never** add `612fa313-8d4f-4748-8148-7804fada0d0c` (that is your real
      `m3rcey` / "Mercey" account).

- [ ] **The Terms changed (effective July 24, 2026): a live-ticket refund clause was added.**
      Nothing to do unless you want to announce it. [`/terms` §4](src/app/\(public\)/terms/page.tsx)
      now says a live-session/Executive Producer seat is final once the session happens, and
      refundable if the artist cancels or reschedules to a time the buyer can't make. It is
      buyer-favorable and matches the code (a full refund already revokes the seat), so a
      notification is optional, but §1 of the Terms says material changes get one. Your call.

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

  Two bugs caused it, both fixed, and the model was rewritten to your customer avatar on
  2026-07-28 ([`docs/ICP.md`](docs/ICP.md)): proven direct sales is now 40% of the score and big
  reach with no sales history is a penalty rather than a bonus. **Keep watching.** The loss
  tools now ask whether they have ever sold to fans, but the `worth` funnel still cannot learn
  goal or blocker, so it must recognise a hot lead from reach, sales history and behavior alone.
  If a lead you would personally chase is banded `nurture` or `unqualified`, that is a scoring
  bug, not a bad lead. Tell Claude.

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

- **Make the roadmap fully adaptive, and wire it to the Quest Engine.** The ramp already re-plans
  from real pace and real MRR, shows one milestone at a time, and promotes the step the artist's
  entry calculator was about ([`docs/REVENUE_RAMP.md`](docs/REVENUE_RAMP.md)). What is still
  static: the milestone percentages are assumed rather than measured, and nothing weights release
  cadence, content output or hours available per week, because CRWN does not collect those yet.
  Mine to build, in that order. The levelling itself belongs to the Quest Engine, which is built
  and dark: a ramp step completing should award XP there rather than the ramp growing its own
  badges, or there will be two progression systems telling an artist different things.

- **Retarget the rest of the funnel to the customer avatar.** The scoring model, the homepage
  calculator, the loss tools' qualifying question, the nurture sequence and the brain doc are done
  (2026-07-28, [`docs/ICP.md`](docs/ICP.md)). Still mine to finish: the setup wizard assumes an
  artist with nothing (one free tier, first track free, no bulk catalog import) which is the wrong
  first run for someone with 40 to 300 released songs, and the loss engine still applies a flat
  1% to 3% conversion regardless of whether the artist has ever sold anything, which under-sells a
  proven seller. Neither blocks anything today.

- **`useArtistContext` serves an empty/stale `tiers` (from `artist_profiles.tier_config`), not the
  real `subscription_tiers` table.** This made the live-session tier gate show no tiers (2026-07-26,
  fixed IN the live form by fetching `subscription_tiers` directly). Any OTHER hub page that reads
  `ctx.tiers` has the same empty list. I will audit consumers and fix the context at the source
  (point it at `subscription_tiers`) so no surface depends on the dead `tier_config`.

The Instagram acquisition engine is feature-complete and verified in production: ingress,
identity, Claude extraction with a complete deterministic fallback, the calculator handoff,
secure result links, claiming, the gated in-window email capture, follow-up automation with a
compliant unsubscribe, the tool-education drip, booking detection, the no-show ladder, retention,
and the admin panel. The privacy policy now discloses the funnel (live).

- **Announcement pop-ups: the Pop-up Engine is ON (you flipped it 2026-07-24).** Announcements now
  fire, each gated on its own feature flag: `announce_live_tips` and `announce_producer_sessions`
  are live (both features are on); `announce_royalty_readiness` waits on the royalty flag (still
  off, see the royalty migration item); `announce_hub_navigation` is live. When you add a new
  dark-launched feature's announcement, add its flag to `ANNOUNCEABLE_FLAGS` in
  `src/app/api/popups/route.ts` or the gate reads `false` forever. Remaining gap I can fix any
  time: `PopupContext` carries no account-creation date, so "existing users only" is approximated
  with a once-ever cap; say the word and I add `accountAgeDays`.

- **Artist dashboard is now 15 real screens, not a 16-tab strip.** `/profile/artist` is Rise Mode
  only; management lives in the hamburger (`/account/*`), tools live in Studio (`/studio/*`), and
  every screen wears `HubPage` (X in the top left, returns to the menu when it carries
  `?from=hub`). Nothing for you to run: no migration, no env var, no flag. (The
  `announce_hub_navigation` pop-up is now live: the Pop-up Engine flag is on. The seven Studio
  tiles that were emoji placeholders now carry real gold product photos, done 2026-07-26.)

- **Royalty / publishing intelligence, phase 1 shipped (the diagnostic).** The Royalty Readiness
  Check is built. The score-only **Royalty lead magnet** (keyword `ROYALTY`) is now LIVE (web tool
  + ManyChat DM flow, verified end to end 2026-07-27). What is deliberately NOT built, in the order
  I would build it: a **per-song registration tracker** (the check is artist-level today, tracks
  already carry an ISRC); a **composition record** separate from the recording, which is the real
  prerequisite for anything split-sheet shaped. CRWN should not become a publisher or administrator,
  and none of the above moves it toward being one.

- **Executive Producer Sessions: LIVE (2026-07-24).** The migration ran, the flag is on, and the
  fan submission agreement is final (`/submission-agreement`). Shipped and live: fan submissions
  (beats/vocals/ideas/references, private upload, deadline), the artist review queue, advisory
  polls, a public per-session sales page (`ProducerSessionOffer`), per-session stats
  (`/api/producer/analytics`), one-tap **Run it again** recurrence, free-entry seat count, a
  loss-framed announcement (`announce_producer_sessions`), and a live-ticket refund clause in the
  Terms.

  **Only two things are left, and I recommend NOT building either until you have run a real paid
  session.** Both are your decision, not more spec:
  - **Premium seat types** (a cheap viewer ticket + a few high-price producer seats sold
    separately). Lower risk, no legal, no moderation. My advice: build it the day a single-price
    session sells out, not before. Then: viewer ticket at the calculator's band price + 3 to 5
    premium seats at ~4x.
  - **Fans on mic/stage.** The bigger differentiator but the heaviest: needs a fan likeness release
    AND real-time moderation. The `stage` LiveKit role is scaffolded (types + grants + DB CHECK,
    nothing mints it). My advice: build it **invite-only, one fan at a time** (you pull up a
    specific fan), which sidesteps almost all the moderation surface. Blocked on your
    likeness-release call, and I would only start it after a session or two have run.

- **Automated lead deletion (erasure requests).** Ask me to build this when you want it. Today a
  "delete my data" request from a lead is MANUAL: `DELETE FROM lead_identities WHERE ...` in
  Supabase (it cascades). The privacy policy honestly describes this manual path, but a proper
  self-serve or one-command deletion is not built (it is Phase 2 in the checklist). Low volume
  today, so not urgent, but it is the one real gap behind the privacy disclosure.

- **Loss-revelation lead magnets: live, and one of them was NOT honest.** The house rule is that
  every tool's `fix` must point to a CRWN feature that actually exists. It is enforced by
  convention, not by code, and the **Executive Producer Session Calculator broke it**: its fix
  ended with "Fans pitch beats, vocals, and topics live", which nothing in the codebase does.
  Corrected and live on 2026-07-24, along with the hero, the cause paragraph and the email
  run-of-show, which all made the same promise. **I want to add a real check rather than trusting
  the convention a second time**, and I will unless you would rather I spent that time elsewhere.
  Every tool otherwise has a DM flow, a web page, a recovery-flow diagram, and the CRWN showcase.
  The 11th, **Own Your Fans** (keyword `OWN`, the DistroKid/independence angle), ships on today's
  owned-CRM features and reuses existing profile fields (no migration). Founder Window is a real
  feature now (cap + deadline + founder marking; migration run). The only deferred piece is
  **grandfathered/locked pricing** for founders, left out because it touches Stripe subscription
  pricing. Ask if you want it. (The ManyChat flows for the new tool keywords are now built and live.)


- **Prospect nurture (email-only calculator leads): LIVE (migrations run 2026-07-30).** A lead
  who runs a calculator, asks for the result by email, but does not sign up now enters a versioned,
  calculator-aware, consent-gated sequence (v2: 25 emails over ~12 months), and exits the instant
  they create an account. It reuses the existing Resend sender, the global suppression gate, the daily
  cron scheduler, and the lead tables (no parallel system). The Instagram unsubscribe route's
  suppression write also works properly now (the `reason='unsubscribe'` CHECK is in place).
  Deliberately NOT built yet, in the order I would build them: **Phases 4-9** (objections → mechanism →
  proof → re-engagement → authority → evergreen), which slot into the same code array with no schema
  change; and wiring the external **`/worth`** (Streaming Loss) tool to enroll (only registry wizard
  tools enroll today). Full spec + admin controls: [`docs/PROSPECT_NURTURE.md`](docs/PROSPECT_NURTURE.md).

One known limitation, and it is deliberate: **`/signup` ignores `?next`.** Auto-claim through
signup works via `ClaimRedeemer` instead. `/welcome` and `useAuth` are the two files that broke
onboarding silently for months, and a claim feature does not justify touching them.
