# CRWN Brain — Changelog

## 2026-07-15 — Founding-artist fee/AI promo killed at the source

Founder call: the partner-code 5%-fee promo (and its incidental Pro-level AI access) is dead. It reused the retired founding-artist plumbing and would have fired the first time an influencer converted an artist.

- **The one writer removed:** `metadata.founding_artist = 'true'` in `platform-checkout`. That was the ONLY code path that ever set the flag (`founding_number` was never set, so the original 50-spot webhook branch was already dead). With the writer gone, `is_founding_artist` is permanently false.
- **Dead readers deleted** rather than left as latent landmines: the 5% branch in `getArtistFeePercent` (it now returns the tier fee, unconditionally), and the "founding → Pro access" clause in all three AI-manager surfaces (`cron/ai-manager`, `ai-manager/generate`, `AiManagerCard` + the `isFoundingArtist` prop and the profile-page state that fed it).
- **Kept, because it is the influencer program, not the promo:** the partner-code branch still records attribution (`partner_code_used`, `acquisition_source='partner'`), creates the `artist_referrals` row + `recruited_by`, and grants the 1-month Stripe trial. It just no longer touches the platform fee. Artists pay their plan's normal fee (12% Free / 8% Pro) from day one.
- **Inert residue, left on purpose:** `FoundingBadge` renders behind `artist.founding_artist_number`, which nothing sets, so it never shows. Cosmetic, not behavioral; not worth public-profile render surgery.
- Zero artists ever carried the flag in production, so nothing changed for anyone live.

## 2026-07-14 — The legal pages now state the fees the code actually charges; founding artists retired

The **artist agreement** (a document artists accept) said **Starter = 8%** while `getArtistFeePercent` charges **12%**: a contract term wrong in the direction that hurts the artist. It also said Pro was $50/month ($9.99) and Label 6% at $150 (5%, $99, not sellable). `/terms` repeated the same fiction ("standard fee is 8%, reduced to 6% for Label").

- **Founder call (2026-07-14): the code is correct, the documents bend to it.** Free **12%** / Pro **8%** at **$9.99/mo**. Fixed in `(public)/artist-agreement`, `(public)/terms`, and the Stripe guide.
- The Label row was **deleted** from the fee schedule rather than corrected: it is spec-only and not sellable, and listing it in a contract implies an artist can buy it.
- **Founding Artist program retired** (founder call, same day). Every user-facing mention removed. Zero artists ever carried the flag in production, so nobody was affected.
- ⚠️ **Still live in code:** the partner-code promo (**5% fees for 3 months**, `platform-checkout:132` → `webhookHandlers:1529`) deliberately *reuses* `is_founding_artist` to get the fee reduction. It is unadvertised and currently unused, and it cannot render the Founding badge (that needs a `founding_artist_number` the partner path never sets). Awaiting a keep/kill call in `TODO.md`. **Do not delete the founding fee path without deciding this**, or the influencer program silently loses its closing discount.
- **Rule:** a legal page must state what the code does. Do not render it from a live constant either, or a code change silently rewrites the contract artists agreed to.

## 2026-07-14 — A deploy is not an outage: the error boundaries were mislabelling a routine deploy as a crash

Reported as "site not loading, says something went wrong" on the homepage and the featured
artist page, which then stopped on its own. Production was never down. It was a **stale-deploy
chunk error**: a deploy had gone out ~1h earlier, and an open tab still held HTML pointing at
the previous build's content-hashed JS chunks. Fetching one 404s, throwing `ChunkLoadError`,
which trips the nearest error boundary. `chunkReload` then hard-reloads once and the next load
is clean, which is why it "fixed itself."

- **The defect was the presentation, not the recovery.** All three boundaries only tested
  `isChunkLoadError` inside `useEffect`, so the crash screen **painted first** and the reload
  fired a tick later. Every deploy therefore flashed "Something went wrong" at anyone mid-session.
  It convinced the founder the site was down; a visiting artist would conclude the same and leave.
  That puts it on the acquisition surface, not in the cosmetics pile.
- **Fix:** the check now runs during **render**, so the first paint is a quiet "Updating to the
  latest version" screen (`src/components/shared/AppUpdating.tsx`). The genuine crash copy is
  reserved for genuine crashes.
