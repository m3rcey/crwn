# 09 — Coding Conventions

> The conventions the code *actually* uses (not aspirational). `Confirmed` unless noted. Grounded in `src/hooks/*`, `src/lib/*`, `src/app/api/**`, `src/types/*`.

## 1. File & folder naming
- **Components:** PascalCase `.tsx` (`OptionSelect.tsx`).
- **lib / hooks / types:** camelCase `.ts` (`benefitCatalog.ts`, `useArtistSetup.ts`).
- **Route segments (App Router):** kebab-case, double as URL paths (`create-price/`, `fan-connect/`).
- Three conventions, each internally consistent by file role — no mixing within a category. `Confirmed`.
- `src/components/` is split into **24 feature folders** (`admin/ artist/ auth/ booking/ calendar/ community/ demand/ fan/ gating/ layout/ library/ live/ messages/ missions/ notifications/ onboarding/ player/ pwa/ quests/ referrals/ share/ shared/ smart-links/ team/ ui/`).

## 2. Imports
- **`@/` alias for all intra-`src` imports** — no `../../` chains observed anywhere. `Confirmed`.
- Barrel files `ui/index.ts` and `hooks/index.ts` are dead (`export {}`); import by direct path.

## 3. Server vs client components
- Root `layout.tsx` is a **server component** wrapping client context providers (`AuthProvider > ToastProvider > PlayerProvider`).
- **Most files carry `'use client'`**; the large majority of the 115 `page.tsx` files are client components — this is a heavily interactive, context-driven dashboard app, not RSC-data-fetch-first. `Confirmed`.

## 4. State management
- **No Redux/Zustand/React Query/SWR.** Context providers only: `AuthProvider` (`useAuth.tsx`), `PlayerProvider` (`usePlayer.tsx`), `ToastProvider` (`shared/Toast.tsx`). `Confirmed`.
- **Data fetching = direct Supabase queries inside custom hooks.** Pattern: `useState` + `useEffect` with a `cancelled` flag to guard against unmount races (`useSubscription.ts:24-67`). One exception fetches via an API route: `usePlatformLimits.ts` (with a `starter` fallback).

## 5. The two (three) Supabase clients — critical
- **Browser** (`src/lib/supabase/client.ts`, `createBrowserSupabaseClient()`): anon key, respects RLS, singleton-cached. Also exports a confusingly-named `supabaseServer` that still uses the **anon key** (not service role).
- **Server, cookie-aware** (`src/lib/supabase/server.ts`, `createServerSupabaseClient()`): anon key + cookies, RLS-respecting; use to read the caller's session in API routes.
- **Admin / service-role** (RLS-bypassing): **NOT a shared file** — every API route inlines `createClient(url, SUPABASE_SERVICE_ROLE_KEY, ...)`. ⚠️ Copy-pasted per route; **recommend centralizing** into `src/lib/supabase/admin.ts`. Use only in `/api/` routes. `Confirmed`.

## 6. Build-safe env pattern (MANDATORY — Vercel Hobby)
Always fallback, never `!`: `process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'` and `process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'`. Applied consistently; a `!` non-null assertion on an env var crashes the Vercel static build. `Confirmed`.

## 7. Authorization pattern for service-role routes
`requireArtistOwner(artistId)` in `src/lib/apiAuth.ts` — session identity (never a client id) + `artist_profiles` ownership check before touching the admin client. ⚠️ Adopted by only ~3/195 routes; most hand-roll `getOwnedArtistIds`/`getDealForUser`. **New routes must replicate an ownership check.** `Confirmed`. (Recommend consolidating on one helper.)
- **Persist app-gating flags via a service-role route, not an unchecked client `.update()`.** Any flag the whole app keys off of (e.g. `artist_profiles.setup_completed`) must be written by a service-role route that does an explicit `getUser` auth check and confirms a row actually matched. A fire-and-forget client `.update()` with no error check can silently fail (RLS/no-op) and leave the app in a wedged state. Example: `POST /api/artist/complete-setup` sets `setup_completed=true`; `useArtistSetup.markComplete()` calls it and throws on failure. The prior client-side `.update()` silently failed and bounced artists from the dashboard back into `/setup`. `Confirmed`.
- **Slug/handle generation** (`/welcome` artist handle → `thecrwn.app/[handle]`): run the chosen handle through `slugify` + `isReservedSlug`, and handle a Postgres `23505` unique-collision on insert. The slug comes from the handle the artist chooses, not the prefilled legal name. `Confirmed`.

