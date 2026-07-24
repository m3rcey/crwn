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

- [ ] **Buy one live ticket on production as a fan with NO subscription, and confirm you get in.**
      Until 2026-07-24 you could not. Six gates decided "may this fan watch" and only three
      honored a paid ticket, so a buyer without a tier was shown the Subscribe wall on the watch
      page and never reached the route that would have let them in. They also could not chat,
      could not open the replay, and got no reminder. Fixed and live (`sw.js` v240), one resolver
      now answers for all six.

      I cannot run a card, so only you can confirm it. On [thecrwn.app/m3rcey](https://thecrwn.app/m3rcey)
      with an account holding no subscription to that artist: create a gated live with a ticket
      price, buy the ticket in Stripe test mode, then open the session and check you see **Join
      Live** and not a Subscribe wall. Then send a chat message, then open the recording after it
      ends. If any of the three still blocks you, tell me which.

- [ ] **Test one real purchase and one Stripe Connect click on production.** Every Stripe flow on
      the platform was failing with `42501` and I shipped the fix on 2026-07-24 (deployed, live at
      `sw.js` v239). Cause: `schema-phase2-stripe-id-column-privs.sql` revoked SELECT on
      `stripe_connect_id` and the `platform_stripe_*` columns from `authenticated`, and naming one
      revoked column fails the WHOLE query, embedded joins included, so ~12 queries silently
      returned no row and every caller answered "not found". Subscriptions, track/product/ticket/
      tip checkout, Stripe Connect onboarding, balance, cashout, login-link, create-price and the
      billing portal were all dead, along with the payouts and billing screens.

      I verified the fix compiles and deployed it, but I cannot log in as an artist or run a card,
      so **only you can confirm money actually moves.** Two checks: subscribe to a tier on
      [thecrwn.app/m3rcey](https://thecrwn.app/m3rcey) in Stripe test mode, and open
      [`/account/payouts`](https://thecrwn.app/account/payouts) to confirm the balance renders.
      If either still fails, tell me the exact error text.

- [ ] **Run [`supabase/schema-phase2-profiles-column-privileges.sql`](supabase/schema-phase2-profiles-column-privileges.sql).
      Every user's email address is currently readable by anyone on the internet.**

      Verified against production on 2026-07-23 with the PUBLIC anon key, from outside the app:
      `GET /rest/v1/profiles?select=*` returns **all 68 profiles including `email`**, plus **5 real
      phone numbers**. The anon key ships inside every browser bundle, so this needs no login and
      no exploit, just devtools.

      Cause: `schema.sql` made profiles `FOR SELECT USING (true)`, which is right for the public
      columns (an artist's name and avatar must render). But profiles later grew private columns by
      ALTER TABLE (email, phone, full_name, stripe_connect_id, is_approved, last_active_at), and
      each one silently inherited "viewable by everyone". RLS filters ROWS, never COLUMNS, so the
      fix is a column privilege. `artist_profiles.stripe_connect_id` already returns 42501 to anon,
      so this exact hardening was done once and simply never applied to `profiles`.

      The migration revokes the table grant (a column grant is a no-op while it stands) and
      re-grants only the public columns. Self-verifies with `has_column_privilege`, so it fails
      loudly rather than half-landing.

      **The code change is already deployed and is safe either way**: `useAuth` no longer does
      `select('*')`. Run the migration whenever you like; nothing breaks before or after.

      **One exception, tell me before you run it and I will clear it first:**
      [`src/app/team/[id]/page.tsx:46`](src/app/team/[id]/page.tsx#L46) still reads
      `profiles.stripe_connect_id` from the browser. That works today only because this migration
      has not landed. Once it does, that query starts returning 42501 and the team page's payout
      banner breaks, the same failure that just took down every Stripe flow.

- [ ] **Blank the 11 fan accounts still publishing an email as their public name.** I was blocked
      from running this myself (the permission classifier refused a bulk write to production user
      data), so it needs you. One statement, no judgment calls: fans have no public page, every
      render path already falls back to "A fan", and the address stays in `auth.users`.

      ```sql
      UPDATE profiles SET display_name = NULL
      WHERE display_name LIKE '%@%' AND role = 'fan';
      ```

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

- [ ] **DO NOT record the 7 Executive Producer video scripts as written.** Two separate
      problems, and the second one is yours to decide.

      Files: [`videos/scripts/lead-magnets/`](videos/scripts/lead-magnets/) `producer-drake.md`,
      `producer-kanye-west.md`, `producer-kendrick-lamar.md`, `producer-quavo.md`,
      `producer-russ.md`, `producer-t-pain.md`, `producer-travis-scott.md`.

      **1. They promise a feature CRWN does not have.** Every script says fans "cannot pitch
      beats, cannot submit vocals, cannot suggest song ideas" and then, in the sidenote, that
      letting them do exactly that "is exactly what an artist can build on the CRWN app."
      **It is not.** There is no submission table, no fan-to-artist file upload, and no artist
      review queue anywhere in the codebase. I audited this on 2026-07-24 and fixed the same
      false claim in the shipped calculator copy (live now, `sw.js` v240), but the scripts and
      the generator that writes them still carry it.

      What an artist CAN build today, and what the scripts can truthfully say: a private,
      ticketed, limited-seat live session, sold by ticket or gated to a tier, where the artist
      shares their screen and works while fans watch and talk in the live chat, with a replay
      afterward. Everything else in the scripts (any size audience, no catalog needed, artist
      keeps full creative control, roughly two a month) is already true.

      **2. The $300 seat price is above what your own calculator returns.** `producer-kendrick-lamar.md`
      and `producer-travis-scott.md` both price a seat at $300. The calculator's top band is
      **$200** for any audience over 250k
      ([`toolAdapters.ts` seatPrice](src/lib/acquisition/toolAdapters.ts)). So a viewer who
      watches the Kendrick video ($17.1M/mo), comments PRODUCER, and runs the tool gets
      **$11.4M/mo** instead. The video and the tool must not disagree, and which one moves is
      your call: either drop the scripts to $200, or raise the top band. Tell me which and I
      will make the change.

      (The "two sessions a month" line is fine. The seats are a monthly total split across the
      two sessions, and the NOTES block in each script already says so. It only reads as a
      multiplier if the narration implies each session sells that many, so keep the reveal
      worded as a monthly figure.)

      Also fix the generator, or it writes the same claim again:
      [`.claude/commands/crwn-lead-magnet.md`](.claude/commands/crwn-lead-magnet.md) lines 63
      and 206.

### P1 — real risk or real friction, but nothing is on fire

- [ ] **Run [`supabase/schema-phase2-featured-hidden.sql`](supabase/schema-phase2-featured-hidden.sql)**
      to take the `aribahmad21@gmail.com` artist off the Featured Artists row.

      There was no way to remove ONE artist from discovery. The only existing lever was
      `profiles.is_active = false`, which deactivates their entire account: the wrong-sized
      tool for "this tile reads badly". The migration adds `artist_profiles.featured_hidden`,
      rebuilds `artist_profiles_public` (that view enumerates its columns at creation time,
      so a new column stays invisible to it until rebuilt, and the app reads the view), and
      sets the flag on that one artist. Their account, public page, music and payouts are all
      untouched, and they stay findable by search. Self-verifies, including that the rebuilt
      view still does not leak the Stripe id columns.

      The code shipped ahead of it and is safe either way: `featured_hidden` is queried
      separately and tolerantly, so until you run this, nobody is hidden and nothing errors.

      To undo, or to hide someone else later:
      ```sql
      UPDATE artist_profiles SET featured_hidden = false WHERE slug = '<slug>';
      SELECT ap.slug, p.display_name FROM artist_profiles ap
        JOIN profiles p ON p.id = ap.user_id WHERE ap.featured_hidden;
      ```

- [ ] **Delete your two leftover onboarding test artists.** Both are live on Featured
      Artists right now as duplicate "Merce" tiles:

      | slug | public name | email |
      |---|---|---|
      | `joshwilliams` | Merce | joshn.wms+onboardi@gmail.com |
      | `joshnwmsonboardhgmailcom` | Merce | joshn.wms+onboardh@gmail.com |

      Both are your own plus-addressed signups from testing the setup wizard. Deleting the
      auth user cascades everything. Supabase dashboard → Authentication → Users → search
      `+onboard` → delete both. **Do NOT delete `joshn.wms@gmail.com`**, that is your real
      admin account (slug `m3rcey`, display name "Mercey").

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

- [ ] **Turn the Pop-up Engine on.** Its migration is applied (both tables confirmed present in
      production on 2026-07-23), so only the flag is left:

      ```sql
      UPDATE admin_settings SET value = '{"enabled":true}'::jsonb WHERE key = 'popup_engine';
      ```

      **This is now the thing standing between your artists and two live features they will not
      find on their own: Live Tips and Executive Producer Sessions.** Both flags are ON in
      production, but every existing artist formed their mental map of the app before either
      existed. Two announcements are written and waiting (`announce_live_tips`,
      `announce_producer_sessions`); each fires only for artists, only once, and only while its own
      feature flag is on. Until the engine flag flips, nobody is told about either.

      Low survey scores (1-2 of 5) email joshn.wms@gmail.com with the fan's feedback.

- [ ] **The Terms changed (effective July 24, 2026): a live-ticket refund clause was added.**
      Nothing to do unless you want to announce it. [`/terms` §4](src/app/\(public\)/terms/page.tsx)
      now says a live-session/Executive Producer seat is final once the session happens, and
      refundable if the artist cancels or reschedules to a time the buyer can't make. It is
      buyer-favorable and matches the code (a full refund already revokes the seat), so a
      notification is optional, but §1 of the Terms says material changes get one. Your call.

- [ ] **DECIDE the seat model for Executive Producer Sessions.** This one determines the schema,
      so I am not picking it. `live_sessions` has a single `price` column today, which means one
      price for everyone and no seat types. The options and what each costs to build:

      - **One price, capped seats.** Ships on what exists (cap is 10 to 500 today). Cheapest.
      - **Viewer tickets plus a few premium producer seats.** Needs a ticket-types table, and
        for large viewer counts a different video transport than the current LiveKit room.
      - **Lottery or application.** Needs the submission system first, plus refund-or-decline.
      - **Several smaller sessions.** Ships on what exists, and is the closest fit to the "two a
        month" story the scripts already tell.

      Related: the current capacity picker offers 10 to 500. If you want a number above 500,
      say so, because it changes how the room is built, not just the dropdown.

- [ ] **Run [`supabase/schema-phase2-royalty-readiness.sql`](supabase/schema-phase2-royalty-readiness.sql)**
      in the Supabase SQL editor, then flip the flag to launch the Royalty Readiness Check.

      This is the first piece of the "money you already earned but never collected" side of CRWN.
      It is a DIAGNOSTIC, not a collection service: twelve self-reported questions, a coverage
      score, and a ranked list of actions pointing at the organizations that actually collect
      (PRO, the MLC, SoundExchange, an administrator). It deliberately shows **no dollar figure**,
      because every answer is unverifiable and an invented "you are owed $X" would be a fake
      royalty statement. The migration adds one table (`royalty_readiness`, owner-only RLS) and
      seeds the flag OFF. Self-verifies at the end.

      The code is already live and **inert until you do this**: the Studio tile hides itself, the
      page says "not available yet", and the API returns `{ enabled: false }`.

      Then turn it on:
      ```sql
      UPDATE admin_settings SET value = '{"enabled": true}'::jsonb WHERE key = 'royalty_readiness';
      ```
      Verify on the `m3rcey` test artist: a **Royalty Readiness** tile appears in Studio, and
      answering "no" to the PRO question puts "Sign up with a PRO" at the top of the list.

      **Decision that is yours, not mine:** whether CRWN should eventually earn referral revenue
      from the administrators this screen names. Today it names Songtrust, ASCAP, BMI, the MLC and
      SoundExchange with **no affiliate relationship and no preference**, which is the honest
      default. Taking a referral fee changes what that list means, so it is a founder call.

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

The Instagram acquisition engine is feature-complete and verified in production: ingress,
identity, Claude extraction with a complete deterministic fallback, the calculator handoff,
secure result links, claiming, the gated in-window email capture, follow-up automation with a
compliant unsubscribe, the tool-education drip, booking detection, the no-show ladder, retention,
and the admin panel. The privacy policy now discloses the funnel (live).

- **Announcement pop-ups: DONE, and they can no longer fire early.** `PopupContext` now carries
  `featureFlags` (read from `admin_settings`), so an announcement gates on the flag of the feature
  it announces as well as on the engine. That removed the reason these were blocked, so both owed
  announcements are written and waiting: `announce_live_tips` and `announce_royalty_readiness`.
  When you add a new dark-launched feature's announcement, add its flag to `ANNOUNCEABLE_FLAGS`
  in `src/app/api/popups/route.ts` or the gate reads as `false` forever. Remaining gap I can fix
  any time: `PopupContext` carries no account-creation date, so "existing users only" is
  approximated with a once-ever cap; say the word and I will add `accountAgeDays`.

- **Artist dashboard is now 15 real screens, not a 16-tab strip.** `/profile/artist` is Rise Mode
  only; management lives in the hamburger (`/account/*`), tools live in Studio (`/studio/*`), and
  every screen wears `HubPage` (X in the top left, returns to the menu when it carries
  `?from=hub`). Nothing for you to run: no migration, no env var, no flag. Two cosmetic follow-ups
  I will do unasked unless you want them sooner: the seven new Studio tiles (Music, Albums, Shop,
  Live, Analytics, Manager, Sync) are emoji placeholders and want real gold product photos like
  the other tiles, and the `announce_hub_navigation` pop-up is written but only shows once the
  Pop-up Engine flag `admin_settings.popup_engine` is on, which is still off.

- **Royalty / publishing intelligence, phase 1 shipped (the diagnostic).** The Royalty Readiness
  Check is built and dark. What is deliberately NOT built, in the order I would build it: the
  **Unclaimed Royalty lead magnet** (same scorer, score-only, no dollar figure, keyword `ROYALTY`),
  which should only ship once the in-app check is live so the tool points at something real; a
  **per-song registration tracker** (the check is artist-level today, tracks already carry an
  ISRC); a **composition record** separate from the recording, which is the real prerequisite for
  anything split-sheet shaped. CRWN should not become a publisher or administrator, and none of
  the above moves it toward being one.

- **Executive Producer Sessions: Phase 1 BUILT and dark (2026-07-24), waiting on the rights terms
  to go live.** Fan submissions (beats/vocals/ideas/references, private upload, deadline), the
  artist review queue (feature/shortlist/pass, play, download), and advisory in-session polls are
  all shipped behind `admin_settings.producer_sessions` (off). To launch: run the migration (P1
  above), settle the rights terms (Do Now above), then flip the flag. Once live, every sentence in
  the producer scripts is true except "fans get on the mic," which is Phase 2.

  What is deliberately NOT in Phase 1, in the order I would build it: **stage promotion** so a fan
  can actually be given a microphone (the `stage` role is already in the types, the LiveKit grants
  and the DB CHECK, and nothing mints it, so this is smaller than it looks) plus kick/mute/ban; a
  **public per-session sales page**; **per-session revenue and attendance reporting**; then **seat
  types** and **recurrence** (recurrence should reuse `fulfillment_obligations`, which already
  models a monthly livestream promise, not a new table). Ask when you want Phase 2. Stage needs a
  likeness-release decision from you before it can ship.

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
