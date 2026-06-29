# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Problem-Solving Principles

Three tools. Each answers a different question. Use the one that matches.

WHEN EXECUTING EACH AND EVERY PROMPT, EXECUTE THIS PROCESS:
{
**"Which of these should I do first?"** → Most-critical-first.
When you have a list, queue, or backlog, pick the item that most threatens the current goal. Critical means "what fails worst if ignored," not "what's quickest" or "what's loudest." Pre-PMF, critical = blocks artist acquisition or breaks money flows.

**"What's actually true here?"** → First principles.
Before fixing, diagnosing, or arguing about anything: list what you KNOW is true. Reason up from there. Use this when the situation is murky, when you've inherited assumptions, or when you suspect you're reasoning from someone else's frame.

**"What should I do about this one thing?"** → Five-step pass.
Apply in order, never reversed:
1. Question the requirement. Should this exist at all? Challenge it regardless of who gave it.
2. Delete. Try to remove parts/steps. If you're not occasionally adding things back, you're not deleting enough.
3. Simplify. Only after confirming it should exist and can't be deleted.
4. Accelerate. Go faster — but only after steps 1–3.
5. Automate. Always last. Never automate what shouldn't exist.

**The full loop:** triage with most-critical-first → diagnose with first principles → decide with five-step.
}

## Project Overview

CRWN is a music monetization platform where artists sell subscriptions, tracks, and digital products to fans. Built with Next.js 16 (App Router + Turbopack), Supabase (Postgres/Auth/Storage), Stripe Connect (3-8% platform fee by tier), and Tailwind CSS 4. Deployed on Vercel.

## Commands

- `npm run dev` — Start dev server (port 3000)
- `npm run build` — Production build (**must pass before pushing**)
- `npm run lint` — ESLint
- No test framework is configured

## Architecture

### Routing (App Router)

- `src/app/(auth)/` — Login, signup, onboarding (redirect to /home if authenticated)
- `src/app/(main)/` — Protected routes with sidebar navigation (home, explore, community, library, profile)
- `src/app/(public)/` — Public marketing pages
- `src/app/[slug]/` — Dynamic public artist profile pages
- `src/app/api/` — API routes (Stripe webhooks, cron jobs, notifications, analytics)
- `src/middleware.ts` — Auth middleware, PKCE code exchange, route protection

### State Management

Context-based (no Redux): `AuthProvider`, `PlayerProvider`, `ToastProvider`. Data fetching via direct Supabase queries in custom hooks (`src/hooks/`).

### Supabase Client Pattern

Two clients — using the wrong one is a common source of bugs:
1. **Browser client** (`@/lib/supabase/client`): Components. Respects RLS, uses anon key.
2. **Admin client** (created in API routes with `SUPABASE_SERVICE_ROLE_KEY`): Bypasses RLS. **Only use in `/api/` routes.**

### Stripe Architecture

- Prices created on the **platform** account (not connected account)
- Checkout uses `transfer_data.destination` for connected accounts
- Subscriptions: `application_fee_percent: 8`
- One-time purchases: `application_fee_amount: Math.round(price * 0.08)`
- Webhook route: `/api/stripe/webhook`

### Key Directories

- `src/components/` — Feature-organized (artist/, auth/, booking/, community/, player/, ui/, shared/)
- `src/hooks/` — useAuth, usePlayer, useContentAccess, useFavorites, useSubscription, usePlatformLimits
- `src/lib/` — Business logic: supabase/, stripe/, r2/, emails/, notifications, tours, upload validation
- `src/types/` — TypeScript interfaces (Profile, Track, Album, etc.)

## Critical Rules

**Read CODEBASE.md and DEV_RULES.md for full details. The rules below cause the most bugs:**

### Prices Are In Cents

ALL database prices are integers in cents. Form input: `Math.round(parseFloat(val) * 100)`. Display: `(price / 100).toFixed(2)`.

### Column Locations — Do Not Guess

