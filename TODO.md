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

- [ ] **The email capture on every calculator has captured ZERO leads, ever. Decide whether the
      `/worth` form should collect marketing consent.** Nothing to run in SQL. This is a product
      call only you can make.
      What I verified in production on 2026-08-15 (service-role query, read-only): `lead_magnet_leads`
      is **0 rows**, `prospect_nurture_enrollments` is **0**, `prospect_nurture_sends` is **0**, against
      41 stored results and 244 calculator starts. The 25-email nurture sequence has never sent one
      email to one person. The migration is applied and the cron runs; there is simply no input.
      I have already done what I safely could: rewrote the capture card to say what actually arrives
      instead of "Want a copy of this?", cut three dead form fields (genre, @handle, phone were
      collected for months and read by nothing), and fired the `lead_magnet_lead_capture_viewed`
      event, which was defined and allowlisted but never actually called, so the opt-in rate had no
      denominator.
      **What needs you:** `/worth` is one of the six promoted tools and it does NOT enroll anyone,
      because its form (`src/app/(public)/worth/WorthExperience.tsx`) collects **no marketing consent
      checkbox at all**. Wiring it to nurture would mean inferring marketing permission from someone
      typing an email, which I will not do on my own. Either:
        1. Say yes, and I add an explicit unchecked consent box to the `/worth` form and wire it, or
        2. Say no, and `/worth` stays a `crm_contacts` capture with no nurture, which is fine but
           should be a decision rather than an accident.
      Watch after any change: `prospect_nurture_enrolled` / `lead_magnet_result_generated`, today 0/40.

- [ ] **To finish Team Splits I need a test-mode sandbox. This is the only thing left, and it is
      environment setup, not code.** Nothing to run in SQL.
      I checked rather than assumed: your Stripe key really is live (I asked Stripe, and the balance
      came back `livemode: true` on acct_1BO7MsEG40iT0MPS), there is no test key anywhere, there is
      no `STRIPE_WEBHOOK_SECRET` in .env.local at all, and the Supabase project is production. So the
      only canary I could run today would move real money through a real artist's Connect account.
      I did not create a single Stripe object.
      What I need, in one place that is NOT production:
        1. A Stripe **test-mode** secret key and publishable key (same Stripe account, just the test
           side). Put them in the sandbox environment the normal way; do not paste them to me.
        2. A `STRIPE_WEBHOOK_SECRET` for that environment. `stripe listen --forward-to
           localhost:3000/api/stripe/webhook` prints one.
        3. A Supabase project that is NOT ecpqtuidtsncjfwtkvwc. A free one is fine. I will replay the
           schema files from the repo into it.
      Why both, not just the Stripe key: the webhook refuses test events if EITHER the key is live OR
      the database is production. That guard is right and I am not touching it.
      Once those three exist I do the rest myself: create the test Express account, build the canary
      artist/fan/collaborator, and run all ten steps (first subscription charge, renewal, one-time
      purchase, two payments racing a cap, a payment that never settles, a partial refund, a refund
      replay, the artist surplus return, a dispute, and a collaborator cashout), then reconcile every
      cent and decide whether payouts turn on. **They stay off until that passes.**

- [ ] **One 30-second run to close out early access: prove a PAYING fan is not locked out.**
      Open and run:
      [`supabase/verify-early-access-window.sql`](supabase/verify-early-access-window.sql)
      Expect nine `PASS` notices then `ROLLBACK`. Nothing persists (it creates a members-first
      track, a members-only track, a public track and two throwaway subscriptions, asks the oracle
      as each kind of reader, and destroys all of it).
      Both migrations are already applied and I have proved the SECURITY half live with the anon
      key: a track inside its window returns `can_play = false` with both audio columns NULL, and it
      opens to everyone once the window passes. What I could NOT prove from outside is the opposite
      direction, because it needs a logged-in paying fan's session: that an entitled member CAN
      still play an in-window track (its check 3). Every signal says it is fine (the tier branch of
      the function is unchanged, and all 11 member-only tracks still behave), but "locked out a
      paying fan" is the one failure worth 30 seconds of certainty.
      If any line says FAIL, send me the output and stop.

### P1 — real risk or real friction, but nothing is on fire

- [ ] **Two quick SQL runs to finish the surface reduction.** Both self-verify and are safe to
      run in any order.
      **1. Turn off live tips** (0 tips ever; the tip bar and checkout stop rendering, nothing
      is deleted, reversal is the same row). Open and run:
      [`supabase/flag-off-live-tips.sql`](supabase/flag-off-live-tips.sql)
      **2. Drop the retired Manager outcome columns** (never written; the file ABORTS if any row
      unexpectedly holds data, so a surprise is a loud error, not a loss). Open and run:
      [`supabase/schema-phase2-drop-manager-outcome-schema.sql`](supabase/schema-phase2-drop-manager-outcome-schema.sql)

