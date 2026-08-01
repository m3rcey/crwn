# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stock tier ladder — Bronze / Silver / Gold / Platinum

The recommended four-tier ladder is **Bronze (free) / Silver ($10) / Gold ($25) / Platinum ($100)**,
renamed from The Wave / Inner Circle / The Vault / Throne on 2026-07-30. Every surface that builds
tiers for an artist (the setup wizard's free entry point, Rise Mode Level 3, the /worth calculator,
the calculator result email, the unified opportunity model, the offer builder goals) uses these
names. `src/lib/tierTemplate.ts` (`RECOMMENDED_LADDER`) is the source of truth: change a name there,
not in a component.

- The internal keys stay `wave | inner_circle | vault | throne`. They are referenced across the
  calculators, drafts and offer builder, and renaming them moves data for no artist-visible gain.
- Each rung carries `legacyNames`. The ladder's "already added" check matches those too, so an
  artist who applied the old ladder is not offered a duplicate tier. **Never drop a legacy name.**
- "The Vault" survives as a FEATURE name (the Vault Revenue Planner, the monthly vault unlock, the
  artist's private archive). It is no longer a tier name: the vault lives in the Gold tier.

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

## The public artist page — `isOwner` is the OWNER, and preview only removes access

Two rules on `src/app/[slug]/page.tsx` and everything under it:

- **Owner checks are `session.user.id === artist.user_id`, never "does this viewer have an
  `artist_profiles` row."** The page used the latter for months, so every artist got owner-only
  controls (locked-channel reads, moderation menus, the artist-voice composer) on every OTHER
  artist's page. The DB stopped the reads; it did NOT stop `community_posts.is_artist_post`,
  whose INSERT policy is only `auth.uid() = author_id`
  (`supabase/schema-phase2-artist-post-authorship.sql` adds the trigger).
- **Owner preview** (`src/hooks/useArtistPreview.tsx` + `PreviewBar`) lets the owner view the
  page as a visitor or any tier. `useSubscription` is the ONE injection point: override it and
  all 13 gated consumers follow. It must only ever REMOVE access, which is what makes it safe
  as a pure rendering lens. If you add a surface that reads a SERVER-granted flag
  (`can_view`, a signed URL, a purchase row), it must fall back to tier math when `previewing`,
  or the owner sees an unlocked page while it claims to be a fan's.

## Plan limits: only advertise what the product enforces

Audited and settled 2026-08-01. Every limit is now either real or gone; do not reintroduce a
third state.
- **Members: NO CAP on any plan.** Removed rather than enforced, because the only enforcement
  point is refusing a paying fan at checkout. Never re-advertise one. A big list routes to Pro
  via `contacts_need_more_sends` (the email cadence limit), never a member count.
- **Tracks (50 on Launch): enforced by a DB trigger** (`schema-phase2-track-cap-enforcement.sql`),
  because tracks are inserted straight from the browser client and no API guard can cover that.
  The UI must warn BEFORE an upload starts and translate `TRACK_LIMIT_REACHED` into plain words.
- **Email blasts: enforced at CREATE and, authoritatively, at SEND** through
  `src/lib/emailQuota.ts`. A draft costs nothing; only a send spends the quota. Never write a
  second copy of that rule.
If you add a plan limit, it needs an enforcement point that a browser cannot route around, or it
does not go in the marketing copy.

## Interruptions are governed — one engine, one cap

Every surface that interrupts a user (pop-ups, artist broadcasts, fan notifications, surveys)
must pass a frequency governor. Do NOT add a new interruption path without one.
- **Pop-ups** go through the Pop-up Engine, NOT ad-hoc modals: add a `PopupDef` to
  `src/lib/popups/registry.ts` (targeting + `frequency` cap + loss-framed copy). The engine
  enforces **max one pop-up per user per day** on top of each pop-up's own cap. **Every
  ANNOUNCEMENT pop-up ("we changed X" / "new feature") MUST carry `announcedAt`** (the date the
  change went live): the engine skips it for accounts created on/after that date, because those
  users met the current product at signup and the announcement is noise to them. Dark-launched via
  `admin_settings.popup_engine` (off by default), same pattern as `quest_engine`. Surveys are a
  pop-up `kind` (1-5 + feedback), stored in `popup_survey_responses`; low scores email the founder.
- **Broadcasts / fan notifications** already carry hourly + daily rate-limit caps in their routes
  (`api/messages/broadcast`, `api/notifications/notify-subscribers`). Keep them. A muted fan is a
  lost fan, so the platform caps even a well-meaning artist.

## Navigation — three surfaces, one rule each

The artist dashboard is NO LONGER a tab strip. `/profile/artist` is Rise Mode and nothing else.
Every one of its old 16 tabs is a real route. Three surfaces, and each one has a single job:

- **Bottom tab bar** (`Navigation.tsx`, `buildNavItems`) — DOING the work. 5 slots:
  Home, Explore, [Studio|Earn], Messages, [Rise|Library]. Visible on mobile AND desktop
  (sidebar). Profile is NOT a slot. Do not add management destinations here.
- **Hamburger AccountHub** (`src/components/layout/AccountHub.tsx`, top-left) — the COMPLETE
  index. Every old-16 tab AND every Studio connector tool is listed here, in five groups (Grow /
  Reach and fans / Music and shop / Your business / Account). This is not the "management only"
  half: an artist who learned the tab strip must find all sixteen without learning a second place
  to look, and anything in Studio must be findable here too. **If you add a destination to Studio,
  add it here too** (this is now the ONLY place the reference/config screens Analytics, Fan CRM,
  Team Splits and Promise Calendar live, since they were pulled out of the Studio grid). First
  group renders expanded.
- **Studio** (`/studio`) — the work destinations you MAKE/ACT in, as a visual grid, plus the
  connector tools: `/studio/music`, `/studio/albums`, `/studio/shop`, `/studio/live`,
  `/studio/manager`, `/studio/sync`, plus offers/campaigns/missions/bounties/squads/action-plan/
  playbooks. Reference/config screens (`/studio/analytics`, `/studio/fans`, `/studio/team`,
  `/studio/promise`) are intentionally NOT in this grid, only in the hamburger. Neither surface is
  exclusive, so there is no wrong place to look for a screen.

Rules when you touch any of this:
- **Every ex-tab screen wears `HubPage`** (`src/components/layout/HubPage.tsx`): X in the TOP
  LEFT, artist gate, and artist context via `useArtistContext()` (module-cached, so navigating
  between these screens costs no round trip). Do not hand-roll the gate or the back control.
- **`?from=hub` means "the X returns to the hamburger."** AccountHub appends it; HubPage reads
  it and sets a one-shot sessionStorage flag (`requestHubReopen`) that `Navigation` consumes on
  the next pathname change to reopen the menu. Without `from=hub` the X is a normal `smartBack`,
  which is what makes Rise Mode CTAs return to Rise Mode.
- **Connector pages that are NOT HubPage but ARE reachable from the hamburger** (offers,
  campaigns, missions, bounties, squads, city-unlocks, proof-of-demand, campaign-hub, action-plan,
  playbooks, clip-controls) use `HubBackControl` (`src/components/shared/HubBackControl.tsx`) for
  their back control, NOT a hand-rolled `smartBack` button. It reads `?from=hub` and renders the
  same top-left X + reopen-menu behavior as HubPage when opened from the hamburger, and the page's
  normal back arrow otherwise. If you add a connector page to AccountHub, give the link `hub: true`
  AND swap its back button to `HubBackControl`, or its X will wrongly say "Back to Studio".
- **Link to these routes with `<Link prefetch>`, never `<button onClick={router.push}>`.** The
  prefetch is the entire reason they open instantly; a button cannot be prefetched.
- **Never add a new `?tab=` link.** `src/lib/dashboardRoutes.ts` (`TAB_ROUTES`) is the legacy
  map, and `/profile/artist` redirects through it so links already sitting in emails and
  `notifications.link` rows keep working. It exists for history, not for new code.

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

CRWN is a music monetization platform where artists sell subscriptions, tracks, and digital products to fans. Built with Next.js 16 (App Router + Turbopack), Supabase (Postgres/Auth/Storage), Stripe Connect (5-12% platform fee by plan), and Tailwind CSS 4. Deployed on Vercel.

## Commands

- `npm run dev` — Start dev server (port 3000)
- `npm run build` — Production build (**must pass before pushing**)
- `npm run lint` — ESLint
- `npm test` — vitest (node env, pure `src/**/*.test.ts` suites; no jsdom/component tests). Run it before pushing when you touch a tested lib.
- `npm run verify:quests` — quest catalog integrity check

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
- Subscriptions: `application_fee_percent` = the artist's plan fee from `getArtistFeePercent()` (Launch 12 / Pro 8 / Scale 5)
- One-time purchases: `application_fee_amount: Math.round(price * feePercent / 100)`, same source
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

### NEVER name a revoked column from a browser or user-session client

`artist_profiles.stripe_connect_id`, `.platform_stripe_customer_id` and
`.platform_stripe_subscription_id` have SELECT **revoked** from `anon` and `authenticated`
(`schema-phase2-stripe-id-column-privs.sql`). This is correct and stays.

The trap is how Postgres refuses. Naming ONE revoked column fails the **entire statement** with
`42501 permission denied for table artist_profiles`, and PostgREST applies the same rule to
**embedded joins**. The query does not return a row with that field missing, it returns **no row
at all**, so every caller reads it as "not found" and fails closed while the code looks fine.
This silently killed every checkout, payout, and Stripe-connect flow on the platform.

- Read these ids ONLY through `src/lib/stripe/connectAccount.ts` (service role).
- Keep the ownership check on the user session. Only the secret moves server-side.
- `select('*')` on `artist_profiles` from a browser client is the same bug waiting to happen.
- The same applies to `tracks.audio_url_*` and (once its migration lands) `profiles.email`/`.phone`.
- To verify, probe production with the ANON key, never a superuser session:
  `curl "$URL/rest/v1/artist_profiles?select=slug,stripe_connect_id" -H "apikey: $ANON"`

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

New artists do NOT get the old dashboard tour first. They flow **signup → `/setup`** directly, a full-screen, hard-gated wizard. Reference this as **"the artist setup wizard"**. **The `/welcome` page was RETIRED on 2026-07-30** (Josh's call: it was a redundant screen); the route now just redirects to `/setup`, and the wizard's first two screens do what it did. Every entry point (signup, login, `/verify`, the `(main)` gate, the journey resolver, the quest destination registry, the onboarding-reminder email) points at `/setup`.

- **Route:** `src/app/setup/page.tsx` (+ `layout.tsx`). **ONE FIELD per screen** — the wizard is a flat list of single-field screens (`SCREENS` in that file), 12 in order: **artist-name → artist-link → photo → ladder → promises → stripe → content-plan → track-audio → track-title → product-type → product-title → product-price**. Grouped into the four chips up top (Profile/Monetize/Music/Shop) for orientation; progress bar by screen. Identity + Photo + Track are **mandatory**; the Monetize + Shop groups are **skippable** ("Skip for now" jumps the whole group). **Tagline is NOT asked in the wizard** (set later in the Profile tab). **Phone is NOT collected at onboarding anymore.** Do NOT stack multiple asks on one screen — that was the repeated mistake; the `ladder` screen is one DECISION (confirm the recommended model), not stacked fields. A signup with a claimed calculator result first sees the "Your CRWN plan is saved" intro (`PlanIntro`). The full staged evolution of this wizard is `docs/ARTIST_LAUNCH_WIZARD.md`.
- **Identity screens** (replaced `/welcome`): `artist-name` (never pre-filled — the profile seed is the signup email, and pre-filling is how emails leak out as public artist names; carries a small "Not an artist? Continue as a supporter" escape that saves role=fan and exits to `/home`) then `artist-link` (handle auto-synced from the name via the shared `src/lib/slugify.ts` until edited). The link screen's Continue calls **`POST /api/onboarding/identity`**, which does BOTH writes with the SERVICE-ROLE client (ownership enforced explicitly; `trg_promote_to_artist` still promotes fan→artist on the insert): browser-side `profiles` updates AND the RLS `artist_profiles` insert both 42501 until `schema-phase2-fix-profiles-update-permission.sql` is applied — the column-privileges hardening collided with the profiles UPDATE policy (reads revoked `stripe_connect_id`) and the artist_profiles INSERT gate (reads revoked `is_approved`). The wizard's photo save is server-side for the same reason (`POST /api/onboarding/avatar`). The daily canary still exercises the RLS insert and alarms until the migration runs. The identity route also sends the welcome email once, with the chosen name.
- **The `ladder` screen confirms the FULL recommended model (Launch Wizard Stage 2, 2026-07-30).** One decision screen renders `RECOMMENDED_LADDER` (Bronze free always applied + Silver $10 / Gold $25 / Platinum $100 with inline price edit and per-rung "Drop this tier"). It also shows estimated buyers per rung from the artist's own claimed calculator (`tierProjections` on `/api/lead-results/auto-claim`, matched by current or legacy tier name via `projectedBuyersFor`). Applying goes through **`src/lib/applyTierTemplate.ts`** — the ONE shared path also used by Rise Level 3's `TierLadderTemplate` — so structured benefits route through `/api/tier-benefits` and the Promise Calendar obligations (Gold's monthly Vault unlock, Platinum's quarterly listening event) seed automatically. Retry-safe: rungs whose name or legacy name already exists are skipped. A dropped rung stays offerable in Rise Level 3 (alias matching prevents duplicates). Onboarding tiers still get null Stripe ids, backfilled by `backfillTierPrices()` on connect.
- **The `promises` screen reviews the workload BEFORE anything is created (Launch Wizard Stage 3, 2026-07-30).** The tier create runs on THIS screen, not the ladder screen. `src/lib/promisePlan.ts` is the pure benefit→obligation brain shared by the wizard and the server sync (`src/lib/tierObligations.ts` consumes it): promise detection, cadence/title/first-due from benefit config, DEDUP (the same promise on several tiers is ONE obligation via `metadata.merged_tier_ids`, re-anchored if the anchor tier drops it) and INHERITANCE (`serves_higher_tiers` on Gold's vault unlock serves every higher tier via `metadata.serves_tier_ids`, refreshed on every sync so creation order converges), plus the recurring-workload estimate. The screen's cadence dropdown (shared `OptionSelect`) and first-due date ride into `applyTemplateTier` as `benefitConfigOverrides` and become each benefit's config (`frequency`, `first_due_at`). Fan eligibility (`calendarProjection.fanEligibleForObligation`) and the fulfillment fan-notify honor `serves_tier_ids`, so a Platinum member sees and gets Gold's inherited promises. No migration: serve lists ride the existing `metadata` jsonb. Pure logic is under test in `src/lib/promisePlan.test.ts` (run `npm test` when touching it).
- **The `stripe` screen surfaces Connect in-wizard (Launch Wizard Stage 4, 2026-07-30) and NEVER blocks Continue.** Stripe is required to take money, not to finish setup. `/api/stripe/connect` accepts a validated same-site `?returnTo=` (the wizard passes `/setup`); on `?stripe=success|refresh` the wizard's resume effect restores the exact `stripe` screen instead of the first-incomplete scan. Verification is server-side only: the screen re-hits `/api/stripe/connect/status` (live `accounts.retrieve`, tier-price backfill, and now `payoutsEnabled` in the response) and renders connected / under-review / not-connected. Do not add a client-side Stripe check or make this screen required.
- **The `content-plan` screen picks the catalog path (Launch Wizard Stage 5, 2026-07-30).** One decision: one featured track (single path, unchanged, starts free), the full catalog, or "I'll add music later" (jumps the music group). The catalog path mounts the EXISTING `BulkUploadForm` (`src/components/artist/BulkUploadForm.tsx`) inside the wizard; per-track tier access, artwork, and consent all come from that form, and the `track-title` screen is skipped on the bulk path (see `skipScreen` in `setup/page.tsx`). Do not build an onboarding-only uploader; if the bulk form changes, the wizard inherits it.
- **The personalized roadmap (Launch Wizard Stage 6, 2026-07-30) is a VIEW over the Quest Engine, never a second progression system.** `src/lib/artistRoadmap.ts` defines 5 stages whose steps reference existing DomainChecks by exact name; `/api/artist/roadmap` evaluates them through the quest evaluator's `evaluateCondition` (synthetic instance) plus three Promise Calendar facts, derived on read, stored nowhere. Surfaced as `RoadmapCard` above `RiseMode` on `/profile/artist`. Never grant XP from the roadmap and never store per-step completion; if a step needs a new fact, add a DomainCheck to the evaluator (or a fact to the route), not a parallel query in a component.
- **The fan import hub (Launch Wizard Stage 7, 2026-07-30) lives in `FanImportModal`, and a Patreon export is auto-recognized.** `src/lib/patreonImport.ts` (pure, tested) detects the Relationship Manager CSV, parses status/pledge/tier, and suggests the closest CRWN tier; members import with `patreon` / `patreon-tier:<name>` tags through the SAME `/api/fan-contacts/import` with the versioned attestation. Import never sends anything: invites go through Campaign Hub's contacts audience, which only emails attested, still-subscribed contacts. Never add an invite path that bypasses that campaign sender.
- **The Launch Kit (Launch Wizard Stage 8, 2026-07-30) generates launch copy as DRAFTS, never sends.** `src/lib/launchCampaign.ts` (pure, tested, no em dashes) builds announcement/follow-up emails + social/story/DM copy from the artist's real page, tiers, and imported audience; the `LaunchKit` panel (top of `/studio/fans?view=campaigns`) creates both emails as `campaigns` drafts through /api/campaigns (announcement preset to contacts + 20-contact test group). EMAIL campaigns live at `/studio/fans` (AudienceTab); `/campaign-hub` is Road-To campaigns; do not link "send an email" flows to /campaign-hub.
- **The wizard ends on the `LaunchReview` screen (Launch Wizard Stage 9, 2026-07-30), and the publish action is UNCHANGED server-side.** "Launch my CRWN" is still `markComplete` (`/api/artist/complete-setup`) + the journey resolver; never add a second completion path. The checklist's "Fix it" jumps back into wizard screens; the calendar/roadmap previews render INLINE (their routes are behind the setup gate until launch), and the storefront/checkout preview is the public page. Post-launch, Rise Mode's `RoadmapCard` is the command screen: real stats (members/paying/MRR vs the calculator goal) + upcoming promises from `/api/artist/roadmap`. Real counts only; never render projections as results there. The paid cap is 3 on every plan, and the free tier does not count against it (Option-2 counting). LaunchReview also carries the **operating plan panel** (journey spec Screen 11): `recommendPlan()` re-derived client-side from the roadmap goal with `monthlyPlanCostCents()` arithmetic, advisory only, never blocking the launch; all numbers come from `TIER_PRICING`/`TIER_LIMITS`, never hardcoded. Post-launch, Level 5 quests close the activation loop (first visit via `artist_page_visits`, first delivered promise via completed `fulfillment_events`), and the upgrade pop-ups (`artist_pro_break_even`/`artist_scale_break_even`) fire once on REAL trailing-30-day GMV crossing the derived break-evens. Experiences + the lower fee (12% to 8%) + live/DMs/scheduling remain **Pro** ($49/mo), surfaced AFTER the wizard; the product step offers only **Digital + Physical**.
- **Item creation:** the multi-field items (tier, track, product) collect their fields across screens into **draft state** in `setup/page.tsx`, then create on the last field's Continue via `src/lib/onboardingItems.ts` (`createOnboardingTier/Track/Product`). Minimal fields only (first track free; product file/advanced options deferred to the Shop tab). **Onboarding tiers do NOT call Stripe** (`/api/stripe/create-price` requires a connected account) — the row is inserted with null Stripe ids and `backfillTierPrices()` in `/api/stripe/connect/status` creates the Stripe prices automatically once the artist connects Stripe and charges are enabled. Completion (`hasTier/hasMusic/hasProduct`) is DB-derived — after create, `refresh()` unlocks Continue. Ends on a **share screen** → "Enter CRWN" → dashboard + trimmed tour.
- **Source of truth:** `src/hooks/useArtistSetup.ts` (now also exposes `onboardingCompleted` from `profiles.onboarding_completed` — a brand-new signup has no artist row yet and stays in the wizard on the identity screens; only an established fan, onboarding done + no artist row, is bounced to `/home`). Step completion is **DERIVED from live data, never stored per-step** — identity = `artist_profiles` row exists; profile = fresh `profiles.avatar_url`; music = ≥1 `tracks`; monetize = ≥1 active `subscription_tiers`; shop = ≥1 `products`. Everything is read straight from the DB, **NOT the `useAuth` context, which lags** — right after the identity save flips `fan→artist` the context `profile.role` is still `'fan'` until the next token refresh. So both the hook AND the `(main)` gate derive "is an artist" from the **`artist_profiles` row existing**, never from `profile.role` (a role check there would bounce a brand-new artist out of `/setup` into a redirect loop). Continue unlocks live off DB reads; Stripe status is cosmetic-only, fetched once.
- **The only stored flag** is `artist_profiles.setup_completed` (migration `supabase/schema-phase2-artist-setup-wizard.sql`, already applied). It just records "finished the wizard once." Existing artists were backfilled to `true`. The gate fails OPEN if the column is missing.
- **Hard gate:** `src/app/(main)/layout.tsx` redirects any user with `onboarding_completed = false` AND any artist with `setup_completed = false` to `/setup` (one enforcement point, one destination).
- **Focused profile:** the Profile group is name → link → photo. Photo is `OnboardingAvatarStep` (photo → `profiles.avatar_url`), autosaves on upload so `Continue` unlocks from live DB. **Tagline is NOT asked in the wizard** — tagline + everything else (banner, bio, socials, cal.com, location, genres) is done later in the full Profile tab. (`OnboardingTaglineStep` and `ArtistProfileForm`'s `mode="onboarding"` prop still exist but are unused by the wizard.)
- **Tour:** `getPostSetupTourSteps()` in `artistTourSteps.ts` is the trimmed dashboard tour (skips profile/tiers/music/shop that the wizard already covered). The old post-tour action-picker modal was removed.
- `/welcome` is a redirect to `/setup` (kept because sent emails link to it). `middleware.ts` protects `/setup` and excludes it from artist-slug visitor tracking.
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

### Platform Plans (Artist SaaS) — pricing strategy 2026-07-31

- **Launch** (internal key `starter`, displayed "Launch"): free, 12% fee, 50 tracks, 250 members/contacts, 1 email campaign/mo, full 4-tier fan ladder (free + 3 paid). Purpose: prove the first direct-to-fan offer.
- **Pro**: $49/mo ($490/yr), 8% fee, unlimited tracks/members, live/DMs/scheduling/bundles/clipper, 20 email campaigns/mo. Beats Launch above $1,225/mo GMV.
- **Scale** (internal key `scale`, renamed from the old spec-only `label`): $199/mo ($1,990/yr), 5% fee, assisted migration, team permissions, 100 email campaigns/mo. Beats Pro above $5,000/mo GMV. Billable once its Stripe price env vars are set.
- A true multi-artist **Label** tier is custom-priced and does NOT exist until org accounts / cross-artist infra ship. `empire` is dead; `resolveTierKey()` aliases stray `label`/`empire` values to `scale`.
- Fee % is sourced from `TIER_LIMITS` in `platformTier.ts` (the single source of truth); prices from `TIER_PRICING` there. NEVER re-hardcode a fee or price. `platform-checkout` verifies the live Stripe price amount against `TIER_PRICING` before selling, so a stale price env var fails loudly instead of undercharging.
- **Deterministic plan recommendation**: every account starts on Launch; `src/lib/planRecommendation.ts` (`recommendPlan`, tested) derives the recommended operating plan (never an AI guess) and it is stored on `artist_profiles.recommended_plan` (migration `schema-phase2-platform-plan-recommendation.sql`), seeded from the claimed calculator in `/api/lead-results/auto-claim`.

### Fan Subscription Tiers (M3rcey test artist)

Live rows as of 2026-07-30 (verified against production, an older version of this note listed
$10/$50/$200, which was wrong). These predate the Bronze/Silver/Gold/Platinum rename and were
deliberately NOT rewritten, since renaming a tier a fan already pays for is a founder decision:

- The Wave: free (now built as Bronze)
- Inner Circle: $10/mo (now Silver)
- The Vault: $25/mo (now Gold)
- Throne: $100/mo (now Platinum)
- Benefits managed via `tier_benefits` table + `benefitCatalog.ts`.

## Completion Signal
When you finish a task, always run this as your final bash command:
powershell.exe '(New-Object Media.SoundPlayer "C:\Windows\Media\Ring05.wav").PlaySync()'