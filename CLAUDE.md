# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UX Rule — multi-option selectors are DROPDOWNS

Whenever a screen asks the user to pick ONE option from several (campaign goal type,
mission type, offer type, product type, signal type, unlock type, etc.), render it as
a DROPDOWN (a single collapsed control that expands a list), not a grid/stack of all
options at once. Use the shared `OptionSelect` component in `src/components/ui/OptionSelect.tsx`.
Exception: a genuine 2-option binary toggle can stay as two buttons (a dropdown for two
choices is worse). This applies to new code and when editing existing selectors.

## UX Rule — flows started from Rise Mode return to Rise Mode

When a creation flow is launched from Rise Mode (the CTA carries `?returnTo=...`), its
exit/X/back controls and its on-success redirect must return the user to that `returnTo`
(Rise Mode), NOT a hardcoded route like /studio. Read returnTo from the URL and honor it;
fall back to the old route only when returnTo is absent. Use `smartBack(router, fallback)`
for back/X controls so they return to the actual previous page.

## Copy Rule — lead with the LOSS, not the gain

Artist-facing marketing copy (lead magnet heroes, tool cards, landing pages) must be framed
around **what the artist loses by not doing it**, not what they gain by doing it. Loss aversion,
not upside. Gain-framed: "One clear mission beats 'please support me.'" Loss-framed (correct):
"'Please support me' is why your fans do nothing." Name the cost of inaction (money not earned,
fans not converted, reach going to someone else) first, then the fix.

## Brand Photos — dark + gold, artists aged 18-32

Photos must be cinematic and on-brand: near-black charcoal (#0D0D0D) with warm gold (#D4AF37)
accent light. People are optional, but anyone shown must be a Black (African American) hip hop or
R&B artist who reads as **age 18 to 32**. State the age explicitly in the generation prompt, or
the model drifts middle-aged. Always look at the image before shipping it.

## Copy Rule — NEVER use em dashes

NEVER use an em dash (—) in ANY user-facing copy, anywhere, ever: UI strings, emails, web/marketing pages, notifications, button labels, tooltips, error messages, docs — all of it. This applies to everything new you write and anything you edit. Do not substitute an en dash (–) either. Rewrite instead: split into two short sentences (also better for readability), or use a comma, colon, or parentheses. Example: "Your front door — the easiest yes" becomes "Your front door: the easiest yes". (Hyphens in compound words like "one-time" are fine; this rule is about the dash punctuation between clauses.)

## TODO.md — you maintain it, Josh works it

`TODO.md` at the repo root is Josh's list. It has three sections: **Do Now** (one-shot,
P0/P1/P2), **Ongoing** (recurring rituals), and **On Claude's plate** (so he knows what he is
not carrying).

**Whenever you create work only Josh can do, add it to TODO.md in the SAME commit.** That
means: a SQL migration to apply, an env var to set in Vercel, a secret to rotate, a pricing
or legal decision, a dark-launched flag to flip, anything needing an account you cannot log
into. If you ship a migration and do not list it, the migration does not get run and the
feature is silently dead.

Rules:
- **P0 means "blocks artist acquisition or breaks money flows."** Not "feels urgent." Use the
  same definition as the triage principle below, or the priorities become meaningless.
- Each item carries the **exact command, SQL, or file path**. The item IS the instruction. If
  Josh has to go look something up, the item is not finished.
- **DELETE items the moment they are done. Do not tick them, do not strike them through, do not
  keep them "for the record."** Git remembers what was done and when; TODO.md is only for what
  is still true. Every completed item left in the file is a line Josh has to read past to find
  the ones that matter, and a list he skims is a list he stops trusting. Delete stale items too.
- Do the same for the "Done" archives: there is no Done section, in any part of the file.
- Put your OWN follow-up work in "On Claude's plate", never in his sections.
- If you discover a founder-blocking task that predates this file, add it. Verify it first:
  do not copy claims out of the Brain or CLAUDE.md without checking the code, because both
  have been wrong.

