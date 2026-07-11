# Rise Mode: Zero-to-Hero Artist Journey — Implementation Blueprint

> Repository-grounded architecture document. **Investigation only — no application code, migrations, UI, business rules, or the Quest Engine flag were changed.** Every claim cites a file. Verified against the live repo at branch `master`, not against docs alone.

---

## 0. How to read this

The central finding, stated once: **the Quest Engine is already built, correct, and wired; the gap is the quest _catalog_.** `progression.ts` defines 10 artist levels, but `templates.ts` ships only Levels 1-3 (a self-described "Phase-1 seed", `templates.ts:6-9`). Turning Rise Mode into a full zero-to-hero journey is **data entry against an existing, sound shape** plus a small number of additive `DomainCheck` cases — not a new system. The risk is not "can we build it" but "do the completion conditions map to signals the platform actually produces." Sections 7 and the buildability tables are the load-bearing parts of this document.

---

## 1. Current-state summary

| Fact | Evidence |
|---|---|
| Quest Engine fully built, **dark-launched** (`admin_settings.quest_engine = {"enabled":false}`); no code path flips it on (SQL only). | `schema-phase2-quest-engine.sql:255-257`; `index.ts:392-399`; `13-CURRENT-STATE.md:26` |
| Completion is **server-derived** from authoritative tables, never client-asserted. | `evaluator.ts:83-190`, header `:1-10` |
| XP is **idempotent** via `xp_ledger` (partial-unique-index-safe check-then-insert). | `evaluator.ts:327-366`; `schema-phase2-quest-engine.sql:241-242` |
| **Unlocks are disclosure-only, never access.** Platform tier + RLS + entitlement oracle do gating. | `types.ts:2-3`; `evaluator.ts:368`; `11-SECURITY-AND-PRIVACY.md:14` |
| `GET /api/quests` already runs the **full adaptive cascade**: `ensureRoleQuests` → 6×(`unlockEligibleQuests`+`refreshQuests`) → `reconcileXp`. | `api/quests/route.ts:25-133` |
| **10 artist levels defined**, only **Levels 1-3 seeded** (7 artist quests + 3 live quests + 5 fan quests). | `progression.ts:13-24`; `templates.ts:16-349` |
| Rise tab is **mounted and is the default artist tab**, but renders a "coming soon" placeholder while the flag is off. | `(main)/profile/artist/page.tsx:22,41-42,240-242`; `RiseMode.tsx:181-191` |
| No quest crons; **artist→fan quest fan-out is unbuilt** (Phase-3 stub). | grep `src/app/api/cron/*` = none; `index.ts:290-292` |
| Setup wizard and Quest Engine are **fully decoupled** — the wizard makes no quest calls; both just read the same DB rows. | grep of `src/app/setup`, `(auth)`, `useArtistSetup` = no quest refs |

**Three defects to flag (repair required before any launch, but out of scope for this investigation):**
1. `schema-phase2-quest-notifications.sql` has **corrupted tokens** (`EXECUccTE:31`, `L88OOP:32`) and will fail to run; it shows as modified in git status.
2. Live Quest UI is **dead** — `LiveQuestBar.tsx` and `LiveQuestLauncher.tsx` are defined but mounted nowhere, so Live Quests and all client fan-engagement events have no entry point.
3. `syncTemplatesToDb` is **never called** (`templates.ts:381`), so the `quest_templates` DB table sits empty. The engine runs off the in-memory `QUEST_TEMPLATES` registry, so this is non-fatal today, but any admin/AI-authored-quest feature is inert.

---

## 2. Existing quest inventory

Full catalog from `templates.ts`. "Derived" = completion reads authoritative state (not manual/client). "Functional" = the condition maps to a signal that is actually produced today.

### Artist quests

| Key | Title | levelKey | questType | Prereqs | Completion condition | XP | Unlocks | Auto-assigned | Derived | Functional | Keep/Move/Expand/Replace/Remove |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `artist_add_photo` | Add your artist photo | setup | onboarding | – | domain `artist_has_avatar` | 25 | `rise_feed` | yes | yes | **yes** | **Keep** (→ Tutorial) |
| `artist_upload_first_track` | Upload an exclusive track | setup | main | – | domain `artist_has_track` | 50 | – | yes | yes | **yes** | **Keep** (→ Tutorial). Copy over-claims "unreleased" (no such flag). |
| `artist_create_free_tier` | Create a free tier | setup | main | `artist_upload_first_track` | domain `artist_has_free_tier` (price=0) | 50 | `supporter_leaderboard` | yes | yes | partial | **Move → L3**, fix prereq (see §11) |
| `artist_build_first_offer` | Create a paid supporter tier | setup | main | `artist_create_free_tier` | domain `artist_has_paid_offer` (price>0) | 100 | – | yes | yes | partial | **Move → L3**, break the free→paid prereq chain |
| `artist_first_supporter` | Get your first paid supporter | first_supporters | **boss** | `artist_build_first_offer` | domain `artist_supporter_count`=1 | 250 | – | yes | yes | **yes** | **Keep** (→ L5 boss) |
| `artist_ten_supporters` | Reach 10 supporters | first_supporters | **boss** | `artist_first_supporter` | domain `artist_supporter_count`=10 | 500 | `fan_missions`,`campaign_hub` | yes | yes | **yes** | **Keep** (→ L6 boss) |
| `artist_create_road_campaign` | Launch your first Road To | campaign_starter | main | `artist_ten_supporters` | domain `artist_has_campaign` | 250 | `road_to_pages` | yes | yes | **yes** | **Move → L8** |

