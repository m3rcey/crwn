# 16 — Glossary

> CRWN-specific terms, roles, tables, and confusing names. Grounded in code/docs.

## Roles & actors
- **Fan** — default role (`profiles.role='fan'`); listener/buyer/promoter.
- **Artist** — `profiles.role='artist'`, has an `artist_profiles` row; publishes + monetizes. Promotion is server-side on publish.
- **Admin** — `profiles.role='admin'`; CRWN internal operator (Josh).
- **Recruiter / Partner** — an influencer who refers *artists* to the platform for commission (`recruiters`, `partner_applications`). "Partner" is a higher, scored tier of recruiter.
- **Collaborator** — a user on an artist's **Team Split** deal (`team_split_deals.collaborator_user_id`).
- **Clipper** — a fan who makes short clips to drive subscriptions (Clip-to-Earn); a `referrals.source='clipper'` variant of a referrer.

## Product concepts
- **Tier (fan tier / subscription tier)** — an artist's paid membership level (`subscription_tiers`), e.g. The Wave $10 / Inner Circle $50 / Throne $200 (test artist). NOT the platform tier.
- **Platform tier** — the artist's CRWN SaaS plan (repriced 2026-07-31): **Launch** (`starter`, $0, 12%) / **Pro** ($49/mo, 8%) / **Scale** (`scale`, $199/mo, 5%; renamed from the old spec-only `label` $99 concept). Sets fee % and limits. `empire` was deleted 2026-07-31; `resolveTierKey()` aliases stray `label`/`empire` strings to `scale`.
- **Founding artist** — **RETIRED (2026-07-15), and it never paid out.** Was meant to be a flat 5% fee for 6 months via `is_founding_artist`. The override is gone from `getArtistFeePercent()`, nothing writes the flag, and no production row ever carried it. The column and a `FoundingBadge` component still exist as inert residue. Do not quote a founding-artist fee.
- **Benefit** — a perk attached to a tier (`tier_benefits` + `benefitCatalog.ts`); some are "coming soon".
- **Product** — a shop item: `digital` / `physical` / `experience` / `bundle`.
- **Experience** — a bookable/scheduled product (1-on-1, group session); Pro-gated.
- **Booking token** — a one-time redeemable token granting a scheduling link after purchase (the live booking flow; supersedes the old Calendly embed).
- **Content access model** — `is_free` (bool) + `allowed_tier_ids` (JSONB tier UUIDs) + optional `price`. Replaces the legacy `access_level` enum.
- **Rise Mode / Supporter Mode / Quest Engine** — dark-launched gamification layer (XP/levels/streaks/quests) that *guides*, does not gate access. Flag `admin_settings.quest_engine`.
- **Mission** — one trackable fan action toward a goal (share/clip/rsvp/vote…), `missions`.
- **Squad** — a role-based group of an artist's fans (clippers/street team), `artist_squads`.
- **Clip Bounty** — a bonus challenge for clippers, non-cash rewards in v1 (`clip_bounties`).
- **City Unlock** — fans push a city past a demand threshold to unlock a local show/drop (`city_unlocks`).
- **Road Campaign** — a "Road to X" fan-funding/goal campaign (`road_campaigns`); shown under `/campaigns` and `campaign-hub`.
- **Proof of Demand** — money-free RSVP/vote/waitlist test to validate an idea before it becomes a paid offer (`proof_of_demand`). Deliberately excluded from the unified calculator's dollar total: it takes no money by design.
- **Unified Opportunity Calculator** — the 18th public tool (`/tools/opportunity-calculator`), the only ALL-IN-ONE one. Models every opportunity in ONE layered model instead of summing the other calculators, which would count the same fans and the same dollars several times. `src/lib/opportunity/unifiedModel.ts`. See `docs/UNIFIED_OPPORTUNITY.md`.
- **Overlap-safe** — the property that no fan, subscriber, offer or revenue event is counted more than once across opportunities. Enforced by a disjoint-population rule (every dollar is paid by a member or a non-member, never both) and asserted by 82 tests, not by convention.
- **Acquisition vs offer** — Share-to-Earn and Clip-to-Earn are ACQUISITION systems: they change how many supporters arrive and where they came from. They produce **no revenue line of their own**; their money is already inside the membership number. Treating either as a separate income stream is the classic double-count.
- **Entry context** — `?from=<tool-slug>` on the unified calculator. Reorders the wizard so a single-opportunity video leads with its own questions. Reordering ONLY: it never adds or removes a question, because different entries must not produce different models.
- **Offer** — NOT a table; a read-only aggregator view over tiers + products (`/offers`).
- **Smart Link / Pre-Save** — trackable external link (`smart_links`) that can capture email/phone; pre-save is a mode of the same table.
- **Team Split** — a capped-hybrid revenue-share deal with a collaborator (percentage sets rate, cap sets max amount; net-basis).
- **Playbook** — a predefined multi-step campaign template the artist can "run" (`playbook_runs`).
- **AI Manager** — the artist-facing DeepSeek insights/actions panel (Pro+; Free gets rule-based "starter nudges").
- **Autonomous Agent** — the admin-side AI that auto-executes whitelisted low-risk ops and escalates the rest (internal, dark-launched).