## Interruptions are governed — one engine, one cap

Every surface that interrupts a user (pop-ups, artist broadcasts, fan notifications, surveys)
must pass a frequency governor. Do NOT add a new interruption path without one.
- **Pop-ups** go through the Pop-up Engine, NOT ad-hoc modals: add a `PopupDef` to
  `src/lib/popups/registry.ts` (targeting + `frequency` cap + loss-framed copy). The engine
  enforces **max one pop-up per user per day** on top of each pop-up's own cap. Dark-launched via
  `admin_settings.popup_engine` (off by default), same pattern as `quest_engine`. Surveys are a
  pop-up `kind` (1-5 + feedback), stored in `popup_survey_responses`; low scores email the founder.
- **Broadcasts / fan notifications** already carry hourly + daily rate-limit caps in their routes
  (`api/messages/broadcast`, `api/notifications/notify-subscribers`). Keep them. A muted fan is a
  lost fan, so the platform caps even a well-meaning artist.

## Navigation — Profile lives in the hamburger AccountHub, not the tab bar

The bottom tab bar is for DOING the work. "Manage my account/business" lives in
`src/components/layout/AccountHub.tsx` (the hamburger, top-left). The 5 bottom-nav slots are
Home, Explore, [Studio|Earn], Messages, [Rise|Library] (`Navigation.tsx`, `buildNavItems`).
Profile is NOT a bottom-nav slot. Reach `/profile` and payouts/support/etc. through the hub.
The Fan CRM is its own route `/studio/fans` (not `?tab=audience`).

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
- **Service worker caches aggressively on iOS Safari** — test in incognito or clear Safari cache. Bump `CACHE_NAME` in `public/sw.js` after every frontend change (that file is the source of truth for the current version; do not hardcode the number here).

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

### Artist Setup Wizard (post-signup onboarding)

