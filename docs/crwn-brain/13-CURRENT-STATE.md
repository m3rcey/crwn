# 13 — Current State

> A realistic state-of-the-product report at commit `86e3e8c` (branch `master`, 2026-07-29). Certainty labels used. This is deliberately candid about incompleteness — do not read "a component exists" as "the feature works."

## Snapshot

CRWN is **live in production** (`thecrwn.app`) and the core money loop is real and hardened. The codebase is **large and layered** — it has grown many parallel feature surfaces (241 API routes, 25 crons, 134 migrations, 115 pages) faster than it has been consolidated. Earlier threads: a **security-hardening sprint** (entitlement oracle, signed audio, RLS canary), and the **Quest Engine / Rise Mode** gamification layer, which is built but remains **dark-launched (flag off)**. The **current frontier** is the **Opportunity Funnel system** (public calculator tools → value-before-signup builders → one journey resolver → holistic experiments), which is **live** with its experiments engine **on**; its latest addition (2026-07-29) is the **unified Opportunity Calculator**, the first surface that models every opportunity together without double-counting; on 2026-07-30 the calculator gained the **Tier 1 launch journey** around it: the 40% qualification question in its wizard, a qualified immediate-call hand-raiser (server-recomputed `scoreLead`, one deduplicated founder alert per phone per day, admin Calls-tab CRM record with manual statuses; the alert channel became EMAIL always on 2026-07-31 when SMS was removed, with an optional `FOUNDER_ALERT_SMS_EMAIL` carrier-gateway mirror), consent-attested fan-contact import, first-fan invites through the existing campaign sender (live; `schema-phase2-fan-invites.sql` applied 2026-07-30), a post-publish launch transition on `/offers/new` (Stripe prompt + "choose who sees it first"), and five new funnel stages carrying the journey to `first_paid_conversion`. `Confirmed`.

## Complete & production-ready (Confirmed)

- **Auth + onboarding + setup wizard** (`/welcome` → `/setup`, DB-derived completion, hard gate, daily canary). `setup_completed` now persists via the service-role `POST /api/artist/complete-setup` route (was a silent client `.update()`).
- **Fan subscriptions** (paid + free), **track/product/booking/live-ticket purchases**, **discount codes** (end-to-end wired), **Stripe Connect payouts** (weekly cron + on-demand cashout).
- **Content + gating** via `is_free`/`allowed_tier_ids` (redacting views enforce it). For TRACKS
  the authoring model is **content classes** (free forever / members first, public later /
  members only, 2026-08-01): `fieldsForClass()` derives the stored fields, the old two-toggle UI
  is gone, and a staggered members-first release rides `tracks.waterfall`, opened additively by
  the daily cron (entitlement gate untouched).
- **Membership strategy layer (2026-08-01):** deterministic Release Club vs Vault brain
  (`src/lib/membershipStrategy.ts`), derived on read at `/api/artist/strategy`, surfaced by
  `StrategyCard` on the command screen with the two declared questions that can flip the pick;
  live-session templates prefill the live form. Spec tier names are roles on the pinned
  Bronze/Silver/Gold/Platinum ladder. `Confirmed`.
- **Evidence layer + Constraint Engine (2026-08-03).** The first artist-facing closed feedback
  loop. Evidence: `tier_events` (per-rung views + checkout starts, migration APPLIED and
  probe-verified), `first_paid_conversion` emitted from all six paid rails through one shared
  recorder that stamps the artist's calculator, and `fulfillment_events.status = 'missed'` now
  actually written (it was read in nine places and written in none) with lateness derived from
  the existing timestamps. Decision: `src/lib/constraint/*` diagnoses the earliest blocking
  constraint, shows its evidence, and returns exactly ONE action, rendered by `ConstraintCard`
  above the roadmap. **Deterministic: no AI provider is involved, and it reads without ever
  writing.** It renders nothing on insufficient evidence, so the default experience is unchanged.
  Full rules in `07-BUSINESS-RULES.md` §15a/§15b; audit context in `docs/FEEDBACK_LOOPS.md`.
  `Confirmed`.
