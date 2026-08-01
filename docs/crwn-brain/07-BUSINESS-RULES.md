# 07 — Business Rules

> Business logic extracted from code, with source citations. `Confirmed` unless noted. Where a rule is duplicated across files, it is flagged.

## 1. Money is always integer cents
ALL DB price/amount columns are integers in cents. Form input → `Math.round(parseFloat(val) * 100)`; display → `(price / 100).toFixed(2)`. `Confirmed` (`CODEBASE.md`, `checkout/route.ts`, 37 files use the display pattern). **Never** store dollars.

## 2. Platform SaaS plans, fees, and limits (pricing strategy 2026-07-31)
Source of truth: `TIER_LIMITS` in `src/lib/platformTier.ts`. `getArtistFeePercent(artistId)` is the single fee-determination function used at charge time. The 2026-07-31 pricing strategy (`CRWN_PRICING STRATEGY.md`) repositioned CRWN as a direct-to-fan operating system for the proven-seller ICP: Launch (prove the first offer) → Pro (operate the business) → Scale (higher volume + team). A true multi-artist **Label** tier is custom-priced and does NOT ship until org accounts / cross-artist infra exist.

| Plan | Price | Fee | maxFanTiers (paid) | maxTracks | maxMembers | bundles/scheduling/live/DMs/clipper | Email campaigns/mo |
|---|---|---|---|---|---|---|---|
| Launch (`starter`) | $0 | **12%** | 3 | 50 | ∞ | all off | 1 |
| Pro (`pro`) | **$49/mo** ($490/yr) | **8%** | 3 | ∞ | ∞ | all on | 20 |
| Scale (`scale`) | **$199/mo** ($1,990/yr) | **5%** | 3 | ∞ | ∞ | all on | 100 |

- **Break-evens (the honest upgrade math, derivable from `planRecommendation.ts`):** Pro beats Launch above **$1,225/mo GMV** ($49 / 4 fee points); Scale beats Pro above **$5,000/mo GMV** ($150 / 3 fee points). Savings claims must show this math.
- **Internal keys stay `starter`/`pro`; the old spec-only `label` key was renamed `scale`** (no production row ever carried `label` or `empire`, so the rename moved no data). `resolveTierKey()` in `platformTier.ts` aliases lingering `label`/`empire` strings to `scale` so nothing silently falls back to the 12% fee. `formatTierName()` maps `starter`→"Launch".
- **Deterministic plan recommendation** (`src/lib/planRecommendation.ts`, tested): every account technically begins on Launch; `recommendPlan()` derives the recommended operating plan from projected GMV, catalog size, contacts, team, and feature intent, never an AI guess. Stored on `artist_profiles.recommended_plan` / `recommendation_reason` / `projected_monthly_gmv` (migration `schema-phase2-platform-plan-recommendation.sql`, seeded from the calculator in `/api/lead-results/auto-claim`, fail-soft pre-migration).
- **Checkout price verification:** `platform-checkout` retrieves the live Stripe price and refuses if `unit_amount` differs from `TIER_PRICING` — a stale env var (e.g. the old $9.99 Pro price) fails loudly instead of silently undercharging. Whitelist is `['pro','scale']`; annual cycle is wired but the UI stays monthly-only until the annual Stripe prices exist.
- **Founding-artist program is RETIRED and the code is GONE (2026-07-15).** There is no per-artist fee override anymore: `getArtistFeePercent()` returns the plan fee, full stop. A partner code is **attribution only** plus a 1-month Stripe trial (a SaaS-price perk, not a fee cut).
- **The legal pages state the fees, and must be kept true by hand.** `/artist-agreement` and `/terms` list Launch 12% / Pro 8% $49 / Scale 5% $199. They once claimed Starter was 8% while the code charged 12%. Do NOT render them from `TIER_LIMITS`: a code change would then silently rewrite the agreement artists already accepted.
- **PLAN LIMITS: what is real, settled 2026-08-01.** An earlier version of this line claimed
  `checkArtistLimit()` "enforces caps server-side" and marked it `Confirmed`; that was wrong (its
  only callers are `/api/tracks/check-limit` and `/api/tiers/check-limit`, and those two routes
  have zero callers of their own). Every limit was audited and each one was either made real or
  removed from the product. There are no advertised-but-unenforced limits left.
  - **Members: NO CAP, on any plan.** The 250 figure was enforced nowhere and is gone from
    `TIER_LIMITS` (`maxMembers: -1`), the pricing modal, the announcement pop-up, and the plan
    recommender. It was removed rather than enforced because the only possible enforcement point
    is refusing a paying fan at checkout. **Never re-advertise a member cap.** A large contact
    list still routes to Pro, but on the honest reason: `contacts_need_more_sends` (Launch's one
    email campaign a month), not a member count.
  - **Tracks (50 on Launch): ENFORCED at the database** by `trg_enforce_track_plan_cap`
    (`supabase/schema-phase2-track-cap-enforcement.sql`). It must live there because tracks are
    inserted directly from the browser client, so no API guard could cover it. Soft-deleted
    tracks do not consume the allowance, and an UPDATE reactivating one is allowed through (the
    artist already had that track). The UI warns BEFORE an upload starts and translates
    `TRACK_LIMIT_REACHED` into plain language; the bulk uploader uploads what fits and labels the
    overflow. Enforcing is what makes `recommendPlan()`'s "your 82 tracks need Pro" honest.
  - **maxFanTiers (3): client-side only, and deliberately not a paywall** since every plan allows
    the same 3 paid tiers. `offers/new` fails OPEN, which is harmless while the cap is uniform.
  - **Email blasts: enforced server-side** at CREATE (`/api/campaigns`) and authoritatively at
    SEND (`/api/campaigns/[id]/send`) — creation alone left a draft-then-send bypass, because
    only `sent/sending/scheduled` count and a draft is none of those. Both use
    `src/lib/emailQuota.ts` so the rule cannot drift between them.
