# 01 — Product Vision

> Status labels used throughout: `Confirmed` (verified in code/docs), `Strongly inferred`, `Unclear`, `Not found in codebase`, `Needs founder confirmation`.
>
> Sourcing note: product framing comes from repo docs (`CRWN_Kickoff_Brief.md`, `PRD.md`, `PITCH_DECK.md`, `CLAUDE.md`). Where those docs disagree with the actual code, the **code wins** and the doc is flagged as stale. The PRD (`PRD.md`, v1.3, dated 2026-03-25) is the richest single narrative but is demonstrably out of date on pricing and the AI provider — see the reconciliation table below.

---

## 1. Purpose

CRWN (pronounced "Crown") is a **music-monetization SaaS platform** for independent artists to sell subscriptions, tracks, albums, digital/physical products, and experiences **directly to fans**, and to own the fan relationship, revenue, and data. `Confirmed` (`CLAUDE.md`, `PRD.md §1`).

The kickoff brief positions it as **"Skool meets EVEN meets YouTube, purpose-built for music creators"** (`CRWN_Kickoff_Brief.md`). In practice the codebase has grown well past a storefront into an **artist growth/operations suite**: email marketing automation (SMS was removed 2026-07-31), a CRM, referral/recruiter/partner acquisition programs, gamified fan engagement (missions/squads/bounties/city-unlocks), live streaming + VOD, team revenue-splits, and an autonomous AI "manager" that diagnoses an artist's business and proposes/executes growth actions. `Confirmed` (feature audit across `src/`).

## 2. Core problem it solves

Independent artists on streaming platforms (Spotify/Apple) earn fractions of a cent per stream and never see who their listeners are. CRWN's thesis: give the artist a **direct-to-fan monetization layer they own** — recurring subscriptions + one-time sales through Stripe Connect, with the fan's identity, email/phone, and purchase history captured as first-party data the artist can market to. `Strongly inferred` from the monetization + CRM + audience/attribution machinery (`src/lib/webhookHandlers.ts`, `src/app/api/audience`, `src/lib/emails/*`, `referral_clicks`/`earnings` tables).

## 3. Target market

- **Primary (customer avatar, set 2026-07-28, canonical in [`docs/ICP.md`](../ICP.md)):** artists who have **already proven they can get fans to spend money directly** (Patreon, merch, VIP, Discord, beat packs, tickets) but whose monetization stack is **fragmented** across five or six tools. Tier 1 is **250k to 5M followers, 100k to 3M monthly listeners, 40 to 300 released songs, 3+ years releasing**. Streaming is exposure; direct sales are proof. CRWN's pitch to them is **consolidation plus new products**, NOT "streaming pays pennies". Under 50k followers / 20k listeners is Tier 3: they can succeed on CRWN, but they cost too much to acquire right now. Launch artist named in the brief: **"The G1ft"**; the seeded test artist is **`m3rcey`** (Josh, the owner/operator). `Confirmed` (`docs/ICP.md`, `src/lib/acquisition/leadScoring.ts`, `CRWN_Kickoff_Brief.md`, `CLAUDE.md`).
  - Superseded: this used to read "independent / early-stage recording artists who already have some audience." Early-stage is now explicitly the *later* wave, and code that scored leads on that basis was rewritten.
- **Secondary market actors** the product explicitly builds for: **fans** (buyers + promoters), **recruiters/partners** (music-industry influencers who refer artists to the platform for commission), and **collaborators** (producers/managers/clippers who take a revenue-share via Team Splits). `Confirmed`.

## 4. Primary user personas

