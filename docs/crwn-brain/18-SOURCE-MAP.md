# 18 — Source Map

> Traceability from documentation claims to source files, so another AI can verify quickly. Paths are repo-relative.

## Product / docs (repo)
- Vision/positioning: `CRWN_Kickoff_Brief.md`, `PITCH_DECK.md`, `CRWN_Product_Plan.docx`
- Requirements (stale on pricing/AI): `PRD.md`
- Pricing (current, 2026-07-31): `CRWN_PRICING STRATEGY.md` (Launch $0 12% / Pro $49 8% / Scale $199 5%); code SoT `src/lib/platformTier.ts`
- Working rules (authoritative): `CLAUDE.md`, `DEV_RULES.md`, `CODEBASE.md`, `AGENT_INSTRUCTIONS.md`
- Ops: `POST_DEPLOY_CHECKLIST.md`; handoffs: `CRWN_*_HANDOFF.md`, `CRWN_SESSION_CONTEXT_MAR10.md`, `CLIP_TO_SUBSCRIBE_PHASE1*.md`

## Drift prevention (doc 26, LIVE 2026-08-12)
- Invariant registry (+ frozen identifiers, `FEATURES` reachability, `EXPECTED_MIGRATION_STATE`): `src/lib/architecture/invariants.ts`
- Centralized exceptions (the ONLY place intentional deviations live): `src/lib/architecture/exceptions.ts`
- Shared scanner (cached walk, comment strip, `violation()` messages; test-time only): `src/lib/architecture/sourceScan.ts`
- Registry-driven suites: `src/lib/architecture/{architecture,ownership,financial,communications,attribution,navigation,terminology,identifiers,reachability,authorization}.test.ts`
- Suite manifest + command: `vitest.architecture.config.ts` via `npm run verify:architecture` (registry↔manifest parity asserted in `architecture.test.ts`)
- Migration/doc contract: DOCS-002 describe block in `src/lib/brainContract.test.ts`
- Doc-impact mapping: `.claude/hooks/doc-sync-reminder.sh` (code area → canonical docs)

## Config
- `package.json` (deps/scripts), `next.config.ts` (env expose, headers, image hosts), `vercel.json` (25 crons), `tsconfig.json` (`@/` alias), `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`, `.env.local` (names only)

## Auth & authorization
- `src/middleware.ts`, `src/lib/supabase/{client,server,middleware}.ts`
- `src/hooks/useAuth.tsx`, `src/components/auth/AuthForm.tsx`
- Email verify: `src/app/verify/page.tsx` (success screen; `emailRedirectTo` target)
- Account state: `src/app/api/account/deactivate/route.ts`, `src/app/api/account/reactivate/route.ts` (reactivate called from `useAuth.tsx` on `is_active===false`)
- `src/lib/auth/requireAdmin.ts`, `src/lib/apiAuth.ts` (`requireArtistOwner`)
- RLS/roles: `supabase/schema-phase2-rls-column-restrictions.sql`, `-promote-artist-role.sql`, `-artist-approval-gate(-repair).sql`

## Database
- Base: `supabase/schema.sql`; tickets `schema-ticket{3,4,5,7}.sql`
- Money ledger RLS + retrofit: `schema-phase2-money-ledger-rls.sql`, `-attribution-hardening.sql`, `-earnings-type-check.sql`, `-earnings-live-tip-type.sql` (adds `live_tip` to the type allowlist)
- Money Model measurement (First Revenue Launch economics, 2026-08-10, doc 21): `src/lib/frl/{economics,checklist,server}.ts` (+`economics.test.ts`), routes `src/app/api/admin/frl/engagements/**`, UI `src/components/admin/MoneyModelView.tsx`, migration `schema-phase2-frl-engagements.sql`. Guarantee evaluator it reuses: `src/lib/launchPartner.ts` + `/api/artist/launch-partner` + `schema-phase2-launch-partner.sql`; revenue models `src/lib/avatars/revenueModels.ts`; stack replacement `src/lib/stackReplacement.ts`
- Entitlement: `schema-phase2-tracks-audio-view.sql`, `-tracks-audio-column-privs.sql`, `-community-posts-rls.sql`, `-fix-entitlement-oracle-via-authuid.sql`, `-revoke-entitlement-oracle-execute.sql`
- Stripe id lockdown: `schema-phase2-artist-profiles-public-view.sql`, `-stripe-id-column-privs.sql`
- Team splits: `schema-phase2-team-splits.sql`, `-team-splits-cashout-rpc.sql`
- Cashout locks: `schema-phase2-cashout-rpc-lockdown.sql`
- Setup wizard: `schema-phase2-artist-setup-wizard.sql`; platform tiers: `schema-platform-tiers.sql`
- Quest engine: `schema-phase2-quest-engine.sql`, `-quest-notifications.sql`
- Types mirror: `src/types/index.ts`, `community.ts`, `live.ts`