- **Fan-tier cap counts PAID tiers only (price > 0).** The free "front door" tier does NOT consume a plan's fan-tier allowance (founder-approved rule, Rise Mode Prompt 2). **Every plan now allows 3 paid tiers** (`starter` was 1, raised to 3 on 2026-07-27 so the calculator's promise is buildable on any plan; `pro` unchanged at 3). Tier COUNT is no longer a Pro paywall: Pro differentiates on fee (12% -> 8%), live, DMs, scheduling, clipper, and unlimited tracks/members. A Free artist earning across 3 tiers pays the higher 12% fee, so more tiers means more platform revenue, not less. Because both plans cap at 3, hitting the cap is NOT an upsell moment (no billable plan gives more in v1): `TierManager` shows a "you've built the full ladder" note, not an UpgradePrompt. This lets the recommended four-tier ladder (free Bronze + Silver $10 + Gold $25 + Platinum $100 = free + 3 paid) fit **every** plan without changing any price or fee. These four are the SAME tiers the Streaming Loss calculator (`/worth`) shows, so the money the calculator promises is the money the ladder actually builds (`tierTemplate.ts` `RECOMMENDED_LADDER`, applied by `TierLadderTemplate`, whose free tier the setup wizard also creates by the name "Bronze"). Applying a paid tier routes its benefits through `/api/tier-benefits`, which runs `syncTierObligations` and auto-populates the Promise Calendar: Gold seeds a **monthly Vault unlock** obligation, Platinum a **quarterly private group listening event** (config-driven title + cadence in `tierObligations.ts`). The monthly unlock lives on the Gold tier only (Platinum inherits it via access), so the calendar never double-books. The paid-only predicate is defined identically in `checkArtistLimit()` (`platformTier.ts`) and `/api/platform/limits`; enforcement remains client-side (the server gate `/api/tiers/check-limit` is still not wired into creation). `Confirmed`.

## 3. Fan monetization surfaces and fees
Every fan→artist payment routes through Stripe on the **platform account** with `transfer_data.destination = artist Connect account`, and skims `application_fee`:
- **Subscriptions:** `application_fee_percent = feePercent (+ attributedCut)` (`checkout/route.ts:206`).
- **One-time** (track/product/booking/live-ticket): `application_fee_amount = Math.round(unitAmount * feePercent/100)`.
- Fee formula is **copy-pasted in 8+ call sites**; only the *rate* (`getArtistFeePercent`) is centralized. ⚠️ Flagged duplication (`07`/`10`). `Confirmed`.