| Persona | Who they are | What they do on CRWN | Evidence |
|---|---|---|---|
| **Fan** | A supporter of one or more artists | Discovers artists, subscribes to tiers, buys tracks/products/tickets, joins community + DMs, refers others for commission, joins missions/squads/bounties | `UserRole='fan'` (`src/types/index.ts`), fan routes under `(main)/` |
| **Artist** | An independent musician | Publishes profile/music/shop, sets tiers, runs email campaigns + sequences (SMS removed 2026-07-31), views analytics, manages payouts, runs Team Splits and referral/clipper programs, goes live | `UserRole='artist'`, `artist_profiles` table, 17-tab dashboard `src/app/(main)/profile/artist/page.tsx` |
| **Admin** | CRWN's internal operator (Josh) | Platform KPI dashboards, artist CRM pipeline, acquisition funnel, platform-to-artist nurture sequences, autonomous AI ops | `UserRole='admin'`, `/admin`, `src/app/api/admin/*` |
| **Recruiter / Partner** | Music-industry influencer referring *artists* to CRWN | Applies at `/partner`, gets a `join/[code]` link, earns flat + recurring commission, tracks a conversion funnel | `recruiters`/`partner_applications` tables, `/recruit/dashboard`, `PRD.md §6` |
| **Collaborator** | Producer/manager/clipper on a specific artist deal | Accepts a Team Split invite, completes deliverables, accrues a capped revenue share, cashes out separately | `team_split_deals`, `src/app/team/*`, `src/lib/teamSplits/*` |

## 5. Artist use cases (Confirmed unless noted)

- Publish a public artist page at `thecrwn.app/[slug]` with tiers, music, albums, playlists, shop, community, and live.
- Sell **fan subscriptions** (recurring), **tracks/products** (one-time), **booking sessions** and **live tickets**.
- Gate any content by free / specific subscription tier / one-time price.
- Run **email campaigns** and **automated sequences** (welcome, abandoned-cart, tier-upgrade, loyalty) with open/click/conversion tracking and UTM revenue attribution.
- ~~Run **SMS marketing**~~ REMOVED 2026-07-31 (founder decision: A2P 10DLC compliance cost was not worth it; Twilio is no longer an integration).
- View **analytics**: revenue trends, subscriber growth, cohort retention heatmap, churn-vs-benchmark, top content, visitor tracking.
- Manage **payouts** via Stripe Connect (weekly auto-payout + on-demand cashout).
- Recruit fans as **referrers/clippers** (commission on referred subscriptions/clips).
- Split revenue with **collaborators** via capped-hybrid Team Splits.
- Get **AI Manager** insights + one-click actions (Pro+; `starter` gets rule-based nudges).
- **Go live** (LiveKit) with paid/gated access, recorded to VOD.
- Gamified growth toolkit: **missions, squads, clip bounties, city-unlocks, road-campaigns, proof-of-demand, smart-links/pre-save** (Rise Mode / Quest Engine wraps these; the quest layer itself is **dark-launched**, flag `admin_settings.quest_engine` defaults off). `Confirmed`.

## 6. Fan use cases

- Discover and play music (persistent player, 128/320 kbps, gated previews).
- Subscribe to tiers (monthly, plus annual with a discount), pause/cancel, manage via Stripe portal.
- Buy tracks/products; own them in a **Library**.
- Follow community feed + channels, comment, like, DM the artist (voice notes supported; DMs are Pro-artist-gated).
- Refer others and **earn commission** (Earn/Impact/Command centers, fan cashout via Stripe Connect).
- Join missions/squads/bounties/city-unlocks; contribute to road-campaigns; respond to proof-of-demand.
- Receive email digests + in-app notifications (no web/push notifications exist — foreground only). `Confirmed`.

## 7. Admin use cases

- Platform metrics (LGP, MRR, CAC, churn) with a Hormozi-style per-tier health table. `Confirmed` (`PRD.md §8`, `src/app/api/admin/metrics`).
- 6-stage artist **CRM pipeline** (Signed Up → Onboarding → Free → Paid → At Risk → Churned) + lead scoring.
- Acquisition **funnel** analytics filterable by source (organic/recruiter/partner/founding).
- Platform-to-artist **nurture sequences** (activation nudges, upgrade nudges, churn winback).
- **Autonomous AI agent** that can auto-execute a whitelist of low-risk ops and escalate the rest for approval (dark-launched / internal). `Confirmed`.

## 8. Business model (Confirmed against code — this is the source of truth, not the PRD)