## Money & attribution terms
- **Application fee** — CRWN's cut skimmed from a fan→artist Stripe payment (`application_fee_percent` for subs, `application_fee_amount` for one-time).
- **Platform account vs Connect account** — subscriptions/prices live on the CRWN *platform* Stripe account; artist payouts go to per-artist *Connect Express* accounts via `transfer_data.destination`.
- **earnings** — the unified revenue-event ledger (gross/platform_fee/net + UTM attribution).
- **Attributed cut / clipper rate** — extra artist-funded commission added on top of the platform fee for a referred/clipped subscription.
- **Cashout** — on-demand withdrawal: artist ($2 fee), fan/collaborator ($25 min, atomic RPC).
- **LGP / MRR / CAC** — admin KPIs: Lifetime Gross Payments, Monthly Recurring Revenue, Customer Acquisition Cost.
- **Acquisition source** — `organic | recruiter | partner | founding` on `artist_profiles`.
- **Activation milestones** — JSONB progress markers (`onboarding_completed`, first track, tiers, `stripe_connected`, first subscriber) driving nudge sequences.

## Technical terms
- **Service-role / admin client** — Supabase client using `SUPABASE_SERVICE_ROLE_KEY`; **bypasses RLS**; API routes only.
- **Anon / browser client** — Supabase client using the anon key; **respects RLS**.
- **Entitlement oracle** — SECURITY DEFINER functions (`can_play_track`, `can_read_community_post`) that redact paid columns in Postgres; queried via redacting views (`tracks_public`, `community_posts_feed`).
- **Column privileges** — per-column GRANT/REVOKE protecting Stripe ids, audio urls, frozen columns (role/tier) even from an RLS-permitted row read.
- **smartBack** — `smartBack(router, fallback)` back-navigation helper honoring in-app history / `returnTo`.
- **OptionSelect** — the shared single-choice dropdown component (mandated for pick-one-of-3+).
- **Canary** — synthetic health check: `onboarding-health` (publish/RLS/upload) and `rls-canary` (entitlement from the outside), both email the founder on failure. `__canary*` slugs are skipped by hooks.
- **Setup wizard** — the mandatory post-signup `/setup` flow (one field per screen).

## Potentially confusing name pairs
- **Tier** (fan subscription) vs **Platform tier** (artist SaaS plan).
- **Referral** (fan → subscriber) vs **Recruiter/Partner** (referrer → artist).
- **Campaigns** (`/campaigns` = road campaigns) vs **Campaign Hub** (`/campaign-hub` growth dashboard) vs **Email campaigns** (`/api/campaigns`) vs **Sequences** (drip automation).
- **`access_level`** (legacy enum, dead) vs **`is_free`/`allowed_tier_ids`** (current).
- **`album_tracks.track_number`** vs **`playlist_tracks.position`** (different ordering columns).
- **`[slug]`** (canonical artist pages) vs **`artist/[slug]`** (legacy redirect + dead dupes).
- **`empire`** — a dead platform tier, fully deleted 2026-07-31 (`resolveTierKey()` aliases any stray string to `scale`).
- **`neu-*` CSS classes** — flat design, NOT neumorphic (naming leftover).

---

*See also: [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [05-DATABASE.md](05-DATABASE.md) · [07-BUSINESS-RULES.md](07-BUSINESS-RULES.md)*