- [ ] **RE-RUN the earnings/recruiters SELECT policy migration (the fixed version).** Open and run:
      [`supabase/schema-phase2-sec-earnings-recruiters-select-policies.sql`](supabase/schema-phase2-sec-earnings-recruiters-select-policies.sql)
      Your first run on 2026-08-12 DID take effect: the transaction committed, and both tables now
      answer the anon key with 42501 instead of 200, so the access hole is closed. What failed was
      the self-verify block that runs after COMMIT, on this line:
        MIGRATION FAILED: recruiters has a policy reachable by anon/authenticated/PUBLIC
      That was a real defect in the migration, not a fluke. Its cleanup loop only dropped policies
      whose USING clause was literally `true`, but its assertion forbids ANY policy naming a Data
      API role, so a non-permissive recruiters policy survived and the file was asserting something
      it never enforced. The loop now uses the exact predicate the assertion checks. Re-running is
      safe and idempotent: everything else in the file is CREATE OR REPLACE / DROP IF EXISTS /
      REVOKE. Watch for a `NOTICE: Dropped recruiters policy <name>` line, and tell me the name,
      because nothing in version control records what that policy was.
      Expected on success: `earnings + recruiters verified: ...` and no exception.
      Verify after with: npm run verify:migrations (both SEC-EARN lines must read DENIED (closed))

- [ ] **Sign the three remaining unsubscribe senders, then flip the legacy flag.** Unsubscribe is
      already safe (the GET only renders a confirm page; the mutation needs a POST with a
      server-minted token), but three senders still emit UNSIGNED links, so
      `ALLOW_UNSIGNED_LEGACY_LINKS` in src/lib/emails/unsubscribeToken.ts must stay true until they
      are updated. Copy the pattern from src/lib/campaignSender.ts:294-305:
        src/app/api/campaigns/[id]/send/route.ts:370 and :559
          pass `unsubscribeSigning` to campaignEmail, and sign the List-Unsubscribe header too
        src/app/api/cron/sequences/route.ts:210
          cannot use `unsubscribeSigning` (that descriptor signs with sendId, this link is keyed on
          enrollment.id). Use appendUnsubscribeToken(url, { kind: 'sequence-artist',
          id: enrollment.id, artistId: enrollment.artist_id, recipient: fanRecipient(enrollment.fan_id) })
        src/app/api/admin/crm/outreach/route.ts:157
          appendUnsubscribeToken(url, { kind: 'crm-outreach', id: send.id,
          artistId: CRWN_PLATFORM, recipient: emailRecipient(send.email) })
      Then flip the flag to false, which stops a bare row id being a capability at all. Do not flip
      it before, or you strand every already-sent email, which is a compliance failure.

- [ ] **Migrate src/middleware.ts to the "proxy" convention.** Next 16.3.0 prints a deprecation
      warning for the middleware file convention. It builds clean today so this is not urgent, but
      that file carries the load-bearing rule that the matcher MUST exclude api/, and getting it
      wrong makes every POST 404. It needs a deliberate pass, not a codemod run in passing.

- [ ] **Enforce CSP (currently Report-Only).** `Content-Security-Policy-Report-Only` is live in
      production and its origins were derived from the code, but it carries `script-src 'self'
      'unsafe-inline'`, so it provides ZERO XSS containment today. Removing `unsafe-inline` needs a
      per-request nonce minted in middleware, because the static `headers()` block in
      next.config.ts cannot produce one. Once a nonce is present browsers ignore `'unsafe-inline'`,
      so it is a single cutover rather than a gradual one. There is also no report collector, so
      violations only reach the console of whoever is looking; a `/api/csp-report` sink would need
      its own rate limit and body cap. Until both land, do not describe CSP as protecting users.

- [ ] **Set HSTS `includeSubDomains` at the Vercel domain layer, not in code.** Production's
      `Strict-Transport-Security: max-age=63072000` comes from the Vercel edge, not from
      next.config.ts. Adding a second STS header from the app risks two competing values, and a
      browser processes only one, so a well-meant `includeSubDomains` could silently WEAKEN HSTS.
      It is also a two-year, hard-to-reverse commitment. A DNS probe of 18 likely subdomain names
      found only the apex resolving, so it looks safe, but that is a dictionary sample and not
      proof. Set it in the Vercel dashboard, then confirm exactly one STS header comes back:
        curl -sI https://thecrwn.app

- [ ] **Three crons filter on `artist_profiles.is_active`, a column that DOES NOT EXIST, and all
      three have been silently doing nothing for months.** Found 2026-08-11 while tracing the
      Manager loop. Verified against production: `artist_profiles.is_active` returns
      `42703 column does not exist`, while `profiles.is_active` (a different table) does exist.
      None of the three checks the error, so `data` comes back `null` and each one early-returns
      as if there were simply no artists. Affected: `/api/cron/ai-manager` (proven dead: its
      heartbeat has said **"No active artists" every single day**, and `agent-health` reads that
      heartbeat as PROOF OF LIFE, so the safety net is masking the outage it exists to catch),
      and `/api/cron/weekly-report`. **`weekly-payout` is no longer on this list: it was RETIRED
      2026-08-11** after live Stripe inspection proved it had never created a single payout while
      Stripe had been paying artists automatically the whole time.
      **So this item is now only about `/api/cron/weekly-report`** (`ai-manager` has its own item
      below). Decide: fix the filter so the weekly report resumes, or retire it too. It has been
      sending nothing for months and nobody noticed, which is the same evidence pattern.