CRWN makes money two ways:

1. **Platform SaaS subscription** paid by the artist (Stripe subscription on the CRWN *platform* account).
2. **Transaction fee** (a percentage `application_fee`) skimmed from every fan→artist payment routed through Stripe Connect.

**Actual tiers and fees** (source of truth: `TIER_LIMITS` in `src/lib/platformTier.ts`; repriced 2026-07-31 per `CRWN_PRICING STRATEGY.md`):

| Plan (internal key) | Price | Platform fee | Fan tiers | Notes |
|---|---|---|---|---|
| **Launch** (`starter`) | $0 | **12%** | free + 3 paid | 50 tracks, unlimited members/contacts, 1 email campaign/mo. "Prove your first direct-to-fan offer" |
| **Pro** (`pro`) | **$49/mo or $490/yr** | **8%** | free + 3 paid | unlimited tracks/members, 20 email campaigns/mo. "Run your entire direct-to-fan business in one place" |
| **Scale** (`scale`) | **$199/mo or $1,990/yr** | **5%** | free + 3 paid | 100 email campaigns/mo, assisted migration, team permissions. Renamed from the spec-only `label` $99 concept. "Scale revenue, your team, and fan operations with less manual work" |

- The `empire` tier is **fully deleted** from `TIER_LIMITS`/`TIER_LIMITS_V2`/`PlatformTierName` (2026-07-31). `resolveTierKey()` aliases stray `label`/`empire` strings to `scale`; `formatTierName()` maps `starter` to "Launch".
- Break-evens: Pro beats Launch above $1,225/mo GMV ($49 / 4 fee points); Scale beats Pro above $5,000/mo GMV ($150 / 3 fee points).
- A true multi-artist **Label** tier is custom-priced and does not ship until org accounts / cross-artist analytics / bulk ops exist. Never describe the old $99 Label as a current plan.
- **There is NO founding-artist fee override.** `getArtistFeePercent()` reads `platform_tier` and returns that tier's fee, full stop. The 5% override was retired by founder call on 2026-07-15 and the code removed; nothing writes `is_founding_artist`, and no production row ever carried it. This doc previously claimed the override was live and `Confirmed`, which contradicted `07-BUSINESS-RULES.md` and would have had an agent quoting the wrong fee. `Confirmed` (`src/lib/platformTier.ts`, read 2026-07-29).
- Platform checkout whitelists **`pro` and `scale`** (`src/app/api/stripe/platform-checkout/route.ts`) and verifies the live Stripe price amount against `TIER_PRICING` before checkout, so a stale env var fails loudly. `Confirmed`.

## 9. How the docs disagree (reconciliation — read before trusting any repo `.md`)

> Historical table. The **2026-07-31 pricing strategy (`CRWN_PRICING STRATEGY.md`) supersedes everything below on pricing**: Launch $0 12% / Pro $49 8% / Scale $199 5%.

| Claim | Stale doc says | Code actually says | Verdict |
|---|---|---|---|
| Platform pricing | Starter free / Pro **$50** / Label **$175** / Empire **$350**, fees 8/6/5/3% (`PRD.md §7`); `$69/$175/$350` (`CLAUDE.md` note); `$49/$149` (`schema-platform-tiers.sql`) | Free 12% / Pro **$9.99** 8% / $99 `label` 5% (spec-only) / `empire` dead (code as of 2026-07-29; since 2026-07-31 the code says Launch $0 12% / Pro $49 8% / Scale $199 5%) | **Code wins.** All prose docs are stale on pricing. |
| AI provider | "Moonshot AI (Kimi)" (`PRD.md §9.6`) | **DeepSeek** (`deepseek-chat` via `openai` SDK) for AI Manager + admin agent; real **OpenAI** `gpt-4o-mini` only in the `sync-opportunities` cron | **Code wins.** `Confirmed` (`src/lib/ai/*`). |
| Booking | Calendly OAuth integration (`PRD.md §9.4`) | `react-calendly` embed is **orphaned/unused**; the live flow is **booking tokens** (`booking-tokens-migration.sql`). `CALCOM_API_KEY` exists in env but no cal.com server integration found. | **Code wins.** |
| Onboarding | "Role selection + guided tour + post-tour action picker" (`PRD.md §3`) | Flow is signup → `/welcome` → **`/setup` wizard** (one-field-per-screen), post-tour picker was removed (`CLAUDE.md`, `src/app/setup`). | **Code wins.** |
| SMS provider | Twilio SDK (`PRD.md`) | SMS was removed entirely 2026-07-31; no Twilio integration exists anymore | **Code wins.** The PRD's SMS feature no longer exists. |