### Live quests (on-demand, not auto-assigned; **currently unreachable — dead UI**)

| Key | Completion | XP | Notes |
|---|---|---|---|
| `live_build_offer` | domain `artist_has_offer` | 150 | Needs `LiveQuestLauncher` mounted to be reachable |
| `live_launch_campaign` | domain `artist_has_campaign` | 200 | same |
| `live_final_push` | **manual** | 150 | manual by design |

### Fan quests (Stages 1-2)

| Key | Completion | XP | Functional |
|---|---|---|---|
| `fan_listen_first_track` | fan_event `like` ≥1 | 10 | **No** — `like` only emitted by dead LiveQuestBar |
| `fan_subscribe_to_artist` | domain `fan_has_subscription` | 100 | **yes** |
| `fan_back_campaign` | fan_event `custom`/`campaign` ⚠️ template says `share`/`campaign` | 100 | **Broken** — support route emits `custom`, template keys on `share` (`templates.ts:257` vs `api/road-campaigns/[id]/support/route.ts:35`) |
| `fan_share_campaign` | fan_event `share`/`campaign` | 25 | **No** — no producer emits `share` |
| `fan_invite_friend` | domain `fan_referral_count`≥1 | 50 | **yes** |

**Two confirmed template bugs:** `fan_back_campaign` and `fan_share_campaign` key on the `share` event type, which nothing emits; the campaign support route emits `custom`/`campaign`. Fix when the fan questline is next touched.

---

## 3. Gaps in the current progression

1. **Levels 4-10 have no templates** (`fan_activation`, `promotion_engine`, `live_movement`, `team_builder`, `city_builder`, `movement_os`, `full_movement` are XP labels with zero quests).
2. **No endgame / questline / repeatable-scaling quests** exist. `quest_type` supports `weekly_goal`, `questline_step`, `retention_quest`, `fulfillment_quest`, `ai_recommended_quest` (`types.ts:7-21`) but none are seeded.
3. **Catalog depth is unrepresented** — only `artist_has_track` (≥1). No album, playlist, or ≥N-track quest, and **no released/unreleased flag exists** in the schema.
4. **Stripe-connect / "publish & test the funnel" is unrepresented** — no `DomainCheck` reads connect status or the fan-journey test.
5. **Community, live, fulfillment, growth-engine, and CEO capabilities are all production-ready but questless** (email, SMS, sequences, smart links, segments, CRM, referrals, clipper, bounties, city unlocks, proof of demand, team splits, analytics, AI Manager).
6. **Fan-side engagement signals are mostly not emitted** — `fan_events` is broad but sparsely populated (see §7).
7. **Build branching is defined but unused by the catalog** — `buildTags` exists on the template type (`types.ts:117`) but no template sets it, so `ARTIST_BUILDS.priorityCategories` (`builds.ts`) can't yet reprioritize the board.

---

## 4. Recommended final level structure

Keep the existing 10-slot XP curve (`ARTIST_LEVEL_XP`, `progression.ts:10`) and **relabel the 10 `level_key`s to the journey below**. The "Tutorial" is **not** an XP level — it is the existing `/setup` wizard, which already hard-gates entry (`(main)/layout.tsx:33-59`). Rise Mode picks up **after** the wizard. This preserves the wizard's proven completion machinery and avoids duplicating setup as quests.

| New level | Proposed `level_key` (rename) | Old `level_key` slot | Belongs in this order? |
|---|---|---|---|
| **Tutorial: Enter the Kingdom** | *(wizard, pre-Rise)* | – | Yes — it's the existing gate; do not re-implement as quests |
| **L1: Build Your Foundation** | `foundation` | setup | Yes |
| **L2: Build Your Vault** | `vault` | first_supporters* | Yes, **with reframed condition** (§10 caveat) |
| **L3: Build Your Membership Ladder** | `ladder` | campaign_starter* | Yes — but see four-tier conflict (§11) |
| **L4: Open the Gates** | `open_gates` | fan_activation | Yes |
| **L5: Recruit Your Founding Fans** | `founding_fans` | promotion_engine | Yes |
| **L6: Build the First 10** | `first_ten` | live_movement | Yes |
| **L7: Turn Fans Into a Community** | `community_os` | team_builder | Yes, **artist-side conditions only in v1** (§7) |
| **L8: Launch Your First Movement** | `first_movement` | city_builder | Yes |
| **L9: Build the Growth Engine** | `growth_engine` | movement_os | Yes |
| **L10: Become the Artist CEO** | `artist_ceo` | full_movement | Yes |
| **Endgame: Empire Mode** | `empire` (new, above max XP) | – | Yes — repeatable `weekly_goal`/`questline_step` |

