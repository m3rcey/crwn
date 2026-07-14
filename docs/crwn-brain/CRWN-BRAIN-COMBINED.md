# CRWN Brain — Combined Context

> Single-file, compressed context pack for uploading into ChatGPT or another AI. Rewritten (not concatenated) from the full CRWN Brain. Reflects branch `master`, commit `614b958`. Certainty labels: `Confirmed` / `Strongly inferred` / `Unclear` / `Needs founder confirmation`. **The code is the source of truth; the repo's `PRD.md` is stale on pricing/AI provider/booking/onboarding.**

## 1. What CRWN is
CRWN ("Crown", thecrwn.app) is a **music-monetization SaaS** for independent artists to sell subscriptions, tracks, albums, products, and experiences **directly to fans**, owning the fan relationship + data. It has grown into a full artist growth suite: monetization + email/SMS marketing + CRM + referral/recruiter acquisition + gamified engagement + live streaming + team revenue-splits + an AI manager. **Live in production**, large and layered (60+ API domains, 25 crons, 117 migrations), current frontier is the dark-launched Quest Engine. **Zero automated tests.** `Confirmed`.

Users: **Fan** (subscribes/buys/promotes), **Artist** (publishes/monetizes), **Admin** (operator), plus overlay actors **Recruiter/Partner** (refer artists for commission) and **Collaborator** (Team Splits). `profiles.role = fan|artist|admin`.

## 2. Architecture
Next.js 16 (App Router, mostly `'use client'` pages) on Vercel · Supabase (Postgres/Auth/Storage/Realtime, RLS) · Stripe Connect · Cloudflare R2 (audio/VOD) · LiveKit (live) · Resend (email) · Twilio (SMS, raw REST) · **DeepSeek** (AI Manager + admin agent, via `openai` SDK) + narrow **OpenAI** `gpt-4o-mini`. No Redux/RQ — **React Context** (`AuthProvider`/`PlayerProvider`/`ToastProvider`) + **direct Supabase queries in custom hooks**. Business logic in `/api/` route handlers + `src/lib/*`. No third-party analytics/error-monitoring. `Confirmed`.

**Two Supabase clients (critical):** anon+RLS (browser/components) vs service-role (API routes only, bypasses RLS, copy-pasted per route — no shared factory). Middleware protects *pages* and **excludes `/api/`**, so every API route self-authenticates.

Directory: `src/app/{(auth),(main),(public),[slug],api,setup,admin,+top-level features}` · `src/components/{24 feature folders + ui + shared + layout}` · `src/hooks` · `src/lib/{ai,auth,emails,livekit,quests,r2,storage,stripe,supabase,teamSplits}` + `platformTier.ts`, `webhookHandlers.ts`, `apiAuth.ts` · `src/types` · `supabase/*.sql` (manual) · root `*.mjs`/`videos/` are **content tooling, not app code**.

## 3. Roles & permissions
- `profiles.role` frozen at column level — a client cannot self-promote. fan→artist is a **server-side trigger on artist publish** (`trg_promote_to_artist`). Never add a client `profiles.update({role})`.
- "Is an artist" for gating derives from the **`artist_profiles` row existing**, not `profile.role` (context lags a token refresh).
- Admin enforced **server-side on every `/api/admin/*` route** (`requireAdmin`); the `/admin` page's client check is UX-only.
- Artist ownership via `requireArtistOwner`/`getOwnedArtistIds` (⚠️ shared helper adopted by only ~3/195 routes; most hand-roll it). Fans scoped to `fan_id=user.id`. Content entitlement proven server-side via redacting views, never client flags.
- RLS is **per-table opt-in**; money tables were retrofitted after being created directly in prod.

## 4. Database (Postgres/Supabase, 117 manual migrations)
Key tables: `profiles` (role/display_name/avatar_url) · `artist_profiles` (slug/banner_url/stripe_connect_id/platform_tier/setup_completed/acquisition_source/activation_milestones; **id ≠ user_id**) · `tracks`/`albums`/`album_tracks`(**track_number**)/`playlists`/`playlist_tracks`(**position**) · `products`/`bundle_items`/`purchases` · `subscription_tiers`/`tier_benefits`/`subscriptions` (UNIQUE fan_id+artist_id, status incomplete|active|past_due|canceled|paused) · **money ledger** `earnings`/`referrals`/`referral_earnings`/`fan_payouts`/`processed_webhook_events`/`recruiters` · `team_split_*` (deals/deliverables/earnings/payouts/disputes) · community `community_posts`/`community_channels` (+ legacy `posts`) · `dm_conversations`/`dm_messages` · `notifications` · gamification `missions`/`squads`/`clip_bounties`/`city_unlocks`/`road_campaigns`/`proof_of_demand`/quest engine · marketing `campaigns`/`sequences`/`smart_links`/`sms_*`/`crm_*`/`platform_sequences` · live `live_sessions`/`vod_markers` · admin/agent `admin_settings`(feature-flag KV)/`agent_*`.