## Payments / Stripe
- `src/lib/stripe/client.ts`, `src/lib/webhookHandlers.ts`, `src/lib/platformTier.ts` (fees/limits SoT), `src/lib/planRecommendation.ts` (deterministic operating-plan recommendation engine, `recommendPlan()`, pure + tested)
- Routes: `src/app/api/stripe/*` (checkout, track/product/booking/live/platform-checkout, connect(+status), cashout, fan-cashout, team-split-cashout, subscription-update, webhook, create-price, balance, free-subscribe, fan-connect, fan-portal, login-link)
- Subscription mgmt: `src/app/api/subscriptions/{cancel,pause}`
- Team splits lib: `src/lib/teamSplits/{allocation,server,constants,types,warnings}.ts`; routes `src/app/api/team-splits/*`; crons `cron/team-split-accruals`, `cron/team-split-selfcheck`; audit `supabase/audit-team-split-road-campaign-accruals.sql`
- Communications Governor V1: taxonomy `src/lib/comms/taxonomy.ts`, pure governor `src/lib/comms/governor.ts`, integrated at the notification chokepoint `src/lib/notifications.ts` (`createNotification`). Promise reminder boundary: `src/lib/promiseReminders.ts` + `src/lib/calendarReminders.ts`, both via `src/lib/fulfillment.ts`.
- Manager admin observability (read-only): `src/app/api/admin/manager-ops/route.ts` (GET only, `requireAdmin`), `src/components/admin/ManagerOpsView.tsx`, pure logic `src/lib/admin/managerOps.ts`, mounted as the **Artist Manager** tab in `src/app/admin/page.tsx`.
- Artist bank payouts: **no CRWN cron.** Stripe pays each Express account on its own automatic daily schedule. The only CRWN-initiated artist payout is `src/app/api/stripe/cashout/route.ts` ($2, artist-triggered). The `weekly-payout` cron was retired 2026-08-11.
- Discounts: `src/lib/discountCodes.ts`, `src/app/api/discount-codes/*`

## Content / entitlement / player
- `src/app/api/tracks/[id]/stream/route.ts`, `src/lib/storage/signedAudio.ts`, `src/lib/r2/client.ts`, `src/lib/uploadValidation.ts`
- Components: `src/components/gating/{GatedTrackPlayer,GatedCommunityPost}.tsx`, `src/hooks/{useSubscription,useContentAccess}.ts`
- Public pages: `src/app/[slug]/**`, share `src/components/share/*`, embed `src/app/embed/[trackId]/*`

