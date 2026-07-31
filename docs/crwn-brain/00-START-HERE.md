# 00 — START HERE (CRWN Brain)

> The master entry point for any AI agent working on CRWN. Load this first. It is concise on purpose; each section links to a detailed doc. Generated at branch `master`, commit `614b958`. Certainty labels (`Confirmed` / `Strongly inferred` / `Unclear` / `Needs founder confirmation`) are used throughout the package.

## What CRWN is
CRWN ("Crown", `thecrwn.app`) is a **music-monetization SaaS** for independent artists to sell subscriptions, tracks, albums, products, and experiences **directly to fans**, and to own the fan relationship + data. Positioned as "Skool meets EVEN meets YouTube for musicians." In practice it's grown into a full **artist growth/operations suite**: monetization + email marketing + CRM + referral/recruiter acquisition + gamified fan engagement + live streaming + team revenue-splits + an AI "manager." `Confirmed`. → `01-PRODUCT-VISION.md`

## Core problem it solves
Streaming pays fractions of a cent and hides the fan. CRWN gives artists a **direct-to-fan monetization layer they own** (recurring subs + one-time sales via Stripe Connect) plus first-party fan contact data to market to.

## Primary users
**Fan** (subscribes/buys/promotes) · **Artist** (publishes + monetizes) · **Admin** (CRWN operator) · plus overlay actors: **Recruiter/Partner** (refers artists for commission) and **Collaborator** (revenue-share via Team Splits). Roles: `profiles.role = fan | artist | admin`. → `03-USER-ROLES-AND-PERMISSIONS.md`

## Value proposition
Own your revenue, your subscribers, and your data — with the marketing/analytics/acquisition/AI tooling to grow them — instead of renting an audience from streaming/social. `Strongly inferred`.

## Product maturity
**Live in production.** Core money loop is real and hardened. Codebase is **large and layered** (241 API routes, 25 crons, 134 migrations, 115 pages) and has grown faster than it's been consolidated — real dead/duplicate code and design-token drift exist. Current frontier: the **Opportunity Funnel** (public tools → value-before-signup → journey resolver → experiments, live), with the Quest Engine / Rise Mode still dark. **`npm test` runs 392 vitest tests across 23 files**, all in the pure business layers; there is still no component/integration/e2e test, so `npm run build` remains the gate for everything the suite does not reach. → `13-CURRENT-STATE.md`

## High-level architecture
Next.js 16 (App Router, mostly client components) on Vercel · Supabase (Postgres + Auth + Storage + Realtime, RLS) · Stripe Connect · Cloudflare R2 (audio/VOD) · LiveKit (live) · Resend (email) · DeepSeek + OpenAI (AI). Business logic lives in `/api/` route handlers (service-role) and `src/lib/*`. (Twilio SMS was removed entirely on 2026-07-31.) → `04-ARCHITECTURE.md`