\* The old slot ordering (`first_supporters` at level 2) does not match the new journey; because a quest's `levelKey` is just a **grouping label** and the user's numeric level comes from **cumulative XP**, the rename is a display/label change. **Keep XP rewards tuned so completing a level's quests crosses that level's XP threshold** (e.g. L1 quests should sum to ≥150 XP to reach level 2). This XP↔level alignment is the one thing that will drift if quests are added carelessly.

**Ordering verdict:** The proposed sequence is sound and matches the natural money-flow dependency chain (identity → catalog → offer → payments → first fans → scale fans → retain → campaign → systematize → operate). The only reordering to consider: **L2 (Vault) before L3 (Ladder)** is correct because tiers reference content as benefits, but on a Free plan the single tier is created in the wizard already — so L3 for a Starter artist is largely a "review/enrich your one tier" step, not "build four."

---

## 5. Quest-by-quest mapping

Notation: **M** main, **S** side, **B** boss. Condition source in `[brackets]`; "NEW check" = additive `DomainCheck` case in `evalDomain` (`evaluator.ts:88`). All new checks reuse the NULL-safe `countActive` pattern.

### Tutorial (wizard — existing, no new quests)
Recognized retroactively by Rise on first load: `artist_add_photo` [domain `artist_has_avatar`], `artist_upload_first_track` [domain `artist_has_track`]. **Keep as-is.**

### L1 — Build Your Foundation
- **M** `artist_complete_profile` — tagline + banner + bio present [NEW check `artist_profile_complete` reading `artist_profiles.tagline/banner_url` + `profiles.bio`]. Rise-native replacement for the profile fields the wizard deliberately defers.
- **S** `artist_add_socials` — `profiles.social_links` non-empty [NEW check `artist_has_socials`].
- **M/Boss** `artist_public_profile_live` — artist_profiles row + ≥1 public track [reuse `artist_has_track` + row existence]. **Boss = "your page is real."**

### L2 — Build Your Vault
- **M** `artist_catalog_depth` — ≥3 active tracks [NEW check `artist_track_count`, count≥3, reuses the `count` param pattern from `artist_supporter_count` `evaluator.ts:160`].
- **S** `artist_first_album` — ≥1 active album [NEW check `artist_has_album` counting `albums WHERE artist_id AND is_active≠false`].
- **S** `artist_first_playlist` — ≥1 artist playlist [NEW check `artist_has_playlist`].
- ⚠️ **Do NOT** promise "organize released vs unreleased" — no schema flag exists (see §10).

### L3 — Build Your Membership Ladder
- **M** `artist_free_front_door` — ≥1 free tier [`artist_has_free_tier`]. **Plan-aware** (§11).
- **M** `artist_paid_tier` — ≥1 paid tier [`artist_has_paid_offer`].
- **M** `artist_tier_benefits` — tier has ≥1 benefit [NEW check `artist_tier_has_benefits` reading `access_config.benefits` length or `tier_benefits` rows].
- **Boss** `artist_ladder_built` — tier count meets plan target [NEW check `artist_tier_count`, threshold **plan-derived**, not hardcoded 4].

### L4 — Open the Gates
- **M/Boss** `artist_stripe_connected` — Stripe charges enabled [NEW check `artist_stripe_connected` reading `artist_profiles.stripe_connect_id NOT NULL` AND the `activation_milestones.stripe_connected` flag set by `connect/status` backfill; `07-BUSINESS-RULES.md:43`]. **This is the money gate; must be authoritative, never manual.**
- **S** `artist_offer_published` — ≥1 tier with a Stripe price id (backfill ran) [NEW check `artist_tier_purchasable` reading `subscription_tiers.stripe_price_id NOT NULL`].
- **S** `artist_test_fan_journey` — **manual** (view your own public page as a fan); the only defensible manual quest here, low-stakes.

### L5 — Recruit Your Founding Fans
- **M** `artist_first_free_member` — ≥1 free subscription [NEW check `artist_free_supporter_count`≥1, counting `subscriptions` joined to price-0 tier, or `subscriptions.status='active'` with tier price 0].
- **B** `artist_first_supporter` — ≥1 paid supporter [`artist_supporter_count`=1]. **Keep existing boss.**

### L6 — Build the First 10
- **B** `artist_ten_supporters` — 10 active supporters [`artist_supporter_count`=10]. **Keep existing boss.**
- **S** side acquisition quests (guidance, non-blocking): turn on referrals [NEW `artist_referrals_on` reading `referral_commission_rate>0`], publish a smart link [NEW `artist_has_smart_link`].

### L7 — Turn Fans Into a Community (artist-side signals only, v1)
- **M** `artist_first_community_post` — ≥1 community post [NEW check `artist_has_community_post` counting `community_posts WHERE artist_id`].
- **M** `artist_fulfill_benefit` — ≥1 fulfillment event [NEW check `artist_fulfillment_done` reading `fulfillment_events`/`fulfillment_obligations`; Promise Calendar, `02-FEATURE-MAP.md:65`].
- **S** `artist_send_first_email` — ≥1 sent blast [NEW `artist_sent_email` reading `campaigns WHERE status='sent'`].
- **Boss** `artist_retention_cycle` — collected retention feedback OR ran a re-engagement [NEW `artist_has_survey_response` reading `survey_responses`].
- ⚠️ Fan like/comment/live-join are **not** completion sources in v1 (unemitted, §7). Keep them as guidance steps, not conditions.

