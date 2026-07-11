# 13 — Current State

> A realistic state-of-the-product report at commit `38186b1` (branch `master`). Certainty labels used. This is deliberately candid about incompleteness — do not read "a component exists" as "the feature works."

## Snapshot

CRWN is **live in production** (`thecrwn.app`) and the core money loop is real and hardened. The codebase is **large and layered** — it has grown many parallel feature surfaces (60+ API domains, 25 crons, 117 migrations, ~89 pages) faster than it has been consolidated. Recent work (git log) shows two threads: (1) a **security-hardening sprint** (entitlement oracle, signed audio, RLS canary) and (2) building/stabilizing the **Quest Engine / Rise Mode** gamification layer, which is the current frontier and **dark-launched (flag off)**. `Confirmed`.

## Complete & production-ready (Confirmed)

- **Auth + onboarding + setup wizard** (`/welcome` → `/setup`, DB-derived completion, hard gate, daily canary). `setup_completed` now persists via the service-role `POST /api/artist/complete-setup` route (was a silent client `.update()`).
- **Fan subscriptions** (paid + free), **track/product/booking/live-ticket purchases**, **discount codes** (end-to-end wired), **Stripe Connect payouts** (weekly cron + on-demand cashout).
- **Content + gating** via `is_free`/`allowed_tier_ids` (redacting views enforce it).
- **Stripe webhook** (idempotent, signed, refunds/disputes handled).
- **Team Splits** (capped-hybrid, accrual cron, deliverables/disputes/release, separate cashout ledger) — carefully engineered.
- **Email**: campaigns + multi-step sequences + attribution + suppression + fan digest.
- **Analytics/CRM/funnel/pipeline** (admin) and **AI Manager** (artist, Pro+) + **admin autonomous agent** (internal).
- **Live streaming + VOD** (LiveKit, tier/ticket-gated, egress→R2, signed VOD).
- **Messaging/DMs** with voice notes (Pro-artist-gated, private-bucket signed audio).
- **Notifications** (in-app bell + realtime), **community** feed + channels (RLS-gated).
- **Gamified growth toolkit** (missions, squads, clip bounties, city-unlocks, road-campaigns, proof-of-demand, smart-links/pre-save, earn/impact/command) — all DB-backed, live independent of the Quest flag.
- **Recruiter/partner** program (dashboard, Stripe payouts, qualification crons).

## Experimental / dark-launched

