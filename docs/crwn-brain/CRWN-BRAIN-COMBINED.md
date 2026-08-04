# CRWN Brain — Combined Context

> **Delta 2026-08-03, not yet folded into the sections below: the evidence layer and the
> Constraint Engine.** CRWN now measures the artist journey through first paid conversion and
> per-tier fan behavior, and turns that into ONE next action.
> **Evidence:** `tier_events` (`tier_card_viewed` / `tier_checkout_started`, migration APPLIED,
> server-write only, grain `(artist, tier, type, visitor_hash, day)` matching
> `artist_page_visits`); `first_paid_conversion` now emitted from ALL six paid rails through one
> shared recorder that stamps the artist's calculator (it previously fired from two, and since
> the stage dedupes per artist, an artist whose first dollar came any other way read as never
> converted forever); and `fulfillment_events.status='missed'` is finally WRITTEN (it was read in
> nine places and written in none) by a sweep on the existing 6am cron after
> `MISSED_GRACE_DAYS = 14`, with lateness derived from `due_at`/`completed_at`, no new column.
> **Decision:** `src/lib/constraint/*` is a pure, deterministic, read-only engine.
> Order: launch gate (delegated to the Roadmap) → FULFILLMENT → RETENTION → REACH → FREE_CAPTURE
> → FIRST_PAID → PAID_TIER_INTEREST → CHECKOUT_COMPLETION → DEPTH → none, because fulfillment and
> retention protect revenue ALREADY EARNED while acquisition wins revenue not yet earned.
> Thresholds live in ONE file (`src/lib/constraint/thresholds.ts`, founder-adjustable, first
> guesses). Below a stage's minimum sample there is NO diagnosis, not a low-confidence one; null
> evidence means "cannot evaluate", never zero. `ConstraintCard` renders above `RoadmapCard` and
> renders NOTHING unless a diagnosis clears its bar, so the default experience is unchanged.
> **No AI provider is involved anywhere in it, and nothing on the path writes.** Upgrade and
> downgrade rates remain underivable (subscriptions overwrite `tier_id`). Details:
> `07-BUSINESS-RULES.md` §15a/§15b, `02-FEATURE-MAP.md`, `18-SOURCE-MAP.md`,
> `docs/FEEDBACK_LOOPS.md`.