- [ ] **Decide whether the autonomous (scheduled) AI Manager should run at all. My recommendation:
      keep it dormant, do not delete it.** Full reasoning in `docs/crwn-brain/02-FEATURE-MAP.md`.
      Short version: there are TWO gates holding it shut, not one. Fixing `is_active` alone would
      NOT restart autonomous actions today, because all 9 artists are on `starter` and the action
      generator returns early for starter. It would restart daily rule-based nudges and push
      notifications for 9 artists. **Autonomy switches itself on the day one artist upgrades to
      Pro**, with no further code change, so this decision has a deadline set by your first Pro
      signup. Also worth knowing before you decide: of the only two actions that can auto-execute
      without you, one (`send_reengagement`) duplicates a deterministic cron that already runs
      daily, and both end in emails to fans.

- [ ] **Tag every calculator video link BEFORE you publish it.** An untagged link still works, it
      just lands under "unknown" forever and that video can never be compared to another one. No
      migration, nothing to deploy: build each link at /admin -> Lead Magnets -> **Campaign link
      builder**, then tag the matching ManyChat flow. **Two kinds of flow, tagged in different
      places:** a CRWN engine flow (has an Actions -> External Request node) takes the tag in the
      node-2 request BODY, not as a pasted URL, because the link it sends is `{{crwn_result_url}}`.
      A plain link flow takes the pasted URL in its button. Click-by-click: section 2b of
      [`docs/acquisition/campaign-tagging.md`](docs/acquisition/campaign-tagging.md). Read once:
      [`docs/acquisition/campaign-tagging.md`](docs/acquisition/campaign-tagging.md) (naming
      convention, allowed values, worked examples, and what CRWN can never see). Results land at
      /admin -> Lead Magnets -> **Content scorecard**.

- [ ] **Pick the first THREE launch partners and flip their flag:**
      [`supabase/enable-launch-partner.sql`](supabase/enable-launch-partner.sql). Edit the slug
      list, run it, and the guarantee checklist appears on their command screen. Pick
      strategically (prior direct sales + an exportable list + will actually send the campaign),
      not whoever agrees first. Three, not five to ten: you are learning delivery hours, not
      scaling yet. Charge the implementation fee (0 to $500 for the founding cohort) by a
      MANUAL Stripe invoice from the dashboard; there is deliberately no checkout for it.

- [ ] **Set up the Money Model tab** (its migration already ran; probe-verified). In
      /admin -> **Money Model**:
      1. Set your **founder hourly cost** (Cost assumptions box). No default exists on purpose;
         until you set it, labor cost and contribution margin read "missing", never zero.
      2. Create one engagement per launch partner (type the artist slug), enter the agreed fee,
         start date, and the allocated acquisition cost, and log your hours as you work.
      Recording the fee here does not charge anyone; the invoice stays manual in Stripe.

- [ ] **Launch content for the four avatar funnels. These are the exact links.** All four
      sub-avatars now point at the ALL-IN-ONE calculator, which leads with that avatar's
      questions and framing (spec: [`docs/SUB_AVATARS.md`](docs/SUB_AVATARS.md)). Paste these
      wherever that avatar's video, ad or bio link lives:
      - Empire builder (big audience, already sells direct)
        thecrwn.app/tools/opportunity-calculator?from=highest_priority_empire_builder
      - Established independent operator (years in, runs it themselves)
        thecrwn.app/tools/opportunity-calculator?from=established_independent_operator
      - Brand-led hip-hop artist (content engine, attention they do not own)
        thecrwn.app/tools/opportunity-calculator?from=brand_led_hip_hop_artist
      - R&B empire builder (devoted fans with nowhere to go deeper)
        thecrwn.app/tools/opportunity-calculator?from=rnb_empire_builder

      A typo in `?from=` is harmless: the calculator just asks in its normal order. Add
      `&utm_content=<video-label>` on each so the admin Avatars tab can compare creatives;
      both the avatar and first-touch UTMs now persist across the whole visit.

- [ ] **When you read the Avatars tab, read the genre rows, not just the cohort totals.**
      Nothing to do today; this is a one-time "how to not misread your own report". The
      qualification bar means every big seller lands in Highest Priority whatever their genre,
      so that cohort will always look richest: it is defined as your biggest artists. The
      comparison that actually tells you where to spend is the **"Who this funnel brought"** rows
      inside each cohort card (hip-hop vs R&B vs other, with the first-paid rate per genre), plus
      the genre filter at the top. And it only compares CONTENT if your links carry `?from=`;
      untagged traffic falls back to scoring, which compares artist size instead.