## 4. Content access / gating
Current model (per `CLAUDE.md`, enforced in `tracks_public`/`community_posts_feed` views): each track/album/product/post uses `is_free` (bool) + `allowed_tier_ids` (JSONB tier UUIDs) + optional `price` (cents). Gating check uses `useSubscription().tierId`. **Legacy `access_level` enum (`free|subscriber|purchase`) is superseded but still present** in columns and types — do not use it. `Confirmed`.

## 5. Subscription lifecycle
- **Unique constraint `(fan_id, artist_id)`** → one sub per fan/artist pair; resubscribe = **upsert** (`onConflict:'fan_id,artist_id'`). `Confirmed`.
- **Free tier** ($0 price): no Stripe; direct `subscriptions` upsert (`free-subscribe/route.ts` and a duplicate branch in `checkout/route.ts`; only `free-subscribe` notifies the artist — behavioral inconsistency). `Confirmed`.
- **Upgrade** (higher price): immediate, `proration_behavior:'create_prorations'`, `tier_id` updated now.
- **Downgrade** (lower price): deferred — writes `pending_tier_id`/`pending_change_date` = period end; webhook `handleSubscriptionUpdated` applies once Stripe's price matches. ⚠️ No Stripe-side schedule call found in the route — verify downgrades actually apply. `Strongly inferred` gap.
- **Pause:** Stripe `pause_collection` 30 days, keeps access, status `paused` (offered as cancel alternative). `Confirmed`.
- **Cancel:** `cancel_at_period_end:true`; collects `cancellation_reasons` (multi-select + freeform). Handles both fan-sub and platform-plan contexts. `Confirmed`.
- **Statuses:** `incomplete | active | past_due | canceled | paused`.
- **Annual billing:** tiers may `offers_annual` with `annual_discount_percent` (PRD cites 25%); backfill caps discount at 50%. `Confirmed`.

## 6. Stripe Connect / payouts
- **Onboarding:** `/api/stripe/connect` creates an Express account (card_payments + transfers); `stripe_connect_id` saved via admin client (RLS-blocked otherwise). `Confirmed`.
- **Backfill:** `/api/stripe/connect/status` — only when `charges_enabled`, records `stripe_connected` milestone and runs `backfillTierPrices()` (creates Stripe products/prices for onboarding-created tiers that skipped Stripe). `Confirmed`.
- **Weekly payout cron** (`0 11 * * 1`): pays out the **entire** Connect available balance per artist; idempotent via `cron_run_log` per ISO week. **No fee deducted.** `Confirmed`.
- **Manual cashout** (`/api/stripe/cashout`): deducts flat **$2** (`CASHOUT_FEE_CENTS=200`), requires balance > $2, rate-limited 1/60s. ⚠️ Asymmetry with weekly payout (which takes no fee) — confirm intended. `Confirmed`.
- **Fan cashout** ($25 min) and **team-split cashout** ($25 min) use atomic RPCs + platform→fan `transfers.create`; kept in **separate ledgers**. `Confirmed`.

## 7. Referral / clipper commissions (fan → artist)
- Fans get a link `thecrwn.app/[artistSlug]/r/[code]`; artists set `referral_commission_rate` (PRD: 5–10%) and a `clipper_rate_schedule` (ramp/cap). `Confirmed`.
- Commission is an **artist-funded `attributedCut`** *added on top of* the platform fee on the referred subscription (`checkout/route.ts:72-142`), subtracted from `net_amount` on renewal, capped so `commission ≤ gross − platformFee` (platform never funds shortfall). `Confirmed`.
- Referred fan must maintain a paid sub 30+ days to qualify (PRD §4.5); commissions cleared via `cleared_at`, paid via fan-cashout. `Confirmed`/`Strongly inferred` on the 30-day gate specifics.
- `referrals`/`referral_earnings` tables are **shared** between fan-referral and clipper systems via a `source` discriminator (`fan|clipper`). ⚠️ Changing one risks the other.