New artists do NOT get the old dashboard tour first. They flow **signup → `/welcome` (name/phone/role) → `/setup`**, a full-screen, hard-gated wizard. Reference this as **"the artist setup wizard"** (branch `claude/artist-onboarding-redesign-05hgns`, PR #27).

- **Route:** `src/app/setup/page.tsx` (+ `layout.tsx`). **ONE FIELD per screen** — the wizard is a flat list of single-field screens (`SCREENS` in that file), 9 in order: **photo → tier-name → tier-price → tier-benefits → track-audio → track-title → product-type → product-title → product-price**. Grouped into the four chips up top (Profile/Monetize/Music/Shop) for orientation; progress bar by screen. Photo + Track are **mandatory**; the Monetize + Shop groups are **skippable** ("Skip for now" jumps the whole group). **Tagline is NOT asked in the wizard** (set later in the Profile tab). Do NOT stack multiple asks on one screen — that was the repeated mistake; keep it strictly one-field-per-screen.
- **Plan-aware by design (Free = 1 fan tier).** Onboarding creates the FREE "Community" entry point only (`tier-name`/`tier-price` pre-filled "Community" / $0, `tier-benefits` pre-selects community perks, editable, written to `access_config.benefits`). The PAID membership ladder (Backstage/Inner Circle/Executive) is built later in Rise Mode Level 3, whose template recognizes the free Community tier by name, so setup and Rise never ask for the same thing. NOTE: the free tier does not count against the plan's fan-tier cap (paid-only counting, Option 2). The multi-tier ladder + Experiences + lower fee are **Pro** ($9.99/mo) — surfaced AFTER the wizard (dashboard/tour), not in it. The product step therefore offers only **Digital + Physical** (Experiences need Pro-only scheduling); experiences live in the Shop tab.
- **Item creation:** the multi-field items (tier, track, product) collect their fields across screens into **draft state** in `setup/page.tsx`, then create on the last field's Continue via `src/lib/onboardingItems.ts` (`createOnboardingTier/Track/Product`). Minimal fields only (first track free; product file/advanced options deferred to the Shop tab). **Onboarding tiers do NOT call Stripe** (`/api/stripe/create-price` requires a connected account) — the row is inserted with null Stripe ids and `backfillTierPrices()` in `/api/stripe/connect/status` creates the Stripe prices automatically once the artist connects Stripe and charges are enabled. Completion (`hasTier/hasMusic/hasProduct`) is DB-derived — after create, `refresh()` unlocks Continue. Ends on a **share screen** → "Enter CRWN" → dashboard + trimmed tour.
- **Source of truth:** `src/hooks/useArtistSetup.ts`. Step completion is **DERIVED from live data, never stored per-step** — profile = fresh `profiles.avatar_url` + `artist_profiles.tagline`; music = ≥1 `tracks`; monetize = ≥1 active `subscription_tiers`; shop = ≥1 `products`. Everything is read straight from the DB, **NOT the `useAuth` context, which lags** — right after `/welcome` flips `fan→artist` the context `profile.role` is still `'fan'` until the next token refresh. So both the hook AND the `(main)` gate derive "is an artist" from the **`artist_profiles` row existing**, never from `profile.role` (a role check there would bounce a brand-new artist out of `/setup` into a redirect loop). Continue unlocks live off DB reads; Stripe status is cosmetic-only, fetched once.
- **The only stored flag** is `artist_profiles.setup_completed` (migration `supabase/schema-phase2-artist-setup-wizard.sql`, already applied). It just records "finished the wizard once." Existing artists were backfilled to `true`. The gate fails OPEN if the column is missing.
- **Hard gate:** `src/app/(main)/layout.tsx` redirects any artist with `setup_completed = false` to `/setup` (the same single enforcement point that gates `/welcome`).
- **Focused profile:** the Profile group is just the photo — `OnboardingAvatarStep` (photo → `profiles.avatar_url`), autosaves on upload so `Continue` unlocks from live DB. **Name, slug, and tagline are NOT asked in the wizard** — name/slug are set at `/welcome` (name → auto slug); tagline + everything else (banner, bio, socials, cal.com, location, genres) is done later in the full Profile tab. (`OnboardingTaglineStep` and `ArtistProfileForm`'s `mode="onboarding"` prop still exist but are unused by the wizard.)
- **Tour:** `getPostSetupTourSteps()` in `artistTourSteps.ts` is the trimmed dashboard tour (skips profile/tiers/music/shop that the wizard already covered). The old post-tour action-picker modal was removed.
- `/welcome` routes artists to `/setup` (not the Tiers tab). `middleware.ts` protects `/setup` and excludes it from artist-slug visitor tracking.
- **If you change the publish/upload/tier/shop flows, keep `useArtistSetup` completion checks in sync**, and remember the daily onboarding canary (`/api/cron/onboarding-health`) still governs the underlying publish RLS path.

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

- Free (internal key `starter`): 12% fee
- Pro: $9/mo, 8% fee
- $99/mo tier (rolling out later; internal key `label`): 5% fee. SPEC ONLY, not billable/gated in v1.
- Fee % is sourced from `TIER_LIMITS` in `platformTier.ts` (the single source of truth for fees). `TIER_PRICING` in that file is CORRECT ($9.99 Pro / $99 label); an older version of this note claimed it still showed $69/$175/$350 and a dead Empire tier, and that was wrong. The only leftover is dead `empire_monthly`/`empire_annual` entries in `STRIPE_PRICE_IDS`.

### Fan Subscription Tiers (M3rcey test artist)

- The Wave: $10/mo
- Inner Circle: $50/mo
- Throne: $200/mo
- Benefits managed via `tier_benefits` table + `benefitCatalog.ts`.

## Completion Signal
When you finish a task, always run this as your final bash command:
powershell.exe '(New-Object Media.SoundPlayer "C:\Windows\Media\Ring05.wav").PlaySync()'