- [ ] **Run the membership-strategy migration:**
      [`supabase/schema-phase2-membership-strategy.sql`](supabase/schema-phase2-membership-strategy.sql).
      Adds `artist_profiles.membership_strategy` (the explicit Release Club vs Vault override)
      plus the two declared facts the strategy card asks for (`declared_unreleased_tracks`,
      `declared_releases_per_year`), all WITH the per-column SELECT grants that keep
      `select('*')` from 42501-ing. **If you already ran an earlier version of this file,
      run it again: it is idempotent** (ADD COLUMN IF NOT EXISTS) and the later columns are new.
      Until it runs, everything works on the derived recommendation; only saving answers or
      switching strategy reports it cannot save yet. Self-verifies, including the grants.

- [ ] **Run one real Fan Drive when your constraint says reach or first paid.** Nothing technical
      is outstanding: the migration is applied and production-verified. This is the product step.
      Open `/fan-campaigns`. If CRWN has diagnosed reach or first-paid you get a prefilled drive;
      if it has diagnosed an overdue promise or churn you get that priority instead and no drive,
      which is the gate working, not a bug. Send `thecrwn.app/<your slug>/campaign` to a handful of
      fans directly, not as a broadcast. **CRWN can only verify PAYING members brought in by a
      participant's link.** Free members are not attributable to anyone (the free join path records
      no referral), and the screen says so rather than showing you a zero. Until a drive closes,
      CRWN has no campaign outcome data at all, which is why this is worth doing once for real.

- [ ] **Decide what the public fan leaderboard is allowed to show.** Not urgent, and nothing is
      leaking now: the points total is no longer published, because it was exactly invertible
      back to a fan's lifetime spend given the referral, comment and like counts shipped beside
      it. The public list now shows rank, name, tier and those three counts, and it is still
      ORDERED by the full score (spend included) server-side. The open question is whether you
      want a visible number back, in which case the options are a bucketed score or a score with
      the spend term removed. Both change what the leaderboard means, so it is your call, not a
      bug fix. No migration.

- [ ] **Two one-click confirmations only you can do (both need a logged-in session), then tell me
      and I will delete this.**

      **1. Top up the DeepSeek balance. DIAGNOSED 2026-08-01: `HTTP 402 Insufficient Balance`.**
      The `DEEPSEEK_API_KEY` is valid and is reaching production. The account simply has no
      credit, which is the standard failure on a new DeepSeek key. There is nothing to fix in
      code.

      1. Log in at `platform.deepseek.com` with the account that owns the key.
      2. Billing (or "Top up"), add credit. Their minimum is a few dollars and the support
         assistant uses `deepseek-chat` with an 800-token cap per reply, so a small balance lasts
         a long time at CRWN's current volume.
      3. Send a message at `/support`. A real answer means it is working. As an admin you would
         see any remaining fault printed inline as `[admin only] ...`.

      Not urgent, because the chat is NOT dead: on any assistant fault it answers from the
      getting-started guides (no key, no balance, no network), and it still notifies you. You now
      get at most ONE "assistant is down" email per hour no matter how many people chat.

      **2. Stripe env wiring.** First just OPEN `/account/billing`. You are not actually on Pro:
      the row says `pro`/`active` but Stripe has no subscription behind it, and the SQL migration
      could not catch it because your `platform_stripe_subscription_id` is not null, it points at
      a subscription that no longer exists. The page now asks Stripe on load and corrects itself,
      so it should flip you to Launch and make Pro clickable.

      Then Pro → Upgrade. I verified the four live prices exist at the right amounts on the right
      products (CRWN Pro $49/$490, CRWN Scale $199/$1,990) and that ZERO artists sit on the old
      $9.99 price, so grandfathering is a closed question. What I cannot check is which price id
      each Vercel variable holds, because Sensitive vars are unreadable to me. If Stripe opens
      showing **$49.00 / month**, the wiring is right and I will delete this. If it errors, the
      wiring is wrong and the error is deliberate: checkout compares the live price to the code's
      $49 and refuses rather than charging the stale $9.99. Nothing can silently undercharge.

- [ ] **Wind down Twilio: the SMS feature is REMOVED from CRWN (your call, 2026-07-31, for
      compliance cost).** Code, routes, cron, tier copy, legal SMS program section: all gone.
      Hot-lead alerts now arrive by EMAIL always (plus the carrier-gateway text if
      `FOUNDER_ALERT_SMS_EMAIL` is set; that path is just email and needs no Twilio). In Twilio:
      release the number (+1 314 557 3549) and close or downgrade the account so it stops
      billing, and abandon the A2P campaign (no action needed, it just lapses). In Vercel you
      can delete `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`; nothing
      reads them anymore. KEEP `FOUNDER_ALERT_SMS_EMAIL` if you want hot-lead texts.
      The old `sms_*` tables keep their consent history; they are simply unused.