## Most important business rules
- **Money is integer cents.** Input `Math.round(val*100)`, display `(price/100).toFixed(2)`.
- **Platform tiers/fees (code SoT `TIER_LIMITS`; repriced 2026-07-31 per `CRWN_PRICING STRATEGY.md`):** **Launch** (internal key `starter`) free 12% / **Pro $49/mo or $490/yr, 8%** / **Scale** (internal key `scale`, renamed from the old spec-only `label` $99 concept) $199/mo or $1,990/yr, 5%. `empire` is fully deleted; `resolveTierKey()` aliases stray `label`/`empire` strings to `scale`. Every plan allows the same 4-tier fan ladder (free + 3 paid). Break-evens: Pro beats Launch above $1,225/mo GMV, Scale beats Pro above $5,000/mo GMV. **The legal pages (`/artist-agreement`, `/terms`) now state these exact numbers.** **Founding Artist program is RETIRED, code removed** (2026-07-15): no per-artist fee override exists, `getArtistFeePercent` returns the tier fee. A partner code is attribution + a 1-month trial only, no fee cut. (The PRD's $50/$175/$350 pricing is **stale**.)
- **Fan money** routes on the Stripe **platform** account with `transfer_data.destination` + `application_fee`; artist payouts go to Connect Express accounts.
- **Content gating:** `is_free` + `allowed_tier_ids` (+ `price`). Legacy `access_level` is dead.
- **One subscription per (fan, artist)** — resubscribe = upsert.
- **Team Splits** are capped-hybrid on the net-revenue basis, fenced to a specific source. → `07-BUSINESS-RULES.md`

## Most important technical constraints
- **Two Supabase clients:** anon+RLS (components) vs service-role (API routes only, RLS-bypassing).
- **Middleware excludes `/api/`** — every API route self-authenticates.
- **Role promotion is server-side** (trigger on publish); a client `profiles.update({role})` is RLS-rejected.
- **Migrations are manual**, must end with a self-verify block. Cron ≤ daily (Vercel Hobby).
- **Build-safe env fallbacks**, never `!` on env vars. `NEXT_PUBLIC_*` change = full redeploy. Bump `sw.js` `CACHE_NAME` after frontend changes.
- **Run `npm run build` and `git` inside WSL** in this environment (Windows-side git/build misbehave). → `09-CODING-CONVENTIONS.md`, `12-ENVIRONMENT-AND-SETUP.md`

## Most important security warnings
- 🔴 **Unauthenticated webhooks** (`/api/webhooks/resend`, `/api/outreach/webhook`, `/api/outreach/inbound`) mutate suppression/opt-in state without signature checks. (`/api/sms/webhook` was on this list until the SMS feature was removed 2026-07-31.)
- 🔴 **`NEXT_PUBLIC_CRON_SECRET`** is client-bundled and mirrors `CRON_SECRET` (which gates 25 cron routes incl. payouts); `/api/ai-manager/generate` has no ownership check.
- 🟠 Low adoption of the shared ownership helper; `/api/platform/limits` unauthenticated; `booking-checkout` trusts client `artistId`.
- ✅ Already fixed (don't reopen): `/api/audience` fan-email leak, paid-track audio leak, entitlement-oracle outage. Money/entitlement paths are canary-monitored. → `11-SECURITY-AND-PRIVACY.md`

## Recommended reading order
1. `00-START-HERE` (this) → 2. `01-PRODUCT-VISION` → 3. `02-FEATURE-MAP` → 4. `03-USER-ROLES` → 5. `04-ARCHITECTURE` → 6. `05-DATABASE` → 7. `06-ROUTES-AND-USER-FLOWS` → 8. `07-BUSINESS-RULES` → 9. `08-DESIGN` + `09-CODING-CONVENTIONS` → 10. `10-INTEGRATIONS` → 11. `11-SECURITY` → 12. `12-ENVIRONMENT` → 13. `13-CURRENT-STATE` → 14. `14-ROADMAP-INFERRED` → 15. `15-AI-AGENT-INSTRUCTIONS` → 16. `16-GLOSSARY` → 17. `17-OPEN-QUESTIONS` → 18. `18-SOURCE-MAP`.
For routine work, `CRWN-BRAIN-QUICK-CONTEXT.md` may suffice; to load one file into ChatGPT, use `CRWN-BRAIN-COMBINED.md`.

## Before making changes (checklist)
- [ ] Grep for an existing component/lib before creating one (duplication is a known problem).
- [ ] Use the source of truth (`TIER_LIMITS`/`getArtistFeePercent`; `05-DATABASE` for columns).
- [ ] Right Supabase client; ownership/session check on any service-role route.
- [ ] Gate content via `is_free`/`allowed_tier_ids` + entitlement views, never TS.
- [ ] Cents + Stripe platform/Connect discipline; metadata complete.
- [ ] No em dashes; `OptionSelect`/`smartBack`/`?returnTo`; `bg-crwn-surface` not `bg-crwn-card`.

## Before merging changes (checklist)
- [ ] `npm run build` passes clean (WSL).
- [ ] No IDOR/missing auth on new routes; webhooks verify signatures.
- [ ] Migration (if any) not auto-run + ends with a self-verify block; RLS enabled with owner override.
- [ ] Canaries kept in sync if publish/entitlement/upload changed.
- [ ] Bumped `sw.js` `CACHE_NAME` if frontend changed.
- [ ] Updated the relevant Brain doc(s) + `CHANGELOG.md`.

---
*Full operating manual: `15-AI-AGENT-INSTRUCTIONS.md`. Unknowns to resolve with the founder: `17-OPEN-QUESTIONS.md`.*
