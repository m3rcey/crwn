# CRWN Brain — Quick Context

> Short context for routine tasks. If you need depth, load `CRWN-BRAIN-COMBINED.md` or the numbered docs. Reflects commit `614b958`.

## What it is
CRWN (thecrwn.app) = music-monetization SaaS. Independent artists sell subscriptions + tracks/albums/products/experiences directly to fans via Stripe Connect, and own the fan CRM. Also bundles marketing automation, gamified engagement, live streaming, team revenue-splits, and an AI manager. **Live, large, untested.**

## Roles
`profiles.role = fan | artist | admin`. Overlay actors: recruiter/partner (refer artists), collaborator (Team Splits). Role is frozen at the column level; fan→artist promotion is a **server-side trigger on publish** — never client-`update({role})`.

## Architecture
Next.js 16 App Router (mostly client components) on Vercel · Supabase (Postgres/Auth/Storage/Realtime + RLS) · Stripe Connect · Cloudflare R2 (audio/VOD) · LiveKit (live) · Resend (email) · Twilio (SMS) · DeepSeek/OpenAI (AI). State = React Context + direct Supabase queries in hooks. No tests, no analytics vendor.

**Two Supabase clients:** anon+RLS (components) vs service-role (API routes only, bypasses RLS). Middleware excludes `/api/` → every API route self-authenticates + checks ownership.

## Key directories
`src/app/` (routes; `[slug]` = canonical artist pages; `api/` ~190 handlers incl. 25 crons) · `src/components/` (24 feature folders + `ui/` primitives) · `src/hooks/` · `src/lib/` (`platformTier.ts` fees, `webhookHandlers.ts`, `apiAuth.ts`, `stripe/`, `supabase/`, `teamSplits/`, `ai/`, `quests/`) · `src/types/index.ts` · `supabase/*.sql` (manual migrations). Root `*.mjs`/`videos/` = content tooling, NOT app code.

## Most important business rules
- **Cents everywhere:** input `Math.round(val*100)`, display `(price/100).toFixed(2)`.
- **Platform tiers/fees (SoT `TIER_LIMITS`):** Free 12% / **Pro $9.99 8%** (only billable) / $99 `label` 5% (spec) / `empire` dead. Founding artist flat 5%. (PRD pricing is stale.)
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

## Required workflow before changing code
1. Grep for an existing component/lib (avoid duplication).
2. Use the source of truth for fees/limits/columns.
3. Pick the correct Supabase client; add ownership/session check on service-role routes.
4. Keep cents + Stripe platform/Connect discipline; gate via `is_free`/`allowed_tier_ids`.
5. `npm run build` must pass (WSL). Don't push a broken build.
6. If unsure about money/entitlement/pricing or enabling a dark-launched feature (Quest Engine), propose first.

---
*Deeper: `CRWN-BRAIN-COMBINED.md` · full docs `00`–`18` · unknowns `17-OPEN-QUESTIONS.md`.*