- **`global-error.tsx` was also missing `<html>`/`<body>`**, which Next requires because that
  file *replaces* the root layout when it renders. It is now inline-styled end to end: it cannot
  depend on `globals.css`, since the layout it replaces is what imports it.
- **Boundary coverage:** only `(main)`, `(auth)` and the root `global-error` exist. `(public)`
  and `[slug]` (artist profiles) have no route-level boundary and fall through to `global-error`,
  which is the path this bug came in on.

## 2026-07-14 — Influencer commission is 1% of artist REVENUE (founder rule), and it was paying 5x

Founder rule: **influencers earn 1% of the referred artist's revenue**, negotiable per influencer. The code was paying a percentage of something else entirely.

- **The bug:** `cron/recruiter-recurring` held a private price map (`pro: 5000, label: 17500, empire: 35000`) and fed it straight into `stripe.transfers.create()`. Pro is **$9.99**, so a 10% recurring commission on a Pro artist would have wired **$5.00/mo against an artist paying $9.99** (5x), Label 1.77x. It had been logged in TODO.md as a P2 "harmless dead code" item. **It never fired** (no recurring payout has ever run; no qualified referrals exist), so nothing needed clawing back.
- **The rule now:** commission base is `earnings.net_amount` (what the artist keeps, the same basis Team Splits uses) summed over the **previous calendar month**. Refunds are negative rows and net out; a net-negative month pays 0, with no clawback. Rate defaults to **1%**, overridden per influencer via `recruiters.partner_recurring_rate` (legacy column name, now applies to every recruiter).
- **Plan gates removed.** The old "artist must be on an active paid plan" and "partners earn nothing on Pro artists" rules assumed the commission came out of the artist's SaaS fee. A revenue share is funded by the platform fee (Free 12%, Pro 8%), which exists on every plan.
- **Also fixed:** the summary emails were rebuilt by a second pass that re-derived every amount and re-applied none of the skips, so a recruiter could be emailed about money that was never sent. They now report what was actually transferred. Earnings reads are paginated (PostgREST caps at 1000 rows, so a busy artist's month would have silently underpaid).
- **Copy:** `/partner`, `/recruit` and the getting-started guide were selling the fiction ($69 Pro, Label $175, Empire $350, "10% on Label+"). Rewritten to the real deal.
- **Rule:** never hardcode a price or fee in a route. Derive from `TIER_PRICING` / `TIER_LIMITS`. A "harmless dead constant" that feeds arithmetic is not harmless.

## 2026-07-14 — All four unsigned webhooks now verify signatures (HIGH-1 closed)

`webhooks/resend`, `outreach/webhook`, `outreach/inbound`, `sms/webhook` accepted a POST from anyone and wrote via the service-role client. See `11-SECURITY-AND-PRIVACY.md` HIGH-1. Verified with hand-rolled HMAC (`src/lib/webhookSignatures.ts`) against Twilio's and Svix's official test vectors. All fail closed. Needs three Resend signing secrets in Vercel (in `TODO.md`).

## 2026-07-14 — Internal self-calls hit Vercel's auth wall, silently

`cron/ai-manager`, `admin/agent/{briefing,autonomous,execute}` and the RLS canary built base urls from `req.nextUrl.origin` / `VERCEL_URL`. Inside a Vercel cron both resolve to the `*.vercel.app` **deployment** origin, which sits behind Vercel Authentication (custom domains are public, deployment urls are not). That wall answers **every** path, `/api/*` included, with an **http 200 and an html login page**, so the self-calls did not fail loudly: they "succeeded" with html and the work never happened. It also made the RLS canary email a false LEAK alert about its own front door. One hardcoded `PUBLIC_ORIGIN` (`src/lib/publicOrigin.ts`) now. Two of the routes also had `(A || B) ? C : D` precedence bugs that made the `NEXT_PUBLIC_SITE_URL` fallback unreachable.

## 2026-07-11 — Rate limiter fixed (every unauthenticated route was fail-closed)

`check_rate_limit(p_user_id)` is typed `uuid`, but unauthenticated routes have no user id and key on a string like `ip:1.2.3.4`. Postgres could not cast it (`22P02`), the RPC errored, and `checkRateLimit` discarded the error, so `data === true` evaluated `false`. An errored limiter was indistinguishable from a denial, and **every visitor got a 429 on their first request**.

- **Was broken in production:** `/api/support` (support form), `/api/partner/apply` (partner applications), `/api/lead-magnets/capture`, `/api/lead-magnets/email`. All four are unauthenticated and top-of-funnel. Authenticated routes pass a real uuid and were never affected, which is why this went unnoticed.
- **Fix (`src/lib/rateLimit.ts`, no schema change):** hash any non-uuid key into a stable uuid so it buckets like a real one (verified against prod: allows exactly `max_requests`, then denies); log RPC errors instead of swallowing them.
- **Note:** the limiter still fails CLOSED on an RPC error (unchanged semantics, so money routes are not weakened), but it now logs loudly. `check_rate_limit` has no checked-in migration; its signature was recovered by probing production.

## 2026-07-11 — Lead Magnet system (4 tools)

Added a config-driven Lead Magnet system (branch `claude/rise-mode-full-journey`). One typed registry (`src/lib/leadMagnets/registry.ts`) drives all tools; adding a tool = one config + one deterministic generator, no new pages.

- **Tools shipped (4):** Vault Revenue Planner (`vault-revenue-planner`), Proof of Demand Test Builder (`proof-of-demand-test-builder`), Fan Mission Generator (`fan-mission-generator`), Clip-to-Earn Campaign Planner (`clip-to-earn-campaign-planner`).
- **Routes:** public `/tools` + `/tools/[slug]` (SSG shells, `(public)` group); protected `/artist/tools`, `/artist/tools/[slug]`, `/artist/tools/saved` (middleware `protectedPaths` gains `/artist/tools`; `tools` added to `knownRoutes`).
- **Shared engine:** reuses `Wizard` + `OptionSelect`; deterministic versioned generators (`resultGenerators.ts`, `GENERATOR_VERSION`); preview-gated result renderer; consent-correct public lead capture; save/email/share; conversion adapters that PREFILL the live builders (Proof of Demand, Missions, Bounties read `lm_*` params, one-time seed, their own validation/payout logic untouched). Vault degrades to a saved plan by design.
- **APIs (`/api/lead-magnets/*`):** `capture` (public, IP rate-limited, server-recomputes the result), `results` + `results/[id]` (owner-scoped CRUD, public read by high-entropy token), `email` (recipient-locked, suppression-checked), `analytics` (field-allowlisted sink), `admin` (aggregates only).
- **DB:** `supabase/schema-phase2-lead-magnets.sql` (**APPLIED 2026-07-11**) adds `lead_magnet_leads`, `lead_magnet_results`, `lead_magnet_events` with RLS (owner-manage + admin-read) and a self-verify block. Distinct from `crm_contacts`/`fan_contacts`/`fan_events`.
- **Verified in production:** end-to-end capture writes the lead + result, recomputes server-side and mints a token; token read returns 200, no token 401, wrong token 404 (no leak). Smoke-test rows were deleted afterward.
- **Out of scope preserved:** the existing `/worth` "money left on the table" calculator is untouched.
- **Follow-up:** builder->result "converted" callback (marking a result `converted` after the builder creates the record) is not yet wired; no `/admin` Lead Magnets tab yet.

## v1.0 — 2026-07-10 (initial generation)

- **Generated:** 2026-07-10
- **Repository:** CRWN (`thecrwn.app`), Supabase project ref `ecpqtuidtsncjfwtkvwc`
- **Git branch:** `master`
- **Git commit:** `614b9582b2e5c456837fcd0c5cfc42b1d3194bac` (`614b958` — "Dropdowns for multi-option selectors; notification polish; Rise Mode return-to")
- **Repository status at generation:** working tree had unrelated uncommitted changes (mostly Windows `:Zone.Identifier` / Dropbox attribute sidecar files, plus edits to video-script and SQL notes). **No application source was modified to produce this documentation** — the CRWN Brain only adds files under `docs/crwn-brain/`.

### Method
Documentation was produced by static analysis of the repository at the commit above: reading source, routes, ~190 API handlers, 117 `supabase/*.sql` migrations, config, and the repo's own docs (`CLAUDE.md`, `CODEBASE.md`, `DEV_RULES.md`, `PRD.md`, `CRWN_Kickoff_Brief.md`). Evidence was gathered by parallel read-only exploration agents across domains (database, auth/security, payments, features, integrations, design/conventions, current state) and cross-checked against direct file reads. No code was executed, no migrations applied, no external API called, no production data touched.

### Files created (23)
`00-START-HERE.md`, `01-PRODUCT-VISION.md`, `02-FEATURE-MAP.md`, `03-USER-ROLES-AND-PERMISSIONS.md`, `04-ARCHITECTURE.md`, `05-DATABASE.md`, `06-ROUTES-AND-USER-FLOWS.md`, `07-BUSINESS-RULES.md`, `08-DESIGN-SYSTEM-AND-UX.md`, `09-CODING-CONVENTIONS.md`, `10-INTEGRATIONS.md`, `11-SECURITY-AND-PRIVACY.md`, `12-ENVIRONMENT-AND-SETUP.md`, `13-CURRENT-STATE.md`, `14-ROADMAP-INFERRED.md`, `15-AI-AGENT-INSTRUCTIONS.md`, `16-GLOSSARY.md`, `17-OPEN-QUESTIONS.md`, `18-SOURCE-MAP.md`, `CRWN-BRAIN-COMBINED.md`, `CRWN-BRAIN-QUICK-CONTEXT.md`, `CHANGELOG.md` (this file).

### Certainty labels
Statements are marked `Confirmed`, `Strongly inferred`, `Unclear`, `Not found in codebase`, or `Needs founder confirmation`. No secrets or secret values were included; env vars are referenced by name only.

### Key reconciliations baked in
- **Pricing:** code (`TIER_LIMITS`) is authoritative — Free 12% / Pro $9.99 8% / $99 `label` spec-only / `empire` dead. `PRD.md`, `schema-platform-tiers.sql`, and `recruit/page.tsx` all carry stale/contradictory pricing.
- **AI provider:** DeepSeek (+ narrow OpenAI), not "Moonshot/Kimi" as PRD says. `@google/genai` is unused by the app.
- **Booking:** live flow is booking tokens; the Calendly components are orphaned.
- **Onboarding:** `/welcome` → `/setup` wizard (PRD's tour/action-picker flow is stale).

### Known documentation limitations
1. **Schema is not fully reconstructable from the repo** — `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters` have no checked-in CREATE TABLE migration; their columns are described only from later ALTERs. A production `pg_dump` is needed for completeness.
2. **Security audit sampled, not exhaustive** — the 195-file `SUPABASE_SERVICE_ROLE_KEY` surface was reviewed across every risk category, not line-by-line for all files. No leak found in anything reviewed; a full sweep is a reasonable follow-up.
3. **Env var equality unverifiable** — whether `NEXT_PUBLIC_CRON_SECRET == CRON_SECRET` in production (which determines exploitability of HIGH-2) could not be checked without Vercel access.
4. **Runtime-only facts unverified** — e.g. whether body text renders Inter vs a fallback, and whether subscription downgrades actually apply on Stripe's side, were reasoned from static code and flagged, not observed at runtime.
5. **Dynamic ranking/algorithm logic** (Explore/Home feed ordering) was not deeply traced.
6. Reflects a single commit; drift begins immediately. Update this changelog + the affected docs after each behavior/architecture change.

### How future agents should update the CRWN Brain
- After a feature/change: update `02-FEATURE-MAP` (status), `05-DATABASE` (schema), `07-BUSINESS-RULES` (rules), `13-CURRENT-STATE`, and any doc whose claims changed. Re-check certainty labels.
- Append a new dated `## vN` section here with the new commit hash, what changed, and any new limitations.
- If a statement in the Brain becomes stale, fix it in place and note the correction — stale docs caused several of the reconciliation issues found during this generation.
- Keep `CRWN-BRAIN-COMBINED.md` and `CRWN-BRAIN-QUICK-CONTEXT.md` consistent with the numbered docs when you edit them.