## 8. Team Splits (collaborator revenue-share) — "capped hybrid"
Source: `src/lib/teamSplits/*`. `Confirmed`.
- **Percentage sets the rate, cap sets the max amount.** `splitAmountForEarning() = Math.round(basis * pct/100)`, `applyCap()` clamps to `cap − alreadyAccrued`, never negative.
- **Basis = `net_amount` by default** (post platform-fee, post referral/clipper commission) — a collaborator can never be owed more than the artist netted.
- **Fenced sources only:** a deal must resolve to a specific `tier`/`product`/`track`/`live_session`/`booking`, or a `road_campaign` with a linked tier/product. Unfenceable sources (`custom`/`none`, unresolvable campaign) **accrue $0** (`getQualifyingEarnings` returns `[]`). The only intentional unfenced source is `all_earnings` (flagged high-risk).
- **Accrual cron** (`0 20 * * *`): inserts `team_split_earnings` `status:'held'` with `cleared_at = now + hold_period_days` (default 7); marks deal `completed` at cap.
- **Refund clawbacks:** proportional negative accrual, `status:'released'` immediately (nets against balance now).
- **Deliverables** gate release if `payout_starts_after_deliverable_approval`; **disputes** freeze the deal (`status:'disputed'`, excluded from accrual + release); **release** is artist-only (`held`→`released`).

## 9. Discount codes
- `percent` or `fixed`, scoped to tier/product/all, usage limits + expiry. Pro-tier-gated to create (`discount-codes/route.ts:60`). Applied at checkout as a Stripe coupon on the **discounted** unit amount (fee computed post-discount). `Confirmed`.

## 10. Webhook-triggered business events
`checkout.session.completed` → writes an `earnings` row (`gross`/`platform_fee`/`net`), sends notifications/emails, updates `activation_milestones`, processes referral commission, enrolls sequences, records discount use, resolves abandoned-cart. `invoice.paid` → renewal bookkeeping + recurring commission. `charge.refunded` → negative earning, proportional commission clawback, `purchases.status='refunded'`. Platform-plan events branch via `artist_profiles.platform_stripe_subscription_id`. `Confirmed`.

## 11. Marketing limits & protections
- **Email blasts:** Free 1/mo, Pro 10/mo (`EMAIL_LIMITS`). PRD also cites "2 campaigns/week" — reconcile. `Confirmed` on `EMAIL_LIMITS`.
- **Imported-contact invites (2026-07-30):** a `fan_contacts` row is emailable ONLY when its import carried the artist's permission attestation (`consent_attested_at`) AND `is_subscribed_email` is still true AND the address is not globally suppressed. Importing a file never creates consent by itself; the attestation is what CRWN records, versioned (`src/lib/fanImportConsent.ts`). Contact campaigns count against the same `EMAIL_LIMITS` quota, cannot be scheduled (interactive send only; the cron sender refuses them), default toward a small test group, and their unsubscribe flips `fan_contacts.is_subscribed_email`. `Confirmed`.
- **Call-request consent (2026-07-30, alert channel changed 2026-07-31):** a founder alert fires ONLY when calculator completed + server-recomputed `sales_priority` + valid callback number + explicit versioned consent + an active request. Inferred interest never alerts; unqualified requests are recorded in the admin Calls tab but never alerted. One alert per phone per day, DB-claimed. Since the SMS removal the alert is EMAIL always (joshn.wms@gmail.com), optionally mirrored to a carrier email-to-SMS gateway via `FOUNDER_ALERT_SMS_EMAIL` (plain Resend, no Twilio). `Confirmed`.
- **SMS: REMOVED 2026-07-31** (founder decision: A2P 10DLC compliance cost not worth it). The Pro+ gating, quiet hours, 1 SMS/mo/fan cap and `sms-reset` cron are all gone with the feature; `sms_*` tables stay dormant for consent history. Terms §13 (SMS Messaging Program) was removed from the legal pages.
- **Suppression:** hard bounce → global suppress; spam complaint → opt out of all artist marketing; senders check before send. `Confirmed`.
- **Sequences:** triggers `new_subscription|new_purchase|new_post|abandoned_cart|tier_upgrade|loyalty_survey`; multi-step delays; auto-enroll on trigger; conversion checked in a 7-day window. `Confirmed`.