## Features
- Onboarding: `src/app/(public)/welcome/`, `src/app/setup/`, `src/hooks/useArtistSetup.ts`, `src/lib/onboardingItems.ts`, `src/app/(main)/layout.tsx`, `src/app/api/artist/complete-setup/route.ts` (service-role `setup_completed=true`)
- Artist dashboard: `src/app/(main)/profile/artist/page.tsx` + `src/components/artist/*`; tours `src/lib/artistTourSteps.ts` (`getPostSetupTourSteps`), `usePageTour` (dashboard tour set `enabled:false`, replay-only via `TourReplayButton`)
- Community/messaging: `src/components/community/*`, `src/components/messages/*`, `src/lib/messaging.ts`, `src/app/api/messages/*`
- Notifications: `src/lib/notifications.ts`, `src/components/notifications/NotificationBell.tsx`, `src/app/api/notifications/*`
- Live/VOD: `src/lib/livekit/livekit.ts`, `src/app/api/live/*`, `src/components/live/*`, `src/app/[slug]/live/*`
- Gamification: `src/lib/quests/*`, `src/components/quests/*`, `src/components/artist/RiseMode.tsx`, `src/lib/{missions,squads,bounties,cityUnlocks}.ts`, routes `src/app/api/{missions,squads,bounties,city-unlocks,road-campaigns,quests,proof-of-demand}/*`
- Marketing/CRM: `src/lib/emails/*`, `src/app/api/{campaigns,sequences,segments,crm,fan-contacts,smart-links}/*` (the `sms/*` routes and `src/lib/twilio.ts` were deleted 2026-07-31 with the SMS removal)
- Support (2026-07-31): `/support` help center page, `src/lib/supportKnowledge.ts` (guide-derived AI knowledge prompt), `src/app/api/support/{route,chat}` + `src/app/api/admin/support-chat`, admin `SupportChatView` (`/admin?tab=support`), global `BugReportButton` in the root layout, tables `support_conversations`/`support_messages` (`schema-phase2-support-chat.sql`, applied 2026-08-01)
- Fan Testimonials (2026-08-12, schema-gated): pure brain `src/lib/testimonials/core.ts` (trigger eligibility, `deriveVerification`, `isTestimonialPubliclyEligible`, `toPublicTestimonial`, body validation); server `src/lib/testimonials/server.ts` (generator + fan/artist writes, all fail-soft pre-migration); public read `src/lib/testimonials/publicRead.ts` (reads the `fan_testimonials_public` view under the session client, the artist_profiles_public pattern). Routes `/api/testimonials` (fan, session is the author), `/api/artist/testimonials` (artist, session resolves the artist id), `/api/cron/testimonial-requests`. UI `src/components/fan/TestimonialRequestCard.tsx`, `src/components/artist/{TestimonialLibrary,PublicTestimonials}.tsx`, `/studio/testimonials`. Migration `supabase/schema-phase2-fan-testimonials.sql` (2 tables CLOSED to anon/authenticated + 1 public view + authorship freeze trigger + `artist_profiles.testimonial_requests_enabled`). Invariants TESTIMONIAL-001..009, suites `src/lib/testimonials/core.test.ts` + `src/lib/architecture/testimonials.test.ts`, both in the verify:architecture gate
- Referrals/recruiters: `src/lib/referrals.ts`, `src/lib/attribution.ts`, `src/app/api/{referrals,recruit}/*`, `src/app/{join/[code],partner}/`
- Admin/AI: `src/app/admin/`, `src/app/api/admin/*`, `src/lib/ai/*`, `src/app/api/ai-manager/*`, `src/components/admin/*`
- Lead magnets / public tools: registry `src/lib/leadMagnets/*` (16 `LeadMagnetConfig` + `EXTERNAL_TOOLS` worth); DM/execution adapters `src/lib/acquisition/{toolAdapters,orchestration,lossResult}.ts`; result/claim `src/lib/leadResults/*`; pages `src/app/(public)/{tools,worth}/*`; DM ingress `src/app/api/integrations/manychat/webhook/route.ts`
- Opportunity Funnels (shared config/lifecycle/promotion + funnel analytics over the tools): `src/lib/opportunityFunnels/{types,registry,analytics}.ts` (typed view over the registries; `promotion`/`lifecycle`; 7 `opportunity_*` + 16 `journey` events sanitized onto the existing `lead_magnet_events` sink). Own Your Fans = primary. Funnel event spine `src/lib/analytics/funnelEvents.ts`; money ledger `src/lib/analytics/opportunityLedger.ts`
- Value-before-signup (Own Your Fans): pre-signup builder `src/components/opportunity/FanCaptureBuilder.tsx`; draft sanitizers `src/lib/opportunityDrafts/ownYourFansDraft.ts`; public draft capability routes `src/app/api/opportunity-drafts/{route,[token]/route}.ts` (reuse `lead_magnet_results` as an unclaimed draft, no migration); resume page `src/app/(main)/own-your-fans/plan/page.tsx` (reads claimed draft under RLS). Claim/resume reuse `src/lib/leadResults/{resultAccess,postSetupDestination}.ts` + the signup `user_metadata` token
- Post-signup journey resolver (one place, no scattered conditionals): `src/lib/journey/resolveJourneyDestination.ts` (account gate -> setup gate -> restored builder via `buildDraftConfig` -> safe dashboard; `safeInternalPath` returnTo guard; Rise Mode only appends returnTo when quest_engine on). Entry `src/app/api/lead-results/post-setup-destination/route.ts` (server-side context, experiment variant re-derived from `aid`). 9 personalized-journey analytics events in `opportunityFunnels/analytics.ts`
- Experiments (holistic experience A/B foundation, LIVE: flag ON, `oyf-signup-timing-v1` running): `src/lib/experiments/{registry,assignment,anonId,taxonomy,metrics,insights,server,client}.ts` (behavior is prebuilt code, deterministic assignment, projection-vs-actual guard). Migration `supabase/schema-phase2-experiments.sql` (`experiments` + `experiment_events`, applied, probe-verified). Routes `src/app/api/experiments/track/route.ts` (public, flag-gated) + `src/app/api/admin/{experiments,experiment-analytics}/route.ts` (requireAdmin). Admin UI tab `src/components/admin/ExperimentsView.tsx`. Flag: `admin_settings.experiments`