## 10. How CRWN differs from adjacent products (Strongly inferred from feature set)

- **vs. streaming (Spotify/Apple):** CRWN is not a discovery/streaming royalty platform. Artists set their own prices; fans pay the artist directly (minus CRWN's fee). CRWN captures fan identity + contact info; streaming does not.
- **vs. social (Instagram/TikTok):** CRWN owns the transaction and the mailing list. Community/DMs exist but are a retention layer around monetization, not the product.
- **vs. fan clubs / Patreon-style memberships:** CRWN is closest to Patreon here (recurring tiers + gated content) but is **music-first** (player, albums, tracks, ISRC/label metadata, pre-save, live listening sessions) and bundles a full marketing/CRM/analytics/acquisition stack Patreon lacks.
- **vs. artist storefronts (EVEN, Bandcamp):** CRWN keeps the storefront (track/product/bundle sales) but layers subscriptions, automation, gamified promotion, referral economics, and AI ops on top.

The combination — **storefront + membership + owned CRM + acquisition machine + AI operator** — is the differentiator the codebase actually implements. `Strongly inferred`.

## 11. Product principles inferred from the code

- **The artist owns the relationship and the data.** First-party email/phone capture, per-artist CRM, unsubscribe/suppression handling. `Confirmed`.
- **Money flows are guarded and auditable.** Webhook idempotency, atomic cashout RPCs, entitlement oracles, column-privilege lockdowns on Stripe ids — the money surface has been hardened repeatedly after real incidents. `Confirmed` (`05-DATABASE.md`, `11-SECURITY-AND-PRIVACY.md`).
- **Server-side truth over client claims.** Role promotion, content entitlement, live access, and tier limits are all enforced server-side; the client is treated as untrusted. `Confirmed`.
- **Progressive disclosure for artists.** The setup wizard is one-field-per-screen; advanced features (Experiences, multi-tier ladders, lower fees) are surfaced *after* onboarding and gated behind Pro. `Confirmed` (`CLAUDE.md`, `src/app/setup`).
- **Copy discipline:** no em dashes anywhere in user-facing copy (enforced project rule). `Confirmed`.

## 12. Areas needing founder confirmation

- **True product priority:** the codebase spans an enormous surface (60+ API domains, 25 crons). Which of these are core to the current go-to-market vs. speculative? (see `13-CURRENT-STATE.md`, `14-ROADMAP-INFERRED.md`). `Needs founder confirmation`.
- ~~**Is the `$99 label` tier launching, and when?**~~ **ANSWERED 2026-07-31:** renamed **Scale** at $199/mo ($1,990/yr), 5% fee, billable once its Stripe prices and env vars exist. A true multi-artist Label tier stays custom-priced and unshipped.
- **Is the Quest Engine / Rise Mode meant to ship on** (flag currently defaults off)? `Needs founder confirmation`.
- **Recruiter/partner program economics** (flat fee + recurring %) — are these live payouts today or spec? Code paths exist and pay via Stripe Connect; real-world activation unclear. `Needs founder confirmation`.
- **Founding-artist program** parameters (count cap, fee window). `Needs founder confirmation`.

---

*See also: [00-START-HERE.md](00-START-HERE.md) · [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [07-BUSINESS-RULES.md](07-BUSINESS-RULES.md) · [17-OPEN-QUESTIONS.md](17-OPEN-QUESTIONS.md)*