## 12. Onboarding & role rules
- Signup → `/welcome` (name/phone/role, creates `artist_profiles`) → `/setup` wizard (9 one-field screens; photo + one track mandatory; Monetize/Shop skippable). `Confirmed`.
- **Editable CRWN link at `/welcome`:** artists set their public handle via an editable `thecrwn.app/[handle]` field, auto-filled from the name via `slugify` until edited, validated against reserved handles (`isReservedSlug`) and Postgres 23505 unique collisions (inline error). The slug is created from the chosen handle, not the prefilled legal display name (which previously produced `thecrwn.app/fulllegalname`). `Confirmed`.
- **`setup_completed` is persisted via the service-role `POST /api/artist/complete-setup` route** (admin client, explicit `getUser` auth, confirms a row matched); `useArtistSetup.markComplete()` calls it and throws on failure. The prior silent client `.update()` could fail and bounce the artist from the dashboard back into `/setup` (a black-screen loop). `Confirmed`.
- **Email verification lands on `/verify`** (signup `emailRedirectTo`), a success screen that forwards by onboarding state; middleware preserves `?verified=true` on PKCE failure for the cross-browser/webview case. `Confirmed`.
- **Deactivation hides publicly:** `profiles.is_active=false` is read at `[slug]` (`notFound()`) and filtered from home discovery AND `/api/explore` (artist tiles + their tracks). This is app-layer per surface, not RLS (`profiles`/`artist_profiles` SELECT are `USING (true)`), so EVERY new public listing surface must filter `is_active !== false` itself. Reactivates on next login via `useAuth` calling `/api/account/reactivate`. `Confirmed`.
- **Role promotion is server-side only** — publishing an artist page fires `trg_promote_to_artist` (fan→artist). A client `profiles.update({role})` is RLS-rejected silently. Never add one. `Confirmed`.
- "Is an artist" is derived from the **`artist_profiles` row existing**, not `profile.role` (context lags a token refresh). `Confirmed`.
- Setup completion is **DB-derived** (`hasTier`/`hasMusic`/`hasProduct` from live queries), not stored per-step; the only stored flag is `artist_profiles.setup_completed`. `Confirmed`.
- Onboarding tiers insert with null Stripe ids; `backfillTierPrices()` creates prices after Stripe connects. `Confirmed`.

## 13. Acquisition / recruiter / partner (influencer) economics
- Recruiter link `thecrwn.app/join/[code]` → `referral_clicks`; artist signup within a **30-day** window marks conversion. Flat fee on qualification (30+ days on a paid plan). Payouts via Stripe Connect, qualification cron daily. `Confirmed` (code paths); no payout has ever run in production.
- **Recurring commission = 1% of the referred artist's REVENUE, for 12 months.** Founder rule, 2026-07-14. The base is `earnings.net_amount` (what the artist keeps, the same basis Team Splits uses), summed over the previous calendar month; refunds are negative rows so they net out; a net-negative month pays 0 (no clawback). Rate is **negotiable per influencer** via `recruiters.partner_recurring_rate` (legacy column name, now applies to every recruiter, not just partners); null means the standard 1%. `Confirmed` (`cron/recruiter-recurring`, `cron/recruiter-qualify`).
- **No plan gate on the recurring payout.** The commission is funded by the platform fee CRWN charges on that revenue, which exists on every plan (Free 12%, Pro 8%), so a referred artist on Free still earns their influencer 1%.
- ⚠️ **Superseded model (do not reintroduce):** commission used to be a % of the artist's *monthly SaaS fee to CRWN*, tiered 5%/10% by recruiter tier, and gated to "Label+" artists. It read a hardcoded price map (`pro: 5000, label: 17500, empire: 35000`) that had drifted into fiction, so it would have paid **5x** the real amount into `stripe.transfers.create()`. Fixed 2026-07-14 before any payout ran. **Never hardcode a price; derive from `TIER_PRICING`.**

## 14. Opportunity modelling rules (the public calculators)