## Evidence layer + Constraint Engine (2026-08-03)
- Constraint Engine: `src/lib/constraint/{thresholds,types,engine,assembler,presentation}.ts` + `{engine,assembler,presentation}.test.ts`. Route `src/app/api/artist/constraint/route.ts` (session-only ownership, no artistId param). UI `src/components/artist/ConstraintCard.tsx`, mounted above `RoadmapCard` in `src/app/(main)/profile/artist/page.tsx`. **Pure, deterministic, no AI, read-only.**
- Tier evidence: `src/lib/analytics/{tierEvents,tierEvidence}.ts` (+ tests), client beacon `src/lib/analytics/trackTierViewClient.ts`, hook `src/hooks/useTierViewTracker.ts`, routes `src/app/api/tier-events/route.ts` (view beacon) and `src/app/api/artist/tier-evidence/route.ts` (owner-gated reader). Migration `supabase/schema-phase2-tier-events.sql` (APPLIED). Checkout starts emitted from `src/app/api/stripe/checkout/route.ts`
- First paid conversion, all six rails: `src/lib/analytics/paidConversion.ts` (+ test), called from `src/lib/webhookHandlers.ts` (subscription, product, track, booking, live ticket, live tip). Stamps the artist's calculator AND their campaign attribution, so the event joins back to the funnel and to a specific video
- Campaign attribution (tagged organic-video links, 2026-08-06): `src/lib/analytics/campaignAttribution.ts` (pure normalizer, allowlists, `buildCampaignUrl`; + test) and `src/lib/analytics/attributionLookup.ts` (first-touch resolver off `lead_magnet_results.input_data._attribution`; + test). Client capture `readCampaignAttribution()` in `src/lib/leadMagnets/analytics.ts`. Persisted by `/api/lead-magnets/capture` and `/api/opportunity-drafts`; stamped downstream by auto-claim, complete-setup, `connectReconcile`, fan-contacts import, call-request and `paidConversion`. Reported by `campaignScorecard()` in `src/lib/analytics/leadMagnetDashboard.ts` + the Campaign link builder in `src/components/admin/LeadMagnetsView.tsx`. Founder guide `docs/acquisition/campaign-tagging.md`. **NO migration.**
- Promise reliability: `MISSED_GRACE_DAYS` + `shouldMarkMissed`/`latenessDays`/`summarizePromiseHealth` in `src/lib/fulfillment.ts` (+ test); sweep `src/lib/promiseSweep.ts` (+ test), piggybacked on the 6am `scheduled-releases` cron
- One churn definition: `src/lib/analytics/retention.ts` (+ test), imported by BOTH `/api/analytics` and the constraint assembler
- One visitor identity: `src/lib/analytics/visitorHash.ts`, imported by `src/middleware.ts` and the tier-events route