- **Quest Engine / Rise Mode / Supporter Mode** — flag `admin_settings.quest_engine = {"enabled": false}` (`schema-phase2-quest-engine.sql`). Fully built and wired end-to-end (`src/lib/quests/*`, `src/components/quests/*`), consumers no-op gracefully when off. Under active development with two recently-fixed production bugs (`getQuests` ordered by a non-existent `sort_order`; `NULL is_active` excluded). `Confirmed`.
  - **Zero-to-hero artist journey (Prompt 2, shipped dark):** the artist catalog now covers the **Tutorial + Levels 1-4** (Foundation, Vault, Membership Ladder, Open the Gates), not just the old 1-3 seed. Level keys renamed to the journey labels (`progression.ts`); ~13 new artist quests with authoritative `DomainCheck` completion (profile-complete, socials, track-count, album, playlist, tier-count/benefits, plan-aware ladder, Stripe-connected, tier-purchasable, welcome-post) added to `evaluator.ts`. Level 2 catalog-shape planner (`VaultPlanner.tsx`, mounted atop `MusicManager`) using the shared `OptionSelect` to adapt recommended catalog steps and deep-link to the existing tracks/albums/playlists surfaces. Recommended four-tier ladder template (`src/lib/tierTemplate.ts` + `TierLadderTemplate.tsx`, mounted in `TierManager`) with edit/skip/preview and workload safeguards. Adaptive first-load recap in `/api/quests` (`recap` payload) + `RiseMode` banner; cascade loop raised to 12 for the deeper ladder. No migration required; all checks read existing tables. `Confirmed`.
  - **Full artist career game (Prompt 3, shipped dark):** Levels 5-10 + Empire Mode now seeded. ~40 new artist quests (Recruit Founding Fans, Build the First 10, Turn Fans Into a Community, Launch Your First Movement, Build the Growth Engine, Become the Artist CEO) with ~24 new authoritative `DomainCheck`s (free-member count, members-post count, went-live, survey, retention cycle, proof-of-demand, mission, squad, campaign closed/reached, smart link, captured lead, active sequence, referrals/clipper on, sent campaign, growth-loop composite, revenue milestone, MRR, team split, referral conversions, cities unlocked, and the `artist_beat_rise_mode` victory composite). Coaching-only steps use `kind:'manual'` completed through a NEW **guarded** `POST /api/quests/complete` that refuses any non-manual (domain/fan_event) quest, so financial/supporter milestones stay server-derived. Empire is escalating **non-repeatable** milestones (25/50/100/250/500 supporters, $1k/$5k MRR, referrals, cities) gated on the prior rung, so no XP farming. Main-game **victory** payload + `RiseMode` "You Beat Rise Mode" banner (real counts only). `recommendNextQuest` is now build-aware (boosts side quests by the artist build's `priorityCategories`; the main spine never branches). Opt-in full quest map + per-quest "Mark as done" for manual quests. No migration required. `Confirmed`.
  - **Setup ↔ Rise alignment (latest):** the Artist Setup Wizard now creates the **free "Community" entry point** by default (was a paid "$10 Inner Circle" tier) so setup and Rise Mode never ask for the same thing; the paid ladder is built in Rise Level 3, whose template recognizes the free Community tier by name. Setup completion CTA is now **"Start Rise Mode."** `/welcome` shows the minimum-viable-setup promise and a **"Build My CRWN"** CTA for artists. Rise Level 1 boss is **"Complete Your Artist Destination"** (authoritative composite: photo + banner + bio + slug + track + social link). A new **infrastructure-ready capstone** quest (`artist_infrastructure_ready`, L4) + RiseMode banner marks the setup→growth handoff, derived from a composite check (free+paid tier, Stripe connected, purchasable tier, track, community post, profile) — **not** overloading `setup_completed`. Executive Supporter recognition disclaimer expanded to explicitly exclude master ownership, publishing, songwriting/producer credit, royalties, revenue participation, approval rights, creative control, and Team Split. No migration. `Confirmed`.
  - **Closeout fixes:** the previously-corrupted `supabase/schema-phase2-quest-notifications.sql` (`EXECUccTE`/`L88OOP`) is repaired to valid PL/pgSQL and ready to apply. A zero-dependency catalog integrity guard (`scripts/verify-quest-catalog.mjs`, `npm run verify:quests`) asserts unique keys, resolvable prerequisites/fan-quest refs, and that every domain `check` is both declared in the union and handled by an evaluator case (currently: 71 quests, 43 checks, all clean). `Confirmed`.
- **`$99 "label" platform tier** — fully specced (`TIER_LIMITS`, Stripe price env vars) but **hard-disabled** (checkout whitelists `pro` only). `Confirmed`.
- **Benefit catalog "coming soon" items** (`benefitCatalog.ts:225`, e.g. `monthly_merch`) — explicitly `available:false`. `Confirmed`.

## Partial / gaps (Confirmed)

- **SMS deferred-send queue not implemented** (`sms/send/route.ts:155`) — quiet-hour messages are counted but silently dropped, never queued.
- **`campaign-hub` per-campaign breakdowns** — "coming soon" placeholder (`campaign-hub/page.tsx:220`).
- **Admin "fan referral tracking"** metric — "coming soon" tooltip (`AdminDashboard.tsx:68`).
- **Downgrade scheduling** — `subscription-update` writes `pending_tier_id`/`pending_change_date` to the DB but no Stripe-side schedule call was found in that route; the webhook only *applies* a pending change once Stripe's price already matches. Trace before trusting downgrades apply on Stripe's side. `Strongly inferred` gap.
- **No user-facing account hard-delete/GDPR erasure** path found. Deactivate/reactivate is now a working pair (deactivate genuinely hides the artist publicly at the app layer, reactivate fires on next login), just not a hard-delete. `Needs founder confirmation`.
- **No web/push notifications** — `public/sw.js` has no push listener; notifications are foreground-only. `Confirmed`.

## Legacy / duplicated / dead (Confirmed)

- **`src/app/artist/[slug]/*` vs `src/app/[slug]/*`** — the top-level `artist/[slug]/page.tsx` is a redirect shim, but the subroutes (`track/album/post/playlist/[id]`, `book/success`) are **full near-byte-identical duplicates** that have already **drifted one field** (album `description`). `[slug]/*` is canonical. Stray link `TrackUploadForm.tsx:525` still builds `/artist/${slug}`. Recommend deleting or shimming the duplicates.
- **`empire` platform tier** — dead/spec but **still wired into a live type union + fee/limit config + Stripe env placeholders + admin-dashboard metric across ~20 files**. Latent bug if a stale row ever reads `platform_tier='empire'`.
- **Legacy `access_level` enum** — superseded by `is_free`/`allowed_tier_ids` but still present on `tracks`/`albums`/`products`/posts columns **and** in the TS `Track`/`Album`/`Post`/`CommunityPost` types. A live foot-gun.
- **`useContentAccess.ts`** — old access model, only one consumer (`GatedCommunityPost`); superseded by `useSubscription`.
- **Calendly booking components** (`CalendlyBooking`, `SessionManager`, `BookingSettings`) — **not imported anywhere**; superseded by booking tokens.
- **Dead components:** `OnboardingTaglineStep.tsx`, `ArtistProfileForm mode="onboarding"` (zero call sites). `/onboarding` (auth group) is a static placeholder.
- **Dead barrel files:** `src/components/ui/index.ts` and `src/hooks/index.ts` are `export {}` placeholders (everything imports by direct path).
- **Legacy social layer:** `posts`/`comments`/`likes` (ticket7) overlaps `community_posts/*` and `community_channels/*` — confirm which is live.
- **Notification dead link:** `notifyNewPost`/`notifyNewComment` write `link:'/community'`, a route that doesn't exist → 404 on click.

## Design-system debt (Confirmed, from CSS audit)

- **`bg-crwn-card` is an undefined Tailwind v4 token used in 56 files** — with no `tailwind.config.*` and no `@theme` entry, it likely compiles to nothing (transparent). The real token is `bg-crwn-surface`.
- **Color mismatch:** `--crwn-bg` is `#0f0f0f` but `layout.tsx` hardcodes `#0D0D0D` (and CLAUDE.md/PRD say `#0D0D0D`).
- **Font var leftover:** `globals.css` sets `--font-sans: var(--font-geist-sans)` but `layout.tsx` defines `--font-inter` — body text may be falling back to system-ui. `Strongly inferred`, verify in devtools.
- **Two stagger mechanisms** coexist (CSS `.stagger-fade-in` vs `<StaggerChildren>`).

## Mock data / seeds

- Only **marketing mockups** use fake data (`(public)/worth/mocks.tsx`, `recruit/page.tsx` `MockRecruiterDashboard`) — intentional illustrations, not bugs. Production UI queries Supabase directly.
- Demo seeds (`seed-demo-*.sql`) populate the `m3rcey` test artist; `__canary*` users are synthetic health-check accounts (skipped by notification hooks).
- **Stale copy in the recruit marketing page** (`recruit/page.tsx:162`) still says "Pro $50, Label $150, Empire $350" — contradicts current pricing.

## Testing

**Zero automated tests, codebase-wide.** No jest/vitest/playwright config, no `.test`/`.spec` files, no `test` npm script. Verification is the `npm run build` gate + the `onboarding-health` and `rls-canary` crons that exercise real RLS paths against production. `Confirmed`.

## Incident history (from migration filenames + git log)

Repairs/hardening migrations reveal past incidents: `artist-approval-gate-repair` (publish broke silently for months), `revoke/fix-entitlement-oracle` (paid-content access outage), the signed-audio arc (paid-track audio leak), `cashout-rpc-lockdown`, `agent-tables-rls` (forgeable agent log), `money-ledger-rls` (money tables had no RLS). These are **fixed**, but they define the sensitive zones. `Confirmed`.

## Highest-value cleanup opportunities (recommendation, most-critical-first)

1. **Fix HIGH security findings** (unauthenticated webhooks, `NEXT_PUBLIC_CRON_SECRET`) — see `11-SECURITY-AND-PRIVACY.md`.
2. **Get a full schema dump** for the money tables lacking CREATE TABLE migrations — see `05-DATABASE.md`.
3. **Delete/shim the `artist/[slug]/*` duplicate subroutes** (they drift silently).
4. **Fix `bg-crwn-card`** (56 files rendering wrong background).
5. **Excise the dead `empire` tier** from the live type union + config.
6. **Drop legacy `access_level`** from types to stop new code reading the wrong field.

---

*See also: [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [14-ROADMAP-INFERRED.md](14-ROADMAP-INFERRED.md) · [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md)*