Column facts: `display_name`/`avatar_url`/`role` on **profiles**; `slug`/`banner_url`/`stripe_connect_id`/`setup_completed` on **artist_profiles**. Content model: `is_free` + `allowed_tier_ids` (JSONB) + `price` (cents); legacy `access_level` enum still present but dead. Soft-delete = `is_active=false` (SELECT policies need owner override). Redacting views: `tracks_public`, `community_posts_feed`, `artist_profiles_public`. Entitlement oracles `can_play_track`/`can_read_community_post` (SECURITY DEFINER).

**⚠️ CRITICAL:** `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters` have **no CREATE TABLE migration** (created directly in prod) — the repo can't rebuild the schema. Every migration ends with a `DO $$…RAISE EXCEPTION…$$` self-verify block; applied manually by the founder.

## 5. Main features (status)
Production-ready: auth + `/welcome` + `/setup` wizard (one field/screen, DB-derived completion, hard gate) · public artist pages `/[slug]` · music/albums/playlists · fan subscriptions + track/product/booking/live-ticket purchases · discount codes · content gating · Stripe Connect payouts · Team Splits · email campaigns + sequences + CRM + segments + smart-links/pre-save · DMs + voice notes · notifications (no push) · community feed + channels · live streaming + VOD (LiveKit) · analytics/pipeline/funnel (admin) · AI Manager (Pro+) · gamified toolkit (missions/squads/bounties/city-unlocks/road-campaigns/proof-of-demand/earn/impact/command) · recruiter/partner acquisition · PWA.
Experimental/dark-launched: **Quest Engine/Rise Mode** (flag `admin_settings.quest_engine` off) · admin autonomous agent · `$99 label` tier (hard-disabled) · "coming soon" benefit items.
Legacy/dead: `artist/[slug]/*` duplicate subroutes (drifting) · `empire` tier (wired into live type union, ~20 files) · legacy `access_level`/`useContentAccess` · Calendly booking components (unused; booking tokens are the live flow) · `OnboardingTaglineStep` · dead barrel files.

## 6. Business rules (source-cited in 07-BUSINESS-RULES)
- **Cents everywhere.** Input `Math.round(val*100)`; display `(price/100).toFixed(2)`.
- **Platform tiers/fees (SoT `src/lib/platformTier.ts` `TIER_LIMITS`):** Free(`starter`) $0 **12%** 1 tier · **Pro $9.99/mo 8%** 3 tiers (only billable v1) · `label` $99 5% 10 tiers (spec-only, checkout whitelists `pro`) · `empire` 3% (dead). **Founding artist = flat 5% for 6mo** (`getArtistFeePercent`). PRD's $50/$175/$350 is stale.
- **Fan money:** platform-account subscriptions/prices; `transfer_data.destination` for Connect; subs `application_fee_percent`, one-time `application_fee_amount`; fee formula copy-pasted 8+ places (rate centralized). Never pass `stripeAccount` to subscription calls. Metadata `fan_id/artist_id/tier_id`|`product_id`. Checkout checks `data.url`.
- **Subscriptions:** UNIQUE(fan_id,artist_id) → resubscribe=upsert; free tier bypasses Stripe (direct upsert); upgrade immediate, downgrade deferred (writes `pending_tier_id`; Stripe-side application unverified); pause=`pause_collection` 30d; cancel=`cancel_at_period_end` + reasons.
- **Payouts:** weekly cron pays full Connect balance (no fee); manual cashout $2; fan/team-split cashout $25 min via atomic RPCs, separate ledgers.
- **Referral/clipper:** artist-funded `attributedCut` on top of platform fee; `referrals` shared fan/clipper via `source`.
- **Team Splits:** percentage sets rate, cap sets max, net-basis, fenced source only (unfenceable = $0); accrual cron holds 7d; artist-only release; disputes freeze.
- **Webhook** (signed, idempotent via `processed_webhook_events`): checkout.completed → earnings + notify + milestones + referral + sequences; refunds claw back commission.
- **Marketing limits:** Email Free 1/Pro 10 per mo; SMS Pro+ only, quiet hours 9pm–9am, 1/mo/fan (quiet-hour sends currently dropped, not queued).
- **Onboarding:** signup→`/welcome`→`/setup`; role promotion server-side; completion DB-derived; onboarding tiers backfill Stripe prices after connect.

