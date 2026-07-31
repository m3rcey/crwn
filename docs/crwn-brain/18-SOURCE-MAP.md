# 18 — Source Map

> Traceability from documentation claims to source files, so another AI can verify quickly. Paths are repo-relative.

## Product / docs (repo)
- Vision/positioning: `CRWN_Kickoff_Brief.md`, `PITCH_DECK.md`, `CRWN_Product_Plan.docx`
- Requirements (stale on pricing/AI): `PRD.md`
- Pricing (current, 2026-07-31): `CRWN_PRICING STRATEGY.md` (Launch $0 12% / Pro $49 8% / Scale $199 5%); code SoT `src/lib/platformTier.ts`
- Working rules (authoritative): `CLAUDE.md`, `DEV_RULES.md`, `CODEBASE.md`, `AGENT_INSTRUCTIONS.md`
- Ops: `POST_DEPLOY_CHECKLIST.md`; handoffs: `CRWN_*_HANDOFF.md`, `CRWN_SESSION_CONTEXT_MAR10.md`, `CLIP_TO_SUBSCRIBE_PHASE1*.md`

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
- Money ledger RLS + retrofit: `schema-phase2-money-ledger-rls.sql`, `-attribution-hardening.sql`, `-earnings-type-check.sql`
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
- Payout cron: `src/app/api/cron/weekly-payout/route.ts`
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
- Support (2026-07-31): `/support` help center page, `src/lib/supportKnowledge.ts` (guide-derived AI knowledge prompt), `src/app/api/support/{route,chat}` + `src/app/api/admin/support-chat`, admin `SupportChatView` (`/admin?tab=support`), global `BugReportButton` in the root layout, tables `support_conversations`/`support_messages` (`schema-phase2-support-chat.sql`, pending)
- Referrals/recruiters: `src/lib/referrals.ts`, `src/lib/attribution.ts`, `src/app/api/{referrals,recruit}/*`, `src/app/{join/[code],partner}/`
- Admin/AI: `src/app/admin/`, `src/app/api/admin/*`, `src/lib/ai/*`, `src/app/api/ai-manager/*`, `src/components/admin/*`
- Lead magnets / public tools: registry `src/lib/leadMagnets/*` (16 `LeadMagnetConfig` + `EXTERNAL_TOOLS` worth); DM/execution adapters `src/lib/acquisition/{toolAdapters,orchestration,lossResult}.ts`; result/claim `src/lib/leadResults/*`; pages `src/app/(public)/{tools,worth}/*`; DM ingress `src/app/api/integrations/manychat/webhook/route.ts`
- Opportunity Funnels (shared config/lifecycle/promotion + funnel analytics over the tools): `src/lib/opportunityFunnels/{types,registry,analytics}.ts` (typed view over the registries; `promotion`/`lifecycle`; 7 `opportunity_*` + 16 `journey` events sanitized onto the existing `lead_magnet_events` sink). Own Your Fans = primary. Funnel event spine `src/lib/analytics/funnelEvents.ts`; money ledger `src/lib/analytics/opportunityLedger.ts`
- Value-before-signup (Own Your Fans): pre-signup builder `src/components/opportunity/FanCaptureBuilder.tsx`; draft sanitizers `src/lib/opportunityDrafts/ownYourFansDraft.ts`; public draft capability routes `src/app/api/opportunity-drafts/{route,[token]/route}.ts` (reuse `lead_magnet_results` as an unclaimed draft, no migration); resume page `src/app/(main)/own-your-fans/plan/page.tsx` (reads claimed draft under RLS). Claim/resume reuse `src/lib/leadResults/{resultAccess,postSetupDestination}.ts` + the signup `user_metadata` token
- Post-signup journey resolver (one place, no scattered conditionals): `src/lib/journey/resolveJourneyDestination.ts` (account gate -> setup gate -> restored builder via `buildDraftConfig` -> safe dashboard; `safeInternalPath` returnTo guard; Rise Mode only appends returnTo when quest_engine on). Entry `src/app/api/lead-results/post-setup-destination/route.ts` (server-side context, experiment variant re-derived from `aid`). 9 personalized-journey analytics events in `opportunityFunnels/analytics.ts`
- Experiments (holistic experience A/B foundation, dark): `src/lib/experiments/{registry,assignment,anonId,taxonomy,metrics,insights,server,client}.ts` (behavior is prebuilt code, deterministic assignment, projection-vs-actual guard). Migration `supabase/schema-phase2-experiments.sql` (`experiments` + `experiment_events`, UNRUN). Routes `src/app/api/experiments/track/route.ts` (public, flag-gated) + `src/app/api/admin/{experiments,experiment-analytics}/route.ts` (requireAdmin). Admin UI tab `src/components/admin/ExperimentsView.tsx`. Flag: `admin_settings.experiments`

