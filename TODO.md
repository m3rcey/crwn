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

- [ ] **Apply the experiments migration, then (optionally) turn the engine on.** The holistic
      experience experimentation foundation shipped dark. It is inert until you do two things, both
      yours: (1) run [supabase/schema-phase2-experiments.sql](supabase/schema-phase2-experiments.sql)
      in the Supabase SQL editor (creates `experiments` + `experiment_events`, admin-only RLS, self-
      verifying). Until then the Experiments admin tab reads existing funnel data only (experience
      comparison still works; eligible/exposed stay 0). (2) To actually run an experiment, flip the
      flag: upsert `admin_settings` key `experiments` to `{ "enabled": true }` (or `PUT /api/admin/settings`
      with `{ "key": "experiments", "value": { "enabled": true } }`), then in the Experiments tab set an
      experiment to **running**. Nothing assigns or exposes a variant until both are done. No pricing,
      fees, ownership, or permissions can ever change through an experiment (behavior is prebuilt code).

- [ ] **Rewire the remaining ManyChat flows to deliver-first (Royalty is done).** The funnel no
      longer gates the breakdown behind an email; CRWN delivers the result link immediately and now
      actually EMAILS a copy when a lead gives their address (all code shipped + verified: revs
      250b2af/3267b75/ef79bad). Each remaining flow needs the SAME 3 node edits in ManyChat (no code):
      (1) on the send_result node (Send Message showing `crwn_message`), add a button -> Open URL ->
      insert the `crwn_result_url` pill -> label "See The Breakdown"; (2) reword the email-ask node to
      "Want me to email you a copy so it doesn't get buried in your DMs? Drop your best email, or skip
      this and tap 'See The Breakdown' above."; (3) turn the end node (after the profile_update External
      Request) into "Sent. I just emailed a copy to your inbox so it doesn't get buried." and DELETE its
      button. Then Update/publish and DM-test. Flows to do: **OWN, LIVE, PRODUCER, WORTH, VAULT** (and
      any others live). Delivery-first policy is documented in `docs/acquisition/manychat-setup-guide.md`
      section 6b.

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

- [ ] **Add the `ROYALTY` keyword flow in ManyChat** (new "Royalty Readiness Check" lead magnet,
      keywords `royalty` / `royalties` / `publishing`). CRWN-side routing already exists (it derives
      from `dmKeywords` in the registry), so nothing is needed on our end. Clone an existing tool
      keyword flow (e.g. `SHARE`) and point it at the same External Request. Verify the deploy's
      webhook rev sha BEFORE testing (ManyChat guide §10). Live at
      [thecrwn.app/tools/royalty-readiness-check](https://thecrwn.app/tools/royalty-readiness-check).

      **This one is different from the other 16 and the difference is deliberate:** it returns a
      SCORE, not a dollar figure. Every other tool estimates revenue the artist could create, which
      is a plan. This one is about money that may already be owed, and stating a dollar amount for
      that from six self-reported answers would be inventing a fact about the world. So its hook
      teases a score, and the hero delivers a score. **If you write video scripts for it, do not
      promise a dollar** or the hero will not match the hook.

- [ ] **Add the `OWN` keyword flow in ManyChat** (new "Own Your Fans" lead magnet, keyword
      `own`). CRWN-side routing already exists (it derives from `dmKeywords` in the registry), so
      nothing is needed on our end. In ManyChat, clone an existing tool keyword flow (e.g. `SHARE`)
      and set its trigger keyword to `OWN`, pointing at the same External Request. **Until this is
      added, any Instagram comment of "OWN" from the new Own Your Fans scripts goes nowhere.**
      Verify the deploy's webhook rev sha BEFORE testing (see the ManyChat guide §10). The tool is
      live at [thecrwn.app/tools/own-your-fans-calculator](https://thecrwn.app/tools/own-your-fans-calculator).

- [ ] **Add the `PRODUCER` keyword flow in ManyChat** (Executive Producer Session Calculator).
      Same clone-an-existing-flow steps as `SHARE`, trigger keyword `PRODUCER`, same External
      Request. Verify the deploy's webhook rev sha BEFORE testing (ManyChat guide §10). The
      tool is live at
      [thecrwn.app/tools/executive-producer-session](https://thecrwn.app/tools/executive-producer-session).
      **Do this only after you have settled the script decisions in the P0 item above**, or the
      comments arrive pointing at copy you are about to change.

- [ ] **Add the `LIVE` keyword flow in ManyChat** (new "Live Experience Calculator" lead magnet,
      keyword `live`). CRWN-side routing already exists (it derives from `dmKeywords` in the
      registry), so nothing is needed on our end. In ManyChat, clone an existing tool keyword flow
      (e.g. `SHARE`) and set its trigger keyword to `LIVE`, pointing at the same External Request.
      **Until this is added, any Instagram comment of "LIVE" goes nowhere.** Verify the deploy's
      webhook rev sha BEFORE testing (see the ManyChat guide §10). The tool is live at
      [thecrwn.app/tools/live-experience-calculator](https://thecrwn.app/tools/live-experience-calculator).

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
  `?from=hub`). Nothing for you to run: no migration, no env var, no flag. Two cosmetic follow-ups
  I will do unasked unless you want them sooner: the seven new Studio tiles (Music, Albums, Shop,
  Live, Analytics, Manager, Sync) are emoji placeholders and want real gold product photos like
  the other tiles. (The `announce_hub_navigation` pop-up is now live: the Pop-up Engine flag is on.)

- **Royalty / publishing intelligence, phase 1 shipped (the diagnostic).** The Royalty Readiness
  Check is built and dark. What is deliberately NOT built, in the order I would build it: the
  **Unclaimed Royalty lead magnet** (same scorer, score-only, no dollar figure, keyword `ROYALTY`),
  which should only ship once the in-app check is live so the tool points at something real; a
  **per-song registration tracker** (the check is artist-level today, tracks already carry an
  ISRC); a **composition record** separate from the recording, which is the real prerequisite for
  anything split-sheet shaped. CRWN should not become a publisher or administrator, and none of
  the above moves it toward being one.

- **Executive Producer Sessions: LIVE (2026-07-24).** The migration ran, the flag is on, and the
  fan submission agreement is final (`/submission-agreement`). Shipped and live: fan submissions
  (beats/vocals/ideas/references, private upload, deadline), the artist review queue, advisory
  polls, a public per-session sales page (`ProducerSessionOffer`), per-session stats
  (`/api/producer/analytics`), one-tap **Run it again** recurrence, free-entry seat count, a
  loss-framed announcement (`announce_producer_sessions`), and a live-ticket refund clause in the
  Terms.

  **Only two things are left, and I recommend NOT building either until you have run a real session
  (see the P0 test item).** Both are your decision, not more spec:
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
  pricing. Ask if you want it. Also still yours: the **ManyChat flows** for the new tool keywords.


One known limitation, and it is deliberate: **`/signup` ignores `?next`.** Auto-claim through
signup works via `ClaimRedeemer` instead. `/welcome` and `useAuth` are the two files that broke
onboarding silently for months, and a claim feature does not justify touching them.