- **Stripe webhook** (idempotent, signed, refunds/disputes handled).
- **Team Splits** (capped-hybrid, accrual cron, deliverables/disputes/release, separate cashout ledger) — carefully engineered.
- **Email**: campaigns + multi-step sequences + attribution + suppression + fan digest.
- **Prospect nurture (email-only calculator leads)** — live 2026-07-27 (migration applied + deployed; no feature flag, on once deployed). A lead who runs a calculator, asks for the result by email, but does not sign up is enrolled (with marketing consent) into a versioned, calculator-aware core sequence (`src/lib/prospectNurture/*`, **v2 retuned to docs/ICP.md**: 25 emails across ~12 months, Phases 1-8), driven by the daily cron `/api/cron/prospect-nurture`. The pitch is **consolidation** of a fragmented direct-to-fan stack (the ICP), not "streaming pays pennies". Reuses the existing Resend sender, the global `email_suppressions` gate, and the `lead_magnet_leads`/`lead_magnet_results` tables (NOT parallel; distinct from `platform_sequence_*`, which nurture account holders). Financial values read from stored `result_data`, never recomputed. Exits the moment the lead signs up (`exitProspectNurtureForUser` in `autoClaimForUser`); suppression/unsubscribe overrides every send; one active enrollment per email (partial unique index); per-step idempotency (`prospect_nurture_sends UNIQUE(enrollment_id, email_id)`). Admin panel under the Sequences tab. Phases 4-9 and `/worth` enrollment are deliberate follow-ups, held until open/click/conversion data exists. Full spec: `docs/PROSPECT_NURTURE.md`. `Confirmed`.
- **Analytics/CRM/funnel/pipeline** (admin) and **AI Manager** (artist, Pro+) + **admin autonomous agent** (internal).
- **Live streaming + VOD** (LiveKit, tier/ticket-gated, egress→R2, signed VOD).
- **Messaging/DMs** with voice notes (Pro-artist-gated, private-bucket signed audio).
- **Notifications** (in-app bell + realtime), **community** feed + channels (RLS-gated).
- **Support system (shipped 2026-07-31):** `/support` is a help center (search across the 14 getting-started guides, link to `/getting-started`, live chat, contact form that CCs the founder with auto-captured context). The chat is AI-first (DeepSeek `deepseek-chat` over `src/lib/supportKnowledge.ts`) with human escalation into a new admin Support tab (`/admin?tab=support`, `SupportChatView`; admin replies email the user). A global `BugReportButton` in the root layout (hidden on auth/setup) posts bug reports with auto-captured context. Chat storage (`support_conversations`/`support_messages`, migration `schema-phase2-support-chat.sql`) was **APPLIED 2026-08-01**, so the chat is live rather than falling back to the form. Escalation splits judgment from fault, and a "New question" control starts a fresh thread (see the 2026-08-01 CHANGELOG entry). Announced via the one-time `announce_support_chat` popup.
- **Gamified growth toolkit** (missions, squads, clip bounties, city-unlocks, road-campaigns, proof-of-demand, smart-links/pre-save, earn/impact/command) — all DB-backed, live independent of the Quest flag.
- **Recruiter/partner** program (dashboard, Stripe payouts, qualification crons).
- **Opportunity Funnel system** (live 2026-07-27) — the 17 public tools unified under one config/lifecycle/promotion layer (`src/lib/opportunityFunnels/*`); the **Own Your Fans value-before-signup** builder (anonymous fan-page draft reusing `lead_magnet_results`, claimed at signup via the existing `user_metadata` token); ONE post-signup **journey resolver** (`src/lib/journey/resolveJourneyDestination.ts`: account gate → setup gate → prefilled builder → safe dashboard, validated returnTo); and a holistic-experience **experiments engine** (`src/lib/experiments/*`, `experiments` + `experiment_events` tables, admin Experiments tab). Experiment behavior is **prebuilt code**, so an experiment can never change pricing/fees/ownership/RLS. **The engine is ON** (`admin_settings.experiments`) and `oyf-signup-timing-v1` is **running** (save vs preview signup boundary, 50/50), assigning + recording variant-attributed outcomes. Full detail in `CHANGELOG.md` (2026-07-27 entries) + `18-SOURCE-MAP.md`. `Confirmed`.

## Experimental / dark-launched

