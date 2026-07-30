# CRWN Brain — Quick Context

> Short context for routine tasks. If you need depth, load `CRWN-BRAIN-COMBINED.md` or the numbered docs. Reflects commit `86e3e8c` (2026-07-29).

## What it is
CRWN (thecrwn.app) = music-monetization SaaS. Independent artists sell subscriptions + tracks/albums/products/experiences directly to fans via Stripe Connect, and own the fan CRM. Also bundles marketing automation, gamified engagement, live streaming, team revenue-splits, an AI manager, and an acquisition funnel of 18 public calculator tools. **Live and large.** `npm test` = 392 vitest tests, but they cover the **pure business layers only** (no component/integration/e2e), so `npm run build` is still the gate for everything else. `npm run lint` is not a gate (~635 pre-existing errors).

## Roles
`profiles.role = fan | artist | admin`. Overlay actors: recruiter/partner (refer artists), collaborator (Team Splits). Role is frozen at the column level; fan→artist promotion is a **server-side trigger on publish** — never client-`update({role})`.

## Architecture
Next.js 16 App Router (mostly client components) on Vercel · Supabase (Postgres/Auth/Storage/Realtime + RLS) · Stripe Connect · Cloudflare R2 (audio/VOD) · LiveKit (live) · Resend (email) · Twilio (SMS) · DeepSeek/OpenAI (AI). State = React Context + direct Supabase queries in hooks. No tests, no analytics vendor.

**Two Supabase clients:** anon+RLS (components) vs service-role (API routes only, bypasses RLS). Middleware excludes `/api/` → every API route self-authenticates + checks ownership.

## Key directories
`src/app/` (routes; `[slug]` = canonical artist pages; `api/` 241 handlers incl. 25 crons) · `src/components/` (24 feature folders + `ui/` primitives) · `src/hooks/` · `src/lib/` (`platformTier.ts` fees, `webhookHandlers.ts`, `apiAuth.ts`, `stripe/`, `supabase/`, `teamSplits/`, `ai/`, `quests/`) · `src/types/index.ts` · `supabase/*.sql` (manual migrations). Root `*.mjs`/`videos/` = content tooling, NOT app code.

## Most important business rules
- **Cents everywhere:** input `Math.round(val*100)`, display `(price/100).toFixed(2)`.
- **Platform tiers/fees (SoT `TIER_LIMITS`):** Free 12% / **Pro $9.99 8%** (only billable) / $99 `label` 5% (spec) / `empire` dead. **No founding-artist override exists** (retired 2026-07-15; `getArtistFeePercent` returns the tier fee, full stop). (PRD pricing is stale.)
- **Stripe:** subscriptions/prices on **platform** account; `transfer_data.destination` for Connect; never pass `stripeAccount` to subscription calls; metadata `fan_id/artist_id/tier_id`; checkout checks `data.url`.
- **Content gating:** `is_free` + `allowed_tier_ids` + `price`. Legacy `access_level` is DEAD.
- **Subscriptions:** UNIQUE(fan_id, artist_id) → resubscribe = upsert; free tier bypasses Stripe.
- **Column locations:** `display_name`/`avatar_url`/`role` on `profiles`; `slug`/`banner_url`/`stripe_connect_id` on `artist_profiles`. `album_tracks.track_number`, `playlist_tracks.position`.

## Design & UX conventions
Dark-only, gold `#D4AF37`, flat, mobile-first, Inter, lucide, recharts, Tailwind v4 (no config file). Reuse `OptionSelect` (pick-one-of-3+ = dropdown), `Wizard`, `ConfirmModal`, `EmptyState`, `Skeleton`. **No em dashes.** Internal nav `router.push`; back = `smartBack(router, fallback)`; Rise-Mode flows honor `?returnTo=`. ⚠️ Use `bg-crwn-surface`, NOT the undefined `bg-crwn-card`.

## Coding conventions
Components PascalCase; lib/hooks camelCase; routes kebab-case; `@/` alias. Build-safe env fallbacks (`|| 'dummy-...-for-build'`), never `!`. Reset form state with EVERY field. Errors → `console.error` + 500. Migrations: manual, end with a `DO $$…RAISE EXCEPTION…$$` self-verify block. Bump `sw.js` `CACHE_NAME` after frontend changes. **Run `npm run build` + `git` inside WSL here.**

## Security must-knows
- Service-role client = `/api/` only + ownership check (no IDOR).
- Verify webhook signatures (Stripe/LiveKit/Twilio-status do; Resend + Twilio-inbound DON'T — known HIGH gap).
- `NEXT_PUBLIC_CRON_SECRET` is a known HIGH risk (client-bundled, mirrors `CRON_SECRET`).
- Entitlement is server-side (redacting views), never TypeScript.
- Fixed already: `/api/audience` email leak, paid-audio leak.

## Acquisition funnel must-knows
- **18 public tools** at `/tools/[slug]` (registry `src/lib/leadMagnets/registry.ts` + adapters `src/lib/acquisition/toolAdapters.ts`). Page order is fixed: result → transition → **builder** → save boundary. The builder IS the CTA; never put a signup link or email gate before it.
- **The 18th is the all-in-one Opportunity Calculator** and it is the one that must never be broken casually: it models every opportunity in ONE layered model so the same fan, subscriber and dollar cannot be counted twice. **Never add tool headlines together.** Share-to-Earn and Clip-to-Earn are acquisition, not revenue; the Vault is a membership TIER, not a second membership; tickets and seats sell only to non-members. 82 tests enforce this (`src/lib/opportunity/`). Spec: `docs/UNIFIED_OPPORTUNITY.md`.
- **Every tool's `fix` must point to a feature that ACTUALLY exists.** This convention has already failed once in production.
- New tool = registry entry + adapter + a `DeliverableSpec`, or the coverage guard test fails.
- **The Tier 1 launch journey (2026-07-30):** the calculator asks `monetization_status`; a qualified artist can request an immediate founder call from BELOW the builder (`/api/lead-magnets/call-request` recomputes qualification server-side, one SMS/phone/day to server-only `FOUNDER_ALERT_PHONE`); fan-contact import requires a versioned permission attestation; imported contacts get invited through the EXISTING campaign sender (`filters.audience='contacts'`, LIVE — `schema-phase2-fan-invites.sql` applied 2026-07-30); `funnel_events` now has 20 stages ending at `first_paid_conversion` (migration applied 2026-07-30).

## Required workflow before changing code
1. Grep for an existing component/lib (avoid duplication).
2. Use the source of truth for fees/limits/columns.
3. Pick the correct Supabase client; add ownership/session check on service-role routes.
4. Keep cents + Stripe platform/Connect discipline; gate via `is_free`/`allowed_tier_ids`.
5. `npm run build` must pass (WSL). Don't push a broken build.
6. If unsure about money/entitlement/pricing or enabling a dark-launched feature (Quest Engine), propose first.

---
*Deeper: `CRWN-BRAIN-COMBINED.md` · full docs `00`–`18` · unknowns `17-OPEN-QUESTIONS.md`.*