## 7. Design & UX
Dark-only, black + gold `#D4AF37`, "flat dark", gold=interactive, dividers over borders, mobile-first, Inter, lucide icons, recharts. Tailwind v4 CSS-first (no config file); tokens in `globals.css`. **Reuse `OptionSelect`** (pick-one-of-3+ dropdowns), **`Wizard`** (multi-step), `ConfirmModal`, `EmptyState`, `Skeleton`. Context toasts. driver.js tours. PWA (bump `sw.js` CACHE_NAME per frontend change; no push).
UX rules: no em dashes anywhere; internal nav `router.push`; back = `smartBack(router, fallback)`; Rise-Mode flows honor `?returnTo=`.
⚠️ Known drift: **`bg-crwn-card` used in 56 files is an UNDEFINED token** (use `bg-crwn-surface`); color `#0f0f0f`(var) vs `#0D0D0D`(hardcoded/docs); `--font-geist-sans` leftover (verify Inter renders); two stagger mechanisms; legacy `access_level` still in TS types.

## 8. Coding conventions
Components PascalCase `.tsx`; lib/hooks/types camelCase `.ts`; routes kebab-case. `@/` alias only. Build-safe env fallbacks (`|| 'dummy-...-for-build'`), never `!`. Errors → `console.error` + 500 (no Sentry). Comment the *why* on non-obvious money/security code. Reset form state with EVERY field. Handle `user?.id`, `.maybeSingle()` null. Workflow: `npm run build` (must pass) → commit → push; migrations manual + self-verify block; **run build/git inside WSL here**.

## 9. Integrations
Supabase, Stripe (platform+Connect, webhook signed+idempotent), R2 (audio now private + 1hr signed URLs), LiveKit (token-gated, egress→VOD, webhook signed), Resend (email; **webhook NOT signed**), DeepSeek+OpenAI, Twilio (Pro+, dev-stubbed; status webhook signed, inbound NOT). Unused/absent: `react-calendly` (orphaned), `@google/genai` (scaffolded, app doesn't import), DiceBear (seed only), no analytics vendor. 25 Vercel crons (≤daily), each `CRON_SECRET`-gated.

## 10. Security (see 11-SECURITY for grading)
Strong controls: frozen role/tier/Stripe-id columns, server-side admin + role promotion, entitlement oracles + redacting views, signed idempotent Stripe webhook, atomic cashout RPCs, DB rate limiting, upload validation, daily RLS + onboarding canaries.
🔴 HIGH open: (1) unauthenticated Resend/Twilio inbound webhooks mutate suppression/opt-in state; (2) `NEXT_PUBLIC_CRON_SECRET` client-bundled mirrors `CRON_SECRET` (gates payout crons) + `/api/ai-manager/generate` no ownership check.
🟠 MED: low ownership-helper adoption; `/api/platform/limits` unauthenticated; `booking-checkout` trusts client `artistId`.
✅ Fixed (don't reopen): `/api/audience` fan-email leak, paid-track audio leak, entitlement-oracle outage.
Privacy: PII exposed only to owning artist/admin; visitor tracking is hashed IP:UA; no user-facing hard-delete/GDPR path found; no CSP/HSTS in-repo.

## 11. Current state & open questions
Complete: core money loop, content, payments, marketing, live, community, admin/AI. Partial: SMS deferral, downgrade Stripe-schedule, playbooks. Dark-launched: Quest Engine, `$99` tier, autonomous agent. Dead/duplicated: `empire` tier, `artist/[slug]` dupes, `access_level`, Calendly components. No tests.
**Biggest founder questions:** confirm live pricing; ship Quest Engine? activate `$99`/recruiter program? get money-table schema dump; fix the 2 HIGH security items; is downgrade wired to Stripe? which social layer is live? account-deletion/GDPR required?

## 12. AI agent operating rules (condensed)
1. Grep before building (duplication is a known problem). 2. Use the source of truth (`TIER_LIMITS`/`getArtistFeePercent`; `05-DATABASE` for columns). 3. Service-role client = `/api/` only, always with an ownership/session check. 4. Never client-`profiles.update({role})`. 5. Stripe platform/Connect discipline; cents; complete metadata; checkout uses `data.url`. 6. Gate via `is_free`/`allowed_tier_ids` + entitlement views, never TS. 7. Migrations: don't run them; end with a self-verify block; enable RLS + owner override; keep canaries in sync. 8. No em dashes; `OptionSelect`/`smartBack`/`?returnTo`; `bg-crwn-surface`. 9. Verify webhook signatures. 10. `npm run build` (WSL) is the only test gate. 11. Label uncertainty; propose before touching money/entitlement/pricing or enabling dark-launched features. 12. Update the Brain + CHANGELOG after changes.

---
*Full detail in the numbered docs `00`–`18`. For routine tasks use `CRWN-BRAIN-QUICK-CONTEXT.md`.*