- **Quest Engine / Rise Mode / Supporter Mode** — flag `admin_settings.quest_engine = {"enabled": false}` (`schema-phase2-quest-engine.sql`). Fully built and wired end-to-end (`src/lib/quests/*`, `src/components/quests/*`), consumers no-op gracefully when off. Under active development with two recently-fixed production bugs (`getQuests` ordered by a non-existent `sort_order`; `NULL is_active` excluded). `Confirmed`.
  - **Zero-to-hero artist journey (Prompt 2, shipped dark):** the artist catalog now covers the **Tutorial + Levels 1-4** (Foundation, Vault, Membership Ladder, Open the Gates), not just the old 1-3 seed. Level keys renamed to the journey labels (`progression.ts`); ~13 new artist quests with authoritative `DomainCheck` completion (profile-complete, socials, track-count, album, playlist, tier-count/benefits, plan-aware ladder, Stripe-connected, tier-purchasable, welcome-post) added to `evaluator.ts`. Level 2 catalog-shape planner (`VaultPlanner.tsx`, mounted atop `MusicManager`) using the shared `OptionSelect` to adapt recommended catalog steps and deep-link to the existing tracks/albums/playlists surfaces. Recommended four-tier ladder template (`src/lib/tierTemplate.ts` + `TierLadderTemplate.tsx`, mounted in `TierManager`) with edit/skip/preview and workload safeguards. Adaptive first-load recap in `/api/quests` (`recap` payload) + `RiseMode` banner; cascade loop raised to 12 for the deeper ladder. No migration required; all checks read existing tables. `Confirmed`.
  - **Full artist career game (Prompt 3, shipped dark):** Levels 5-10 + Empire Mode now seeded. ~40 new artist quests (Recruit Founding Fans, Build the First 10, Turn Fans Into a Community, Launch Your First Movement, Build the Growth Engine, Become the Artist CEO) with ~24 new authoritative `DomainCheck`s (free-member count, members-post count, went-live, survey, retention cycle, proof-of-demand, mission, squad, campaign closed/reached, smart link, captured lead, active sequence, referrals/clipper on, sent campaign, growth-loop composite, revenue milestone, MRR, team split, referral conversions, cities unlocked, and the `artist_beat_rise_mode` victory composite). Coaching-only steps use `kind:'manual'` completed through a NEW **guarded** `POST /api/quests/complete` that refuses any non-manual (domain/fan_event) quest, so financial/supporter milestones stay server-derived. Empire is escalating **non-repeatable** milestones (25/50/100/250/500 supporters, $1k/$5k MRR, referrals, cities) gated on the prior rung, so no XP farming. Main-game **victory** payload + `RiseMode` "You Beat Rise Mode" banner (real counts only). `recommendNextQuest` is now build-aware (boosts side quests by the artist build's `priorityCategories`; the main spine never branches). Opt-in full quest map + per-quest "Mark as done" for manual quests. No migration required. `Confirmed`.
  - **Setup ↔ Rise alignment (latest):** the Artist Setup Wizard creates the **free "Bronze" entry point** by default (`DEFAULT_TIER_NAME` in `src/app/setup/page.tsx`; an earlier version of this note said "Community", which was wrong) so setup and Rise Mode never ask for the same thing; the paid ladder is built in Rise Level 3. Note the ladder template (`TierLadderTemplate.tsx`) recognizes the free tier **by name** while the quest evaluator recognizes it **by price = 0**, so renaming the free tier desyncs the ladder tile from quest completion. Setup completion CTA is now **"Start Rise Mode."** `/welcome` shows the minimum-viable-setup promise and a **"Build My CRWN"** CTA for artists. Rise Level 1 boss is **"Complete Your Artist Destination"** (authoritative composite: photo + banner + bio + slug + track + social link). A new **infrastructure-ready capstone** quest (`artist_infrastructure_ready`, L4) + RiseMode banner marks the setup→growth handoff, derived from a composite check (free+paid tier, Stripe connected, purchasable tier, track, community post, profile) — **not** overloading `setup_completed`. Executive Supporter recognition disclaimer expanded to explicitly exclude master ownership, publishing, songwriting/producer credit, royalties, revenue participation, approval rights, creative control, and Team Split. No migration. `Confirmed`.
  - **Closeout fixes:** the previously-corrupted `supabase/schema-phase2-quest-notifications.sql` (`EXECUccTE`/`L88OOP`) is repaired to valid PL/pgSQL and ready to apply. A zero-dependency catalog integrity guard (`scripts/verify-quest-catalog.mjs`, `npm run verify:quests`) asserts unique keys, resolvable prerequisites/fan-quest refs, and that every domain `check` is both declared in the union and handled by an evaluator case (currently: 71 quests, 43 checks, all clean). `Confirmed`.
- **Scale platform tier ($199/mo, 5%)** — renamed from the old spec-only `label` $99 concept in the 2026-07-31 repricing. In `TIER_LIMITS` and the checkout whitelist (alongside `pro`); billable once its Stripe prices exist and `STRIPE_CRWN_SCALE_PRICE_ID` / `STRIPE_CRWN_SCALE_ANNUAL_PRICE_ID` are set (the route verifies the live Stripe price amount against `TIER_PRICING`, so a stale env var fails loudly). `Confirmed`.
- **Benefit catalog "coming soon" items** (`benefitCatalog.ts:225`, e.g. `monthly_merch`) — explicitly `available:false`. `Confirmed`.

## Partial / gaps (Confirmed)

- ~~SMS deferred-send queue~~ Moot: the entire SMS feature was REMOVED 2026-07-31 (founder decision, A2P 10DLC compliance cost). All `/api/sms/*` routes, `twilio.ts`, `SmsSetup`, the CRM SMS tab, SMS limits and the `sms-reset` cron are gone; `sms_*` tables kept dormant for consent history.
- **`campaign-hub` per-campaign breakdowns** — "coming soon" placeholder (`campaign-hub/page.tsx:220`).
- **Admin "fan referral tracking"** metric — "coming soon" tooltip (`AdminDashboard.tsx:68`).
- **Downgrade scheduling** — `subscription-update` writes `pending_tier_id`/`pending_change_date` to the DB but no Stripe-side schedule call was found in that route; the webhook only *applies* a pending change once Stripe's price already matches. Trace before trusting downgrades apply on Stripe's side. `Strongly inferred` gap.
- **No user-facing account hard-delete/GDPR erasure** path found. Deactivate/reactivate is now a working pair (deactivate genuinely hides the artist publicly at the app layer, reactivate fires on next login), just not a hard-delete. `Needs founder confirmation`.
- **No web/push notifications** — `public/sw.js` has no push listener; notifications are foreground-only. `Confirmed`.

## Executive Producer Sessions — Phase 1 shipped DARK 2026-07-24 (Confirmed)

The `executive-producer-session` lead magnet and seven scripts sell a paid private session where
fans submit beats/vocals/ideas and watch the artist work. Audited then built the same day. An
Executive Producer Session is **not a new stream type** — it is a `live_session` with submissions
and polls bolted on, so the build extends `live_sessions` rather than forking it. Flag
`admin_settings.producer_sessions` (off), migration `schema-phase2-producer-sessions.sql` (unrun).

**Built (Phase 1):**
- **Fan submissions.** `session_submissions`: a beat/vocal (private R2 upload via signed PUT under
  a fan-scoped key), a written idea, or a reference link. `/api/producer/submissions{,/upload-url,/file}`.
  Every write gates through `canSubmitToSession` (`src/lib/producer/access.ts`), which reuses the
  live-ticket resolver `src/lib/live/access.ts`, so submit-access can't drift from watch-access.
- **Artist review queue.** `SubmissionReviewPanel` — feature/shortlist/pass, play, download, order.
- **Advisory in-session polls.** `session_polls`/`session_poll_votes`, `/api/producer/polls{,/vote}`,
  `ProducerPolls`. A poll never binds the artist, by construction, which keeps "full creative
  control" honest.
- Dark-launch discipline: a `/api/producer/flag` probe hides every surface while off, AND the
  submit route refuses to run while off, so a fan cannot reach it early even by hand.

**Deliberately NOT built (Phase 2):**
- **Fan submission AGREEMENT — DRAFTED + wired, pending attorney review.** `/submission-agreement`
  (`src/app/(public)/submission-agreement/page.tsx`) is a conservative draft (a submission transfers
  NOTHING: no license, no guarantee, fan warrants originality + clears samples, unreleased material
  confidential), in the hand-written Live-Agreement style. The submit route rejects a submission
  unless the client echoes `PRODUCER_SUBMISSION_AGREEMENT_VERSION` (`src/lib/producer/consent.ts`,
  stamped `2026-07-24.draft1` as a tripwire), and the submit panel makes the fan tick a linked box.
  **The flag stays off until an attorney clears the draft; then bump the version off `.draft1` and
  flip.** This is the one launch blocker. In `TODO.md`.
- **Stage / mic.** `'stage'` is in the type union, the LiveKit grants (`canPublish:true`) and the
  DB CHECK, but **nothing mints it** — `/api/live/token` returns only `broadcaster`/`viewer`. So a
  fan still cannot be on the mic. Needs a likeness release.
- **Moderation** (`LiveProvider` has no `removeParticipant`/`mutePublishedTrack`; chat moderation
  soft-deletes a message, not a person; viewers already get `canPublish:false`).
- **Seat types** (viewer vs producer seats) is the last open build; it needs a business-model
  decision. **Stage/mic + moderation** need a likeness-release decision. *(Everything else is built:
  the public per-session sales page `ProducerSessionOffer`; per-session analytics `GET
  /api/producer/analytics` + `SessionStatsPanel`; and recurrence as one-tap "Run it again" on an
  ended session — assisted repetition, NOT auto-scheduling/cron, because a live event needs the
  artist present. Deliberately did not use `fulfillment_obligations`/a cron.)* The fan submission
  agreement is FINAL (founder-approved 2026-07-24), version `2026-07-24.v1` at
  `/submission-agreement`; the Terms carry a live-ticket refund clause (effective 2026-07-24).
- **Screen share already works** (stock `<VideoConference />`; `LiveWatchRoom` subscribes to
  `Track.Source.ScreenShare`), so "watch me work" is real today.

## Legacy / duplicated / dead (Confirmed)

- **`src/app/artist/[slug]/*` vs `src/app/[slug]/*`** — the top-level `artist/[slug]/page.tsx` is a redirect shim, but the subroutes (`track/album/post/playlist/[id]`, `book/success`) are **full near-byte-identical duplicates** that have already **drifted one field** (album `description`). `[slug]/*` is canonical. Stray link `TrackUploadForm.tsx:525` still builds `/artist/${slug}`. Recommend deleting or shimming the duplicates.
- **`empire` platform tier** — **fully deleted 2026-07-31** from `TIER_LIMITS`/`TIER_LIMITS_V2`/`PlatformTierName` as part of the pricing strategy. `resolveTierKey()` aliases any stray `label`/`empire` string to `scale`, so a stale row can no longer break fee lookups.
- **Legacy `access_level` enum** — superseded by `is_free`/`allowed_tier_ids` but still present on `tracks`/`albums`/`products`/posts columns **and** in the TS `Track`/`Album`/`Post`/`CommunityPost` types. A live foot-gun.
- **`useContentAccess.ts`** — old access model, only one consumer (`GatedCommunityPost`); superseded by `useSubscription`.
- **Calendly booking components** (`CalendlyBooking`, `SessionManager`, `BookingSettings`) — **not imported anywhere**; superseded by booking tokens.
- **Dead components:** `OnboardingTaglineStep.tsx`, `ArtistProfileForm mode="onboarding"` (zero call sites). `/onboarding` (auth group) is a static placeholder.
- **Dead barrel files:** `src/components/ui/index.ts` and `src/hooks/index.ts` are `export {}` placeholders (everything imports by direct path).
- **Legacy social layer:** `posts`/`comments`/`likes` (ticket7) overlaps `community_posts/*` and `community_channels/*` — confirm which is live.
- **Notification dead link:** `notifyNewPost`/`notifyNewComment` write `link:'/community'`, a route that doesn't exist → 404 on click.

## Design-system debt (Confirmed, from CSS audit)

- **`bg-crwn-card` is an undefined Tailwind v4 token used in 56 files** — with no `tailwind.config.*` and no `@theme` entry, it likely compiles to nothing (transparent). The real token is `bg-crwn-surface`.
- **Color mismatch:** `--crwn-bg` is `#0f0f0f` but `layout.tsx` hardcodes `#0D0D0D` (and CLAUDE.md/PRD say `#0D0D0D`).
- **Font var leftover:** `globals.css` sets `--font-sans: var(--font-geist-sans)` but `layout.tsx` defines `--font-inter` — body text may be falling back to system-ui. `Strongly inferred`, verify in devtools.
- **Two stagger mechanisms** coexist (CSS `.stagger-fade-in` vs `<StaggerChildren>`).

## Mock data / seeds

- Only **marketing mockups** use fake data (`(public)/worth/mocks.tsx`, `recruit/page.tsx` `MockRecruiterDashboard`) — intentional illustrations, not bugs. Production UI queries Supabase directly.
- Demo seeds (`seed-demo-*.sql`) populate the `m3rcey` test artist; `__canary*` users are synthetic health-check accounts (skipped by notification hooks).
- ~~Stale copy in the recruit marketing page~~ Fixed 2026-07-31: `recruit/page.tsx` no longer carries the old "Pro $50, Label $150, Empire $350" prices.

## Unified Opportunity Calculator — live 2026-07-29 (Confirmed)

The 18th public tool, and the only one that models the whole business at once
(`/tools/opportunity-calculator`). Every other calculator models ONE opportunity honestly; summing
their headlines is not honest, because they are all built on the same audience. At 500k followers
their published formulas sum to ~$550k/mo and 23,500 payers, while the repo's own audience model
says 2,250 people ever pay for anything.

So this does not add them. `src/lib/opportunity/unifiedModel.ts` (`unifiedOpportunity@1`) runs one
layered model: **one** normalized audience (the larger platform figure, never a sum; owned contacts
folded in by inclusion-exclusion), **one** unique paying-supporter count, **one** membership ladder
with the Vault as its middle TIER, Share-to-Earn and Clip-to-Earn as **acquisition** (they move the
supporter count and the attribution split, and produce no revenue line), and incremental purchases
sold **only** out of the non-member pool. That disjoint-population rule is what makes the total
provable: every dollar is paid by a member or by a non-member, never by both.

Presentation `unifiedAdapter.ts` (headline is a conservative-to-high RANGE; current direct revenue
is SUBTRACTED). Coordinated `system` builder in `deliverableSpecs.ts` prefills the whole business,
and `recalcUnified.ts` re-runs the model when the artist's edits change the structure, so the
builder can never keep showing a headline the artist's own choices invalidated. **82 tests** assert
the invariants (`unifiedModel.test.ts`, `unifiedFunnel.test.ts`).

Additive, no migration, no feature flag: it is an 18th entry in the existing lead-magnet registry,
so it inherits the tool page, wizard, capture, tokenized result, email, prospect nurture, draft
claiming and the journey resolver. All 17 individual calculators are untouched and still work.
Promotion is `secondary` on purpose (Own Your Fans stays `primary`: it is the assigned experience of
the RUNNING `oyf-signup-timing-v1` experiment). `?from=<tool-slug>` entry contexts reorder the
wizard for a single-opportunity video without changing the model. Three analytics events added
(`opportunity_overlap_explained`, `_recommendation_edited`, `_estimate_recalculated`) and the server
allowlist in `/api/lead-magnets/analytics` is now DERIVED from `ALL_OPPORTUNITY_EVENT_NAMES` rather
than hand-copied, which had been silently dropping any client event the server list missed. Full
spec: `docs/UNIFIED_OPPORTUNITY.md`. `Confirmed`.

## Testing

**Vitest is configured and the suite is real: `npm test` runs 820 tests across 50 files (a moving figure: run it).** This
supersedes the earlier "zero automated tests" claim in this package, which was written before the
Opportunity Funnel work landed. Coverage is concentrated in the pure business layers (the
acquisition adapters, the opportunity model + funnel, drafts, journey resolution, experiments,
prospect nurture, revenue ramp, analytics); there is still no component, integration or e2e test,
and no jest/playwright config. `npm run build` remains the primary gate for everything the suite
does not reach, alongside the `onboarding-health` and `rls-canary` crons that exercise real RLS
paths against production. `npm run lint` is NOT a gate: it reports ~635 pre-existing errors (mostly
`no-explicit-any`) across the codebase. `Confirmed`.

## Incident history (from migration filenames + git log)

Repairs/hardening migrations reveal past incidents: `artist-approval-gate-repair` (publish broke silently for months), `revoke/fix-entitlement-oracle` (paid-content access outage), the signed-audio arc (paid-track audio leak), `cashout-rpc-lockdown`, `agent-tables-rls` (forgeable agent log), `money-ledger-rls` (money tables had no RLS). These are **fixed**, but they define the sensitive zones. `Confirmed`.

## Highest-value cleanup opportunities (recommendation, most-critical-first)

1. **Fix HIGH security findings** (unauthenticated webhooks, `NEXT_PUBLIC_CRON_SECRET`) — see `11-SECURITY-AND-PRIVACY.md`.
2. **Get a full schema dump** for the money tables lacking CREATE TABLE migrations — see `05-DATABASE.md`.
3. **Delete/shim the `artist/[slug]/*` duplicate subroutes** (they drift silently).
4. **Fix `bg-crwn-card`** (56 files rendering wrong background).
5. ~~Excise the dead `empire` tier~~ Done 2026-07-31 (deleted in the Launch/Pro/Scale repricing).
6. **Drop legacy `access_level`** from types to stop new code reading the wrong field.

---

*See also: [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [14-ROADMAP-INFERRED.md](14-ROADMAP-INFERRED.md) · [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md)*