> **Delta 2026-08-01, not yet folded into the sections below:** (1) **The release strategy
> shipped end to end** (`CRWN_UPDATED_RELEASE_STRATEGY.md`): `src/lib/membershipStrategy.ts` is
> the pure deterministic brain (The Release Club vs The Vault Membership; spec tier names are
> ROLES mapped onto the pinned Bronze/Silver/Gold/Platinum rungs), `/api/artist/strategy` derives
> it on read (only the artist's override + two declared facts persist:
> `schema-phase2-membership-strategy.sql`), `StrategyCard` sits on the command screen.
> **Content classes** (free forever / paid first / member only) are now the ONE track access
> control in `TrackUploadForm`, encoded by `fieldsForClass()` onto the existing fields; the old
> free+early-access toggle combo (which locked a track for EVERYONE during the window) is
> unrepresentable. **The release waterfall** ("higher tiers first", `src/lib/waterfall.ts`,
> `tracks.waterfall`, `schema-phase2-track-waterfall.sql`) is opened ADDITIVELY by the daily
> scheduled-releases cron; the entitlement gate is untouched by design. **Live-session
> templates** (`src/lib/liveSessionTemplates.ts`, 7 formats) prefill the live form. The Quest
> Engine stays dark until the quest catalog is realigned to this vocabulary (plan in TODO "On
> Claude's plate"). (2) **Money-path guards landed** (see CHANGELOG 2026-08-01): platform
> checkout refuses a second subscription (Stripe is the authority, `isPlatformPlanSubscription`
> matches the PRICE), "Start Free" refuses while a paid plan exists, phantom plans self-heal via
> `platformPlanReconcile` on the billing screen, test-mode Stripe events are refused against the
> production DB, and `profiles.platform_tier` DOES NOT EXIST (three silent writes deleted).
> (3) **Plan limits are real or gone**: members uncapped everywhere, the 50-track Launch cap is
> a DB trigger, the email quota is enforced at create + send via `src/lib/emailQuota.ts`.
> (4) **Support chat**: assistant tries first, faults never lock the thread, "New question"
> starts a fresh one, sessions end with a survey (`schema-phase2-support-chat-resolution.sql`),
> offline guide-fallback answers when DeepSeek is down, admins see fault reasons inline.

> **Delta 2026-07-31, not yet folded into the sections below:** (1) **SMS was REMOVED entirely** (founder decision: A2P 10DLC compliance cost not worth it). `src/lib/twilio.ts`, all `/api/sms/*` routes, the `sms-reset` cron, `/api/admin/twilio-health`, `SmsSetup`, the CRM SMS tab, SMS limits in `platformTier.ts`, all SMS marketing mentions, the lead-capture SMS consent checkbox, the fan SMS toggle and Terms §13 are gone; the `sms_*` tables stay dormant for consent history; `TWILIO_*` env vars are dead; founder hot-lead alerts are EMAIL always (joshn.wms@gmail.com) with an optional carrier email-to-SMS gateway via `FOUNDER_ALERT_SMS_EMAIL` (plain Resend). (2) **A support system SHIPPED**: `/support` is a help center (search over the 14 getting-started guides, live chat, contact form CCing the founder with auto-captured context); chat tables `support_conversations`/`support_messages` (`schema-phase2-support-chat.sql`, PENDING; form fallback until run); reads via RLS + realtime, writes via service-role (`/api/support/chat` user side, `/api/admin/support-chat` requireAdmin); AI answers from DeepSeek `deepseek-chat` over `src/lib/supportKnowledge.ts`; escalation to `human_requested` emails the founder a link to `/admin?tab=support` (SupportChatView), whose replies email the user; a global `BugReportButton` (root layout, hidden on auth/setup) posts bug reports to `/api/support`; announced via the one-time `announce_support_chat` popup.

> **Delta 2026-07-30 (Tier 1 launch journey), not yet folded into the sections below:** the unified calculator now asks `monetization_status`; a qualified artist can request an immediate founder call below the pre-signup builder (`/api/lead-magnets/call-request`: server-recomputed `scoreLead`, one alert/phone/day (SMS at ship time; EMAIL since the 2026-07-31 SMS removal, see the delta above), CRM record in the admin Calls tab); fan-contact import requires a versioned permission attestation; imported contacts become invitable through the EXISTING campaign sender (`campaigns.filters.audience='contacts'`, LIVE — `schema-phase2-fan-invites.sql` applied 2026-07-30, same day as the funnel-events and prospect-nurture migrations); `/offers/new`'s done screen is now the launch transition (Stripe prompt + import/invite/copy-link); `funnel_events` grew to 20 stages ending at `first_paid_conversion`. Details: `CHANGELOG.md` 2026-07-30.

> Single-file, compressed context pack for uploading into ChatGPT or another AI. Rewritten (not concatenated) from the full CRWN Brain. Reflects branch `master`, commit `86e3e8c` (2026-07-29). Certainty labels: `Confirmed` / `Strongly inferred` / `Unclear` / `Needs founder confirmation`. **The code is the source of truth; the repo's `PRD.md` is stale on pricing/AI provider/booking/onboarding.**

## 1. What CRWN is
CRWN ("Crown", thecrwn.app) is a **music-monetization SaaS** for independent artists to sell subscriptions, tracks, albums, products, and experiences **directly to fans**, owning the fan relationship + data. It has grown into a full artist growth suite: monetization + email marketing (SMS removed 2026-07-31) + CRM + referral/recruiter acquisition + gamified engagement + live streaming + team revenue-splits + an AI manager. **Live in production**, large and layered (241 API routes, 25 crons, 134 migrations, 115 pages). Current frontier is the **Opportunity Funnel** (18 public calculator tools → value-before-signup builders → one post-signup journey resolver → a live experiments engine); the Quest Engine / Rise Mode is built but still dark. **`npm test` runs 820 vitest tests across 50 files (a moving figure: run it), covering the pure business layers only** (no component/integration/e2e), so `npm run build` remains the gate for everything else. `npm run lint` is not a gate (~635 pre-existing errors). `Confirmed`.

Users: **Fan** (subscribes/buys/promotes), **Artist** (publishes/monetizes), **Admin** (operator), plus overlay actors **Recruiter/Partner** (refer artists for commission) and **Collaborator** (Team Splits). `profiles.role = fan|artist|admin`.

## 2. Architecture
Next.js 16 (App Router, mostly `'use client'` pages) on Vercel · Supabase (Postgres/Auth/Storage/Realtime, RLS) · Stripe Connect · Cloudflare R2 (audio/VOD) · LiveKit (live) · Resend (email) · **DeepSeek** (AI Manager + admin agent + /support chat, via `openai` SDK) + narrow **OpenAI** `gpt-4o-mini`. No Redux/RQ — **React Context** (`AuthProvider`/`PlayerProvider`/`ToastProvider`) + **direct Supabase queries in custom hooks**. Business logic in `/api/` route handlers + `src/lib/*`. No third-party analytics/error-monitoring. `Confirmed`.

**Two Supabase clients (critical):** anon+RLS (browser/components) vs service-role (API routes only, bypasses RLS, copy-pasted per route — no shared factory). Middleware protects *pages* and **excludes `/api/`**, so every API route self-authenticates.

Directory: `src/app/{(auth),(main),(public),[slug],api,setup,admin,+top-level features}` · `src/components/{24 feature folders + ui + shared + layout}` · `src/hooks` · `src/lib/{ai,auth,emails,livekit,quests,r2,storage,stripe,supabase,teamSplits}` + `platformTier.ts`, `webhookHandlers.ts`, `apiAuth.ts` · `src/types` · `supabase/*.sql` (manual) · root `*.mjs`/`videos/` are **content tooling, not app code**.

## 3. Roles & permissions
- `profiles.role` frozen at column level — a client cannot self-promote. fan→artist is a **server-side trigger on artist publish** (`trg_promote_to_artist`). Never add a client `profiles.update({role})`.
- "Is an artist" for gating derives from the **`artist_profiles` row existing**, not `profile.role` (context lags a token refresh).
- Admin enforced **server-side on every `/api/admin/*` route** (`requireAdmin`); the `/admin` page's client check is UX-only.
- Artist ownership via `requireArtistOwner`/`getOwnedArtistIds` (⚠️ shared helper adopted by only ~3/195 routes; most hand-roll it). Fans scoped to `fan_id=user.id`. Content entitlement proven server-side via redacting views, never client flags.
- RLS is **per-table opt-in**; money tables were retrofitted after being created directly in prod.

## 4. Database (Postgres/Supabase, 134 manual migrations)
Key tables: `profiles` (role/display_name/avatar_url) · `artist_profiles` (slug/banner_url/stripe_connect_id/platform_tier/setup_completed/acquisition_source/activation_milestones; **id ≠ user_id**) · `tracks`/`albums`/`album_tracks`(**track_number**)/`playlists`/`playlist_tracks`(**position**) · `products`/`bundle_items`/`purchases` · `subscription_tiers`/`tier_benefits`/`subscriptions` (UNIQUE fan_id+artist_id, status incomplete|active|past_due|canceled|paused) · **money ledger** `earnings`/`referrals`/`referral_earnings`/`fan_payouts`/`processed_webhook_events`/`recruiters` · `team_split_*` (deals/deliverables/earnings/payouts/disputes) · community `community_posts`/`community_channels` (+ legacy `posts`) · `dm_conversations`/`dm_messages` · `notifications` · gamification `missions`/`squads`/`clip_bounties`/`city_unlocks`/`road_campaigns`/`proof_of_demand`/quest engine · marketing `campaigns`/`sequences`/`smart_links`/`sms_*` (dormant since the 2026-07-31 SMS removal, kept for consent history)/`crm_*`/`platform_sequences` · live `live_sessions`/`vod_markers` · admin/agent `admin_settings`(feature-flag KV)/`agent_*`.

Column facts: `display_name`/`avatar_url`/`role` on **profiles**; `slug`/`banner_url`/`stripe_connect_id`/`setup_completed` on **artist_profiles**. Content model: `is_free` + `allowed_tier_ids` (JSONB) + `price` (cents); legacy `access_level` enum still present but dead. Soft-delete = `is_active=false` (SELECT policies need owner override). Redacting views: `tracks_public`, `community_posts_feed`, `artist_profiles_public`. Entitlement oracles `can_play_track`/`can_read_community_post` (SECURITY DEFINER).

**⚠️ CRITICAL:** `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters` have **no CREATE TABLE migration** (created directly in prod) — the repo can't rebuild the schema. Every migration ends with a `DO $$…RAISE EXCEPTION…$$` self-verify block; applied manually by the founder.

## 5. Main features (status)
Production-ready: auth + `/welcome` + `/setup` wizard (one field/screen, DB-derived completion, hard gate) · public artist pages `/[slug]` · music/albums/playlists · fan subscriptions + track/product/booking/live-ticket purchases · discount codes · content gating · Stripe Connect payouts · Team Splits · email campaigns + sequences + CRM + segments + smart-links/pre-save · DMs + voice notes · notifications (no push) · community feed + channels · live streaming + VOD (LiveKit) · analytics/pipeline/funnel (admin) · AI Manager (Pro+) · gamified toolkit (missions/squads/bounties/city-unlocks/road-campaigns/proof-of-demand/earn/impact/command) · recruiter/partner acquisition · PWA · **Opportunity Funnel** (18 public lead-magnet tools at `/tools/[slug]`, value-before-signup builders, ONE post-signup journey resolver, experiments engine ON with `oyf-signup-timing-v1` running) · prospect nurture for email-only leads · Founder Window · revenue ramp.

**The Unified Opportunity Calculator** (`/tools/opportunity-calculator`, live 2026-07-29) is the 18th tool and the only all-in-one one. The other 17 each model ONE opportunity honestly; summing their headlines is dishonest because they are all built on the same audience (at 500k followers they sum to ~$550k/mo and 23,500 payers, against a model that says 2,250 ever pay). So it does not sum them: **one** normalized audience (`max`, never a sum; owned contacts by inclusion-exclusion), **one** unique paying-supporter count, **one** membership ladder with the Vault as its middle **tier**, Share-to-Earn and Clip-to-Earn as **acquisition** (a supporter + attribution split, never a revenue line), and tickets/seats sold **only** to non-members so a member is never also a buyer. Recurring and one-time stay separate; gross never mixes with net; current direct revenue is **subtracted**. 82 tests assert it. `src/lib/opportunity/unifiedModel.ts`, spec `docs/UNIFIED_OPPORTUNITY.md`. No migration, no flag.

Experimental/dark-launched: **Quest Engine/Rise Mode** (flag `admin_settings.quest_engine` off) · admin autonomous agent · Executive Producer Sessions (`producer_sessions`) · live tips (`live_tips`) · Royalty Readiness (`royalty_readiness`) · pop-up engine (`popup_engine`) · **Scale** plan (billable once its Stripe prices + env vars exist) · "coming soon" benefit items.
Legacy/dead: `artist/[slug]/*` duplicate subroutes (drifting) · legacy `access_level`/`useContentAccess` · Calendly booking components (unused; booking tokens are the live flow) · `OnboardingTaglineStep` · dead barrel files. (The `empire` tier was fully deleted 2026-07-31; `resolveTierKey()` aliases stray `label`/`empire` strings to `scale`.)

## 6. Business rules (source-cited in 07-BUSINESS-RULES)
- **Cents everywhere.** Input `Math.round(val*100)`; display `(price/100).toFixed(2)`.
- **Platform tiers/fees (SoT `src/lib/platformTier.ts` `TIER_LIMITS`; repriced 2026-07-31 per `CRWN_PRICING STRATEGY.md`):** **Launch**(`starter`) $0 **12%**, 50 tracks, 250 members/contacts, 1 email campaign/mo · **Pro $49/mo or $490/yr, 8%**, unlimited tracks/members, 20 email campaigns/mo · **Scale**(`scale`, renamed from the spec-only `label` $99 concept) $199/mo or $1,990/yr, **5%**, 100 email campaigns/mo, assisted migration, team permissions. `empire` is deleted; `resolveTierKey()` aliases stray `label`/`empire` to `scale`; `formatTierName()` maps `starter` to "Launch". Both `pro` and `scale` are in the platform-checkout whitelist, and the route verifies the live Stripe price amount against `TIER_PRICING` before checkout. Break-evens: Pro beats Launch above $1,225/mo GMV; Scale beats Pro above $5,000/mo GMV. **There is NO founding-artist override** (retired 2026-07-15, code removed; `getArtistFeePercent` returns the tier fee, full stop, and nothing writes `is_founding_artist`). **Fan-tier cap counts PAID tiers only, and is 3 on EVERY plan**, so the recommended four-rung ladder (free Bronze + $10 + $25 + $100) fits any plan; tier count is no longer a Pro paywall. PRD's $50/$175/$350 is stale.
- **Fan money:** platform-account subscriptions/prices; `transfer_data.destination` for Connect; subs `application_fee_percent`, one-time `application_fee_amount`; fee formula copy-pasted 8+ places (rate centralized). Never pass `stripeAccount` to subscription calls. Metadata `fan_id/artist_id/tier_id`|`product_id`. Checkout checks `data.url`.
- **Subscriptions:** UNIQUE(fan_id,artist_id) → resubscribe=upsert; free tier bypasses Stripe (direct upsert); upgrade immediate, downgrade deferred (writes `pending_tier_id`; Stripe-side application unverified); pause=`pause_collection` 30d; cancel=`cancel_at_period_end` + reasons.
- **Payouts:** weekly cron pays full Connect balance (no fee); manual cashout $2; fan/team-split cashout $25 min via atomic RPCs, separate ledgers.
- **Referral/clipper:** artist-funded `attributedCut` on top of platform fee; `referrals` shared fan/clipper via `source`.
- **Team Splits:** percentage sets rate, cap sets max, net-basis, fenced source only (unfenceable = $0); accrual cron holds 7d; artist-only release; disputes freeze.
- **Webhook** (signed, idempotent via `processed_webhook_events`): checkout.completed → earnings + notify + milestones + referral + sequences; refunds claw back commission.
- **Marketing limits:** Email campaigns Launch 1 / Pro 20 / Scale 100 per mo (2026-07-31 repricing). (SMS and its limits were removed 2026-07-31.)
- **Onboarding:** signup→`/welcome`→`/setup`; role promotion server-side; completion DB-derived; onboarding tiers backfill Stripe prices after connect.

## 7. Design & UX
Dark-only, black + gold `#D4AF37`, "flat dark", gold=interactive, dividers over borders, mobile-first, Inter, lucide icons, recharts. Tailwind v4 CSS-first (no config file); tokens in `globals.css`. **Reuse `OptionSelect`** (pick-one-of-3+ dropdowns), **`Wizard`** (multi-step), `ConfirmModal`, `EmptyState`, `Skeleton`. Context toasts. driver.js tours. PWA (bump `sw.js` CACHE_NAME per frontend change; no push).
UX rules: no em dashes anywhere; internal nav `router.push`; back = `smartBack(router, fallback)`; Rise-Mode flows honor `?returnTo=`.
⚠️ Known drift: **`bg-crwn-card` used in 56 files is an UNDEFINED token** (use `bg-crwn-surface`); color `#0f0f0f`(var) vs `#0D0D0D`(hardcoded/docs); `--font-geist-sans` leftover (verify Inter renders); two stagger mechanisms; legacy `access_level` still in TS types.

## 8. Coding conventions
Components PascalCase `.tsx`; lib/hooks/types camelCase `.ts`; routes kebab-case. `@/` alias only. Build-safe env fallbacks (`|| 'dummy-...-for-build'`), never `!`. Errors → `console.error` + 500 (no Sentry). Comment the *why* on non-obvious money/security code. Reset form state with EVERY field. Handle `user?.id`, `.maybeSingle()` null. Workflow: `npm run build` (must pass) → commit → push; migrations manual + self-verify block; **run build/git inside WSL here**.

## 9. Integrations
Supabase, Stripe (platform+Connect, webhook signed+idempotent), R2 (audio now private + 1hr signed URLs), LiveKit (token-gated, egress→VOD, webhook signed), Resend (email; **webhook NOT signed**), DeepSeek+OpenAI (DeepSeek also powers the /support chat since 2026-07-31). **Twilio removed 2026-07-31** (SMS feature deleted; `TWILIO_*` env vars dead). Unused/absent: `react-calendly` (orphaned), `@google/genai` (scaffolded, app doesn't import), DiceBear (seed only), no analytics vendor. Vercel crons (≤daily, 24 after `sms-reset` was deleted), each `CRON_SECRET`-gated.

## 10. Security (see 11-SECURITY for grading)
Strong controls: frozen role/tier/Stripe-id columns, server-side admin + role promotion, entitlement oracles + redacting views, signed idempotent Stripe webhook, atomic cashout RPCs, DB rate limiting, upload validation, daily RLS + onboarding canaries.
🔴 HIGH open: (1) unauthenticated Resend inbound webhooks mutate suppression/opt-in state (the Twilio inbound webhook was deleted 2026-07-31 with SMS); (2) `NEXT_PUBLIC_CRON_SECRET` client-bundled mirrors `CRON_SECRET` (gates payout crons) + `/api/ai-manager/generate` no ownership check.
🟠 MED: low ownership-helper adoption; `/api/platform/limits` unauthenticated; `booking-checkout` trusts client `artistId`.
✅ Fixed (don't reopen): `/api/audience` fan-email leak, paid-track audio leak, entitlement-oracle outage.
Privacy: PII exposed only to owning artist/admin; visitor tracking is hashed IP:UA; no user-facing hard-delete/GDPR path found; no CSP/HSTS in-repo.

## 11. Current state & open questions
Complete: core money loop, content, payments, marketing, live, community, admin/AI, support system (2026-07-31; chat storage migration pending). Removed: SMS (2026-07-31); `empire` tier (deleted 2026-07-31). Partial: downgrade Stripe-schedule, playbooks. Dark-launched: Quest Engine, autonomous agent; Scale plan billable once its Stripe prices + env vars exist. Dead/duplicated: `artist/[slug]` dupes, `access_level`, Calendly components. No tests.
**Biggest founder questions:** ~~confirm live pricing~~ (resolved 2026-07-31: Launch $0 12% / Pro $49 8% / Scale $199 5%); ship Quest Engine? activate the recruiter program? get money-table schema dump; fix the 2 HIGH security items; is downgrade wired to Stripe? which social layer is live? account-deletion/GDPR required?

## 12. AI agent operating rules (condensed)
1. Grep before building (duplication is a known problem). 2. Use the source of truth (`TIER_LIMITS`/`getArtistFeePercent`; `05-DATABASE` for columns). 3. Service-role client = `/api/` only, always with an ownership/session check. 4. Never client-`profiles.update({role})`. 5. Stripe platform/Connect discipline; cents; complete metadata; checkout uses `data.url`. 6. Gate via `is_free`/`allowed_tier_ids` + entitlement views, never TS. 7. Migrations: don't run them; end with a self-verify block; enable RLS + owner override; keep canaries in sync. 8. No em dashes; `OptionSelect`/`smartBack`/`?returnTo`; `bg-crwn-surface`. 9. Verify webhook signatures. 10. `npm run build` (WSL) is the only test gate. 11. Label uncertainty; propose before touching money/entitlement/pricing or enabling dark-launched features. 12. Update the Brain + CHANGELOG after changes.

---
*Full detail in the numbered docs `00`–`18`. For routine tasks use `CRWN-BRAIN-QUICK-CONTEXT.md`.*
