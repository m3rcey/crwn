# CRWN Brain — Changelog

## 2026-07-25 — Feature-specific continuation CTAs on every calculator

Replaced the generic post-result CTA ("Create your CRWN account and fix this", "Claim it on CRWN",
"Build this inside CRWN") with copy that names the exact feature: worth -> "Build My Membership",
share-to-earn -> "Turn On Share-to-Earn", executive-producer -> "Build My Executive Producer
Session", live-experience -> "Create My First Ticketed Live Event", vault -> "Build My Vault". Every
other calculator derives "Build My {featureName}" (with natural overrides for a few plurals/labels),
so a new calculator gets a feature-specific CTA for free.

- **Single source of truth:** `src/lib/leadMagnets/continuationCta.ts` — `continueCtaFor(slug)`
  (bespoke overrides + featureName-derived default) and `buildContinueUrl(slug, token)` (the EXISTING
  signup flow, `/signup?tool=&result=`). No new signup flow; the token handoff is unchanged.
- **Render sites rewired to the helper:** `ConvertToFeatureButton` (the one registry-driven CTA, so
  all 16 tools change at once), `LeadEmailCta` (new `ctaLabel` prop; web + tokenized result page,
  web claimHref now token-aware via buildContinueUrl), the tokenized result page `SignupCta`, the
  capture email `ctaLabel`, and both `/worth` continuation buttons.
- **Deliberately left alone:** `CrwnShowcase` / `IndependenceSection` — platform-wide showcases that
  list ALL revenue streams, not a single feature; and the `hero.primaryCta` "run the calculator"
  buttons. Only the true post-result continuation CTA changed.

Tests in `src/lib/leadMagnets/continuationCta.test.ts` (the five exact strings + every registered
calculator gets non-generic copy + the URL preserves context).

## 2026-07-25 — Lead Magnet Performance dashboard (admin)

The admin-facing surface over the funnel + opportunity analytics. New tab `leadmagnets` in
`src/app/admin/page.tsx` -> `src/components/admin/LeadMagnetsView.tsx` (admin-gated by the page's
role check; its data route re-checks admin server-side, so nothing is exposed publicly).

- **Data:** `GET /api/admin/lead-magnet-dashboard` reads funnel_events + opportunity_ledger and
  returns every tile: Views / Completions / Emails / Accounts, Activation Rate (accounts /
  completions), Builder Completion (published / opened), Revenue Opportunity Revealed + Captured
  (current month, so reveals are not summed across months), Top Calculator, and Highest Converting
  Source / Video / Campaign. Filters: date, campaign, calculator, artist (fetched once per window,
  filtered in memory so the filter-option dropdowns never collapse).