### L8 — Launch Your First Movement
- **M** `artist_create_road_campaign` — ≥1 campaign [`artist_has_campaign`]. **Move existing here.**
- **Boss** `artist_campaign_reached` — a campaign hit its goal [NEW check `artist_campaign_reached` reading `road_campaigns.status='reached'`; state exists, `api/road-campaigns/[id]/support/route.ts:39-45`].
- **S (fan-facing, connected):** repair + reuse `fan_back_campaign` (fix to `custom`/`campaign`), `fan_invite_friend`.

### L9 — Build the Growth Engine
All authoritative row-count checks (add cases; each is one `countActive`):
- **M** `artist_activate_sequence` — ≥1 active sequence [NEW `artist_has_active_sequence` reading `sequences.is_active=true`]. Frame as "activate a lifecycle sequence," not "build automation" (it's trigger-drip, `03` note).
- **M** `artist_launch_clipper` — clipper program on [NEW `artist_clipper_on` reading `clipper_commission_rate>0 AND clipper_campaign_started_at NOT NULL`; **Pro-gated**, set `requiredFeature`].
- **S** `artist_launch_bounty` — ≥1 active bounty [NEW `artist_has_bounty`]; `artist_build_segment` — ≥1 saved segment [NEW `artist_has_segment`]; `artist_import_contacts` — ≥N `fan_contacts` [NEW `artist_contacts_count`].
- **Boss** `artist_growth_loop_live` — referrals on **and** ≥1 smart link **and** ≥1 sent campaign (composite of the above checks).

### L10 — Become the Artist CEO
- **M** `artist_build_team` — ≥1 accepted team split deal [NEW `artist_has_team_split` reading `team_split_deals.status IN ('accepted','active')`; matches `team_builder` slot].
- **M** `artist_review_analytics` — engaged analytics/AI [NEW `artist_engaged_ai` reading `ai_insights.is_read=true` OR `artist_agent_actions.status='executed'`].
- **S** `artist_revenue_milestone` — reach $X MRR [**computed value** — needs a summing check or a stored milestone in `activation_milestones`/`milestones.ts`, not plain `countActive`].
- **Boss** `artist_90_day_plan` — **manual** (commit a 90-day plan) — acceptable manual because it's a reflective artifact with no domain state.

### Endgame — Empire Mode
Repeatable `weekly_goal` + `questline_step` quests keyed on **deltas** (repeatable=true so they re-assign): grow supporters +N this month, ship a release, run a campaign, recruit a team member, unlock a city [`fan_event city_contribution` already emitted], hit a revenue delta. Use `repeatable:true` (already supported, `index.ts:88-102`) and `sinceDays` windows on fan-event checks (`types.ts:48`).

---

## 6. Main / side / boss / progressive-disclosure summary

- **Main quests** carry the level forward and should each map to authoritative domain state.
- **Side quests** are optional accelerators and **branch by build** (§10) — they are the natural home for `buildTags`.
- **Boss quests** are the level's money/proof milestone: L1 page-live, L3 ladder-built, L4 Stripe-connected, L5 first-paid-supporter, L6 ten-supporters, L7 retention-cycle, L8 campaign-reached, L9 growth-loop-live, L10 90-day-plan. Boss/`difficulty:'boss'` already drives the `quest_milestone` celebration path (`evaluator.ts:414`).
- **Progressive disclosure** = `reward.unlocks` writing `quest_unlocks` rows (disclosure keys only). Existing keys: `rise_feed`, `supporter_leaderboard`, `fan_missions`, `campaign_hub`, `road_to_pages`. Extend with new disclosure keys per level (e.g. `growth_engine_tools`, `team_tools`, `empire_mode`). **These reveal UI; they must never be read as an access check** — access stays with `platform_tier`/RLS.

---

## 7. Completion-condition matrix (buildability)

The decisive table. "NOW" = buildable on a signal produced today. "NEW-CHECK" = add a `DomainCheck` case (cheap, additive, one COUNT). "WIRING" = requires emitting a `fan_event` from a hot path (invasive). "COMPUTED" = needs a summing check or milestone store. "MANUAL" = no state signal; last resort.

| Milestone | Best source | Class | Notes |
|---|---|---|---|
| Avatar / track / free tier / paid tier / product / campaign-exists / supporter counts / fan subscription / fan referrals | existing `DomainCheck` | **NOW** | `evaluator.ts:88-189` |
| ≥N tracks, album, playlist, community post, went-live, sequence active, smart link, segment, team split, referrals-on, clipper-on, bounty, tier benefits, tier-count, tier-purchasable, campaign-reached, sent-email, SMS-list, fulfillment done, survey response | new `countActive` case | **NEW-CHECK** | 8 of 10 growth subsystems expose clean row-count signals |
| Stripe connected | `artist_profiles.stripe_connect_id` + `activation_milestones.stripe_connected` | **NEW-CHECK** | authoritative; never manual |
| Fan backed campaign / city contribution / bounty submit / squad join | `fan_events` (`custom`/`campaign`, `city_contribution`, `bounty_submit`, `custom`/`squad`) | **NOW** | already emitted |
| Fan liked/commented/joined-live, mission completion | — | **WIRING** | community likes/comments and live-join emit **no** `fan_events`; `mission_participants` never flips to `completed`. Manual-only until `recordFanEvent` is wired into those routes |
| Revenue/MRR/retention-rate thresholds | analytics sums | **COMPUTED** | `/api/analytics` computes these live; a quest threshold needs a summing check or a stored milestone (`milestones.ts`) |
| "Tested the fan journey", "90-day plan" | none | **MANUAL** | acceptable — reflective artifacts, no financial/entitlement stake |

**Hard rule honored:** no financial, entitlement, ownership, subscription, or supporter milestone uses client-controlled completion. All such milestones are domain/event-derived, matching the engine's existing design (`api/quests/event/route.ts:13-16` already refuses money signals from clients).

---

## 8. Unlock & progressive-disclosure matrix

| Level cleared | New disclosure key(s) → `quest_unlocks` | Reveals (UI only) |
|---|---|---|
| Tutorial | `rise_feed` (existing) | Rise feed |
| L3 | `supporter_leaderboard` (existing) | leaderboard widget |
| L4 | `payments_live` (new) | payout dashboard prominence |
| L6 | `fan_missions`, `campaign_hub` (existing) | missions + campaign hub |
| L8 | `road_to_pages` (existing) | Road To public pages |
| L9 | `growth_engine_tools` (new) | sequences/smart-links/bounties surfaced |
| L10 | `team_tools` (new) | Team Splits surfaced |
| Endgame | `empire_mode` (new) | endgame board |

**Invariant:** a disclosure key MUST NOT appear in any access decision. Access = `canUseFeature(tier,…)` / RLS / entitlement oracle (`platformTier.ts:219`; `05-DATABASE.md:132-138`). Several growth features are **Pro-gated** (SMS, clipper, live, DMs); for those, set the template's `requiredFeature` so a Free artist sees the quest as "upgrade to unlock" rather than a broken dead-end — exactly as `artist_create_road_campaign` already uses `requiredFeature:'campaign_hub'` (`templates.ts:167`).

---

## 9. Adaptive-progression design

**This is largely already built.** `GET /api/quests` (`route.ts:25-133`) on every load: assigns all eligible templates (`ensureRoleQuests`), then loops 6× (`unlockEligibleQuests` + `refreshQuests`) to cascade prerequisite unlocks and auto-complete any quest whose condition is already met, then `reconcileXp` idempotently backfills XP for anything completed before the ledger existed. An established artist who flips the flag on will have their already-done work recognized, XP granted once, level set from cumulative XP, and only the genuinely-open quests presented.

What to add for a 10-level ladder:
1. **Raise the cascade loop count** from 6 to match the deepest prerequisite chain (a 10-level main chain can be up to ~10 links). One-line change in `route.ts`; the loop is idempotent so over-iterating is safe.
2. **Progression recap** — the data already exists (`user_progression` + completed `quest_instances`); the recap is a UI read, not new engine work. Present "you skipped ahead to Level N; here's what auto-completed."
3. **Idempotency guarantees** already hold: `xp_ledger` unique `(user, quest_instance, reason)` (`schema-phase2-quest-engine.sql:241`); `uq_quest_instance_open` prevents duplicate open instances (`:140-143`); `completeQuest` guards on pre-state flip (`evaluator.ts:309-325`). **No duplicate rewards possible.**
4. **Preserve existing instances** — `assignQuest` skips if an open or completed non-repeatable instance exists (`index.ts:72-102`). Safe to re-run.
5. **Partial levels** — because level is derived from XP and quests unlock by prerequisite, a partially-complete level is the natural state; nothing special needed.
6. **Re-evaluation safety** — `refreshQuests` only reads + completes; it never regresses a completed quest (`syncQuest:445`).

**One correctness caveat to encode:** because completion conditions read live tables, an established artist auto-completes L1-L10 headline quests instantly on flag-flip, which could fire a burst of celebration notifications. Recommend a **"silent reconcile on first load"** mode (grant XP, skip the popup) mirroring `reconcileXp`'s existing silent-historical behavior (`index.ts:319-357`), then celebrate only quests completed by live action thereafter.

---

## 10. Artist-build branching design

Canonical build ids (**do not rename** — `builds.ts:16-107`): `come_up`, `vault`, `live`, `movement`, `creator_ceo`, plus `storyteller`, `community`, `local_hero`, `collaborator`, `promotion_engine`. The five the prompt named map exactly to `come_up` / `vault` / `live` / `movement` / `creator_ceo`.

Branching mechanism **already exists but is unused**: `ArtistBuild.priorityCategories` (`builds.ts:24` etc.) and the template field `buildTags` (`types.ts:117`). Today **no template sets `buildTags`**, so builds don't reprioritize anything.

Design:
- The **main-quest spine (L1-L10) is build-agnostic** — every artist walks the same money-flow path. Builds must not fork the spine (that would fragment the "beat the game" goal).
- **Side quests carry `buildTags`.** A `vault` artist sees catalog/offer side quests float up; a `live` artist sees live/promotion side quests; a `movement` artist sees campaign/city; a `creator_ceo` sees revenue/team/analytics. Implement by having `recommendNextQuest`/board sort consult the artist's `artist_build_primary` (`user_progression`) against each open quest's `buildTags` — a sort-order boost, never a filter (a build never hides a quest).
- Build is chosen in `ArtistBuildPicker` (already wired, `RiseMode.tsx:193-195` → `POST /api/quests/build`), stored on the global `user_progression` row. No new storage.

---

## 11. Four-tier platform-limit conflict (founder decision — NOT decided here)

**The recommended ladder (Community Free / Backstage $10 / Inner Circle $25 / Executive Circle $100) is four `subscription_tiers` rows. No billable plan currently allows four.**

Source of truth (`platformTier.ts`):
| Plan | `maxFanTiers` / `fanTiers` | Billable? |
|---|---|---|
| Free (`starter`) | **1** | yes |
| Pro | **3** | yes |
| `label` ($99) | 10 | **no** — checkout whitelists `pro` only (`07-BUSINESS-RULES.md:19`) |
| `empire` | ∞ | dead/spec |

**Enforcement reality (critical):** the cap is **client-side only and fail-open**. Tiers are inserted directly via the browser Supabase client (`TierManager.tsx:252`, `onboardingItems.ts:101`); the only blocks are UI (`TierManager.tsx:62,488`; `offers/new/page.tsx:418-439`, which skips the check on any fetch error). A **real server gate exists but is dead** — `api/tiers/check-limit/route.ts` is never called (and its copy is stale: "up to 5"). There is **no DB/RLS count constraint** (`schema-ticket5.sql`). **The free tier counts against the cap** (the count query includes price-0 rows).

Consequence for the quest ladder: on Starter, an artist can hold exactly one tier, so the free-tier and paid-tier quests **cannot both complete** — and the existing `free_tier → paid_offer` prerequisite chain (`templates.ts:68,93`) makes the paid quest **permanently locked** for a Starter artist whose single tier is paid.

**Smallest-safe options (founder picks; do not implement a revenue change):**
1. **Recommend a 3-tier ladder** (free front door + 2 paid) that fits Pro as-is (free + 3 paid still = 4, so this still needs care — a free + 2 paid = 3 fits Pro exactly). Zero code/limit change. Safest.
2. **Bump `pro.fanTiers` (and `TIER_LIMITS_V2.pro`) to ≥4** so the four-tier ladder fits Pro. One-line config, but a **pricing/packaging decision** (erodes the upsell to `label`).
3. **Stop modeling the free "Community" tier as a `subscription_tiers` row** (treat "free follow" as non-tier membership) so the paid ladder is 3 rows. Larger refactor.
4. **Make the L3 quest plan-aware** regardless: target = `min(recommended, plan cap)` so the quest completes at the plan's real ceiling instead of a hardcoded 4. This should ship **independent** of 1-3 so the ladder quest is never uncompletable.

Independent of the ladder count, **fix the prerequisite chain** so the paid-offer quest does not sit behind an uncompletable free-tier quest on capped plans.

Also flag (not required): the client-only enforcement means the "limit" is advisory today; if the founder wants it real, wire the existing `api/tiers/check-limit` into the two creation paths.

---

## 12. Required schema / type changes

- **`types.ts`** — extend the `DomainCheck` union with the new checks in §5/§7 (`artist_track_count`, `artist_has_album`, `artist_has_playlist`, `artist_profile_complete`, `artist_has_socials`, `artist_tier_count`, `artist_tier_has_benefits`, `artist_tier_purchasable`, `artist_stripe_connected`, `artist_free_supporter_count`, `artist_has_community_post`, `artist_fulfillment_done`, `artist_sent_email`, `artist_has_sms_list`, `artist_has_survey_response`, `artist_campaign_reached`, `artist_has_active_sequence`, `artist_clipper_on`, `artist_referrals_on`, `artist_has_bounty`, `artist_has_segment`, `artist_contacts_count`, `artist_has_team_split`, `artist_engaged_ai`). Pure type addition.
- **No new tables required** for v1. All checks read existing tables.
- **Optional** (only if revenue-milestone quests are wanted): a `milestones`-style stored value or a `artist_profiles.activation_milestones` key for MRR thresholds (computed values can't be plain COUNTs). Prefer reading `activation_milestones` (already written by the webhook, `07-BUSINESS-RULES.md:67`) over a new table.
- **Repair (existing migration, not new):** `schema-phase2-quest-notifications.sql` corrupted tokens must be fixed before the notification types apply.
- **Four-tier:** any change here is a `platformTier.ts` config edit — founder decision (§11).

---

## 13. Required API changes

- **`evaluator.ts`** — add the new `DomainCheck` `case`s in `evalDomain` (`:88`). Each is a `countActive`/COUNT. This is the bulk of the engineering.
- **`api/quests/route.ts`** — raise the cascade loop count (§9); optionally add a `silentReconcile` first-load mode to suppress the celebration burst.
- **Fix the two fan campaign templates** (`fan_back_campaign`, `fan_share_campaign`) to key on emitted event types, or wire `recordFanEvent('share', …)` where sharing actually happens.
- **Optional / deferred:** wire `recordFanEvent` into community like/comment and live-join server paths to make L7 fan-side quests real; wire `syncTemplatesToDb` into an admin route so the DB catalog is populated; wire `api/tiers/check-limit` into creation paths if the founder wants a real tier cap.
- **No gating changes.** Do not add any `isQuestEngineEnabled`-based access checks anywhere.

---

## 14. Required UI changes

- **`RiseMode.tsx` + `components/quests/*`** — render a 10-level ladder + endgame; `MovementMap.tsx` already displays a level ladder and just needs the expanded `level_key`/title set.
- **Mount the dead Live Quest UI** (`LiveQuestBar`, `LiveQuestLauncher`) if Live Quests are in scope — currently unreachable.
- **Progression recap screen** (adaptive first-load) — new, small; reads existing data.
- **Endgame board** — new view for repeatable questlines.
- **`offers/new` exit** should use `smartBack` for consistency (currently raw `router.push`, minor).
- Copy: strip the "unreleased/not on Spotify" claim from the track quest, or add the flag (§10). **No em dashes** in any new copy; celebration strings end in "!" (both already conventions in the engine).

---

## 15. Required template-catalog changes

- Add ~25-35 templates across L1-L10 + endgame in `templates.ts`, grouped by the renamed `level_key`s, each with: `completionCondition` (§7), `reward.xp` tuned to the XP curve (§4), `questType` (main/side/boss), `buildTags` for side quests (§10), `requiredFeature` for Pro-gated ones (§8), and `prerequisites` forming the spine.
- **Rename `ARTIST_LEVEL_KEYS`/`ARTIST_LEVEL_TITLES`** in `progression.ts` to the journey labels (§4).
- **Fix the free→paid prerequisite chain** (§11).
- Set `buildTags` on side quests so `priorityCategories` finally does something.
- Call `syncTemplatesToDb` once after deploy so the DB catalog matches code.

---

## 16. Migration risks

- **Corrupted `schema-phase2-quest-notifications.sql`** will fail on apply — repair first, or quest notifications silently no-op (the engine already `.catch()`es notification inserts, `evaluator.ts:418-425`, so this degrades gracefully but should be fixed).
- **Manual migration workflow** — Josh applies SQL by hand; there is no runner (`05-DATABASE.md:3`). Any new migration must end with a self-verify `DO $$ … RAISE EXCEPTION` block (CLAUDE.md Onboarding Safety Net).
- **`is_active` NULL reality** — new checks MUST use the NULL-safe `.not('is_active','is',false)` pattern (`evaluator.ts:67-69`); strict `is_active=true` would silently under-count onboarding-created rows.
- **Money tables lack CREATE TABLE migrations** (`earnings`, `referrals`, …) — do not assume you can re-derive their columns; read the ALTERs (`05-DATABASE.md:9-11`).
- **XP-curve retuning** — if XP rewards change, existing `user_progression.level` values become stale until the next `refreshQuests`/`reconcile`; that reconcile is idempotent, so it self-heals, but a one-time recompute pass is cleaner.

---

## 17. Security & permissions considerations

- **Disclosure ≠ access — the load-bearing invariant.** Every unlock is a `quest_unlocks` row consumed only by UI reveal logic. Never let a quest, unlock, XP, or level enter an authorization decision. Entitlement stays in Postgres (RLS, column privileges, SECURITY DEFINER `can_play_track`/`can_read_community_post`, `05-DATABASE.md:132-138`).
- **All completion reads use the service-role admin client server-side** (already the case). Client `POST /api/quests/event` is whitelisted to non-money events (`api/quests/event/route.ts:13-16`) — keep it that way; never accept `subscribe`/`purchase` from clients.
- **Ownership checks** — new quest routes (if any) must derive identity from the session and verify artist ownership (the `requireArtistOwner` pattern), given `MEDIUM-1` low adoption (`11-SECURITY-AND-PRIVACY.md:37`). The existing quest routes already resolve role from `artist_profiles` ownership, not `profile.role`.
- **`api/platform/limits` is unauthenticated** (`MEDIUM-3`) — if Rise reads plan caps for the plan-aware ladder quest, read them server-side within `/api/quests` (already session-scoped), not via the open limits route.
- **Inconsistent flag gating** — `POST /api/quests/{role,build,live}` don't check `isQuestEngineEnabled`. Low risk (no reachable UI) but add the gate for consistency before launch.

---

## 18. Testing strategy

There is **zero automated test infrastructure** (`13-CURRENT-STATE.md:64`). Verification is the `npm run build` gate + production canaries. So:
- **Pure functions first:** `levelFromXp`, `updateStreak`, and each new `evalDomain` case are pure/DB-thin — the highest-value place to add the repo's first unit tests (no framework exists; a minimal `node --test` harness would be a clean introduction, but that's a founder call on tooling).
- **Seeded-artist walkthrough:** the `m3rcey` demo seed (`seed-demo-data.sql`, ~20 fans across 3 tiers) is an ideal fixture to flip the flag against in a staging project and watch the adaptive cascade auto-complete L1-L6.
- **Idempotency probe:** call `GET /api/quests` repeatedly for one user; assert XP and completed count are stable (guards against the historical `xp_ledger` double-grant class of bug).
- **A canary** mirroring `onboarding-health` could exercise a synthetic artist through the quest cascade, but only after launch intent is set.
- **Build gate** (`npm run build` in WSL) after every change; the Stop hook already enforces this.

---

## 19. Recommended implementation phases

1. **Phase A — Foundational catalog (safe, additive):** add L1-L4 templates + their new `DomainCheck` cases; rename level keys; fix the free→paid prereq and the two fan-campaign template bugs; make L3 plan-aware. No gating, no fan-event wiring. Ships value even with the flag off (auto-recognized when flipped).
2. **Phase B — Growth & CEO catalog:** add L5-L10 templates + their row-count checks (all `NEW-CHECK`, no wiring). Add `buildTags` to side quests.
3. **Phase C — Adaptive polish:** raise cascade loop count, add silent-reconcile first-load mode + progression recap UI, expanded MovementMap.
4. **Phase D — Endgame + fan engagement:** repeatable questlines; optionally wire `recordFanEvent` into community/live to make L7 fan-side quests real; mount Live Quest UI.
5. **Phase E — Launch prep:** repair the corrupted notification migration, call `syncTemplatesToDb`, add flag gates to the three ungated POST routes, resolve the four-tier founder decision, then flip `admin_settings.quest_engine`.

---

## 20. Exact files likely to change

| File | Change |
|---|---|
| `src/lib/quests/templates.ts` | Add L1-L10 + endgame templates; fix fan-campaign bugs; set `buildTags`; call `syncTemplatesToDb` |
| `src/lib/quests/evaluator.ts` | Add ~24 `DomainCheck` cases in `evalDomain` |
| `src/lib/quests/types.ts` | Extend `DomainCheck` union |
| `src/lib/quests/progression.ts` | Rename `ARTIST_LEVEL_KEYS`/`TITLES`; optionally retune XP |
| `src/lib/quests/index.ts` | Cascade tuning if loop count moves here; endgame assign helper |
| `src/app/api/quests/route.ts` | Raise loop count; silent-reconcile first-load mode |
| `src/components/artist/RiseMode.tsx`, `components/quests/MovementMap.tsx`, `QuestCard.tsx`, `questRoutes.ts` | Render 10-level ladder + endgame; recap |
| `src/components/quests/LiveQuestBar.tsx`, `LiveQuestLauncher.tsx` | Mount (if Live Quests in scope) |
| `supabase/schema-phase2-quest-notifications.sql` | **Repair corrupted tokens** |
| `src/lib/platformTier.ts` | Only if founder chooses to change `pro.fanTiers` |
| `src/app/api/quests/{role,build,live}/route.ts` | Add `isQuestEngineEnabled` gate |
| *(deferred)* community/live routes, `api/tiers/check-limit` wiring | Fan-event emission; real tier cap |

## 21. Open founder decisions

1. **Four-tier ladder vs plan caps** (§11) — the one revenue decision. Recommend shipping the plan-aware L3 quest (option 4) regardless, and choosing among options 1-3 for the recommended default.
2. **Launch intent/timing** for Rise Mode (flag currently off; `17-OPEN-QUESTIONS.md:2`).
3. **Scope of fan-side engagement quests** — accept manual/deferred for L7 fan actions in v1, or fund the `recordFanEvent` wiring now?
4. **Revenue-milestone quests** — worth a computed/stored milestone, or keep progression on capability-completion (row existence) only?
5. **Live Quests** in scope for v1 (requires mounting dead UI)?
6. **Test tooling** — introduce a minimal unit-test harness for the pure quest functions?

---

## Recommended smallest-safe order for the next TWO coding prompts

**Prompt 1 — L1-L4 catalog + the two safety fixes (no gating, no wiring, flag stays off):**
- Add L1-L4 templates in `templates.ts` and their `DomainCheck` cases in `evaluator.ts` (`artist_profile_complete`, `artist_has_socials`, `artist_track_count`, `artist_has_album`, `artist_has_playlist`, `artist_tier_count`, `artist_tier_has_benefits`, `artist_stripe_connected`, `artist_tier_purchasable`) with the NULL-safe pattern.
- Rename `ARTIST_LEVEL_KEYS`/`TITLES` to the journey labels.
- **Fix the free→paid prerequisite** so paid-offer isn't locked on Starter, and make the L3 ladder quest **plan-aware** (target = `min(recommended, plan cap)`).
- `npm run build`. Because the flag is off, this ships dark and is auto-recognized on any future flip — zero user-facing risk.

**Prompt 2 — L5-L10 catalog + adaptive polish:**
- Add L5-L10 templates + their row-count `DomainCheck` cases (all additive), `requiredFeature` on Pro-gated quests, `buildTags` on side quests.
- Fix the two fan-campaign template bugs (`custom`/`campaign`).
- Raise the cascade loop count and add the silent-reconcile first-load mode.
- `npm run build`.

Everything else (endgame, fan-event wiring, notification-migration repair, flag flip, four-tier config) waits on the founder decisions in §21.