- [ ] **Promote the all-in-one calculator to PRIMARY when `oyf-signup-timing-v1` concludes.**
      Decision made 2026-07-30 (you delegated it): do NOT promote while the experiment runs,
      because Own Your Fans is its assigned experience and swapping traffic mid-flight burns the
      readout we are paying for. The moment you conclude the experiment in `/admin` →
      Experiments, tell Claude "promote the opportunity calculator" and it will flip the two
      lines in [`src/lib/opportunityFunnels/registry.ts`](src/lib/opportunityFunnels/registry.ts)
      (opportunity-calculator to `primary`/rank 0, Own Your Fans to `secondary`).

- [ ] **Point your video funnels at the all-in-one calculator (here is exactly where and how).**
      This is only about the LINKS you paste places, nothing inside CRWN or ManyChat flows
      changes. Wherever you currently paste a single tool's link (a video caption, your
      Instagram bio, a Linktree/link-in-bio button, a YouTube description), replace it with the
      matching line below. The calculator then opens leading with that video's topic before
      asking the rest:
      - Vault video → `thecrwn.app/tools/opportunity-calculator?from=vault-revenue-planner`
      - Streaming-pays-nothing video → `thecrwn.app/tools/opportunity-calculator?from=worth`
      - Share-to-Earn video → `thecrwn.app/tools/opportunity-calculator?from=share-to-earn-planner`
      - Clip-to-Earn video → `thecrwn.app/tools/opportunity-calculator?from=clip-to-earn-campaign-planner`
      - Own Your Fans video → `thecrwn.app/tools/opportunity-calculator?from=own-your-fans-calculator`
      - Producer session video → `thecrwn.app/tools/opportunity-calculator?from=executive-producer-session`
      - Live show video → `thecrwn.app/tools/opportunity-calculator?from=live-experience-calculator`
      A typo in `?from=` is harmless (the calculator just asks in its normal order). The old
      per-tool links keep working, so you can switch one video at a time. Do NOT touch the
      ManyChat keyword flows; those are separate and already live.

- [ ] **(Optional, low priority) Per-video attribution for "Highest Converting Video."** CONFIRMED
      2026-07-26: ManyChat's "any post or reel" comment trigger does NOT expose the triggering post id
      (the External Request field picker has no post/media field), so the catch-all flows CANNOT carry
      the video. CRWN accepts `source_post_id` (any string) and records it as the funnel's video
      dimension; without it, video just groups under "unknown" and the funnel still works by source /
      campaign / calculator. The ONLY way to get per-video data is a **per-post** automation (trigger on
      one specific post), where you hardcode a readable label in the External Request body, e.g.
      `,"source_post_id":"kendrick-producer-reel"` right before `,"contact":`. Not worth doing broadly
      (one automation per video, forever). Do it ONLY for a hero video you want to measure.

### P2 — worth doing, nothing breaks if you never do it

- [ ] **In about two weeks, run the calculator step-abandonment query and tell me what it says.**
      Open [supabase/query-calculator-step-abandonment.sql](supabase/query-calculator-step-abandonment.sql)
      in the Supabase SQL editor and run it (read only, four queries, nothing writes). I shortened the
      Opportunity Calculator from 13 screens to 8 and the ten two-question tools from 3 to 2, and I
      cannot see production data. Query 2 says whether completion rose. **Query 3 is the one that
      decides whether it was a good change**: if completion rose but `builder`, `accounts` and
      `first_paid` did not follow, the shorter wizard bought opt-ins instead of artists and I should
      put screens back. `total_steps` in query 1 separates the old cohort from the new one on its own,
      so no flag or experiment is needed.

- [ ] **Decide the public "you keep" number, because the homepage states two.** The fee source of
      truth is `TIER_LIMITS` in [src/lib/platformTier.ts](src/lib/platformTier.ts): Launch 12%
      (keep 88), Pro 8% (keep 92), Scale 5% (keep 95). Eight public strings say **"up to 92%"**
      (both comparison tables, the money-flow bar, the FAQ, `IndependenceSection`, two CTA subs),
      while the money-flow detail line right under the "Keep up to 92%" heading says **"Scale 95%"**.
      One of the two is wrong and it is a pricing-communication call, not a code fix, so I left both
      alone: /terms and /artist-agreement are hand-kept and mention only 12% and 8%, so raising the
      headline to 95% would also mean touching the legal pages, and lowering it means dropping a real
      rate. Tell me which and I will make all eight strings plus the legal pages agree in one pass.
      Found in the Z2B-2 homepage audit; nothing is broken today, the page is just inconsistent.

