# 19 — The Onboarding Flow, A to Z

**As of 2026-07-31.** The complete journey from an anonymous artist running a calculator to a
launched artist on their command screen. Every step names its file or route so you can verify
against code instead of trusting this doc. The staged build history behind it is
`docs/ARTIST_LAUNCH_WIZARD.md`; this doc is the CURRENT state, not the history.

The shape, in one line:

> **Calculator → save the plan → sign up → verify → the plan comes back → identity → confirm
> the model → review the workload → connect Stripe → add music → review the whole system →
> Launch my CRWN → the command screen.**

---

## A. Before signup: the calculator and the saved plan

1. **A lead runs a tool** (organic, video funnel, or the Instagram/ManyChat engine). The
   flagship is the unified Opportunity Calculator (`/tools/opportunity-calculator`); ~11 loss
   tools plus external ones (`/worth`) share the result engine. Results can be delivered on
   page and by email (tokenized result links).
2. **They build their plan before having an account.** The deliverable builder
   (`DeliverableBuilder`, specs in `src/lib/opportunityDrafts/deliverableSpecs.ts`) lets them
   edit the whole system: tier names/prices (t0-t3), benefits, Share-to-Earn on/off +
   commission, clip brief, session/live prices, launch order. Saving posts to
   `/api/opportunity-drafts`, which stores an UNCLAIMED `lead_magnet_results` row: `status
   'draft'`, `user_id`/`artist_id` NULL, spec title as `title`, `result_data {}`, everything
   editable in `input_data.deliverableValues`, the revealed number in
   `input_data.opportunitySummary`, plus a 30-day `public_token`.
3. **Signup carries the claim token.** The signup flow puts `pending_result_token` into auth
   `user_metadata` (server-side, never browser storage). `/signup` deliberately ignores
   `?next`.

## B. Verification and the claim

4. **Email verification** lands the user in the app; the first server touchpoint is
   `POST /api/lead-results/auto-claim` (fired by the wizard and by `ClaimRedeemer`).
   `autoClaimForUser` binds the lead's results to the user by VERIFIED email + the signup
   token; identity comes from the session, never the request body. Funnel events
   `account_created` / `email_verified` record here (deduped per user).
5. **Auto-claim returns the display-ready plan** (`planSeed`): tool name, headline (for a
   draft row this is `opportunitySummary`, never the CTA title), the modeled monthly number,
   `tierProjections` (per-tier buyer counts, matched by current or legacy tier names),
   `ladderPrefill` (the artist's OWN tier names/prices via
   `src/lib/leadResults/ladderPrefill.ts`; template fills gaps; null when nothing was edited),
   and `shareToEarn` (their validated commission config, 1-50%, or null).

## C. The setup wizard (`/setup`, `src/app/setup/page.tsx`)

Everyone lands here after verification (`/welcome` is a redirect; retired 2026-07-30). The
`(main)` layout hard-gates any unfinished artist back to `/setup`. Completion is DERIVED from
live data (`useArtistSetup`), never stored per-step; the only stored flag is
`artist_profiles.setup_completed`.

6. **Plan intro** (`PlanIntro`, brand-new signups with a claimed result only): "Your CRWN plan
   is saved" with the number THEY calculated, their model line (their names/prices or stock),
   the honest recurring workload, and the timeline. Then 12 one-decision screens in four
   groups:

7. **Profile group (required).**
   - `artist-name`: stage name. Never pre-filled (the profile seed is the signup email;
     pre-filling leaks emails as public names). Carries the "continue as a supporter" escape.
   - `artist-link`: the handle, auto-synced from the name until edited. Continue calls
     `POST /api/onboarding/identity` (service-role writes for `profiles`, RLS insert for
     `artist_profiles`; the `trg_promote_to_artist` trigger promotes fan→artist server-side;
     welcome email sent once).
   - `photo`: avatar, saved server-side (`POST /api/onboarding/avatar`).

