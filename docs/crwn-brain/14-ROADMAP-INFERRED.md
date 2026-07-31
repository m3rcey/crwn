# 14 — Inferred Roadmap

> ⚠️ **ENTIRELY INFERRED from repository evidence (git log, feature flags, TODOs, unfinished code). This is NOT a founder-provided roadmap and requires confirmation.** Do not treat any item as committed strategy. See `17-OPEN-QUESTIONS.md`.

## Signal: what the code says the team is doing now
Recent git history (last ~30 commits) shows two active threads: (1) a **security-hardening sprint** just completed (entitlement oracle, signed audio, RLS canary, agent-tables RLS), and (2) **building/stabilizing the Quest Engine / Rise Mode** gamification layer (dark-launched, multiple recent bugfixes), plus a copy-quality pass (em-dash removal) and UX polish (dropdowns, Rise Mode return-to). `Confirmed` (git log).

## Likely near-term priorities (inferred)
1. **Ship the Quest Engine / Rise Mode** — flip `admin_settings.quest_engine` on after stabilization. It's the dominant WIP; the recent "getQuests ordered by non-existent sort_order returned []" bug suggests it's close but not yet trusted. `Strongly inferred`.
2. **Finish the two remaining HIGH security fixes** — verify Resend inbound webhooks and the `NEXT_PUBLIC_CRON_SECRET` pattern. (The Twilio inbound webhook is gone: SMS was removed 2026-07-31.) Given the just-completed security sprint, these fit the current arc. `Strongly inferred`.
3. **Possibly activate the `$99 label` tier** — fully specced and env-wired but hard-disabled. A pricing/packaging decision away from launch. `Needs founder confirmation`.

## Unfinished features (evidence-backed)
- ~~SMS deferred-send queue~~ Moot since 2026-07-31: the SMS feature was removed entirely.
- **Campaign-hub per-campaign breakdowns** and **admin fan-referral tracking metric** — explicit "coming soon" placeholders.
- **Benefit catalog "coming soon" items** (e.g. `monthly_merch`).
- **Subscription downgrade** Stripe-side application — appears to write DB fields without a Stripe schedule call; needs completion/verification.
- **Playbooks run engine** — thin/partial.

## Missing infrastructure (inferred gaps)
- **A checked-in schema for the money tables** (`earnings`, `referrals`, etc.) — currently unrecoverable from the repo. Highest-priority infra gap.
- **A migration registry / runner** — 117 manual SQL files with no applied-state tracking.
- **Automated tests** — none; a regression suite around money + entitlement paths would de-risk the large surface.
- **Error monitoring / structured logging** — no Sentry/APM.
- **Web push notifications** — `sw.js` has no push listener; only foreground notifications today.
- **Account hard-delete / GDPR erasure** — only soft deactivate exists.

## Technical prerequisites before scaling
- Consolidate the **admin Supabase client** and **ownership-check helper** (reduce per-route copy-paste risk).
- Extract the **fee-calc formula** to one function.
- Remove **dead code** that risks bugs: `empire` tier from the type union, legacy `access_level` from types, duplicate `artist/[slug]` routes.
- Fix the **design-token drift** (`bg-crwn-card`, color/font vars) before more UI is built on it.

## High-risk blockers
- **Money tables without CREATE TABLE migrations** — blocks reproducible environments and disaster recovery. `Critical`.
- **Unauthenticated state-mutating webhooks** — abuse could break email deliverability platform-wide (SMS removed 2026-07-31). `High`.
- **No tests + huge surface** — every change risks silent regressions (as the `getQuests` and entitlement-oracle incidents show). `High`.

## Product opportunities suggested by existing code
- The acquisition machine (recruiters/partners/funnel/CRM/attribution) is built but its live impact is unclear — an opportunity to **activate and measure** it. (The `.claude/agents/*` roster — zara/miles/orion/etc. — suggests an intent to run growth analytics as agents.)
- The AI Manager + autonomous agent could move more artist-ops from manual to assisted once trusted.
- Sync-licensing opportunities (currently AI-synthesized placeholder data) could become a real marketplace.
- PRD §15 legacy roadmap items (API access for higher tiers, HubSpot, podcast hosting, social tokens, A/B email testing) remain unbuilt — confirm which survive.

## Recommended sequencing (inferred recommendation, most-critical-first)
1. Close the two HIGH security findings.
2. Obtain/commit the money-table schema; add a migration registry.
3. Decide Quest Engine launch; stabilize + flip flag.
4. Cleanup pass: dead `empire`/`access_level`/duplicate routes; design tokens.
5. Add a minimal test/monitoring baseline around money + entitlement.
6. Then decide on `$99` tier + acquisition activation as growth levers.

---

*All items above are inference from code, not confirmed plans. See [17-OPEN-QUESTIONS.md](17-OPEN-QUESTIONS.md) and [13-CURRENT-STATE.md](13-CURRENT-STATE.md).*