- **Pure aggregation** `src/lib/analytics/leadMagnetDashboard.ts` (tested): stage counts, the two
  rates, `conversionByDimension` (completion rate per source/video/campaign with a min-views floor
  so a 1-view/1-completion row can't top the chart), `calculatorPerformance`.
- **Video dimension added:** funnel_events gained a `video` column (utm_content), wired through the
  recorder and the analytics mirror, so "Highest Converting Video" is real. (Amended the still-
  unapplied funnel migration; no second migration.)
- **UI:** responsive (cards reflow 2->6 cols, recharts in ResponsiveContainer, the per-calculator
  table scrolls on mobile), reuses the FunnelView card/pill/chart patterns. Tests in
  `src/lib/analytics/leadMagnetDashboard.test.ts`.

## 2026-07-25 — Opportunity tracking (revealed / activated / captured / remaining)

Tracks the DOLLAR opportunity a calculator revealed through its lifecycle, per artist per FEATURE
per month. Distinct from the funnel event counts below: this is a money ledger.

- **Table:** `opportunity_ledger` (`supabase/schema-phase2-opportunity-ledger.sql`, UNRUN, TODO.md).
  Grain (artist_id, feature, period_year, period_month) UNIQUE = the dedup guarantee. Columns:
  revealed_cents / captured_cents / remaining_cents / activated + calculator + dimensions. Artist
  reads own, admin reads all.
- **Pure core** `src/lib/analytics/opportunity.ts` (fully tested): `FEATURE_BY_CALCULATOR` maps the
  five calculators onto THREE disjoint features (worth+vault -> membership, live+exec -> live,
  share -> referral); `revealedByFeature` dedups per feature with MAX (two calculators describing
  the same money are never summed); `computeRemaining` = max(0, revealed - captured);
  `capturedFromEarnings` sums net revenue per feature and nets refunds back onto the ORIGINAL
  payment's feature (grouping by type alone would strand refunds and overstate captured).
- **Captured is real money, from disjoint ledgers so it never double-counts:** membership = artist
  net `earnings` type='subscription' (already referral- and fee-netted), live = earnings
  live_ticket + live_tip, referral = `referral_earnings.commission_amount` (the referrer's cut that
  was netted OUT of subscription earnings). Monthly, refund-adjusted.
- **Recompute** `src/lib/analytics/opportunityLedger.ts` `recomputeArtistOpportunity(db, artistId)`:
  reveals (from claimed results) + captured (this month) + activated (real state: a live tier / a
  live session / referral rate > 0) -> upsert the current-month rows. Idempotent.
  `refreshAllOpportunities` does it for all artists with a claimed result.
- **Triggers:** on `builder_published` (the funnel beacon recomputes that artist); read-time for a
  single ?artistId in the rollup; and a daily refresh piggybacked on the `outcome-measure` cron (no
  new cron, per the Hobby cap).
- **Reporting:** `GET /api/admin/opportunity` rolls up revealed/activated/captured/remaining by
  feature, calculator, artist, month, and year.

Tests in `src/lib/analytics/opportunity.test.ts` (feature map, max-dedup, remaining floor, refund
netting, totals).

## 2026-07-25 — Complete lead-magnet funnel analytics

One canonical funnel store for the whole acquisition funnel (page view -> mission completed),
deduped and dimensioned for dashboards. It does NOT replace the two existing event tables
(`lead_magnet_events` append-only log, `acquisition_events` IG outbox); it unifies the funnel.

- **Table:** `funnel_events` (`supabase/schema-phase2-funnel-events.sql`, UNRUN, in TODO.md). Columns:
  `stage` (CHECK of the 15 canonical stages), the five dimensions `calculator`/`campaign`/`referrer`/
  `artist_id`/`occurred_at`, plus `user_id`/`result_id`/`anon_id`/`metadata`, and `dedupe_key`
  (UNIQUE) for "no duplicate events". Admin-read RLS, service-role write.
- **Recorder:** `src/lib/analytics/funnelEvents.ts` — `FUNNEL_STAGES`, `recordFunnelEvent(db, input)`
  (upsert ON CONFLICT (dedupe_key) DO NOTHING; fail-safe, never throws; no-ops pre-migration),
  `buildFunnelRow` (pure, tested). The dedupe_key is namespaced by stage and defaults to a random
  uuid so inherently-repeatable stages never collapse while a retried beacon of one occurrence does.
- **Instrumentation (server-side, each stage once):**
  - Stages 1-7 (page/started/completed/revealed/signup) are MIRRORED from the EXISTING client beacon:
    `/api/lead-magnets/analytics` maps the lm event -> stage via `LM_EVENT_TO_STAGE`; `trackLeadMagnet`
    now stamps a per-occurrence `eventId` (dedup key) and `document.referrer`.
  - Email Submitted: capture route. Assumptions Changed: recalculate route (dedup on result+values).
  - Account Created + Email Verified: auto-claim route (dedup per user). Setup Completed:
    complete-setup route (dedup per artist). Builder Opened: post-setup-destination route.
    Rise Mode Started + Mission Completed: quests route (reuses quest completions).
  - Setup Started + Builder Published: a new authenticated beacon `POST /api/funnel/track`
    (identity from session, never body) called from the setup page and the two builders.
    Client helper `src/lib/analytics/trackFunnelClient.ts` (separate file so node:crypto never
    bundles into a client component).
- **Reporting:** `GET /api/admin/funnel-events` (admin-only) rolls up per-stage counts + breakdowns
  by calculator/campaign/referrer over a date range. Distinct from `/api/admin/funnel` (the existing
  artist activation-milestone funnel), which is untouched.

Tests in `src/lib/analytics/funnelEvents.test.ts` (stage guard, dedup key, fail-safe).

## 2026-07-25 — Lead magnets ARE the first Rise Mode mission

A calculator an artist completed now becomes their personalized first mission, generated through the
existing Action Plan architecture (no new quest/mission system). `src/lib/leadResults/leadMagnetMissions.ts`
is the single shared generator both surfaces read from:
- `LEAD_MAGNET_MISSIONS` maps the five builder-mapped calculators to concrete titles: worth -> "Build
  Membership", executive-producer-session -> "Create Your First Executive Producer Session",
  share-to-earn-planner -> "Turn On Share-to-Earn", live-experience-calculator -> "Schedule Your First
  Ticketed Live", vault-revenue-planner -> "Launch Your Vault".
- `buildLeadMagnetMissions(db, {userId, artistId})` reads EVERY claimed result (via new
  `getClaimedResults` / `rowToSeed` in handoffSeed), keeps one mission per completed calculator
  (newest), ranks by monthly opportunity (worth's dollar is `conversionPayload.netMrrCents`; loss tools
  use `estimatedMonthlyCents`), and each mission's CTA is the prefilled builder URL from
  `postSetupDestination`.

Wiring:
- `/api/action-plan` Rule 0 now emits one recommendation per completed calculator: the top is `high`
  (the personalized FIRST mission), the rest `medium`. Title carries the dollar, e.g. "Build Membership
  ($1,200/mo)".
- `/api/quests` returns the top mission as `leadMagnet`, and RiseMode's banner (above "Your next move")
  renders it as the starting mission with its value. Existing quests/board untouched; degrades to null
  when no calculator was completed.

No migration, env var, or flag. Tests in `src/lib/leadResults/leadMagnetMissions.test.ts`.

## 2026-07-25 — Pre-built draft configs from calculator results (honest scope)

Extends the routing below from a thin prefill to a fuller, auto-generated DRAFT the artist edits and
publishes. Nothing persists until they publish; the two draft-until-publish builders (Offer Builder,
LivestreamManager) are the only homes. A builder audit drew the line between what is a real draftable
field and what is not, and the code respects it rather than faking features:

- **Real drafts (pre-filled, editable):** Membership entry tier (name/price/benefits), the Vault tier,
  the referral share step (on, 20%), a ticketed live/producer session (title, ticket price,
  submissions), and the producer session's `max_slots` (limited room = 20).
- **Suggestions, NOT drafts (because the field does not exist):** the full 3-tier membership ladder
  (Free caps live paid tiers at 1, so only the entry tier is drafted; the rest, with the calculator's
  real projected supporter counts, links to the Pro Tier Ladder builder), the live tip goal (needs a
  live session, commits immediately, dark-launched), replay (records automatically, gated post-hoc),
  and Vault release cadence (no scheduler exists; timing is per-track in Music).

Mechanics: `src/lib/leadResults/postSetupDestination.ts` now centers on a tested pure
`buildDraftConfig(seed) -> { path, prefill, suggest }`. `prefill.*` -> editable `lm_*` fields the
builders hydrate; `suggest.*` -> `lm_suggest_*` guidance the new `CalculatorSuggestions` card renders
(mounted under the prefill banner in both builders). Payloads enriched to carry the real numbers:
worth adapter now emits the `ladder` (price + projected subs per tier, 70/22/8), live adapter emits
`suggestedTipGoalCents`. Tests in `postSetupDestination.test.ts` lock the draft/suggestion boundary.

No migration, env var, or flag. Public result-page CTAs untouched.

## 2026-07-25 — Post-onboarding routing: land in the builder, not the dashboard

Extends the handoff below. When setup finishes, the wizard no longer hardcodes `/profile/artist`.
It asks `GET /api/lead-results/post-setup-destination`, which reads the artist's most recent
claimed calculator result and maps it to the matching builder, PREFILLED. Null (no calculator, or
an unmapped one) falls back to the dashboard, so nothing regresses.

The five calculators collapse onto two real builders (there is no dedicated Referral/Vault/Live
route; they are steps/modes inside these two):
- **`/offers/new`** (Offer Builder): Streaming Loss -> Membership (`grow-supporters` goal, price =
  the calc's implied ARPU netMrr/payers), Vault -> the `vault-access` goal (The Vault tier + price),
  Share-to-Earn -> subscription + the share step turned on.
- **`/studio/live`** (LivestreamManager): Live Experience -> ticketed live ($15), Executive
  Producer -> ticketed live + submissions on, seat price banded to audience.

Mechanics, reusing the existing `lm_*` prefill convention (Missions/PoD/Bounties already do this):
- `src/lib/leadResults/postSetupDestination.ts` is the pure map (tool_slug -> path + `lm_*` params).
  It invents nothing: prices come from each result's `conversionPayload`. Two adapters were enriched
  to carry their real number: live-experience (`ticketPriceCents: TICKET`) and executive-producer
  (`ticketPriceCents: seatPrice`, `acceptsSubmissions`).
- Both builders gained a one-shot prefill `useEffect` reading `window.location.search` (Offer
  Builder presets the goal + jumps past the picker; LivestreamManager opens the form like
  `runItAgain`), and both mount `CalculatorPrefillBanner` ("We already filled this out using your
  calculator.").

Public result-page CTAs (`conversionTarget`) were deliberately left untouched: the routing lives
only in the post-setup path, so blast radius is onboarding, not the marketing pages. No migration,
env var, or flag. Tests in `src/lib/leadResults/postSetupDestination.test.ts`.

## 2026-07-25 — Lead-magnet handoff: the storage-free bridge into the app

The persistence already existed. `lead_magnet_results` has stored every field the calculators
produce (inputs, outputs, generator/formula version, tokens) since the lead-magnet + acquisition
schemas landed, and `claimResult` already bound an anonymous result to a verified account without
ever duplicating an artist. The gap was SURVIVAL: the only thing carrying a result through
signup was `localStorage['crwn_claim']`, redeemed by `ClaimRedeemer` only after setup finished.
That loses the result on a different device, in incognito, or with a cleared cache, and the WEB
calculator path (raw `public_token`) had no claim at all, so a web signup never attached anything.

The bridge, all server-side, no browser storage as a dependency:

- **`autoClaimForUser(userId, {email, token})`** in `src/lib/leadResults/resultAccess.ts` sits
  next to `claimResult` and reuses its safety rules. Two durable keys: (1) a token carried
  through signup in Supabase `user_metadata` (resolves BOTH the hashed acquisition token and the
  raw web `public_token`), and (2) a **verified-email match** across `lead_magnet_leads` and
  `lead_identities`. Only ever anchored on the auth side's VERIFIED email, so binding a
  self-entered lead email to it is safe. Every write touches only unclaimed rows and is
  idempotent; it re-runs to backfill `artist_id` after `/welcome`.
- **`POST /api/lead-results/auto-claim`** derives user + verified email + metadata token from the
  SESSION (never the body), rate-limited, burns the one-shot token.
- Triggered fire-and-forget from `useAuth` (both session-establish paths) and from
  `ClaimRedeemer`. `/signup?result=|token=` carries the token into `user_metadata` via `signUp`,
  which also finally makes the long-dead capture-email CTA work.
- **Feels started:** `getLeadMagnetSeed` (`src/lib/leadResults/handoffSeed.ts`) reads the claimed
  result back into a display shape. The always-on **Action Plan** leads with it (loss-framed) and
  the dark-launched **Rise Mode** shows a banner above "Your next move".
- The numeric opportunity is now persisted INTO `result_data` (`estimatedMonthlyCents` /
  `estimatedAnnualCents`, set by `buildLossResult`) so the handoff leads with a real figure.

No migration, no env var, no flag: it runs on columns/tables the live acquisition engine already
uses, and every path fails safe. Tests in `src/lib/leadResults/handoff.test.ts`.

## 2026-07-24 — P0: a revoked column had silently killed every Stripe flow

Found while chasing why the hamburger showed artists the fan menu. That was one symptom.

`schema-phase2-stripe-id-column-privs.sql` revoked SELECT on `stripe_connect_id`,
`platform_stripe_customer_id` and `platform_stripe_subscription_id` from `anon` and
`authenticated`. Correct, and it stays. What nobody accounted for is **how Postgres refuses**:
naming one revoked column fails the ENTIRE statement with `42501`, and PostgREST applies the
same rule to **embedded joins**. A query does not come back missing a field, it comes back as
**no row at all**, so every caller reads "not found" and fails closed while looking healthy.

Verified against production with the anon key before changing anything (a control query proves
the probe works, per the RLS-canary discipline):

| Query | Result |
|---|---|
| `artist_profiles?select=slug` | 200, row |
| `artist_profiles?select=slug,stripe_connect_id` | **42501** |
| `subscription_tiers?select=id,artist:artist_profiles(slug,platform_tier)` | 200, row |
| `subscription_tiers?select=id,artist:artist_profiles(stripe_connect_id)` | **42501** |

**Money in, all of it, dead:** `/api/stripe/checkout` ("Tier not found", no subscriptions),
`track-checkout`, `product-checkout`, `live-checkout`, `live-tip-checkout`.
**Money out and setup, all of it, dead:** `/api/stripe/connect` ("Artist not found", so no artist
could connect Stripe at all), `connect/status` (reported not-connected for connected artists),
`balance`, `cashout`, `login-link`, `create-price`, `platform-portal`.
**Three screens rendered empty:** `PayoutDashboard`, `PlatformBilling`, `MonetizationRoadmap`.

Fix: `src/lib/stripe/connectAccount.ts`, a service-role helper that is now the ONLY way these
ids are read. The ownership check stays where it was, on the user session; only the secret moves
server-side. This generalizes the pattern `booking-checkout` had already worked out alone.

Still exposed on purpose: `src/app/team/[id]/page.tsx` reads `profiles.stripe_connect_id` from
the browser. It works only because `schema-phase2-profiles-column-privileges.sql` is unapplied.
Flagged in TODO.md against that migration.

## 2026-07-24 — Public artist page opens on Music, and the hub stopped trusting profile.role

- **Default tab on `/[slug]` is now Music, not Movement** (`ArtistProfileContent`). A fan who
  lands on an artist page came for the songs. Movement asked them to care about the artist's
  campaign before they had heard anything. Returning from checkout still lands on Tiers.
- **`AccountHub` derives artist-ness from the `artist_profiles` row, not `isArtist()`.** The
  whole slug/plan/Stripe fetch was gated on `profile.role`, which lags a token refresh. When the
  context still said `fan`, the slug never loaded, so the identity header fell back to the email
  line and **"View as fan" never rendered** for someone who plainly is an artist. Same class of
  bug the `(main)` gate and `useArtistSetup` already guard against. The context is now only a
  placeholder while the row is in flight.

## 2026-07-24 — The artist dashboard's 16-tab strip became 15 real screens

Josh compared CRWN to the Lyft driver app: an identity header, collapsed accordion groups, and
sub-screens that open with an X in the top left that puts you back in the menu. He was right, and
the reason it mattered is that CRWN had **three competing artist hubs** (AccountHub, `/studio`,
and the `/profile/artist` tab strip), one of which was quietly broken.

- **`/profile/artist` is now Rise Mode and nothing else.** It was 16 lazy tabs behind a horizontal
  scroll strip. On a phone, tabs 8 through 16 (Sync, Profile, Albums, Shop, Billing, Tiers,
  Payouts, Referrals) sat past the edge of the screen.
- **Bug this inherited and fixed:** the page only honored **7 of its 16** `?tab=` values from the
  URL and silently fell through to `activeTab = 'rise'` for the rest. 102 internal links pointed
  at `?tab=`, and the biggest groups were dead: `?tab=payouts` (15 links, including the account
  menu's own "Payouts and tax"), `?tab=profile` (6), `?tab=tracks` (5), `?tab=analytics` (5),
  `?tab=livestreams` (5), `?tab=referrals` (4). All landed on Rise Mode. `?tab=live`,
  `?tab=community`, `?tab=bookings` and `?tab=upgrade` were linked but were never tabs at all.
- **Three surfaces, one job each.** Bottom nav = do the work (Studio is back in the artist's 3rd
  slot). Hamburger `AccountHub` = manage the business (`/account/*`). `/studio` = the toolbox
  (`/studio/*`). Explore, Messages and Library deliberately stayed on the tab bar: Lyft can hide
  everything because the driver's actual job is the map underneath, and CRWN's equivalent of the
  map is discovery and the fan inbox.
- **`HubPage`** (`src/components/layout/HubPage.tsx`) is the shared shell: X in the top left,
  artist gate, artist context. `?from=hub` on a link means the X returns to the hamburger, via a
  one-shot sessionStorage flag (`requestHubReopen`) that `Navigation` consumes on the next
  pathname change. A query param would have been simpler but pulls `useSearchParams` into the
  layout, forcing every static page under it into a Suspense boundary. Without `from=hub` the X
  is a plain `smartBack`, which is what keeps Rise Mode CTAs returning to Rise Mode.
- **Why it is now instant.** The tabs were already lazy, so the cost was never parsing: it was
  that a tab's chunk downloaded **at tap time**, behind a spinner, because nothing was a route
  and nothing could be prefetched. AccountHub and the Studio grid now use `<Link prefetch>`, so
  chunks arrive while the menu is on screen. `useArtistContext()` caches the `artist_profiles`
  row at module scope, so splitting one page into 15 did not turn one query into 15.
- **Legacy links.** `src/lib/dashboardRoutes.ts` holds `TAB_ROUTES`; `/profile/artist` redirects
  through it carrying every param except `tab` (notification rows hold
  `?tab=payouts&earning=<id>`). All 98 in-repo `?tab=` links were rewritten to point directly at
  the new routes, so only history pays the redirect hop.
- **The old 27-step dashboard tour was deleted.** Every step targeted a `[data-tour="tab-*"]`
  element that no longer exists. Replaced with a 6-step orientation tour: Rise, Studio, the
  hamburger, view-as-fan.
- The overlay sits at `z-45`, under the nav's `z-50`, so the bottom tab bar and desktop sidebar
  stay visible and tappable while the menu is open.

## 2026-07-24 — The app was slow because three surfaces did work that never needed doing

Josh reported the site loading slowly, worst on Home and worst of all on Rise Mode. Diagnosed
against the code, then measured in production. Nothing here was an N+1 or a missing index. Every
cause was **redundant or serialized work**, which is why it never showed up as one slow query.

- **Rise Mode / `/api/quests`** (runs on every load AND every tab switch, and the route loops its
  cascade up to 12 times per load):
  - `ensureRoleQuests` called `assignQuest` for all ~72 templates every time. Each call costs 3+
    round trips (open check, completed check, prereq check) before concluding it has nothing to
    do. Now it reads what the user already holds in ONE query and only assigns what is missing:
    ~200 queries down to 1 on a settled account. `assignQuest` keeps its own guards, so the
    prefilter is an optimization, not the correctness boundary.
  - `refreshQuests` evaluated every open quest sequentially. `evaluateCondition` is read-only, so
    the read phase is now concurrent. **Writes stay sequential on purpose**: `completeQuest` does a
    read-modify-write on the shared `user_progression` row, so parallel completions would lose XP
    grants. Progress-percent writes hit distinct rows and share nothing, so those batch.
  - `reconcileXp` did a select-then-insert per completed quest. It is a self-heal for a historical
    bug, so on a healthy account every lookup found nothing. One ledger query now.
  - `safeEvaluate` isolates a throwing quest condition. Previously one bad quest rejected the whole
    sequential pass and blanked the board.
- **Home:** every load called `/api/stripe/connect/status` through `useArtistSetup`, which does a
  live `stripe.accounts.retrieve()` plus `backfillTierPrices`. An external API round trip in Home's
  critical path, for a "Finish setup 2/4" pill that never reads the value. The hook now takes
  `withStripe` (default OFF) and only the setup wizard pays for it. The featured grid also selected
  `*, profile:profiles(*)` for 50 artists to render 12 tiles; narrowed to the five fields shown.
- **Artist dashboard bundle:** the page opens on Rise Mode but statically imported all 16 tab
  managers, so the browser downloaded and parsed the charts, upload widgets, calendars and the whole
  shop editor before Rise could paint. Every tab except Rise is now `next/dynamic`. Tabs were
  already render-gated by `visitedTabs`, so behavior is unchanged.
- **Explore** (measured after the above shipped: 2.7s cold, ~0.95s warm): eight sequential round
  trips, most of them independent of each other. Now three waves.
- **`artist_profiles.featured_hidden`** (`supabase/schema-phase2-featured-hidden.sql`): removes ONE
  artist from Featured + the Explore browse list without deactivating them. Previously the only
  lever was `profiles.is_active = false`, which kills the whole account. They stay findable by
  SEARCH. **The migration REBUILDS `artist_profiles_public`** because that view enumerates its
  columns at creation time, so a new base-table column stays invisible to it until rebuilt, and the
  app reads the view. The self-verify asserts the column reaches the view AND that the rebuild did
  not re-expose the three Stripe id columns. App code queries the flag separately and tolerantly so
  it survives the pre-migration schema; verified in production (200, full list) before the column
  existed.
- **Royalty Readiness is now reachable from Rise Mode**, not only the Studio tile. Josh looked in
  Rise, which is correct: Rise is the guided path, Studio is the tool hub. Deliberately NOT a quest
  template, because coupling two separately dark-launched features makes each harder to launch alone.

## 2026-07-23 — profiles was leaking every user's email to the public internet

Found while chasing a much smaller problem (12 accounts whose public `display_name` was their
signup email). Probing production from OUTSIDE with the public anon key showed the real issue:
`GET /rest/v1/profiles?select=*` returned **all 68 profiles including `email`**, plus 5 real
`phone` numbers. The anon key ships in every browser bundle, so this required no login.

- **Cause.** `schema.sql` created `"Profiles are viewable by everyone" ON profiles FOR SELECT
  USING (true)`. That is correct for the PUBLIC columns, since an artist's `display_name` and
  `avatar_url` have to render on their page. But `profiles` later grew private columns by
  ALTER TABLE (`email`, `phone`, `full_name`, `stripe_connect_id`, `is_approved`,
  `last_active_at`, `onboarding_nudge_sent_at`) and every one inherited "viewable by everyone".
- **Why RLS was never going to fix it.** RLS filters ROWS, not COLUMNS, and the rows really are
  public. This is a column-privilege problem. The identical fix already exists one table over:
  `artist_profiles.stripe_connect_id` returns 42501 to anon. That hardening was done once and
  never applied to `profiles`.
- **Fix.** `supabase/schema-phase2-profiles-column-privileges.sql` revokes the table-level SELECT
  from `anon` and `authenticated` FIRST (a column grant is a no-op while a table grant stands),
  then re-grants only the public columns. `authenticated` additionally keeps the tour/onboarding
  booleans the client UI needs. Self-verifies with `has_column_privilege` for both roles.
- **The one code change that mattered:** `useAuth.fetchProfile` did `select('*')`, which would
  have started returning 42501 for every logged-in user the moment the grant was narrowed. It now
  selects an explicit column list. A user's own email comes from the Supabase session
  (`user.email`), which is where it should have been read from all along. Nothing else in the
  browser reads `email`/`phone`/`full_name` (every such read is a server route on the
  service-role client, which is not subject to grants).
- **Still open, deliberately:** a fan's chosen `display_name` remains anon-readable. That is a
  design question (community bylines, chat authors, and leaderboards render it) rather than a
  leak, so it was not bundled into this fix.

## 2026-07-23 — Royalty Readiness Check: CRWN starts noticing money the artist already earned

Everything CRWN did before this answered one question: **how much NEW revenue can an artist create
from their audience?** This is the first piece of the second question: **how much revenue have they
already earned and never collected?** Streaming pays badly, but an artist who is not registered
with a PRO, has never registered their songs, and has never heard of SoundExchange is also failing
to collect money that already exists. Nobody in the artist's stack tells them: the distributor
reports masters, the PRO reports only what the PRO collected, and no one reports the gaps.

- **Royalty Readiness Check (dark-launched).** Page `(main)/royalty-readiness`, route
  `/api/royalty-readiness`, scorer `src/lib/royalty/readiness.ts`, table `royalty_readiness`
  (`supabase/schema-phase2-royalty-readiness.sql`), flag `admin_settings.royalty_readiness`, off by
  default, same pattern as the quest, pop-up and live-tips engines. Twelve questions across
  ownership / registration / collection, a 0-100 coverage score, and a ranked action list.
- **The hard constraint, and the reason it is a score and not a dollar figure.** CRWN cannot verify
  a single answer. A precise "you are owed $14,200" from unverifiable self-reported inputs is a fake
  royalty statement, so the output is coverage plus a checklist and the copy says "not confirmed" /
  "nobody is set up to collect this", never "you are owed". `buildLossResult` already had a `score`
  mode for exactly this class of tool; the same reasoning applies in-app.
- **Scoring rules that matter.** Publishing questions are SKIPPED for an artist who does not write,
  rather than scored as failures, so a performer is not shown gaps that are not theirs. `unsure`
  scores as uncovered but yields a "find out" action rather than a "set this up" action. An
  unregistered backlog is an INVERTED question (yes is the risky answer) and is the only item with
  a real clock on it, because back claims are not open forever.
- **CRWN diagnoses, it does not collect.** Every action points outward (ASCAP/BMI, the MLC,
  SoundExchange, an administrator) with no affiliate relationship and no preference. Whether that
  becomes referral revenue is a founder decision, and it changes what the list means.
- **`PopupContext` now carries `featureFlags`.** An announcement pop-up for a dark-launched feature
  must gate on that feature's own flag, not just `popup_engine`, or flipping the engine announces
  something the user cannot reach. Both owed announcements are now written and safe:
  `announce_live_tips` and `announce_royalty_readiness`. New announcements must add their flag to
  `ANNOUNCEABLE_FLAGS` in `src/app/api/popups/route.ts` or the gate is `false` forever.
- **Deliberately NOT built:** the Unclaimed Royalty lead magnet (ships only after the in-app check
  is live, so the tool points at something real), per-song registration tracking, and a composition
  record separate from the recording. The last one is the real prerequisite for anything split-sheet
  shaped, and it must never be collapsed into Team Splits: a CRWN revenue share is a payout
  arrangement, not copyright ownership.

## 2026-07-23 — Live Tips + Tip Goals, and the LIVE lead magnet

CRWN had **no tipping primitive of any kind**. The only money paths into a live were the
subscription tier gate and the pre-sale ticket, which blocked six requested live features at once
(tip goals, biggest-tipper badges, tip-leader queue sorting, revenue-by-minute, live challenges,
tip-goal sponsors). Tipping was therefore built first, ahead of the flashier backstage/FaceTime work.

- **Live Tips (dark-launched).** `live_tips` + `live_goals`
  (`supabase/schema-phase2-live-tips.sql`), checkout at `/api/stripe/live-tip-checkout`, board at
  `/api/live/tips`, `handleLiveTip` + `settleLiveGoals` in `webhookHandlers.ts`, UI in
  `LiveTipBar` (viewer + broadcaster) and `LiveGoalsEditor` (artist), shared helpers in
  `src/lib/live/tips.ts`. Reads `admin_settings.live_tips`, off by default, same pattern as the
  quest and pop-up engines. A tip is a one-time Connect charge in the same shape as a ticket:
  pending row at checkout, flipped to `paid` by the webhook, and only paid tips move the bar.
- **Three traps worth remembering.** (1) A tip carries `live_session_id` just like a ticket, so the
  webhook must match `metadata.type === 'live_tip'` BEFORE the ticket branch or the ticket handler
  swallows it. (2) `earnings_type_check` did not list `live_tip`; the earnings handlers return early
  on a failed insert, so without widening it every tip would be charged and never reach payouts.
  (3) Money columns and `reached_at` are frozen in BEFORE UPDATE triggers, not an RLS `WITH CHECK`,
  so the artist's tip-moderation policy cannot self-approve a payment.
- **Goal unlocks announce themselves in the live chat**, posted as the artist at tier rank 99, so
  the payoff happens on stream rather than in a dashboard.
- **Live Experience Calculator** (`live-experience-calculator`, DM keyword `LIVE`): the 15th
  acquisition tool, ticketed-live angle, registered in `leadMagnets/registry.ts` +
  `acquisition/toolAdapters.ts` with a bespoke charcoal-and-gold hero. Its math and its fix use
  ONLY shipped features (ticket, tips, recording-as-replay). **Standalone post-show replay sales
  and brand sponsorship are deliberately excluded from both** because neither exists in CRWN.
  Sibling of `executive-producer-session`, which sells one seat in the room at a high price; this
  one sells the show itself at volume.

## 2026-07-18 to 2026-07-22 — Backfill: the loss-revelation lead magnet build-out, Founder Window, and two production fixes

**Written 2026-07-23 as a catch-up.** These 20 commits shipped without a brain update, which is a
process failure, not a code one: the `doc-sync-reminder.sh` Stop hook only *reminds*, it does not
gate, so a long run of feature commits drifted. Recorded here so the brain is not silently wrong.

- **The lead magnet system became the acquisition front door.** It grew from 4 tools to 16, all
  running through ONE engine (`src/lib/acquisition/lossResult.ts` `buildLossResult`). Each tool is
  an adapter in `toolAdapters.ts`; a registry entry with `usesLossEngine: true` makes the web
  clients render from that same adapter, so the web page and the DM show an identical result from
  one model. New tools across the window: Founder Window, Movement Page, Fan Journey, Top Fan
  Leaderboard, Quest Path, Supporter Promise, Team Split, Share-to-Earn, Executive Producer
  Session, Own Your Fans, Live Experience.
- **Two integrity rules were learned the hard way and now govern every tool.** (1) Every `fix` must
  point to a CRWN feature that ACTUALLY exists; the audit found one gap (Founder Window), which was
  then built rather than removed from the copy. (2) The result must deliver the dollar the DM hook
  teased. Tools that required `direct_fan_revenue_cents` returned $0 for a cold lead, so
  Supporter Promise and Team Split were switched to project from `social_followers` like the rest.
- **Result presentation was rebuilt twice.** Loss pages now lead with a bold gold dollar hero plus
  stat tiles, carry a `derivation` infographic showing how the number is built, and put the email
  and signup CTAs above the fold. `cause`/`consequences` prose is intentionally NOT rendered (it
  repeated the hero) but stays on the params for storage. Two renderers exist and BOTH need any new
  section kind: the tokenized result page and the web tool client.
- **Share-to-Earn model correction (Josh caught it).** Referral conversions come from the NEW reach
  the sharers create, not a flat percentage of the artist's own followers. Funnel is now
  sharers x reach-per-sharer x conversion x $10.
- **Email capture was broken for every loss tool** and is fixed: the capture route called
  `generateResult`, which throws for `usesLossEngine` tools, so the emailed result never sent.
  Tools also gained email-only `emailInsights` (a computed cost-of-waiting plus a tailored move).
- **Founder Window shipped as a real feature** (see the feature map row): cap, deadline, and
  `is_founder` marking, enforced in checkout on both free and paid paths.
- **Two production fixes on 2026-07-22.** Artists could not save their profile at all (42501: the
  `artist_profiles` UPDATE policy's `WITH CHECK` subqueried Stripe-id columns whose SELECT had been
  revoked from `authenticated`; the freeze moved into a BEFORE UPDATE trigger). And `handle_new_user()`
  was seeding a new user's PUBLIC `display_name` with their signup email. **Both fixes are
  migrations that were still unrun as of 2026-07-23**, so the underlying breakage is live until
  Josh applies them.

## 2026-07-17 — Pop-up Engine, account hub, and interruption governors

A batch of engagement/nav work, all built around one principle: the platform must NOT overkill
the user. Every surface that interrupts a user now passes a frequency governor.

- **Pop-up Engine (dark-launched).** A governed in-app interruption layer. Catalog lives in code
  (`src/lib/popups/registry.ts`), server logic + governor in `src/lib/popups/index.ts`, API at
  `src/app/api/popups/route.ts`, client host `src/components/popups/PopupHost.tsx` mounted in
  `(main)/layout.tsx`. Governor: **at most one pop-up shown per user per calendar day**, plus each
  pop-up's own frequency cap (`once` / `max N` / `everyN days`), plus role/stage targeting.
  Dark-launched exactly like the quest engine: reads `admin_settings.popup_engine`, the API echoes
  `enabled`, the client renders nothing when off. Migration:
  `supabase/schema-phase2-popup-engine.sql` (adds `popup_events`, `popup_survey_responses`, seeds
  the flag OFF). Copy is loss-framed, no em dashes.
- **Pop-up surveys** are a pop-up `kind` (1-5 rating + feedback). Answers → `popup_survey_responses`;
  a score of 1-2 emails the founder the feedback (the "what to fix first" signal).
- **Broadcast + notification governors.** `api/messages/broadcast` gained a daily cap (5/day) on top
  of the hourly 10; `api/notifications/notify-subscribers` gained a daily cap (8/day) on top of the
  5/min burst. Both return loss-framed 429 copy (a muted fan is a lost fan).
- **Account hub (hamburger).** New `src/components/layout/AccountHub.tsx`: a Lyft-driver-style
  full-screen menu (identity header + "View as fan" + plan/upgrade pill + accordion sections)
  reached from a top-left hamburger. **Profile was removed from the bottom tab bar** and now lives
  here; the freed 5th slot is **Rise Mode** for artists / **Library** for fans (`Navigation.tsx`).
- **Fan CRM is now its own route** `/studio/fans` (wraps `AudienceTab` + a Back to Studio control),
  no longer a dashboard tab deep-link. The Studio "Fan CRM" card and the hub point at it. The
  ownership-guarded `/api/audience` is unchanged.
- **Home cleanup.** The two identical "?" icons collapsed into ONE `home-help` control: a setup
  progress pill while an artist has steps left, else a single Getting Started link. The tour replay
  moved into the hub ("Replay the app tour" → `/home?tour=1`). The static welcome subtext is now a
  **rotating daily line** (`getDailyWelcome`, deterministic per calendar day).

## 2026-07-15 — Founding-artist fee/AI promo killed at the source

Founder call: the partner-code 5%-fee promo (and its incidental Pro-level AI access) is dead. It reused the retired founding-artist plumbing and would have fired the first time an influencer converted an artist.

- **The one writer removed:** `metadata.founding_artist = 'true'` in `platform-checkout`. That was the ONLY code path that ever set the flag (`founding_number` was never set, so the original 50-spot webhook branch was already dead). With the writer gone, `is_founding_artist` is permanently false.
- **Dead readers deleted** rather than left as latent landmines: the 5% branch in `getArtistFeePercent` (it now returns the tier fee, unconditionally), and the "founding → Pro access" clause in all three AI-manager surfaces (`cron/ai-manager`, `ai-manager/generate`, `AiManagerCard` + the `isFoundingArtist` prop and the profile-page state that fed it).
- **Kept, because it is the influencer program, not the promo:** the partner-code branch still records attribution (`partner_code_used`, `acquisition_source='partner'`), creates the `artist_referrals` row + `recruited_by`, and grants the 1-month Stripe trial. It just no longer touches the platform fee. Artists pay their plan's normal fee (12% Free / 8% Pro) from day one.
- **Inert residue, left on purpose:** `FoundingBadge` renders behind `artist.founding_artist_number`, which nothing sets, so it never shows. Cosmetic, not behavioral; not worth public-profile render surgery.
- Zero artists ever carried the flag in production, so nothing changed for anyone live.

## 2026-07-14 — The legal pages now state the fees the code actually charges; founding artists retired

The **artist agreement** (a document artists accept) said **Starter = 8%** while `getArtistFeePercent` charges **12%**: a contract term wrong in the direction that hurts the artist. It also said Pro was $50/month ($9.99) and Label 6% at $150 (5%, $99, not sellable). `/terms` repeated the same fiction ("standard fee is 8%, reduced to 6% for Label").

- **Founder call (2026-07-14): the code is correct, the documents bend to it.** Free **12%** / Pro **8%** at **$9.99/mo**. Fixed in `(public)/artist-agreement`, `(public)/terms`, and the Stripe guide.
- The Label row was **deleted** from the fee schedule rather than corrected: it is spec-only and not sellable, and listing it in a contract implies an artist can buy it.
- **Founding Artist program retired** (founder call, same day). Every user-facing mention removed. Zero artists ever carried the flag in production, so nobody was affected.
- ⚠️ **Still live in code:** the partner-code promo (**5% fees for 3 months**, `platform-checkout:132` → `webhookHandlers:1529`) deliberately *reuses* `is_founding_artist` to get the fee reduction. It is unadvertised and currently unused, and it cannot render the Founding badge (that needs a `founding_artist_number` the partner path never sets). Awaiting a keep/kill call in `TODO.md`. **Do not delete the founding fee path without deciding this**, or the influencer program silently loses its closing discount.
- **Rule:** a legal page must state what the code does. Do not render it from a live constant either, or a code change silently rewrites the contract artists agreed to.

## 2026-07-14 — A deploy is not an outage: the error boundaries were mislabelling a routine deploy as a crash

Reported as "site not loading, says something went wrong" on the homepage and the featured
artist page, which then stopped on its own. Production was never down. It was a **stale-deploy
chunk error**: a deploy had gone out ~1h earlier, and an open tab still held HTML pointing at
the previous build's content-hashed JS chunks. Fetching one 404s, throwing `ChunkLoadError`,
which trips the nearest error boundary. `chunkReload` then hard-reloads once and the next load
is clean, which is why it "fixed itself."

- **The defect was the presentation, not the recovery.** All three boundaries only tested
  `isChunkLoadError` inside `useEffect`, so the crash screen **painted first** and the reload
  fired a tick later. Every deploy therefore flashed "Something went wrong" at anyone mid-session.
  It convinced the founder the site was down; a visiting artist would conclude the same and leave.
  That puts it on the acquisition surface, not in the cosmetics pile.
- **Fix:** the check now runs during **render**, so the first paint is a quiet "Updating to the
  latest version" screen (`src/components/shared/AppUpdating.tsx`). The genuine crash copy is
  reserved for genuine crashes.
- **`global-error.tsx` was also missing `<html>`/`<body>`**, which Next requires because that
  file *replaces* the root layout when it renders. It is now inline-styled end to end: it cannot
  depend on `globals.css`, since the layout it replaces is what imports it.
- **Boundary coverage:** only `(main)`, `(auth)` and the root `global-error` exist. `(public)`
  and `[slug]` (artist profiles) have no route-level boundary and fall through to `global-error`,
  which is the path this bug came in on.

## 2026-07-14 — Influencer commission is 1% of artist REVENUE (founder rule), and it was paying 5x

Founder rule: **influencers earn 1% of the referred artist's revenue**, negotiable per influencer. The code was paying a percentage of something else entirely.

- **The bug:** `cron/recruiter-recurring` held a private price map (`pro: 5000, label: 17500, empire: 35000`) and fed it straight into `stripe.transfers.create()`. Pro is **$9.99**, so a 10% recurring commission on a Pro artist would have wired **$5.00/mo against an artist paying $9.99** (5x), Label 1.77x. It had been logged in TODO.md as a P2 "harmless dead code" item. **It never fired** (no recurring payout has ever run; no qualified referrals exist), so nothing needed clawing back.
- **The rule now:** commission base is `earnings.net_amount` (what the artist keeps, the same basis Team Splits uses) summed over the **previous calendar month**. Refunds are negative rows and net out; a net-negative month pays 0, with no clawback. Rate defaults to **1%**, overridden per influencer via `recruiters.partner_recurring_rate` (legacy column name, now applies to every recruiter).
- **Plan gates removed.** The old "artist must be on an active paid plan" and "partners earn nothing on Pro artists" rules assumed the commission came out of the artist's SaaS fee. A revenue share is funded by the platform fee (Free 12%, Pro 8%), which exists on every plan.
- **Also fixed:** the summary emails were rebuilt by a second pass that re-derived every amount and re-applied none of the skips, so a recruiter could be emailed about money that was never sent. They now report what was actually transferred. Earnings reads are paginated (PostgREST caps at 1000 rows, so a busy artist's month would have silently underpaid).
- **Copy:** `/partner`, `/recruit` and the getting-started guide were selling the fiction ($69 Pro, Label $175, Empire $350, "10% on Label+"). Rewritten to the real deal.
- **Rule:** never hardcode a price or fee in a route. Derive from `TIER_PRICING` / `TIER_LIMITS`. A "harmless dead constant" that feeds arithmetic is not harmless.

## 2026-07-14 — All four unsigned webhooks now verify signatures (HIGH-1 closed)

`webhooks/resend`, `outreach/webhook`, `outreach/inbound`, `sms/webhook` accepted a POST from anyone and wrote via the service-role client. See `11-SECURITY-AND-PRIVACY.md` HIGH-1. Verified with hand-rolled HMAC (`src/lib/webhookSignatures.ts`) against Twilio's and Svix's official test vectors. All fail closed. Needs three Resend signing secrets in Vercel (in `TODO.md`).

## 2026-07-14 — Internal self-calls hit Vercel's auth wall, silently

`cron/ai-manager`, `admin/agent/{briefing,autonomous,execute}` and the RLS canary built base urls from `req.nextUrl.origin` / `VERCEL_URL`. Inside a Vercel cron both resolve to the `*.vercel.app` **deployment** origin, which sits behind Vercel Authentication (custom domains are public, deployment urls are not). That wall answers **every** path, `/api/*` included, with an **http 200 and an html login page**, so the self-calls did not fail loudly: they "succeeded" with html and the work never happened. It also made the RLS canary email a false LEAK alert about its own front door. One hardcoded `PUBLIC_ORIGIN` (`src/lib/publicOrigin.ts`) now. Two of the routes also had `(A || B) ? C : D` precedence bugs that made the `NEXT_PUBLIC_SITE_URL` fallback unreachable.

## 2026-07-11 — Rate limiter fixed (every unauthenticated route was fail-closed)

`check_rate_limit(p_user_id)` is typed `uuid`, but unauthenticated routes have no user id and key on a string like `ip:1.2.3.4`. Postgres could not cast it (`22P02`), the RPC errored, and `checkRateLimit` discarded the error, so `data === true` evaluated `false`. An errored limiter was indistinguishable from a denial, and **every visitor got a 429 on their first request**.

- **Was broken in production:** `/api/support` (support form), `/api/partner/apply` (partner applications), `/api/lead-magnets/capture`, `/api/lead-magnets/email`. All four are unauthenticated and top-of-funnel. Authenticated routes pass a real uuid and were never affected, which is why this went unnoticed.
- **Fix (`src/lib/rateLimit.ts`, no schema change):** hash any non-uuid key into a stable uuid so it buckets like a real one (verified against prod: allows exactly `max_requests`, then denies); log RPC errors instead of swallowing them.
- **Note:** the limiter still fails CLOSED on an RPC error (unchanged semantics, so money routes are not weakened), but it now logs loudly. `check_rate_limit` has no checked-in migration; its signature was recovered by probing production.

## 2026-07-11 — Lead Magnet system (4 tools)

Added a config-driven Lead Magnet system (branch `claude/rise-mode-full-journey`). One typed registry (`src/lib/leadMagnets/registry.ts`) drives all tools; adding a tool = one config + one deterministic generator, no new pages.

- **Tools shipped (4):** Vault Revenue Planner (`vault-revenue-planner`), Proof of Demand Test Builder (`proof-of-demand-test-builder`), Fan Mission Generator (`fan-mission-generator`), Clip-to-Earn Campaign Planner (`clip-to-earn-campaign-planner`).
- **Routes:** public `/tools` + `/tools/[slug]` (SSG shells, `(public)` group); protected `/artist/tools`, `/artist/tools/[slug]`, `/artist/tools/saved` (middleware `protectedPaths` gains `/artist/tools`; `tools` added to `knownRoutes`).
- **Shared engine:** reuses `Wizard` + `OptionSelect`; deterministic versioned generators (`resultGenerators.ts`, `GENERATOR_VERSION`); preview-gated result renderer; consent-correct public lead capture; save/email/share; conversion adapters that PREFILL the live builders (Proof of Demand, Missions, Bounties read `lm_*` params, one-time seed, their own validation/payout logic untouched). Vault degrades to a saved plan by design.
- **APIs (`/api/lead-magnets/*`):** `capture` (public, IP rate-limited, server-recomputes the result), `results` + `results/[id]` (owner-scoped CRUD, public read by high-entropy token), `email` (recipient-locked, suppression-checked), `analytics` (field-allowlisted sink), `admin` (aggregates only).
- **DB:** `supabase/schema-phase2-lead-magnets.sql` (**APPLIED 2026-07-11**) adds `lead_magnet_leads`, `lead_magnet_results`, `lead_magnet_events` with RLS (owner-manage + admin-read) and a self-verify block. Distinct from `crm_contacts`/`fan_contacts`/`fan_events`.
- **Verified in production:** end-to-end capture writes the lead + result, recomputes server-side and mints a token; token read returns 200, no token 401, wrong token 404 (no leak). Smoke-test rows were deleted afterward.
- **Out of scope preserved:** the existing `/worth` "money left on the table" calculator is untouched.
- **Follow-up:** builder->result "converted" callback (marking a result `converted` after the builder creates the record) is not yet wired; no `/admin` Lead Magnets tab yet.

## v1.0 — 2026-07-10 (initial generation)

- **Generated:** 2026-07-10
- **Repository:** CRWN (`thecrwn.app`), Supabase project ref `ecpqtuidtsncjfwtkvwc`
- **Git branch:** `master`
- **Git commit:** `614b9582b2e5c456837fcd0c5cfc42b1d3194bac` (`614b958` — "Dropdowns for multi-option selectors; notification polish; Rise Mode return-to")
- **Repository status at generation:** working tree had unrelated uncommitted changes (mostly Windows `:Zone.Identifier` / Dropbox attribute sidecar files, plus edits to video-script and SQL notes). **No application source was modified to produce this documentation** — the CRWN Brain only adds files under `docs/crwn-brain/`.

### Method
Documentation was produced by static analysis of the repository at the commit above: reading source, routes, ~190 API handlers, 117 `supabase/*.sql` migrations, config, and the repo's own docs (`CLAUDE.md`, `CODEBASE.md`, `DEV_RULES.md`, `PRD.md`, `CRWN_Kickoff_Brief.md`). Evidence was gathered by parallel read-only exploration agents across domains (database, auth/security, payments, features, integrations, design/conventions, current state) and cross-checked against direct file reads. No code was executed, no migrations applied, no external API called, no production data touched.

### Files created (23)
`00-START-HERE.md`, `01-PRODUCT-VISION.md`, `02-FEATURE-MAP.md`, `03-USER-ROLES-AND-PERMISSIONS.md`, `04-ARCHITECTURE.md`, `05-DATABASE.md`, `06-ROUTES-AND-USER-FLOWS.md`, `07-BUSINESS-RULES.md`, `08-DESIGN-SYSTEM-AND-UX.md`, `09-CODING-CONVENTIONS.md`, `10-INTEGRATIONS.md`, `11-SECURITY-AND-PRIVACY.md`, `12-ENVIRONMENT-AND-SETUP.md`, `13-CURRENT-STATE.md`, `14-ROADMAP-INFERRED.md`, `15-AI-AGENT-INSTRUCTIONS.md`, `16-GLOSSARY.md`, `17-OPEN-QUESTIONS.md`, `18-SOURCE-MAP.md`, `CRWN-BRAIN-COMBINED.md`, `CRWN-BRAIN-QUICK-CONTEXT.md`, `CHANGELOG.md` (this file).

### Certainty labels
Statements are marked `Confirmed`, `Strongly inferred`, `Unclear`, `Not found in codebase`, or `Needs founder confirmation`. No secrets or secret values were included; env vars are referenced by name only.

### Key reconciliations baked in
- **Pricing:** code (`TIER_LIMITS`) is authoritative — Free 12% / Pro $9.99 8% / $99 `label` spec-only / `empire` dead. `PRD.md`, `schema-platform-tiers.sql`, and `recruit/page.tsx` all carry stale/contradictory pricing.
- **AI provider:** DeepSeek (+ narrow OpenAI), not "Moonshot/Kimi" as PRD says. `@google/genai` is unused by the app.
- **Booking:** live flow is booking tokens; the Calendly components are orphaned.
- **Onboarding:** `/welcome` → `/setup` wizard (PRD's tour/action-picker flow is stale).

### Known documentation limitations
1. **Schema is not fully reconstructable from the repo** — `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters` have no checked-in CREATE TABLE migration; their columns are described only from later ALTERs. A production `pg_dump` is needed for completeness.
2. **Security audit sampled, not exhaustive** — the 195-file `SUPABASE_SERVICE_ROLE_KEY` surface was reviewed across every risk category, not line-by-line for all files. No leak found in anything reviewed; a full sweep is a reasonable follow-up.
3. **Env var equality unverifiable** — whether `NEXT_PUBLIC_CRON_SECRET == CRON_SECRET` in production (which determines exploitability of HIGH-2) could not be checked without Vercel access.
4. **Runtime-only facts unverified** — e.g. whether body text renders Inter vs a fallback, and whether subscription downgrades actually apply on Stripe's side, were reasoned from static code and flagged, not observed at runtime.
5. **Dynamic ranking/algorithm logic** (Explore/Home feed ordering) was not deeply traced.
6. Reflects a single commit; drift begins immediately. Update this changelog + the affected docs after each behavior/architecture change.

### How future agents should update the CRWN Brain
- After a feature/change: update `02-FEATURE-MAP` (status), `05-DATABASE` (schema), `07-BUSINESS-RULES` (rules), `13-CURRENT-STATE`, and any doc whose claims changed. Re-check certainty labels.
- Append a new dated `## vN` section here with the new commit hash, what changed, and any new limitations.
- If a statement in the Brain becomes stale, fix it in place and note the correction — stale docs caused several of the reconciliation issues found during this generation.
- Keep `CRWN-BRAIN-COMBINED.md` and `CRWN-BRAIN-QUICK-CONTEXT.md` consistent with the numbered docs when you edit them.