8. **Monetize group (skippable).**
   - `ladder`: confirm the four-tier model. Opens on the ladder THEY designed (prefill; edits
     win once touched), shows estimated buyers per rung from their own calculator
     ("Dropping it leaves them with no way to pay you"), inline price edit, per-rung drop,
     benefits expandable, Share-to-Earn note when their plan configured it. Returning artists
     see their real tiers read-only.
   - `promises`: the workload review. Each promise the confirmed benefits create (via the
     shared generator, see E) shows serves-which-tiers, prep minutes, delivery method,
     reminder schedule, an editable cadence (shared `OptionSelect`) and first-due date
     (defaults staggered one day apart, never same-day). Footer: total estimated workload.
     **Continue here CREATES the tiers** through `applyTemplateTier`
     (`src/lib/applyTierTemplate.ts`, the same path Rise Level 3 uses), with the cadence/date
     adjustments riding as `benefitConfigOverrides`, and applies their Share-to-Earn rate via
     the ownership-checked commission route. Retry-safe: name/alias dedupe skips existing
     rungs. Onboarding tiers get NULL Stripe ids.
   - `stripe`: "Connect Stripe so fans can purchase your offers and you can receive payouts."
     Connect goes through `/api/stripe/connect?returnTo=/setup`; on `?stripe=success|refresh`
     the wizard restores this exact screen. Verification is server-side only
     (`/api/stripe/connect/status` → `src/lib/stripe/connectReconcile.ts`: live
     `accounts.retrieve`, milestone write when charges enabled, tier-price backfill). Three
     states: connected / under review ("Check again") / not connected. NEVER blocks Continue.

9. **Music group (required, with an explicit later-escape).**
   - `content-plan`: one featured track (fastest, starts free) / the full catalog / "I'll add
     music later" (jumps the group, loss-framed).
   - `track-audio`: single-file picker + rights consent, OR (catalog path) the EXISTING
     dashboard `BulkUploadForm` mounted in-wizard: multi-file queue, per-track tier access
     against the tiers just created, artwork, progress, Artist Agreement consent.
   - `track-title`: names the single track; SKIPPED on the bulk path (titles come from file
     names).

10. **Shop group (skippable).** `product-type` (digital/physical; experiences are Pro) →
    `product-title` → `product-price`. Creates via `createOnboardingProduct`.

## D. The launch review and the publish

11. **`LaunchReview`** ("Your CRWN launch system", the wizard's end screen):
    - Six-item checklist: offers / Stripe / content / promises / audience / campaign. Open
      REQUIRED items carry "Fix it" (jumps back to the exact screen). "Audience imported"
      carries **Import now**, which opens the full `FanImportModal` in place (see F).
    - Previews: the PUBLIC PAGE is the storefront + checkout preview (opened with
      `?preview=visitor`, so the artist lands in the real fan view, see G); the
      Promise Calendar's next events and the roadmap's first milestone render INLINE (their
      routes sit behind the setup gate until launch).
    - **Operating plan panel** ("Your operating plan", 2026-07-31): the deterministic
      `recommendPlan()` re-derived on the client from the artist's own projected GMV (the
      roadmap goal), with per-plan monthly cost arithmetic from `monthlyPlanCostCents()` and
      every fee/price read from `TIER_PRICING`/`TIER_LIMITS`. Advisory and never blocking:
      every artist still launches on Launch (free) and upgrades later in Billing. Without a
      calculator goal it degrades to the static fee ladder + Pro break-even line.
    - Share block (copy link + socials).
    - **"Launch my CRWN"** = `markComplete` → `POST /api/artist/complete-setup`
      (service-role; also seeds the 12-month revenue ramp into the Promise Calendar) → the
      journey resolver (`src/lib/journey/resolveJourneyDestination.ts`). The resolver skips
      any restored-builder destination whose end state is tier creation once a paid tier
      exists (`hasPaidTier` gate), so launch NEVER re-asks for the business the wizard built;
      non-tier restores (OYF plan, missions, demand tests) still restore. Fallback and normal
      landing: `/profile/artist`.

## E. What got created along the way (the machinery)

- **Tiers**: `subscription_tiers` rows with the artist's names/prices,
  `access_config.benefits`, `offers_annual` + 25% discount, NULL Stripe ids until connect.