- [ ] **Ratify (or reject) the four Automated Fan Testimonials decisions, or the design stays on
      the shelf.** Architecture only, nothing was built and no migration exists:
      [docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md](docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md),
      section 23 has the full trade-off for each. The short version, with my recommendation:
        1. **Build now, or wait for more paying fans?** The eligible population is fans who paid
           AND then experienced value, which is small while `first_paid_conversion` is still the
           constraint. I say build the small version now, because proof is perishable and the
           asset compounds. Waiting is a defensible call and is the strongest argument against.
        2. **Does V1 show featured testimonials on the public artist page, or stop at the private
           library?** I say show them. A library nobody can see is inventory, not value.
        3. **Fan deletes their account: delete their testimonials, or keep them anonymized?** I say
           delete, matching every other fan table and "the fan owns the statement."
        4. **Can an artist switch the automation off?** I say on by default with one toggle.
      Answer those four and the build is mechanical. Everything else in that document is already
      settled by repository evidence.

- [ ] **Add the FREE keyword to ManyChat before posting the Akeem Ali all-in video.** The
      script ([videos/scripts/lead-magnets/free-akeem-ali.md](videos/scripts/lead-magnets/free-akeem-ali.md))
      says "Comment FREE and I'll DM you the link", and ManyChat keywords are pills configured
      in its UI, so only you can add the trigger (point it at the same flow as the other
      calculator keywords; the tool link is `/tools/opportunity-calculator`). The code side is
      done: `free` is in the opportunity-calculator `dmKeywords`, live once the branch lands
      on master.

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

- **Sanity-check the Constraint Engine's verdicts as real artists accumulate data.** Live since
  2026-08-03. Since 2026-08-13 the engine's verdict IS Rise Mode's next move when it has enough
  evidence, and the roadmap milestone leads when it does not. Every threshold is a first guess made
  with zero cohort data, in one file:
  [`src/lib/constraint/thresholds.ts`](src/lib/constraint/thresholds.ts). Same situation as the
  lead score bands, and they were wrong once.

  **If you see an artist told to fix something you would not have told them to fix, that is a
  threshold bug, not a bad artist. Tell Claude.** The likeliest first offenders: the free-capture
  floor (2% of visitors joining) and the retention multiplier (1.5x the platform average) will
  both behave oddly while the platform has few artists, because the benchmark is computed from
  everyone. Nothing here can change an artist's tiers, prices, promises or campaigns; it only
  recommends.

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

- **Post-Win Referral V1: SHIPPED 2026-08-12.** Both your decisions are implemented and pinned by
  test: unpaid forever, never retroactively commissionable, and structurally incapable of touching
  the recruiter rail (the link uses `artist_ref`, not `ref`, precisely so it can never end up one
  branch from that $50 fee). When an artist gets their first paid member on CRWN, they see one
  pop-up that copies a share link; whoever they send it to lands on the calculator, and CRWN can
  follow that person all the way to their own first paid member.
  **Nothing to do, but one thing to know:** it will not fire until an artist actually records a
  first paid conversion, which has happened **0** times so far. That is the correct behavior, not a
  bug. Related: your P1 item about tagging calculator video links is the same underlying gap, since
  the attribution carrier is wired correctly and simply has never received a tagged visit.

- **Promise Calendar + email: reconciled 2026-08-11.** Your artists were getting two emails about
  the same promise, three hours apart, because two systems both owned it and neither could see the
  other's dedupe. Now one owner: `promiseReminders` sends fan-promise reminders (honouring the
  per-promise lead times you can set), and the calendar reminder is fan-only for livestreams and
  deadlines. Also worth knowing: I checked the lifecycle emails against all 9 of your artists and
  **they are already state-aware**. A Stripe-connected artist genuinely cannot receive the
  connect-Stripe nudge, because having the milestone is what disqualifies them. I did not invent
  personalization work for a system that already had it.
  (The direct-notification-writer gap this note used to flag was closed 2026-08-12: every
  artist-facing CRWN notification now goes through the governed chokepoint, and a source-walking
  test enforces the boundary.)

- **Rise Mode Resume: reconciled 2026-08-11, and one question is yours.** The prompt's plumbing was
  already right (it reads canonical quest state, matches Rise Mode's own selector, ranks below
  Stripe, caps at 3 shows / 4 days, works cross-device, stores nothing). What was wrong was the
  sentence: it said "You left something half done" when CRWN has no way to know that. Quest progress
  is computed from live database state, so it rises when the ACCOUNT changes, not when an artist
  opens anything. In production all 16 eligible quests were of that kind, including "Reach $1,000
  per month in recurring support" at **4%** and "Reach 25 supporters" at 40%. Those are goals that
  grow with the business, not tasks anybody abandoned. Copy now claims only that a goal is partway,
  which is true at 4% and at 90%.
  **Your call:** do you want CRWN to actually record when an artist starts a quest? That is the only
  way the prompt could honestly say "continue where you left off" and the only way to answer
  "does resuming increase completion". It means one new signal on quest engagement. I did not add
  it because nothing yet proves it is worth the persistence, and the prompt has never once fired in
  production (zero `artist_resume_rise` impressions), so there is no evidence of demand either.

