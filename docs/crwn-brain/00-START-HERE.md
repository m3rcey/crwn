# 00 — START HERE (CRWN Brain)

> The master entry point for any AI agent working on CRWN. Load this first. It is concise on purpose; each section links to a detailed doc. Generated at branch `master`, commit `614b958`. Certainty labels (`Confirmed` / `Strongly inferred` / `Unclear` / `Needs founder confirmation`) are used throughout the package.

## What CRWN is
CRWN ("Crown", `thecrwn.app`) is a **Fan Economy Operating System** for independent artists: it runs the business of the identifiable minority of fans who pay, keep paying, participate and bring others. Concretely it sells subscriptions, tracks, albums, products and experiences **directly to fans**, owns the fan relationship and data, and then decides what the artist should do next from that evidence. The category is RATIFIED (doc 23) and expressed outwardly through `../POSITIONING.md`; **no surface invents its own positioning**, and CRWN is not described as a bundle of tools or as a mashup of other products. `Confirmed`. → `01-PRODUCT-VISION.md`

## Core problem it solves
An artist's most valuable business asset is not the size of their audience but the **economic depth of the small identifiable group inside it who pay**. Almost every tool in their stack measures reach; nothing measures depth, and nothing tells them what is currently limiting it. CRWN owns the direct-to-fan money (recurring subs + one-time sales via Stripe Connect), the first-party fan list, and the evidence loop on top of both. Streaming economics are context, not the pitch: the product does not position streaming as the enemy.

## Primary users
**Fan** (subscribes/buys/promotes) · **Artist** (publishes + monetizes) · **Admin** (CRWN operator) · plus overlay actors: **Recruiter/Partner** (refers artists for commission) and **Collaborator** (revenue-share via Team Splits). Roles: `profiles.role = fan | artist | admin`. → `03-USER-ROLES-AND-PERMISSIONS.md`

## Value proposition
Own your revenue, your subscribers, and your data — with the marketing/analytics/acquisition/AI tooling to grow them — instead of renting an audience from streaming/social. `Strongly inferred`.