- **Structured benefits** → `/api/tier-benefits` → `syncTierObligations`
  (`src/lib/tierObligations.ts`), whose pure brain is `src/lib/promisePlan.ts` (shared with
  the wizard's review screen, so what was reviewed is what gets created): promise detection,
  cadence/title/first-due from config, DEDUP (one obligation across tiers via
  `metadata.merged_tier_ids`, re-anchored if the anchor tier drops it), INHERITANCE (Gold's
  vault unlock carries `serves_higher_tiers` → `metadata.serves_tier_ids`, refreshed every
  sync), cadence/title edits propagating to existing obligations. Fan calendar eligibility
  and fulfillment notifications honor the serve lists.
- **Stripe**: prices created live when already connected, else backfilled by the reconciler
  the moment charges enable. The reconciler also self-heals from `/api/artist/roadmap` (Stripe
  verifies asynchronously; the command screen makes the truth land within one load).
- **Share-to-Earn**: their configured rate on `artist_profiles.referral_commission_rate`.
  Public page shows fans the REAL rate only (button hidden when 0); the page OWNER sees a
  program-state pill instead.
- **Revenue ramp**: seeded at completion; `src/lib/rampReconcile.ts` completes any ramp step
  already satisfied (ladder built, Stripe connected, promises set, ...) via the quest
  evaluator's own checks, so the calendar never nags about finished work.

## F. Audience and campaign (offered at review, live post-launch)

- **Fan import hub** = `FanImportModal` (Fan CRM `/studio/fans`, and in-wizard from the launch
  review): source cards (Patreon with the exact export path / any CSV). A Patreon
  Relationship Manager export is auto-recognized (`src/lib/patreonImport.ts`): active-patron
  filter (former import tagged `patreon-inactive`), per-tier breakdown with
  closest-CRWN-tier suggestions, members tagged `patreon` + `patreon-tier:<name>`. The
  versioned permission attestation gates every import; importing never messages anyone.
- **Launch Kit** (`src/lib/launchCampaign.ts` + `LaunchKit` atop
  `/studio/fans?view=campaigns`): announcement + follow-up created as campaign DRAFTS, with an
  explicit **controlled vs full launch** choice (2026-08-01) showing real recipient counts.
  Controlled (the default) puts the announcement on the 20-contact test group; full sends to
  every eligible contact. The follow-up always goes to everyone. Plus social/story/DM/share copy with copy
  buttons, Patreon-first segment suggestion, Friday send-date suggestion. The composer's
  contacts audience supports SEGMENTS by contact tag; the sender narrows by tag under the
  same consent rules (attested + subscribed + suppression + unsubscribe). Nothing sends
  without the artist pressing send.

## G. Inside CRWN: the command screen and the loops that keep running

- **The landing is Rise Mode** (`/profile/artist`), topped by `RoadmapCard`: the 5-stage
  personalized roadmap (Foundation → Private launch → Audience launch → Deliver and retain →
  Expand, `src/lib/artistRoadmap.ts` + `/api/artist/roadmap`), derived through the Quest
  Engine's own `evaluateCondition` so roadmap and quests can never disagree; current stage,
  ONE next milestone with a deep link, real stats (members / paying / MRR against THEIR
  calculator goal), and the next three upcoming promises. Rise Mode below it: XP/level header
  (always visible, even before an artist build is chosen), quests, recap.
- **Promise reminders deliver**: `src/lib/promiseReminders.ts`, piggybacked on the 6am
  scheduled-releases cron; one digest email per artist when promises cross their 7/3/1-day
  offsets, deduped per event+offset in `metadata.reminded_offsets`.
- **Purchase-level fulfillment**: a real purchase creates its task
  (`src/lib/purchaseObligations.ts` from the Stripe webhook): shipped product → "Ship X to
  fan" due +5d; scheduled experience → "Schedule X with fan" due +7d; digital → nothing.
  Idempotent per purchase; never in the money path.
- **Tours**: per-surface first-visit tours capped at ONE auto-start per browser session (no
  chaining across tabs); replays uncapped via the `TourReplayButton` / help affordances.
- **The launch journey closes its loop in quests** (2026-07-31): Level 5 (Founding Fans)
  now runs first visit → first free member → first paid supporter → first delivered promise.
  `artist_first_visit` reads `artist_page_visits` (the middleware tracker) and
  `artist_deliver_first_promise` reads completed `fulfillment_events` via the new
  `artist_promise_fulfilled` DomainCheck, the same fact the roadmap's `promises_completed`
  uses. The announcement + first-visit quests deep-link to the Launch Kit
  (`/studio/fans?view=campaigns`), the promise quest to `/studio/promise`.
- **Funnel coverage of the launch itself** (2026-08-01): artist page visits now emit
  `page_viewed` with `artistId` from `/api/admin/track` (deduped per visitor per day, the same
  grain as `artist_page_visits`), so "first fan visit" is finally visible in `funnel_events`.
  Manual sharing from the launch review emits `fan_invited` with
  `metadata.method = 'manual_share'` and the channel, because an artist who launches by pasting
  their link used to produce zero funnel signal and looked like they never launched. Both reuse
  EXISTING stages on purpose: adding a stage means migrating the `funnel_events` CHECK.
- **Fan-perspective preview** (2026-07-31): the owner switches the public page between "a
  visitor" and each tier via `ArtistPreviewProvider` (`src/hooks/useArtistPreview.tsx`) and the
  sticky `PreviewBar`. `useSubscription` is the single injection point (13 consumers), so one
  override re-derives every lock at once. Preview only ever REMOVES access, so it is a rendering
  lens and never an authorization boundary. Two surfaces need explicit handling because the DB
  hands the OWNER entitled data: `GatedTrackPlayer` ignores the owner's own purchases, and
  `CommunityPostCard` ignores `community_posts_feed.can_view` (true for every own post) and
  falls back to tier math. "View as fan" everywhere now carries `?preview=visitor`.
  **`isOwner` is the real check** (`session.user.id === artist.user_id`); the page previously
  used "does this viewer have an artist row", which handed any artist owner-only controls on
  every other artist's page. Server-side gates (`/api/tracks/[id]/stream`, `/api/live/vod`)
  still answer as the owner, so preview shows the LOCK correctly but a locked track's click
  routes to the track page rather than being refused.
- **Pop-ups**: governed by the Pop-up Engine (one per user per day); every ANNOUNCEMENT def
  carries `announcedAt` and is skipped for accounts created on/after that date.
- **Upgrade triggers are arithmetic, not vibes** (2026-07-31): the popup context carries
  `gmv30dCents` (trailing 30-day sum of `earnings.gross_amount`). `artist_upgrade_pro`
  nudges at ~60% of Pro break-even or 3+ supporters; `artist_pro_break_even` and
  `artist_scale_break_even` fire ONCE when real GMV crosses `proBreakEvenGmvCents()` /
  `scaleBreakEvenGmvCents()` ($1,225 / $5,000 at current pricing, derived live from
  `TIER_PRICING`, never hardcoded).

## H. Guards that keep all of this honest

- **Daily onboarding canary** (`/api/cron/onboarding-health`, 07:00): real RLS publish +
  promotion + upload check on a throwaway user; emails the founder on any failure.
- **Hard gate**: `(main)` layout bounces `onboarding_completed=false` or artist
  `setup_completed=false` to `/setup`. Completion is server-written only.
- **Resume**: the wizard resumes at the first incomplete screen; completed screens show
  read-only summaries of the REAL data (their tiers, their scheduled promises), never a bare
  "hit Continue".
- **No screen claims to show what it does not show** (the live-test rule): every confirm/
  review surface renders actual data or an honest fallback.

## Known gaps (tracked in TODO "On Claude's plate")

The quarterly live experience as a confirmable wizard component; OAuth import connectors
(CSV covers those sources today); warn-before-deleting future obligations; per-quest $/month
estimates on Rise Mode; the full tour audit; page-visit/checkout-start metrics on the command
screen.
