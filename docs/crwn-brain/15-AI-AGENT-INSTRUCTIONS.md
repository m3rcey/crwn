# 15 — AI Agent Instructions

> Operating manual for ChatGPT / another AI coding agent working on CRWN. Follow this to plan and implement safely without contradicting existing behavior. These rules are distilled from `CLAUDE.md`, `DEV_RULES.md`, and the grounded audit in this package.

## Read first (in order)
1. `00-START-HERE.md` — orientation.
2. `CRWN-BRAIN-QUICK-CONTEXT.md` — for routine tasks, this may be all you need.
3. The repo's own `CLAUDE.md` + `DEV_RULES.md` + `CODEBASE.md` — authoritative working rules (but note pricing/AI-provider claims in `PRD.md` are stale; trust the code and this package).
4. The domain doc for your task: `05-DATABASE`, `07-BUSINESS-RULES`, `03-USER-ROLES`, `10-INTEGRATIONS`, `11-SECURITY`, `08-DESIGN`, `09-CODING-CONVENTIONS`.

## Before you touch anything (pre-work checklist)
- [ ] **Grep before you build.** Search `src/components/` for an existing component and `src/lib/` for existing logic. Do NOT create a duplicate (this repo already has painful duplication: `artist/[slug]` dupes, dual access models, two stagger mechanisms).
- [ ] **Find the source of truth.** Fees → `getArtistFeePercent()`/`TIER_LIMITS`. Limits → `TIER_LIMITS_V2`/`checkArtistLimit`. Column locations → `05-DATABASE`. Never re-hardcode.
- [ ] **Check `package.json`** before importing a library; run `npm install` if missing.
- [ ] **Identify the users + roles + entitlement** for the surface you're changing (`03-USER-ROLES`).
- [ ] **Confirm which Supabase client** you need: anon+RLS (components) or service-role (API routes only).

## How to inspect before editing
- Read the whole file and its imports; check the DB columns it touches against `05-DATABASE` (types in `src/types` may lag).
- For any `[id]`/body param, confirm there is an ownership/session check (`requireArtistOwner` or equivalent). If you add a service-role route, you MUST add this yourself — middleware does not protect `/api/`.
- For content, use `is_free`/`allowed_tier_ids` + entitlement views. **Never re-derive entitlement in TypeScript** (that caused the original paid-audio leak).

## Hard rules (violating these breaks production)
1. **Never add a client-side `profiles.update({ role })`** — RLS silently rejects it; role promotion is a server-side trigger on artist publish.
2. **Service-role client is `/api/` only.** Every service-role route self-authenticates + checks ownership.
   - **Persist app-gating flags through a service-role route, never an unchecked client `.update()`.** Any flag the whole app depends on (e.g. `artist_profiles.setup_completed`) must be written by a service-role route that does an explicit `getUser` auth check and confirms a row matched. A fire-and-forget client `.update()` can silently fail and wedge users: the prior client-side `setup_completed` write silently failed and bounced artists from the dashboard back into `/setup`. Example done right: `POST /api/artist/complete-setup` (called by `useArtistSetup.markComplete()`, which throws on failure).
3. **Stripe:** subscriptions/prices on the **platform** account; `transfer_data.destination` for Connect; never pass `stripeAccount` to subscription retrieve/update/cancel. Metadata always `fan_id, artist_id, tier_id`/`product_id`. Checkout handler checks `data.url`.
4. **Prices are integer cents.** Input `Math.round(val*100)`, display `(price/100).toFixed(2)`. Reset form state with **every** field of the type.
5. **Middleware matcher MUST keep excluding `api/`** or all POSTs 404.
6. **Env vars:** always fallback (`|| 'dummy-...-for-build'`), never `!`. Don't put a secret in a `NEXT_PUBLIC_` var.
7. **Copy:** no em dashes anywhere user-facing. Pick-one-of-3+ selectors use `OptionSelect`. Rise-Mode flows honor `?returnTo=`; back arrows use `smartBack`.
8. **Internal nav** = `router.push()`, never `window.location.href` (external/Stripe only).
9. **CSS:** use `bg-crwn-surface` (NOT the undefined `bg-crwn-card`). Reuse `ui/` primitives.