These govern every number CRWN shows an artist about money they do **not** yet have. Source of truth
for the combined model: `src/lib/opportunity/unifiedModel.ts` (`unifiedOpportunity@1`); for the
single-opportunity tools: `src/lib/acquisition/toolAdapters.ts` and `src/lib/leadCalculator.ts`.
Full spec: `docs/UNIFIED_OPPORTUNITY.md`. `Confirmed`.

- **NEVER add tool headlines together.** The 17 single-opportunity calculators are each honest alone
  and dishonest in company: they are all modeled off the same audience and most resolve to the same
  dollar. At 500k followers their own formulas sum to ~$550,835/mo and 23,500 paying people, against
  a repo audience model that says 2,250 of them ever pay for anything. Any surface that needs a
  combined figure must call the unified model, not sum the adapters.
- **One audience.** `max(followers, listeners, owned)`, never a sum: nothing in this repo can say how
  much two platforms overlap, and adding them invents an audience the artist does not have. Owned
  contacts are a **subset** folded in by inclusion-exclusion (owned are fully reachable, the rest at
  `reachRate`), so addressable can never exceed the audience. Where overlap is unknown, say so.
- **One unique paying-supporter count**, and every recurring dollar is the ladder applied **once** to
  it. Conversion is capped at `maxConversion` (10% of addressable) no matter how many growth systems
  are switched on.
- **The vault is a membership TIER** (Gold, $25, the middle rung of `RECOMMENDED_LADDER`), not a second
  membership. Standalone only when explicitly configured, and then it **replaces** a rung. Not
  recommended below five unreleased pieces.
- **Share-to-Earn and Clip-to-Earn are ACQUISITION, not revenue.** Clips are a capped lift on the
  conversion of the audience already reached. Sharing is the only mechanism reaching outside it, so
  it adds heads, but those heads join the **same** ladder at the same prices. Both appear only as a
  supporter and attribution split: `organic + clip + share == payingSupporters`. Attribution
  explains where a supporter came from; it never multiplies the revenue.
- **Members and non-members are disjoint populations.** Member spend = the ladder plus one member
  ARPU line. Tickets, tips and session seats sell **only** out of the non-member pool, so a member
  is never also counted as a buyer. A session included in a tier earns **zero** on its own (it is
  what makes that tier worth its price, and that price is already counted); a hybrid counts only the
  extra seats. This is the rule that makes a combined total provable.
- **A fan may hold several roles; a person is counted once.**
  `uniquePromoters = sharers + clippers - both`.
- **Financial presentation:** recurring and one-time are tracked separately and only added at the
  gross line; gross is never mixed with net; the platform fee is applied once at the Pro rate;
  contributor commission is artist-funded on the **attributed slice only** and capped at
  `gross - platformFee` (matching how `checkout/route.ts` charges an `attributedCut`); revenue the
  artist already earns is **subtracted**, never added; annualization is x12 and nothing longer.
- **Language:** a planning estimate of what the artist *could build*. Never owed, never guaranteed,
  never described as current revenue. Ranges where precision is unsupported.
- **Opportunities that cannot be honestly monetized stay OUT of the dollar total** and are named
  with a reason: Proof of Demand (free by design), retention/churn (no input for it), fan missions
  (their effect is already inside acquisition), royalties (money earned elsewhere, a different
  tool), sponsorship and replay sales (**not built in CRWN**, so absent from the math and the copy).
- **If the artist edits the plan, re-derive the number.** `recalcUnified.ts` re-runs the model on the
  edited structure. Keeping a headline the artist's own edits invalidated is the same dishonesty as
  double-counting, pointed at a stale number instead of an inflated one.

## 15. UX-enforced product rules (from CLAUDE.md, verified in code)
- Multi-option (pick-one-of-3+) selectors must use `OptionSelect` dropdown, not a grid. `Confirmed`.
- Flows launched from Rise Mode honor `?returnTo=` on exit/success; back arrows use `smartBack(router, fallback)`. `Confirmed`.
- **No em dashes** in any user-facing copy. `Confirmed` (recent commits removed them app-wide).

---

*See also: [05-DATABASE.md](05-DATABASE.md) · [10-INTEGRATIONS.md](10-INTEGRATIONS.md) · [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [17-OPEN-QUESTIONS.md](17-OPEN-QUESTIONS.md)*
