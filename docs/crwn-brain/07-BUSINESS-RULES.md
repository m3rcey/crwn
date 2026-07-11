# 07 — Business Rules

> Business logic extracted from code, with source citations. `Confirmed` unless noted. Where a rule is duplicated across files, it is flagged.

## 1. Money is always integer cents
ALL DB price/amount columns are integers in cents. Form input → `Math.round(parseFloat(val) * 100)`; display → `(price / 100).toFixed(2)`. `Confirmed` (`CODEBASE.md`, `checkout/route.ts`, 37 files use the display pattern). **Never** store dollars.

## 2. Platform SaaS tiers, fees, and limits
Source of truth: `TIER_LIMITS` in `src/lib/platformTier.ts`. `getArtistFeePercent(artistId)` is the single fee-determination function used at charge time.

| Tier | Price | Fee | maxFanTiers | maxTracks | maxMembers | bundles/scheduling/live/DMs/clipper | SMS/mo | Email blasts/mo |
|---|---|---|---|---|---|---|---|---|
| Free (`starter`) | $0 | **12%** | 1 | 20 | 100 | all off | 0 | 1 |
| Pro (`pro`) | **$9.99/mo** | **8%** | 3 | ∞ | ∞ | all on | 500 | 10 |
| $99 (`label`, spec-only) | $99/mo | 5% | 10 | ∞ | ∞ | all on | 2500 | 50 |
| `empire` (dead) | — | 3% | ∞ | ∞ | ∞ | all on | 10000 | ∞ |

- **Founding-artist override:** `is_founding_artist` + unexpired `founding_fee_expires_at` → flat **5%** regardless of tier (`getArtistFeePercent()`, `platformTier.ts:245`). `Confirmed`.
- **Only `pro` is billable in v1** — `platform-checkout` hard-whitelists `tierId==='pro'` (`platform-checkout/route.ts:22`). `label`/`empire` are spec/dead.
- `checkArtistLimit(artistId, 'tracks'|'fanTiers')` enforces caps server-side against live counts; `-1` = unlimited (`isAtLimit`). `Confirmed`.
- **Fan-tier cap counts PAID tiers only (price > 0).** The free "front door" tier does NOT consume a plan's fan-tier allowance (founder-approved rule, Rise Mode Prompt 2). So the caps above (`starter` 1, `pro` 3) mean **paid** tiers; every plan may also run a free tier. This lets the recommended four-tier ladder (free Community + Backstage $10 + Inner Circle $25 + Executive $100 = free + 3 paid) fit Pro without changing any cap number, price, or fee. The paid-only predicate is defined identically in `checkArtistLimit()` (`platformTier.ts`) and `/api/platform/limits`; enforcement remains client-side (the server gate `/api/tiers/check-limit` is still not wired into creation). `Confirmed`.

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
- **SMS:** Pro+ only; quiet hours 9pm–9am fan-local; **max 1 SMS/mo/fan/artist**; monthly counter reset (`sms-reset` cron). Quiet-hour sends currently dropped (not queued). `Confirmed`.
- **Suppression:** hard bounce → global suppress; spam complaint → opt out of all artist marketing; senders check before send. `Confirmed`.
- **Sequences:** triggers `new_subscription|new_purchase|new_post|abandoned_cart|tier_upgrade|loyalty_survey`; multi-step delays; auto-enroll on trigger; conversion checked in a 7-day window. `Confirmed`.

## 12. Onboarding & role rules
- Signup → `/welcome` (name/phone/role, creates `artist_profiles`) → `/setup` wizard (9 one-field screens; photo + one track mandatory; Monetize/Shop skippable). `Confirmed`.
- **Editable CRWN link at `/welcome`:** artists set their public handle via an editable `thecrwn.app/[handle]` field, auto-filled from the name via `slugify` until edited, validated against reserved handles (`isReservedSlug`) and Postgres 23505 unique collisions (inline error). The slug is created from the chosen handle, not the prefilled legal display name (which previously produced `thecrwn.app/fulllegalname`). `Confirmed`.
- **`setup_completed` is persisted via the service-role `POST /api/artist/complete-setup` route** (admin client, explicit `getUser` auth, confirms a row matched); `useArtistSetup.markComplete()` calls it and throws on failure. The prior silent client `.update()` could fail and bounce the artist from the dashboard back into `/setup` (a black-screen loop). `Confirmed`.
- **Email verification lands on `/verify`** (signup `emailRedirectTo`), a success screen that forwards by onboarding state; middleware preserves `?verified=true` on PKCE failure for the cross-browser/webview case. `Confirmed`.
- **Deactivation hides publicly:** `profiles.is_active=false` is read at `[slug]` (`notFound()`) and filtered from home discovery (app-layer, not RLS); reactivates on next login via `useAuth` calling `/api/account/reactivate`. `Confirmed`.
- **Role promotion is server-side only** — publishing an artist page fires `trg_promote_to_artist` (fan→artist). A client `profiles.update({role})` is RLS-rejected silently. Never add one. `Confirmed`.
- "Is an artist" is derived from the **`artist_profiles` row existing**, not `profile.role` (context lags a token refresh). `Confirmed`.
- Setup completion is **DB-derived** (`hasTier`/`hasMusic`/`hasProduct` from live queries), not stored per-step; the only stored flag is `artist_profiles.setup_completed`. `Confirmed`.
- Onboarding tiers insert with null Stripe ids; `backfillTierPrices()` creates prices after Stripe connects. `Confirmed`.

## 13. Acquisition / recruiter / partner economics (per PRD §6 — Needs founder confirmation on live status)
- Recruiter link `thecrwn.app/join/[code]` → `referral_clicks`; artist signup within a **30-day** window marks conversion. Flat fee on qualification (30+ days on paid plan); Tier 1/2 partners also get recurring % for 12 months on Label+ artists; content bonuses performance-based. Payouts via Stripe Connect, qualification cron daily. Code paths exist; real-world activation `Needs founder confirmation`.

## 14. UX-enforced product rules (from CLAUDE.md, verified in code)
- Multi-option (pick-one-of-3+) selectors must use `OptionSelect` dropdown, not a grid. `Confirmed`.
- Flows launched from Rise Mode honor `?returnTo=` on exit/success; back arrows use `smartBack(router, fallback)`. `Confirmed`.
- **No em dashes** in any user-facing copy. `Confirmed` (recent commits removed them app-wide).

---

*See also: [05-DATABASE.md](05-DATABASE.md) · [10-INTEGRATIONS.md](10-INTEGRATIONS.md) · [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [17-OPEN-QUESTIONS.md](17-OPEN-QUESTIONS.md)*