## 8. Stripe / money handling
- Prices integer cents. Form → `Math.round(parseFloat(val)*100)`; display → `(price/100).toFixed(2)` (37 files).
- Subscriptions: `application_fee_percent`; one-time: `application_fee_amount`. Fee **rate** from `getArtistFeePercent()`; the **formula** is copy-pasted (recommend extracting).
- Prices/subscriptions on the **platform** account; `transfer_data.destination` for Connect. Never pass `stripeAccount` to subscription retrieve/update/cancel. `Confirmed`.
- Checkout handler checks `data.url`, not `data.success`. Metadata always includes `fan_id, artist_id, tier_id`/`product_id`.

## 9. Validation
- `src/lib/uploadValidation.ts` `validateUpload(file, category)`: MIME **OR** extension allowlist (browser MIME sniffing is unreliable for `.m4a`/`.flac`) + per-category size caps (10/100/500/50 MB). `Confirmed`.
- Financial values are **recomputed server-side**, not trusted from the request body (e.g. `city-unlocks/contribute`).
- Rate limiting via `checkRateLimit()` (`src/lib/rateLimit.ts`, DB-backed) on 26+ sensitive routes.
- PostgREST `.or()` filter strings are regex-allowlisted or server-derived (no raw SQL interpolation).

## 10. Types
- `src/types/index.ts` is a large flat interface file (+ `community.ts`, `live.ts`). Interfaces mirror DB rows with optional joined fields (`artist?`, `author?`).
- ⚠️ **Legacy `access_level: AccessLevel` still on `Track`/`Album`/`Post`/`CommunityPost`** alongside the current `is_free`/`allowed_tier_ids`/`price`. Treat `access_level` as dead; **do not read it in new code**. `Confirmed`.
- Handle nullables: `user?.id` (user can be null), `.maybeSingle()` can return null, Recharts tooltip formatter `(v: number | undefined) => fmt(v||0)`.

## 11. Form state (common build-breaker)
When resetting form state with `setFormData({...})`, include **every** field from the type — a missing field is a TypeScript build error. Count them. `Confirmed` (`DEV_RULES.md`).

## 12. Error handling & logging
- `console.error` (142 files) paired with `NextResponse.json({error}, {status:500})` in API routes; `console.log` (18 files). No structured/external logger (no Sentry/pino). `Confirmed`.
- AI calls are try/caught and degrade to empty/fallback rather than throwing.

## 13. Navigation
- Internal → `router.push()`. External/Stripe/Calendly → `window.location.href` (some internal sign-out/redirect violations exist — see `08`/`13`).
- Back/X controls → `smartBack(router, fallback)` (`src/lib/navigation.ts`), which uses in-app history when present. Rise-Mode flows read `?returnTo=`.

## 14. Comments
High density on *why* for non-obvious business/security code (fee calc, `apiAuth` header, `smartBack`, entitlement); light on straightforward CRUD/UI. Match this: explain decisions, not mechanics. `Confirmed`.

## 15. Testing & git
- **Vitest is configured: `npm test` runs 820 tests across 50 files (a moving figure: run it).** Coverage is the pure business layers only (acquisition adapters, the unified opportunity model + funnel, drafts, journey resolution, experiments, prospect nurture, revenue ramp, analytics). No component, integration or e2e test exists. So `npm run build` is still the gate for everything the suite does not reach, alongside the `onboarding-health`/`rls-canary` crons. **New pure business logic should ship with a `.test.ts` beside it**; that is now the house pattern, not an aspiration. `Confirmed`.
- **`npm run lint` is NOT a gate.** It reports ~635 pre-existing errors (mostly `no-explicit-any`) across the codebase. Check that YOUR files are clean; do not try to get the run to zero. `Confirmed`.
- Workflow: `npm run build && git add -A && git commit -m "..." && git push`. Build must pass before pushing. Surgical, one-file-at-a-time changes. SQL migrations go in `supabase/schema-phase2-[name].sql`, applied manually by the founder, and **must end with a `DO $$ … RAISE EXCEPTION …$$` self-verify block**. `Confirmed` (`CLAUDE.md`).
- ⚠️ **In this WSL environment, run `npm run build` and `git` inside WSL** (memory: Windows-side git fabricates deletions from colon-named files; Bash-tool build fake-passes). `Confirmed` (user memory).

## 16. Recommended standardizations (from observed drift)
1. Centralize the admin/service-role client (`src/lib/supabase/admin.ts`).
2. One ownership-check helper (consolidate `requireArtistOwner` + ad-hoc checks).
3. Extract the fee-calc formula to one function.
4. Drop legacy `access_level` from the types.
5. One stagger mechanism; fix `bg-crwn-card`.

---

*See also: [08-DESIGN-SYSTEM-AND-UX.md](08-DESIGN-SYSTEM-AND-UX.md) · [04-ARCHITECTURE.md](04-ARCHITECTURE.md) · [15-AI-AGENT-INSTRUCTIONS.md](15-AI-AGENT-INSTRUCTIONS.md)*