| Column | Table | NOT on |
|--------|-------|--------|
| `display_name` | `profiles` | ~~artist_profiles~~ |
| `slug` | `artist_profiles` | ~~profiles~~ |
| `avatar_url` | `profiles` | ~~artist_profiles~~ |
| `banner_url` | `artist_profiles` | ~~profiles~~ |
| `stripe_connect_id` | `artist_profiles` | ~~profiles~~ |
| `user_id` | `artist_profiles` | (profiles uses `id` from auth.users) |

To get an artist's display name: query `profiles` WHERE `id = artist_profiles.user_id`.

### TypeScript Form State

When resetting form state with `setFormData({...})`, include **every** field from the type. Missing one = build error.

### RLS Gotchas

- Client-side operations that silently return null/empty likely hit an RLS policy.
- Soft-delete (`is_active: false`) breaks SELECT policies that filter `is_active = true` — the owner can't see their own deactivated items. Fix: add owner override to SELECT policy.
- Webhook inserts must use the admin/service-role client.

### Notification Pattern

- **Artist notifications** (server/webhook): `notifyNewSubscriber`/`notifyNewPurchase`/`notifySubscriptionCanceled` from `@/lib/notifications` with supabaseAdmin
- **Fan notifications** (client): `POST /api/notifications/notify-subscribers` with `{ artistId, type, title, message, link }`

### File Patterns for New Code

- New API route: `src/app/api/[name]/route.ts`
- New page: `src/app/[name]/page.tsx`
- New artist dashboard tab: add to `src/app/(main)/profile/artist/page.tsx` tab list, create component in `src/components/artist/`
- SQL migrations: `supabase/schema-phase2-[name].sql` (not auto-run; applied manually)

## Design System

Dark theme. Background: #0D0D0D, Cards: #1A1A1A, Elevated: #2A2A2A, Gold accent: #D4AF37. Font: Inter. Mobile-first responsive. Icons: lucide-react. Charts: recharts.

## Dependencies

Check `package.json` before importing. Key packages: @supabase/supabase-js, @supabase/ssr, stripe, @stripe/stripe-js, @aws-sdk/client-s3, lucide-react, recharts, @dnd-kit/core, driver.js, resend. If a package isn't installed, run `npm install` first.


### Next.js 16 / Vercel Gotchas

- **Middleware matcher MUST exclude `api/` routes** — otherwise all POST requests return 404. Check `src/middleware.ts` matcher config.
- **Internal navigation: use `router.push()`**, never `window.location.href` — preserves the audio player persistence. Only use `window.location.href` for external URLs (Stripe checkout).
- **`NEXT_PUBLIC_` env vars require a full redeploy** (no cache) to take effect on Vercel.
- **Service worker caches aggressively on iOS Safari** — test in incognito or clear Safari cache. Current SW version: `crwn-v27`.

### Vercel Hobby Plan Limits — MUST FOLLOW

- **Cron jobs: ONCE PER DAY maximum.** Vercel Hobby plan only allows daily crons. NEVER use `*/30`, `*/6`, or any schedule that runs more than once per day. Use `0 <hour> * * *` format (e.g. `0 8 * * *` for 8am daily). Weekly is fine (e.g. `0 11 * * 1`). Monthly is fine (e.g. `0 0 1 * *`). **Anything more frequent than daily will BLOCK ALL deployments.**
- **Env vars at build time:** Always use fallback values when creating Supabase admin clients in API routes: `process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'` and `process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'`. NEVER use `!` non-null assertion on env vars — it crashes the Vercel build during static page collection.
- **Vercel CLI is linked to project `crwn`** (not `workspace-crwn`). If `.vercel` folder is deleted, relink with `npx vercel link --project crwn --yes`.

### Stripe Platform vs Connect — THIS CAUSES THE MOST BUGS

- **Subscriptions live on the PLATFORM account, NOT Connect** — NEVER pass `stripeAccount` to subscription retrieve/update/cancel calls.
- **Prices MUST be created on the platform account**, not the connected account.
- **Unique constraint on `(fan_id, artist_id)`** in subscriptions table — use upsert for resubscribes.
- **Checkout handler checks `data.url`**, not `data.success`.
- Always include metadata: `fan_id, artist_id, tier_id` (subscriptions) or `fan_id, artist_id, product_id` (purchases).