## Product maturity
**Live in production.** Core money loop is real and hardened. Codebase is **large and layered** and has grown faster than it's been consolidated (run `find src/app -name route.ts | wc -l` etc. rather than trusting a number written here) — real dead/duplicate code and design-token drift exist. **Current state (2026-08-11): the Zero To One programme Z2 to Z12 is complete.** The spine is the **Constraint Engine** (pure, deterministic, no AI, never writes: it names the ONE thing blocking an artist and returns ONE action), wrapped by **Z3** recommendation-to-outcome linkage, **Z8** tier-transition history, **Z9** artist-specific observed rates, **Z10** privacy-gated cross-artist evidence (admin only, never artist-facing), and **Z11** the Virality Engine V1 (Fan Drives). The Quest Engine / Rise Mode is still dark pending its catalog rewrite. **Run `npm test` for the current suite size** (all in the pure business layers); there is still no component/integration/e2e test, so `npm run build` remains the gate for everything the suite does not reach. → `13-CURRENT-STATE.md`

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
- 🔴 **`NEXT_PUBLIC_CRON_SECRET`** is client-bundled and mirrors `CRON_SECRET` (which gates 25 cron routes incl. payouts).
- ✅ **`/api/ai-manager/generate` ownership: FIXED.** It calls `requireArtistOwner(artistId)` and never trusts a caller-supplied user id. This line used to warn that it had no check; that warning outlived the fix and is retired. Pinned by `src/lib/brainContract.test.ts`.
- 🟠 Low adoption of the shared ownership helper; `/api/platform/limits` unauthenticated; `booking-checkout` trusts client `artistId`.
- ✅ Already fixed (don't reopen): `/api/audience` fan-email leak, paid-track audio leak, entitlement-oracle outage. Money/entitlement paths are canary-monitored. → `11-SECURITY-AND-PRIVACY.md`

## Recommended reading order
1. `00-START-HERE` (this) → 2. `01-PRODUCT-VISION` → 3. `02-FEATURE-MAP` → 4. `03-USER-ROLES` → 5. `04-ARCHITECTURE` → 6. `05-DATABASE` → 7. `06-ROUTES-AND-USER-FLOWS` → 8. `07-BUSINESS-RULES` → 9. `08-DESIGN` + `09-CODING-CONVENTIONS` → 10. `10-INTEGRATIONS` → 11. `11-SECURITY` → 12. `12-ENVIRONMENT` → 13. `13-CURRENT-STATE` → 14. `14-ROADMAP-INFERRED` → 15. `15-AI-AGENT-INSTRUCTIONS` → 16. `16-GLOSSARY` → 17. `17-OPEN-QUESTIONS` → 18. `18-SOURCE-MAP` → 19. `19-ONBOARDING-FLOW` → 20. `20-FIRST-REVENUE-LAUNCH-OFFER` (the settled premium offer, 2026-08-06: layered on the open funnel, activation = first paid member).
For routine work, `CRWN-BRAIN-QUICK-CONTEXT.md` may suffice; to load one file into ChatGPT, use `CRWN-BRAIN-COMBINED.md`.

## Strategy and architecture plans (design only, nothing implemented)
- **`../POSITIONING.md`** (2026-08-10): **the outward-facing source of truth.** Every homepage, calculator, signup, onboarding, sales, nurture and product-copy surface inherits from it, and no surface invents its own positioning. Carries the messaging ladder (one-liner through investor pitch), the five-beat calculator spine, the feature-to-outcome map (no feature is ever the headline), the reach-vs-depth language, and a **binding claim-maturity table** that forbids "CRWN learns from every artist" and every network-effect claim until the underlying system ships. Derived from doc 23; changing a ratified element requires updating doc 23 first.
- **`23-ZERO-TO-ONE-STRATEGY.md`** (2026-08-10, reconciled + partially ratified): the canonical strategic reference. The contrarian truth (an artist's most valuable business asset is not the size of their audience but the economic depth of the identifiable minority within it who pay, keep paying, participate and bring others), the Fan Economy definition, the **RATIFIED** category (**Fan Economy Operating System**) and beachhead (`highest_priority_empire_builder`, narrow acquisition only, never product eligibility), the operating loop (Observe, Diagnose, Direct, Deliver, Learn), the five-layer intelligence progression and its one missing primitive (recommendation to outcome linkage), a skeptical defensibility stack (switching costs today, network effects near zero), and the scorecard (current 4.0/10, potential 7.8/10). Homepage, calculator, onboarding and Manager copy derive from this, never independently. **IMPLEMENTED: Z2 to Z12 all complete (2026-08-11).** The 4.0/10 scorecard inside that doc is the ORIGINAL audit; the post-programme re-score lives in its Z12 section.
- **`24-RECOMMENDATION-OUTCOME-LINKAGE.md`** (2026-08-11): the Z3 evidence primitive, and the missing linkage `23` names. Records what the **Constraint Engine** recommended, whether the artist took the action (via the Quest Engine's own DomainCheck, never a second completion oracle), what the metric read before and later, and whether the constraint cleared. Keeps recommendation / action / observation / outcome as four separate facts: **a completed action is not a successful recommendation**, and `insufficient_evidence` is never success. No threshold is invented (classification re-runs `readConstraint`), no measurement window is invented (they come from `thresholds.ts`, and RETENTION / FIRST_PAID / DEPTH have none, recorded as a limitation), no causal claim is stored, and no financial value is recomputed. One additive table, service-role writes, owner-only RLS reads. **Prospective only, no backfill.** **LIVE: migration applied and production-verified 2026-08-11.**
- **`22-VIRALITY-ENGINE-ARCHITECTURE.md`** (2026-08-10): the canonical Virality Engine design: a repeatable system for mobilizing fans to grow the artist's business, rewarding measurable contribution, and learning which mechanics work. **Orchestration over primitives that already exist** (Missions, Clip Bounties, Fan Squads, City Unlocks, Road To, Proof of Demand, and the Share-to-Earn referral rail). Gated by the Constraint Engine; adds no attribution, no payout path and no invented economics. **V1 LIVE (Z11, 2026-08-11): the thin Campaign spine plus ONE archetype, the Fan Recruitment Drive, migration applied and production-verified. Section 28 of that doc is what actually shipped; everything beyond V1 there is still architecture only.**
- **`../CRWN_UNIFIED_PRODUCT_ARCHITECTURE_PLAN.md`** (2026-08-10): how every intelligence, lifecycle and growth system fits together as one operating architecture: one recommendation authority (the Constraint Engine), the Manager vs Action Plan decision, the communication precedence model, the system-of-record matrix, and the documentation dependency system. **Partially implemented: the recommendation-authority half shipped as Z4/Z5. The communications governor has not.**

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