## Design / conventions
- `src/app/globals.css`, `src/app/styles/neumorphic.css`, `src/app/layout.tsx`
- `src/components/ui/*` (OptionSelect, Wizard, ConfirmModal, EmptyState, Skeleton, FadeIn, StaggerChildren)
- `src/components/layout/Navigation.tsx`, `src/components/shared/Toast.tsx`, `src/lib/navigation.ts` (smartBack)
- Hooks: `src/hooks/*`

## Cron (vercel.json ↔ routes)
`src/app/api/cron/{weekly-report,recruiter-qualify,recruiter-recurring,ai-manager,sequences,sync-opportunities,lead-scoring,inactive-subscribers,scheduled-releases,scheduled-campaigns,platform-crm,activation-nudges,onboarding-reminder,platform-sequences,fan-digest,sequence-conversions,outcome-measure,agent-health,clipper-rate-drops,team-split-accruals,rls-canary,onboarding-health,team-split-selfcheck}/route.ts` (`sms-reset` deleted 2026-07-31 with the SMS removal); briefing `src/app/api/admin/agent/briefing/route.ts`

## Health / canaries
`src/app/api/cron/onboarding-health/route.ts`, `src/app/api/cron/rls-canary/route.ts`, `schema-phase2-cron-heartbeat.sql`

## Unified Opportunity Calculator (the all-in-one, overlap-safe)
`src/lib/opportunity/unifiedModel.ts` (the layered model, `unifiedOpportunity@1`) · `unifiedAdapter.ts` (presentation + conversion payload) · `recalcUnified.ts` (re-derive on edit) · `unifiedModel.test.ts` + `unifiedFunnel.test.ts` (82 invariants). Registered as the 18th `LeadMagnetConfig` in `src/lib/leadMagnets/registry.ts` (`opportunity-calculator`) and the 18th `AcquisitionTool` in `src/lib/acquisition/toolAdapters.ts`. Branching support: `src/lib/leadMagnets/validation.ts` (`isStepVisible`, `all`/`oneOf`/`notOneOf` rules) + `src/lib/leadMagnets/entryContext.ts` (`?from=` reordering). Coordinated builder: the `opportunity-calculator` spec in `src/lib/opportunityDrafts/deliverableSpecs.ts` (`preview.kind: 'system'`, `recalc`). Spec: `docs/UNIFIED_OPPORTUNITY.md`.

## Tests
`npm test` (vitest): 820 tests, 50 files (a moving figure: run it). Concentrated in the pure business layers: `src/lib/acquisition/acquisition.test.ts`, `src/lib/opportunity/*.test.ts`, `src/lib/opportunityDrafts/*.test.ts`, `src/lib/opportunityFunnels/*.test.ts`, `src/lib/leadResults/*.test.ts`, `src/lib/journey/`, `src/lib/experiments/`, `src/lib/prospectNurture/`, `src/lib/analytics/`, `src/lib/revenueRamp.test.ts`, `src/components/opportunity/fanCaptureSteps.test.ts`. **No component/integration/e2e test**, so `npm run build` + the canaries remain the gate for everything else. Several suites are coverage GUARDS (e.g. every public tool must have a deliverable, the event allowlist must match), so they fail when a new tool is added incompletely.

## NOT app code (verify before assuming relevance)
Root `*.mjs` (content generation), `carousel-*.json`, `videos/`, `.claude/` (harness config, incl. `.claude/agents/*.md` which are Claude Code subagents, not product roles).

---

*See also: [04-ARCHITECTURE.md](04-ARCHITECTURE.md) · [05-DATABASE.md](05-DATABASE.md) · [15-AI-AGENT-INSTRUCTIONS.md](15-AI-AGENT-INSTRUCTIONS.md)*