## Migrations (how to handle)
- Put SQL in `supabase/schema-phase2-[name].sql`. **Do NOT run it** — the founder applies it manually.
- **End every migration with a `DO $$ … RAISE EXCEPTION …$$` self-verify block** asserting your objects exist (template: `schema-phase2-artist-approval-gate-repair.sql`).
- Enable RLS explicitly on any new table + add owner-override to SELECT policies that filter `is_active=true` (or the owner can't see their own soft-deleted rows).
- If you touch publish/entitlement/upload flows, keep the `onboarding-health` and `rls-canary` crons in sync.
- Remember: several money tables have no CREATE TABLE migration — don't assume the repo reflects the full prod schema.

## Business rules (don't contradict)
- Read `07-BUSINESS-RULES.md`. Especially: unique `(fan_id, artist_id)` subscription (resubscribe = upsert); founding-artist 5% override; Team Split net-basis + cap + fenced-source-only; free-tier bypasses Stripe; deferred downgrade.

## How to test your change
- **Run `npm test` first** (vitest, 392 tests across 23 files). It covers the pure business layers, so if you touched pricing, the opportunity model, adapters, drafts, journey resolution, experiments or analytics, a failure here is your bug. **Add a `.test.ts` beside any new pure business logic.** Several of these suites are deliberate guards that fail when a new tool is added without its deliverable or its analytics entry, so a red test may be telling you work is missing rather than broken.
- **Then run `npm run build`** (inside WSL in this environment) — it must pass clean. No component/integration/e2e test exists, so the build remains the gate for everything the suite does not reach.
- **`npm run lint` is not a gate** (~635 pre-existing errors). Check your own files only.
- Manually exercise the affected flow (the `verify`/`run` skills can drive the app). For entitlement/money changes, reason through the `rls-canary`/`onboarding-health` assertions.
- Never push a build that doesn't compile. Workflow: `npm run build && git add -A && git commit -m "..." && git push` (branch first if on `master`; in WSL, use WSL-side git).
- **Deployment reality: production (thecrwn.app) deploys from `master`.** Pushing your working branch does NOT reach production until `master` fast-forwards (a gated production deploy). To verify what is actually live, check `https://thecrwn.app/sw.js` `CACHE_NAME` and probe a new endpoint (a `404` means it is not deployed yet). Don't assume a code bug on prod until you confirm the code is even live.

## Security checks before shipping
- New endpoint returning data? Confirm session + ownership scoping (no IDOR).
- New webhook? Verify the provider signature (Resend=Svix, Stripe=constructEvent, LiveKit=WebhookReceiver). (Twilio is gone: SMS was removed 2026-07-31.)
- Handling money? Recompute amounts server-side; don't trust request-body values.
- Touching sensitive columns (role/tier/Stripe ids/audio urls)? They're column-privilege-frozen — changes go through the right server path.

## Documenting uncertainty
- Use the labels: `Confirmed`, `Strongly inferred`, `Unclear`, `Not found in codebase`, `Needs founder confirmation`. Don't present assumptions as facts.
- If you discover an exposed secret, report the file path + severity WITHOUT reproducing the value.

## When to propose before implementing
Get founder confirmation before: schema changes to money tables; anything touching payouts/fees/entitlement; enabling a dark-launched feature (Quest Engine); deleting "dead" code that's still wired; changing pricing. (The `empire` tier was deleted 2026-07-31 as part of the founder-approved pricing strategy, so it is no longer an example here. Fees still come only from `TIER_LIMITS`/`getArtistFeePercent()`.)

## Post-work checklist
- [ ] `npm run build` passes (WSL).
- [ ] No duplicate component/logic introduced; reused existing primitives.
- [ ] Ownership/session checks present on any new data route.
- [ ] Cents + Stripe platform/Connect discipline preserved.
- [ ] Migration (if any) ends with a self-verify block and was NOT auto-run.
- [ ] No em dashes; `OptionSelect`/`smartBack`/`?returnTo` honored; `bg-crwn-surface` not `bg-crwn-card`.
- [ ] Bumped `CACHE_NAME` in `public/sw.js` if frontend changed.
- [ ] Updated the relevant CRWN Brain doc(s) + `CHANGELOG.md` if behavior/architecture changed.

## Keeping the CRWN Brain updated
After each feature: update `02-FEATURE-MAP` (status), `05-DATABASE` (new tables), `07-BUSINESS-RULES` (new rules), `13-CURRENT-STATE`, and append to `CHANGELOG.md` (date, commit, what changed). If a claim here becomes stale, fix it and note it — stale docs caused several of the reconciliation issues in this package.

---

*See also: [00-START-HERE.md](00-START-HERE.md) · [09-CODING-CONVENTIONS.md](09-CODING-CONVENTIONS.md) · [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md)*