- **Needs You boundary: SHIPPED 2026-08-11.** The calculator mission block is out of Needs You,
  which now owns events and deadlines only, so nothing there can rank a growth opportunity beside a
  FULFILLMENT diagnosis any more. The calculator commitment itself is untouched and still lives in
  Rise Mode, which is also what tracks progress against it. Blast radius was **1 artist, 7 items**;
  nothing deleted. **`/action-plan` stays on purpose** and is not a tidy-up target: the tour id is a
  persistence key (renaming replays the tour for everyone who dismissed it) and the item ids carry
  historical analytics.

- **Communications Governor: G1 + G2 SHIPPED 2026-08-11. G3 (lifecycle email) is evidence-gated,
  not scheduled.** Governed today: artist-facing CRWN notifications, via one chokepoint, with no
  producer changes and no schema. Both your decisions are encoded and pinned by test (no global
  cross-channel cap; celebrations coexist but never displace an obligation).
  **G3 needs evidence first, and here is the specific evidence:** email has **no send-history
  table**, so governing it means either accepting per-sender local suppression as-is or adding
  persistence, which you ruled out for V1. I would want to see, from G2, either (a) growth
  notifications actually deferring in practice, which would show producers can supply cheap
  context, or (b) a real complaint about email volume. Absent one of those, G3 would add
  machinery against a collision nobody has observed. **G4 (cross-channel dedupe) needs a shared
  send log and is therefore blocked on the same decision you already made.** Ask and I will build
  G3 anyway if you would rather have it early.

- **Manager measurement loop: PARTIAL RETIREMENT SHIPPED 2026-08-11.** The learning half is gone
  (baseline capture, `outcome_delta`/`outcome_metrics` writes, `outcome_score`, the `pastOutcomes`
  prompt block and its "repeat what worked" instruction, and `snapshotMetrics.ts`, which had zero
  live callers left). The telemetry half is untouched: Manager still records what it did, when,
  and whether it worked mechanically. No history was deleted, no rows migrated, no migration run.
  Two legacy artifacts are deliberately LEFT IN THE DATABASE because removing them needs DDL for
  no safety benefit and nothing reads them any more: the `baseline_metrics` / `outcome_metrics` /
  `outcome_delta` columns on `artist_agent_actions`, and the `artist_action_outcomes` view with
  its `outcome_score` expression. If you ever want them gone, that is a cosmetic migration, not a
  correctness one.

- **Bespoke hero photos for the two single-opportunity calculators.** `fan-stack-calculator` and
  `between-tour-calculator` reuse the own-your-fans and live-experience photos (the registry's
  documented placeholder pattern). They are no longer avatar front doors, so this is cosmetic.
  Generate on-brand charcoal+gold images (artist 18-32 rule) and swap the two `hero.image` paths.