### CSS / Tailwind v4

- **Custom CSS MUST go in `neumorphic.css`** — Tailwind v4 purges custom CSS from `globals.css`.
- `stagger-fade-in` animation: apply to inner list containers, not page wrappers.
- Design: flat/minimal style, pill-shaped buttons, solid gold `#D4AF37`. No neumorphic shadows.
- Prefer divider lines over card borders for list items.

### Access Control Model

- Tracks/products use: `is_free` (boolean) + `allowed_tier_ids` (JSONB array of tier UUIDs) + optional `price` (cents).
- Use `useSubscription` hook which returns `tierId` for gating checks.
- This replaces the old `access_level` field.

### Albums

- `album_tracks` uses `track_number` NOT `position`.
- `playlist_tracks` uses `position`.
- Albums use `is_active` (not `is_published`), and have no `slug` field.

### Onboarding Safety Net — DO NOT REMOVE

The artist onboarding path (signup → publish page → upload track) once broke silently for **months** because a migration half-applied and left `artist_gate_enabled()` missing, so the `artist_profiles` INSERT policy referenced a non-existent function and RLS rejected every publish. Two guards now prevent a silent recurrence:

1. **Daily canary** — `/api/cron/onboarding-health` (cron `0 7 * * *`) creates a throwaway user, performs the REAL RLS `artist_profiles` insert, verifies the user was **promoted to `role: artist`**, exercises `validateUpload`, then deletes the user. **Emails joshn.wms@gmail.com the moment any step fails.** The `new-artist-hook` skips `__canary*` slugs so this doesn't spam the founder. If you change the publish or upload flow, keep this check in sync.

   **Role promotion is SERVER-SIDE.** A user CANNOT change their own `role` — `schema-phase2-rls-column-restrictions.sql` freezes it. Publishing an artist page promotes `fan → artist` via the `trg_promote_to_artist` trigger (`schema-phase2-promote-artist-role.sql`). Never add a client-side `profiles.update({ role })` — RLS rejects it silently and leaves artists stuck as `fan`.
2. **Self-verifying migrations** — every migration MUST end with a `DO $$ ... RAISE EXCEPTION ... $$` block asserting its functions/policies/rows/columns exist (template: `supabase/schema-phase2-artist-approval-gate-repair.sql`). A partial apply then errors loudly in the SQL editor instead of silently half-landing.

### Workflow

- **Always run `npm run build` after changes** — never push code that doesn't build clean.
- **Surgical, one-file-at-a-time fixes** — don't refactor adjacent code unless asked.
- SQL migrations go in `supabase/schema-phase2-[name].sql` — DO NOT auto-run. Josh applies them manually in the Supabase SQL Editor. **End every migration with a self-verify assertion block** (see Onboarding Safety Net above).
- Git workflow: `npm run build && git add -A && git commit -m "description" && git push`

### Domain & Infrastructure

- **Live domain:** thecrwn.app
- **Supabase project ref:** ecpqtuidtsncjfwtkvwc (US East)
- **Email:** Resend, `FROM_EMAIL='CRWN <hello@thecrwn.app>'`
- **Test artist:** slug `m3rcey`, Stripe Connect ID `acct_1T6BD7EAbi5c531A`

### Platform Tiers (Artist SaaS)

- Starter: free, 8% fee
- Pro: $69/mo ($52 annual), 6% fee
- Label: $175/mo ($131 annual), 5% fee
- Empire: $350/mo ($262 annual), 3% fee
- Annual = 25% off. Constants in `platformTier.ts`.

### Fan Subscription Tiers (M3rcey test artist)

- The Wave: $10/mo
- Inner Circle: $50/mo
- Throne: $200/mo
- Benefits managed via `tier_benefits` table + `benefitCatalog.ts`.