## Design / conventions
- `src/app/globals.css`, `src/app/styles/neumorphic.css`, `src/app/layout.tsx`
- `src/components/ui/*` (OptionSelect, Wizard, ConfirmModal, EmptyState, Skeleton, FadeIn, StaggerChildren)
- `src/components/layout/Navigation.tsx`, `src/components/shared/Toast.tsx`, `src/lib/navigation.ts` (smartBack)
- Hooks: `src/hooks/*`

## Cron (vercel.json ↔ routes)
`src/app/api/cron/{weekly-payout,weekly-report,recruiter-qualify,recruiter-recurring,ai-manager,sequences,sync-opportunities,lead-scoring,inactive-subscribers,scheduled-releases,scheduled-campaigns,platform-crm,activation-nudges,onboarding-reminder,platform-sequences,fan-digest,sequence-conversions,outcome-measure,agent-health,clipper-rate-drops,team-split-accruals,rls-canary,onboarding-health,team-split-selfcheck}/route.ts` (`sms-reset` deleted 2026-07-31 with the SMS removal); briefing `src/app/api/admin/agent/briefing/route.ts`

## Health / canaries
`src/app/api/cron/onboarding-health/route.ts`, `src/app/api/cron/rls-canary/route.ts`, `schema-phase2-cron-heartbeat.sql`

## Unified Opportunity Calculator (the all-in-one, overlap-safe)
`src/lib/opportunity/unifiedModel.ts` (the layered model, `unifiedOpportunity@1`) · `unifiedAdapter.ts` (presentation + conversion payload) · `recalcUnified.ts` (re-derive on edit) · `unifiedModel.test.ts` + `unifiedFunnel.test.ts` (82 invariants). Registered as the 18th `LeadMagnetConfig` in `src/lib/leadMagnets/registry.ts` (`opportunity-calculator`) and the 18th `AcquisitionTool` in `src/lib/acquisition/toolAdapters.ts`. Branching support: `src/lib/leadMagnets/validation.ts` (`isStepVisible`, `all`/`oneOf`/`notOneOf` rules) + `src/lib/leadMagnets/entryContext.ts` (`?from=` reordering). Coordinated builder: the `opportunity-calculator` spec in `src/lib/opportunityDrafts/deliverableSpecs.ts` (`preview.kind: 'system'`, `recalc`). Spec: `docs/UNIFIED_OPPORTUNITY.md`.

## Tests
`npm test` (vitest): 392 tests, 23 files. Concentrated in the pure business layers: `src/lib/acquisition/acquisition.test.ts`, `src/lib/opportunity/*.test.ts`, `src/lib/opportunityDrafts/*.test.ts`, `src/lib/opportunityFunnels/*.test.ts`, `src/lib/leadResults/*.test.ts`, `src/lib/journey/`, `src/lib/experiments/`, `src/lib/prospectNurture/`, `src/lib/analytics/`, `src/lib/revenueRamp.test.ts`, `src/components/opportunity/fanCaptureSteps.test.ts`. **No component/integration/e2e test**, so `npm run build` + the canaries remain the gate for everything else. Several suites are coverage GUARDS (e.g. every public tool must have a deliverable, the event allowlist must match), so they fail when a new tool is added incompletely.

## NOT app code (verify before assuming relevance)
Root `*.mjs` (content generation), `carousel-*.json`, `videos/`, `.claude/` (harness config, incl. `.claude/agents/*.md` which are Claude Code subagents, not product roles).

---

*See also: [04-ARCHITECTURE.md](04-ARCHITECTURE.md) · [05-DATABASE.md](05-DATABASE.md) · [15-AI-AGENT-INSTRUCTIONS.md](15-AI-AGENT-INSTRUCTIONS.md)*