- **Avatar follow-ups, in order:** per-avatar hero copy on the all-in-one calculator page (today
  the entry context reorders the questions and shows its note, but the hero headline is still
  one shared line); per-avatar experiment experience keys in `src/lib/experiments/registry.ts`
  once there is a message variant worth testing; artist 30/60/90-day retention at cohort grain
  in the admin Avatars tab (needs a per-artist activity definition first, see the tab's "not
  measured" list).

- **Pre-signup live preview (the half of the preview ask that is still open).** The live fan
  preview now runs from the artist-link screen through launch, showing their real page in an
  iframe. It does NOT run on the calculator or builder pages, because before signup there is no
  page, no name, no photo and no music: the only fan-visible thing that exists is the tier ladder,
  and `TierCards` is wired to auth, router and live checkout, so reusing it there is not a small
  change. Showing a near-empty page at the moment of peak excitement is also a conversion risk
  worth measuring before building. The honest version is a ladder-only "what fans will see"
  card in `DeliverableBuilder`, reusing the tier presentation only. Mine, not urgent.

- **v2 interface redesign, remaining screens.** Landed 2026-08-02: tokens + the
  `.neu-raised`/`.neu-inset` surface treatment (75+ call sites upgraded through two classes), the
  nav rail marker (no more filled gold block), the spring motion vocabulary on every shared
  pressable class, `src/lib/contrast.ts` (tested) / `palette.ts` / `useLivingPhoto.ts`, the Home
  next-action card (the one structural change), and Rise Mode progressive disclosure. Landed
  2026-08-03: the whole artist page (accent wash, banner media card, tier cards, self-healing
  palette backfill, drag-to-reframe banner, measured-ink fixes, the contrast sweep dev tool,
  the sampler hue fix). All its migrations are applied and probe-verified. Still mine, in
  order: setup wizard composition (85KB file, one decision per screen with the desktop step
  rail), Studio Music + Fan CRM layout, the shared calculator-intro pattern, the homepage
  ambient layer (WebGL tier; the CSS pool shipped), the living-photo heroes, the player
  accent, and wiring the contrast sweep into CI. Each is its own session per the handoff's
  PR plan (`IMPLEMENTATION.md` in the design handoff).

- **NEXT UP: realign the quest catalog to the membership strategies, then flip the Quest Engine
  on.** The release strategy (`CRWN_UPDATED_RELEASE_STRATEGY.md`) is otherwise implemented end
  to end (2026-08-01): brain, content classes, declared facts, live templates, waterfall. The
  74-quest catalog still describes the pre-strategy journey, and quest progress is STORED, so
  the catalog must be rewritten BEFORE the engine goes live or artists accumulate XP against
  content about to change. The plan, so the next session starts cold: (1) rewrite
  `src/lib/quests/templates.ts` levels 5-10 around the strategy vocabulary (launch the monthly
  promise, first waterfall release, first live from a template, first vault unlock), reusing
  the existing DomainChecks plus `artist_promise_fulfilled`/`artist_first_visit`; (2) keep
  every existing template KEY that still fits (stored instances reference keys); (3)
  `npm run verify:quests` + tests; (4) ship the flag flip as a migration file in the same
  commit. One session, no migrations for Josh beyond the flip file.

- **Launch-spec remainders (each its own session, in this order).** Done this round: ladder
  prefill from the artist's own draft, per-tag segment targeting for imported contacts, the
  richer plan intro, cadence changes propagating to existing obligations, Share-to-Earn config
  restored at ladder create, the purchase-level obligation engine (shipped products and
  scheduled experiences create their fulfillment task at purchase; digital creates nothing),
  promise reminder delivery (daily digest, piggybacked on the 6am cron), per-promise prep
  time + delivery method + reminder schedule on the review screen, and staggered default
  first-due dates (no two promises default to the same day). Still mine:
  1. the quarterly live experience as a confirmable wizard component;
  2. OAuth import connectors (Mailchimp, Google, Shopify, Gumroad); CSV covers them today;
  3. warn-before-deleting future obligations in the Promise Calendar UI.

- **Rise Mode per-task dollar estimates (from your live-test list, deferred on purpose).** Each
  quest card should show the estimated extra $/month completing it unlocks, derived only from
  numbers CRWN really has (calculator payload, tier prices, member counts). Deferred rather than
  rushed because a per-quest estimate model done sloppily invents figures, and the house rule is
  show nothing over showing a made-up number. Its own session.

- **Full tour audit (the rest of your tour feedback).** Fixed this round: one auto-tour per
  session (no more tour chaining across tabs), community step mentions channels, home tour's
  dead final anchor. Still mine: audit all ~20 per-page tours against current selectors and
  features, and decide whether the artist-page tour should stop clicking through its own
  Music/Tiers/Community tabs (kept for now because each tab's content only mounts when active).

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

- **The Artist Launch Wizard (your 10-phase spec, 2026-07-30) is COMPLETE: all nine stages
  are live.** The full record is [`docs/ARTIST_LAUNCH_WIZARD.md`](docs/ARTIST_LAUNCH_WIZARD.md).
  The journey now runs end to end: a signup with a claimed calculator result opens on "Your
  CRWN plan is saved" with their number; the wizard confirms the full ladder (with estimated
  buyers per tier from their own calculator); the promise-review screen shows the recurring
  workload before anything is created (one shared generator, dedup + inheritance, so
  "Everything in Gold" is real for Platinum members); Stripe connects in-wizard with exact-step
  return; the music step offers the full-catalog bulk path; every artist has a 5-stage roadmap
  derived through the Quest Engine's own checks; the fan import hub (with the Patreon on-ramp)
  and the Launch Kit (drafts only) cover the audience; and the wizard ends on the launch review
  (checklist with fix-it jumps, previews, "Launch my CRWN") with Rise Mode's roadmap card as
  the post-launch command screen (real members/paying/MRR-vs-goal numbers plus upcoming
  promises). No migrations, no env vars, nothing for you to run. Deliberately not built yet:
  OAuth import integrations, page-visit/checkout-start metrics on the command screen, and
  moving import/campaign into the wizard proper. Ask when you want any of those.

The Instagram acquisition engine is feature-complete and verified in production: ingress,
identity, Claude extraction with a complete deterministic fallback, the calculator handoff,
secure result links, claiming, the gated in-window email capture, follow-up automation with a
compliant unsubscribe, the tool-education drip, booking detection, the no-show ladder, retention,
and the admin panel. The privacy policy now discloses the funnel (live).

- **Announcement pop-ups: the Pop-up Engine is ON (you flipped it 2026-07-24).** Announcements now
  fire, each gated on its own feature flag. Verified against production 2026-08-12 with
  `npm run verify:flags`: `live_tips`, `producer_sessions`, `royalty_readiness`, `quest_engine`,
  `acquisition_engine`, `experiments` and `popup_engine` are ALL on, so
  `announce_live_tips`, `announce_producer_sessions`, `announce_royalty_readiness` and
  `announce_hub_navigation` are all live. When you add a new
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
signup works via `ClaimRedeemer` instead. (`/welcome` was retired 2026-07-30; onboarding identity
now lives in the setup wizard's first screens. `useAuth` remains a file that broke onboarding
silently for months, and a claim feature does not justify touching it.)
