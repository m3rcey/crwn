# 28 — Team Split Funding Architecture

> **ARCHITECTURE ONLY: FUNDING RAIL REMAINS DISABLED.**
>
> `/api/stripe/team-split-cashout` still returns `503 TEAM_SPLIT_FUNDING_PENDING` and
> `cashoutFundingReady` is still `false`. Nothing in this document is implemented. No Stripe object
> was created or modified, no migration was authored, no money moved.
>
> Production re-verified 2026-08-12: **0 deals, 0 accruals, 0 payouts, 0 deal versions, 0
> deliverables, 0 disputes, 0 audit events.** Nobody is owed anything, and there is no historical
> collaborator balance to migrate. That is the single biggest asset this design has.
>
> Authored 2026-08-12 on branch `claude/rise-mode-full-journey`. Repository is truth for what CRWN
> does; Stripe's own documentation is truth for what Stripe allows, and is cited inline.

**`CLAUDE_PROMPT_FRAMEWORK.md` is still absent** from the working tree and from git history. Seventh
recorded confirmation; noted once, not repeated.

---

## 1. The ratified rule, and the three settled questions

A Team Split is **artist-funded collaborator revenue sharing, carved from the artist's qualifying
net**. CRWN platform revenue never funds it. Not reopened here.

The three questions that closed this rail are **RATIFIED** and are no longer open:

| | Decision |
|---|---|
| **D1** | A split never applies retroactively. A FUTURE payment from an existing subscription may participate **only if the collaborator amount was actually funded before that payment settled**. If it was not, that payment produces no payable. |
| **D2** | No accrual may ever be created from an earning that predates the deal's effective funding boundary. Historical artist money is never rewritten into collaborator debt. |
| **D3** | Reserve that becomes deterministically unowed belongs to the **ARTIST**, never CRWN, released through an idempotent traceable path. Money still exposed to refund, dispute, hold or a deliverable condition is not surplus yet. |

`FUNDING_RATIFIED_DECISIONS` in `src/lib/teamSplits/funding.ts` already records these.
`FUNDING_OPEN_QUESTIONS` in the same file is marked `@deprecated` and is retained only so the
history reads honestly. **Four places still describe those three items as open questions and are
now stale:** `CLAUDE.md`, `docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md`,
`docs/CYBERSECURITY_AUDIT_2026-08-12.md` (F-3) and `TODO.md`. Correcting them is part of the
implementation task, not this one.

---

## 2. What the repository actually does today

Traced from the current source, not from an earlier report.

### 2.1 Every fan-payment rail is a Stripe DESTINATION charge

| Rail | Route | Fee mechanism |
|---|---|---|
| Subscriptions (initial + renewals) | `api/stripe/checkout` | `subscription_data.application_fee_percent = platformFeePercent + attributedCut`, `transfer_data.destination = <artist>` |
| Track purchase | `api/stripe/track-checkout` | `application_fee_amount` |
| Product purchase | `api/stripe/product-checkout` | `application_fee_amount` |
| Booking | `api/stripe/booking-checkout` | `application_fee_amount` |
| Live ticket | `api/stripe/live-checkout` | `application_fee_amount` |
| Live tip | `api/stripe/live-tip-checkout` | `application_fee_amount` |

`on_behalf_of` is not used anywhere. CRWN is therefore the settlement merchant, which Stripe says
is the default: *"If `on_behalf_of` is omitted, the platform is the business of record for the
payment."*

### 2.2 Where the money physically goes

Stripe, on destination charges: *"the full charge amount is immediately transferred from the
platform to the `transfer_data[destination]` account after the charge is captured. The
`application_fee_amount` (capped at the full amount of the charge) is then transferred back to the
platform."* And: *"Your account balance is debited for the cost of the Stripe fees, refunds, and
chargebacks."*

So the artist's share lands in the ARTIST's Connect balance. Only the application fee stays with
CRWN.

### 2.3 Artist payouts are Stripe's, not CRWN's

Every connected account is Express on Stripe's automatic `daily` schedule with `delay_days: 2`.
CRWN passes no `settings.payouts` and calls `payouts.create` in exactly one place (the artist's own
manual cashout). `/api/cron/weekly-payout` is retired and a test enforces that no cron may create a
payout (`src/lib/stripe/payoutOwnership.test.ts`).

**Consequence that decides the architecture: money in an artist's Connect balance is swept to their
bank automatically, roughly every day.** Any design that plans to retrieve collaborator money from
the artist AFTER settlement is racing a sweep it will eventually lose.

### 2.4 Refunds are not initiated by CRWN at all

`refunds.create` appears **nowhere** in the codebase, and neither does `reverse_transfer`. Refunds
are issued outside the application (Stripe Dashboard), and `charge.refunded` merely RECORDS them:
`webhookHandlers.ts` writes a negative `earnings` row and mirrors a negative `referral_earnings`
clawback scaled by the refund ratio.

Stripe: *"When refunding a charge that has a `transfer_data[destination]`, by default the
destination account keeps the funds that were transferred to it, leaving the platform account to
cover the negative balance from the refund. To pull back the funds from the connected account to
cover the refund, set the `reverse_transfer` parameter to `true`."*

**This is a live finding independent of Team Splits.** Today a refund on a destination charge
leaves the artist holding their share while CRWN's platform balance absorbs the whole refund,
unless whoever clicks Refund in the Dashboard also selects the reverse-transfer option. Team Split
funding makes this materially worse (the reserve is in the platform balance too), so the
implementation must settle refund policy rather than inherit it.

### 2.5 Team Split accrual already refuses to run ahead of money

`d3166c4b` wired the guard: `/api/cron/team-split-accruals` calls `withinFundingBoundary()`, reads
`earnings.metadata.team_split_reserved` through `fundedReserveFor()`, and clamps with
`accruableAmount()`. An earning with no recorded reserve accrues **zero**.

`computeFunding()` in `funding.ts` is the pure charge-time arithmetic, with 18 passing tests
asserting conservation. **It is not called from anywhere.** `security.test.ts` (TS-MONEY-005)
asserts the rail must either fail closed or have the reserve wired into checkout, and today it is
the first branch that holds.

**So the ONLY missing piece is the charge-time reserve itself.** The ledger already refuses to
promise money that was never withheld.

---

## 3. The subsidy defect, recomputed from current code

$100 subscription, Launch plan (12%), no referral, one 50% Team Split.

| Step | Source | Amount |
|---|---|---|
| Fan pays | | **$100.00** |
| `application_fee_percent = 12` | `checkout/route.ts:193,256` | $12.00 to CRWN |
| Destination transfer | `transfer_data.destination` | $88.00 to the ARTIST's Connect balance |
| Stripe fee (2.9% + 30c) debited from the platform | Stripe destination-charge rules | -$3.20 from CRWN |
| **CRWN balance after settlement** | | **$8.80** |
| `earnings.net_amount` | `webhookHandlers` | $88.00 |
| Accrual at 50% of net | `allocation.ts` | $44.00 owed to the collaborator |
| Cashout | `team-split-cashout` would call `transfers.create` with **no `source_transaction`** | **$44.00 out of CRWN's platform balance** |

CRWN collected $8.80 and would pay out $44.00. **Net loss $35.20 on a $100 sale, on every split,
forever.** Meanwhile `/api/stripe/cashout` still pays the artist their full $88.

The ledger said "artist-funded". The cash movement was CRWN-funded. Those two disagreed, and the
cash movement is the one that is real.

---

## 4. Conservation invariant

For every qualifying charge, in **integer cents**:

```
grossCents
  = platformFeeCents            (CRWN revenue, never reduced by a split)
  + attributedCutCents          (referral/clipper, artist-funded)
  + collaboratorReserveCents    (Team Split, artist-funded)
  + artistProceedsCents         (what actually reaches the artist's Connect balance)
```

with `0 <= collaboratorReserveCents <= artistNetCents`, where
`artistNetCents = grossCents - platformFeeCents - attributedCutCents`.

Stripe's processing fee is debited from the platform balance separately and reduces CRWN's own
revenue, exactly as it does today. It is outside this allocation and is not borne by the artist or
the collaborator.

`reconciles()` and `crwnRevenueCents()` in `funding.ts` already assert this, and
`funding.test.ts` covers plans, discounts, referrals, caps, concurrent deals, over-allocation and
refunds.

---

## 5. Model comparison

| Criterion | **A. Charge-time reserve** | **B. Transfer then reverse** | **C. Reuse an existing rail** |
|---|---|---|---|
| Conservation correctness | Exact, in cents, before money moves | Correct only if every reversal succeeds | n/a: C IS A |
| CRWN subsidy risk | None by construction | Real whenever a reversal fails | None |
| New subscriptions | `application_fee_amount` on each invoice | Same problem, later | Proven pattern |
| **Existing subscriptions** | **Works with no subscription amendment** (section 7) | Works, but same race | Proven pattern |
| One-time purchases | Add reserve to `application_fee_amount` | Extra reversal per sale | Proven pattern |
| Refund correctness | Reserve never left the platform; unwinds locally | Must chase money twice | Proven pattern |
| Dispute correctness | Platform is debited and still holds the reserve | Platform debited, reserve may be gone | Proven pattern |
| **Automatic payout safety** | Reserve never enters the artist balance, so the daily sweep cannot take it | **Races Stripe's `delay_days: 2` sweep and loses** | Safe |
| Stripe support | Documented first-class | Documented, but for dispute recovery, not routine funding | Documented |
| Failure recoverability | Reconcile from the invoice's own application fee | Partial-failure states multiply | Good |
| Implementation complexity | Moderate, one new webhook branch | High | Lowest |

### Why A wins, and why B is not merely "more work"

Model B asks CRWN to take money back out of an account Stripe is actively emptying. Artist accounts
are on `delay_days: 2` automatic payouts, so a reversal has a short and non-deterministic window,
and a failed reversal produces exactly the outcome this whole exercise exists to prevent: a
collaborator owed money that CRWN must find. Stripe positions transfer reversal as **dispute
recovery** (*"you can attempt to recover funds from the connected account by reversing the
transfer"*), which is a best-effort remedy, not a funding mechanism. Best-effort is not a funding
mechanism.

**Model C turns out to BE Model A.** The referral/clipper rail already withholds an artist-funded
pass-through by adding it to the application fee (`effectiveFeePercent = platformFeePercent +
attributedCut`, `checkout/route.ts:193`), and already claws it back proportionally on refund. Team
Splits should ride the same topology. **This design introduces no new money topology at all**,
which is the strongest thing that can be said about a payments change.

**Recommendation: Model A.**

---

## 6. New sale flow

$100 gross, Launch (12%), 10% referral, one 50%-of-net deal with cap headroom.

```
gross                                             10000c
  platform fee      12% of gross                  -1200c   -> CRWN revenue
  referral cut      10% of gross                  -1000c   -> artist-funded, referrer
  = artist net                                     7800c
  collaborator      50% of net (cap-clamped)      -3900c   -> artist-funded, RESERVED
  = artist proceeds                                3900c   -> artist Connect balance
```

Stripe representation:

- **One-time charges:** `application_fee_amount = 1200 + 1000 + 3900 = 6100`. One integer, exact.
- **Subscriptions:** `application_fee_amount = 6100` set on the invoice (section 7). Do NOT try to
  express the reserve as `application_fee_percent`: a percent cannot carry a cap clamp and
  reintroduces rounding.

Conservation: `1200 + 1000 + 3900 + 3900 = 10000`. CRWN revenue is `1200`, unchanged by the split.

---

## 7. Subscription invoices, including EXISTING subscriptions

This was expected to be the hard part. Stripe's documented invoice-level fee makes it the easy part.

> *"To charge a flat or dynamic fee that can't be automatically calculated with
> `application_fee_percent`, add an `application_fee_amount` directly on each invoice created by the
> subscription."*
>
> *"The `application_fee_amount` set directly on an invoice overrides any application fee amount
> calculated with `application_fee_percent` and is capped at the invoice's final charge amount."*
>
> *"To automatically charge an `application_fee_amount`, create a webhook that listens for the
> `invoice.created` event."*
>
> (`https://docs.stripe.com/connect/subscriptions`)

**The mechanism: on `invoice.created`, compute the exact reserve in integer cents and set
`application_fee_amount` on that invoice.**

What this buys, and why it beats amending the subscription:

- **No subscription mutation.** No `application_fee_percent` update, therefore no proration risk, no
  `billing_cycle_anchor` change, no fan price change, no access interruption, no re-attribution of
  the referral. Stripe's proration triggers are price, quantity and interval changes; none is
  involved.
- **Existing subscriptions participate automatically.** The reserve attaches to the INVOICE, not to
  the subscription, so a deal accepted today applies from the next invoice of a subscription created
  a year ago. **This satisfies D1's renewal case affirmatively**, and it does so by funding before
  settlement rather than by promising and hoping.
- **Caps are exact.** Headroom is read at the moment the invoice is created, so the reserve is
  `min(want, headroom, artistNet)` in cents rather than a percent that drifts as the cap fills.
- **Discounts are handled by Stripe.** The invoice's final charge amount already reflects coupons
  and account-balance adjustments, and the fee is capped at it.

Two constraints to respect:

1. *"If Stripe fails to receive a successful response to `invoice.created`, then finalizing all
   invoices with automatic collection is delayed for up to 72 hours."* The handler must be fast and
   must not throw. If it cannot compute a reserve it must set nothing and return 200: the invoice
   then finalizes on the existing `application_fee_percent`, no reserve is recorded, and the accrual
   guard yields zero. **Failure means the collaborator is owed nothing, never that they are owed
   money nobody funded.**
2. *"Your platform can't add an `application_fee_amount` to an invoice that it didn't create."*
   CRWN creates all of these, so this is satisfied, and it is a reason never to move subscription
   creation to the connected account.

---

## 8. Settlement, and the proof that funding happened

The authoritative moment is the existing settlement webhook, not a checkout success page.

On `invoice.paid` / `charge.succeeded`, the handler already writes the `earnings` row. It must
additionally record what was ACTUALLY withheld:

```
earnings.metadata.team_split_reserved = { "<dealId>": <cents>, ... }
```

derived from the settled charge's real `application_fee_amount` minus the platform fee minus the
attributed cut, **never from what the app intended to withhold**. `RESERVE_METADATA_KEY`,
`fundedReserveFor()` and `accruableAmount()` already exist and already gate the accrual cron.

This reuses `earnings.metadata`, which already carries `attributed_commission` for the identical
concept: an artist-funded pass-through that must not be mistaken for CRWN revenue. **No new table,
no wallet, no second revenue ledger.**

---

## 9. Reserve ownership and platform solvency

**Stripe provides no segregation.** The reserve physically sits in CRWN's platform balance, mixed
with CRWN's own revenue. There is no Stripe primitive that ring-fences it, and this document will
not pretend otherwise.

Therefore the segregation is a LEDGER fact, and CRWN must be able to compute, at any moment:

```
collaboratorReserveLiability =
    SUM(earnings.metadata.team_split_reserved)      -- funded
  - SUM(team_split_payouts where completed)         -- paid out
  - SUM(reserve extinguished by refund/dispute)     -- unwound
  - SUM(surplus released to artists)                -- returned
```

Rules that follow, and none of them is optional:

- The reserve is **never** CRWN revenue, gross profit, application-fee revenue or available
  operating balance. `crwnRevenueCents()` already returns only `platformFeeCents`.
- CRWN's own financial reporting must subtract this liability from the platform balance before
  calling anything "CRWN money".
- The artist's manual cashout (`/api/stripe/cashout`) is **naturally isolated**: it pays from the
  ARTIST's Connect balance, and the reserve never entered it. That isolation is a property of Model
  A and is the second-strongest reason to prefer it.

Honest limitation to state plainly: this is an accounting boundary, not a custodial one. If CRWN's
platform balance were ever drawn down for operating costs, the reserve could be spent. Enforcing
that is a treasury practice, not a code change.

---

## 10. Caps, and the concurrency around them

Reserve only what can still be owed **at the moment of charge**:

```
want      = round(basis * pct / 100)
headroom  = cap_amount - already_accrued        (null cap => unbounded)
reserve   = max(0, min(want, headroom, remainingArtistNet))
```

Example: split computes $12, remaining cap $7, reserve **$7**, not $12.

`computeFunding()` already does exactly this, and clamps the running total across deals to the
artist's net.

**Concurrency is real.** `already_accrued` is read from `team_split_earnings`, and two charges
settling simultaneously near a cap can both see the same headroom and both reserve it. The
consequence is over-collection, not over-payment: the accrual guard still clamps, and the excess
becomes D3 surplus owed back to the artist. Over-collection is the safe direction, but it is not
free, so the implementation should take a per-deal advisory lock around the read-and-reserve, in
the same shape as `pg_advisory_xact_lock` in `atomic_team_split_cashout`.

---

## 11. Hold, deliverables and business disputes

**Funding ownership exists at charge time. The hold only controls RELEASE eligibility.** During the
7-day hold (`constants.ts: holdPeriodDays: 7`) the reserve is artist-funded collaborator money that
CRWN is holding. It is not CRWN's, and it is not the artist's again either.

- **Deliverable gate** (`payout_starts_after_deliverable_approval`): **reserve at charge time,
  release on approval.** Approval must never be the event that creates the obligation, or a
  deliverable approved months later would demand money nobody withheld. If the deal ends with the
  deliverable unapproved under valid terms, the reserve becomes D3 surplus and returns to the artist.
- **Business dispute** (`team_split_disputes`, artist vs collaborator): freezes RELEASE. It changes
  nothing about funding, and it never returns the reserve to CRWN. It is completely distinct from a
  Stripe chargeback, and the implementation must not let one code path serve both.

---

## 12. Refunds

### 12.1 Before the collaborator has cashed out (the normal case)

The reserve never left CRWN's balance, so the unwind is local and complete.

Full refund of the $100 example, with `reverse_transfer: true`:

| Account | Movement |
|---|---|
| Fan | +$100.00 refunded |
| CRWN platform balance | -$100.00 refund, +$61.00 fee it already held, +$39.00 reversed transfer = **net 0** |
| Artist Connect | -$39.00 (their proceeds reversed) |
| Collaborator | nothing owed; the $39.00 reserve is extinguished, not paid |

Partial refunds scale proportionally, which is what `reserveClawback()` already computes, and what
the existing referral clawback already does with `refundRatio`.

**This only works if the refund reverses the transfer.** Per section 2.4 CRWN issues no refunds in
code, so `reverse_transfer` is currently a human choice in the Dashboard. **The implementation must
make that policy explicit**, because a refund without transfer reversal makes CRWN absorb the
artist's share, which is a subsidy of a different shape.

### 12.2 After the collaborator has cashed out (the honest hard case)

Money has left for a third party's bank account. CRWN cannot unconditionally get it back, and this
document will not invent a guarantee.

Current behavior, which is the right default: the accruals cron writes a **negative
`team_split_earnings` row** (`reason: 'refund_clawback'`, released and cleared immediately) so the
clawback reduces the collaborator's FUTURE balance. `atomic_team_split_cashout` counts negative rows
unconditionally, so a negative balance genuinely blocks further cashout.

Residual risk, stated plainly:

- If the collaborator never earns again, the negative balance is never recovered and **CRWN has
  effectively funded that shortfall**. It is bounded by what was already paid out, and it is a real
  cost, not a theoretical one.
- Mitigations that exist: the 7-day hold, the $25 cashout minimum, and Stripe's own 2-day payout
  delay. Mitigations that do not exist: any ability to debit a collaborator.
- **Latency gap to fix:** the clawback runs in the DAILY accruals cron, not in the refund webhook,
  so there is up to a 24-hour window in which a collaborator can cash out against money already
  refunded. The implementation should mirror the clawback synchronously in the refund handler, in
  the same place the referral clawback already happens.

---

## 13. Stripe chargebacks

Stripe is unambiguous: *"For destination charges, with or without `on_behalf_of`, Stripe debits
dispute amounts and fees from your platform account."*

So a chargeback hits CRWN's platform balance, which is also where the reserve sits.

- **Reserve not yet paid out:** extinguish it against the dispute, exactly like a refund. Recover
  the artist's share by reversing the transfer if desired (Stripe's documented remedy), noting the
  same `delay_days: 2` race and that reversal fails if the artist's balance is empty.
- **Reserve already paid out:** negative accrual row, same as 12.2, same residual risk.
- **Dispute won:** funds return to the platform balance. Any reserve extinguished on the basis of
  that dispute must be re-established, or the collaborator silently loses money on a dispute the
  artist won.

---

## 14. Multiple concurrent deals

`computeFunding()` allocates deals in ARRAY ORDER and clamps the running total to the artist's net,
so the artist can never go negative. That guarantees safety. It does not define **fairness**.

**This is reachable, not hypothetical.** `POST /api/team-splits` validates each percentage
individually (0 to 100) and validates the source, but it does **not** block a second deal that
over-commits the same source. `warnings.ts` raises `source_overcommitted` when the combined
percentage crosses `RISK.totalSourceSplitCap`, and a warning is not a constraint. Two accepted 60%
deals on one tier can therefore coexist, and on the next sale the first deal in the array takes 60%
of net while the second takes only the 40% that remains, purely because of the order rows came back
from Postgres.

Allocating by arbitrary order is not something this investigation should invent. **See section 17.**

---

## 15. Source fencing, resolved BEFORE the charge

Charge-time funding needs the source known before payment. It is:

| Source | Known at charge time? | How |
|---|---|---|
| `tier` | Yes | the tier being subscribed to is the checkout input |
| `product` / `track` | Yes | the product/track being bought |
| `live_session` | Yes | the session the ticket is for |
| `booking` | Yes | the booking session |
| `road_campaign` | Yes, after resolution | collapses to its `linked_tier_id`/`linked_product_id` via `resolveRoadCampaign()`; **unresolvable means reserve nothing** |
| `all_earnings` | Yes | matches every positive type |
| `custom` / `none` | Names no revenue source | reserve nothing, accrue nothing (already the rule) |

This is strictly easier than the accrual path, which has to reconstruct the source AFTER the fact by
joining `purchases` / `live_ticket_purchases` / `booking_purchases` on the payment intent, because
`earnings` has no first-class source FK. At charge time CRWN is holding the answer already.

**Never reserve against a vague source and resolve later.** An unfenceable source pays zero.

---

## 16. Ledger, reconciliation and failure recovery

### 16.1 Can the current schema answer "where is this collaborator's money?"

Nearly. The states are already representable:

| State | Representation today |
|---|---|
| reserved | `earnings.metadata.team_split_reserved[dealId]` (NEW: written at settlement) |
| held | `team_split_earnings` row, `released_at IS NULL` or `cleared_at > now()` |
| released | `released_at` set and `cleared_at <= now()` |
| paid | `team_split_payouts` row, `status = 'completed'` |
| clawed back | negative `team_split_earnings` row, `reason = 'refund_clawback'` |
| **returned to artist** | **NOT REPRESENTABLE** |

**One genuine gap: D3 surplus.** There is no way to record that reserved money stopped being owed
and went back to the artist. Proposal, smallest possible, no new table:

- a `team_split_earnings` row with a negative `commission_amount` and a new
  `reason = 'surplus_to_artist'`, which keeps the collaborator balance arithmetic in one place; plus
- the actual movement, which is a platform-to-artist `transfers.create` (a rail that does not exist
  today and is the one genuinely new money movement this design requires).

`surplusToArtist()` in `funding.ts` already computes the amount.

### 16.2 Reconciliation keys

Minimum immutable link set, all of which already exist:

- `earnings.id`: canonical CRWN money row and the accrual's foreign key
- `earnings.stripe_payment_id`: the PaymentIntent, already used for source fencing
- the invoice id for subscription rails, so a reserve can be tied to the exact invoice whose
  `application_fee_amount` funded it
- `team_split_earnings.earning_id`: already enforces accrual idempotency

That is sufficient to answer "which Stripe money funded this collaborator obligation" without a new
identifier. `source_transaction` on the eventual `transfers.create` is worth setting where a single
charge funds the payout, but a cashout aggregates many earnings, so it cannot be the general key.

### 16.3 Failure recovery

| Failure | Behavior |
|---|---|
| Charge succeeds, DB write fails | No reserve recorded, no accrual. The money is over-withheld and becomes D3 surplus. Reconcilable from Stripe's own application fee against `earnings`. |
| Reserve planned, payment fails | Nothing withheld, nothing accrued. No state to unwind. |
| Webhook delivered twice | Existing idempotency: the `_refund` earning marker, and `team_split_earnings.earning_id` uniqueness per deal. |
| Webhook delayed | Accrual is a daily cron, so lateness is normal and harmless. |
| Refund arrives before the accrual | The accrual never happens (guard sees the reserve extinguished). Correct by construction. |
| Release races cashout | `pg_advisory_xact_lock` in `atomic_team_split_cashout` already serializes per collaborator. |
| Cap reached concurrently | Over-collection, never over-payment (section 10). |
| `invoice.created` handler fails | Invoice finalizes without the reserve. No accrual. Fail-safe. |

The recovery principle throughout: **reconcile from Stripe's own application fee plus the canonical
`earnings` row.** Every failure resolves to "the collaborator is owed nothing", never to "the
collaborator is owed money nobody funded".

---

## 17. The one genuine founder decision

Everything else in this document is settled by repository evidence plus Stripe's documentation.

> **How should multiple overlapping Team Split deals allocate an artist's net when together they
> exceed it?**

**Why it matters.** It is reachable today: deal creation warns about over-commitment but does not
prevent it, so two accepted deals can each claim more of one source than remains. `computeFunding()`
currently allocates in array order, which means an arbitrary query ordering silently decides which
collaborator is paid in full and which is short-changed. Two real people are affected and neither
outcome is obviously right, so an engineer must not pick.

**Recommended: refuse to over-commit at acceptance.** Block a deal whose acceptance would push the
combined active percentage on a source above 100% of the artist's net. It is the only option where
no collaborator is ever surprised, it converts a silent money outcome into an explicit conversation
between the artist and the person they are asking to work, and it needs no allocation rule at all.

**Alternative: pro-rata.** Allow over-commitment and scale every deal down proportionally when the
net is insufficient. Nobody is refused a deal, but every collaborator's take becomes conditional on
what the artist agreed with other people, which is difficult to explain and easy to resent.

**Not recommended: priority by acceptance date.** It is defensible in isolation and it silently
makes the last collaborator to sign the one who absorbs every shortfall.

---

## 18. Acceptance criteria for the implementation task

Financial mutation tests are required for each. Cashout stays disabled until a production canary
proves funding end to end.

1. **CRWN platform revenue never funds a collaborator.** `crwnRevenueCents()` equals the platform
   fee on every path, asserted across plans, referrals, discounts, caps and multi-deal cases.
2. **No payable without funding.** An earning with no `team_split_reserved` record accrues zero.
   Mutation: remove the guard, watch the suite fail.
3. **No retroactive accrual.** An earning created before the deal's boundary accrues zero even when
   the source qualifies, the cap has room and the deal is `all_earnings`.
4. **Existing-subscription renewals split only when funded before settlement.** An invoice that
   finalized without the reserve produces no accrual.
5. **Unowed reserve returns to the ARTIST**, never CRWN, through an idempotent traceable path.
6. **Integer-cent conservation** holds on every rail: `platformFee + attributedCut + reserve +
   artistProceeds == gross`, with no unexplained cents.
7. **Order preserved:** platform fee, then referral/clipper, then Team Split, computed on
   `earnings.net_amount` semantics, so a collaborator can never be owed more than the artist took.
8. **Actual discounted amount** is used, never a sticker price.
9. **Cap honored BEFORE reserving:** reserve `min(want, headroom, remainingNet)`.
10. **Concurrent deals bounded:** total reserve never exceeds the artist's net, under a per-deal lock.
11. **Refunds reconcile** proportionally, before payout locally and after payout as a negative
    balance, with the clawback mirrored synchronously in the refund handler.
12. **Chargebacks handled** per section 13, including re-establishing a reserve on a won dispute.
13. **Artist payout cannot consume the reserve:** the reserve never enters the artist's Connect
    balance, proven by asserting `application_fee_amount` includes it.
14. **Collaborator cashout <= funded, released, cleared balance**, with `cashoutFundingReady` gated
    on that being provable.
15. **Every accrual links to the Stripe money that funded it** (`earnings.id` + payment intent +
    invoice id).
16. **Retries idempotent** across duplicate and delayed webhooks.
17. **All money authority server-derived:** amount, source, destination and collaborator identity
    (`collaborator_user_id`, never a mutable email).
18. **The rail stays disabled** until a real canary charge is verified in production.

---

## 19. Security (unchanged, and must stay unchanged)

- Collaborator identity is the authenticated immutable `collaborator_user_id`. Email-based
  authority is not reopened.
- Artist ownership, source, amount and Stripe destination are all server-derived. No caller supplies
  a payout recipient.
- `atomic_team_split_cashout` has `EXECUTE` revoked from `PUBLIC`, `anon` and `authenticated`;
  service role only. It serializes per collaborator and reserves pending payouts against a double
  cashout race.
- Team Split and fan-referral balances never co-mingle: separate tables, separate RPCs.

---

## 20. Recommended phases

| Phase | Contents | Gate |
|---|---|---|
| **1** | Founder decision in section 17; wire `computeFunding()` into the five one-time checkouts; add the `invoice.created` handler for subscriptions; record `team_split_reserved` at settlement. **Cashout stays 503.** | Section 17 answered |
| **2** | Synchronous refund clawback; explicit `reverse_transfer` refund policy; dispute handling; the platform-to-artist surplus transfer rail. | Phase 1 shipped with tests |
| **3** | One real canary charge with a real deal, verified in Stripe AND in the ledger, then flip `cashoutFundingReady`. | Phase 2 verified |

Do not flip the gate before Phase 3. A passing test suite proves the arithmetic; only a canary
proves the money.

---

## 21. Implementation status (2026-08-12)

**Phase 1 shipped. The rail is still 503. `cashoutFundingReady` is still `false`.**

### Built

| Piece | Where |
|---|---|
| D4 over-commitment rule (pure, 26 tests) | `src/lib/teamSplits/commitment.ts` |
| D4 ATOMIC enforcement, advisory-locked | `accept_team_split_deal` in the funded-reserve migration |
| Enforced acceptance wired into the accept path | `src/lib/teamSplits/acceptance.ts`, `api/team-splits/[id]/respond` |
| Charge-time reserve resolver (the one money path) | `src/lib/teamSplits/reserve.ts` |
| First one-time rail withholding the reserve | `api/stripe/track-checkout` |
| Reserve traceability, D3 surplus payout kind, payout idempotency key | the funded-reserve migration |
| TS-MONEY-006 and a strengthened TS-MONEY-002, in the gate | `src/lib/architecture/security.test.ts` |

`resolveReserveForSale` never throws: every failure returns a zero reserve, so a checkout cannot
fail because a split could not be computed, and nobody can accrue against money never withheld.

Deal ACCEPTANCE returns 503 until the migration runs. Deliberate: binding a commitment CRWN cannot
enforce is worse than making an artist wait, and the payout rail is closed anyway.

### NOT built yet, and why the rail stays closed

1. **The other four one-time rails** (product, booking, live ticket, live tip) still pass the bare
   platform fee. Track is the reference wiring; the rest are mechanical and identical.
2. **The `invoice.created` handler** for subscription invoices, which is what brings existing
   subscriptions into scope (section 7).
3. **Settlement does not yet write `earnings.metadata.team_split_reserved`.** Until it does, the
   accrual guard sees no proof of funding and correctly accrues zero, which is why no collaborator
   can be owed anything today.
4. **The destination-charge refund subsidy is NOT closed** (section 2.4). `refunds.create` and
   `reverse_transfer` still appear nowhere. **This alone blocks re-enabling cashout**, independently
   of Team Splits.
5. **The D3 surplus TRANSFER** (platform to artist) is representable now but not implemented.
6. **The refund clawback still runs in the daily cron**, not the refund webhook.

### Stripe premise re-verified, with one correction

`application_fee_amount` on a subscription invoice still overrides `application_fee_percent` and is
capped at the invoice's final charge amount. **Correction to section 7:** the API reference adds
that *"Draft invoices are fully editable. Once an invoice is finalized, monetary values ... become
uneditable."* So `invoice.created` is not merely the convenient hook, it is the ONLY window, and a
handler that is slow or throws loses it. Stripe delays finalization up to 72 hours without a
successful response, which is the safety margin, not a licence to be slow.

---

## 22. Phase 2 (2026-08-13): migration live, rails funded, refund subsidy closed

**`schema-phase2-team-split-funded-reserve.sql` is APPLIED and live-verified.** The cashout rail is
**still 503**, and section 22.3 says exactly why.

### 22.1 Migration verified by BEHAVIOUR, not existence

Probed through the service role (both functions are REVOKED from anon/authenticated, so an anon
probe can only answer "denied", which is indistinguishable from "absent"):

| Probe | Result |
|---|---|
| `team_split_committed_percent` 101% of net | 101.00, over the ceiling |
| 100% of net | 100.00, allowed |
| **89% of GROSS at the Launch fee** | **101.14 of net, refused** |
| 88% of GROSS | 100.00, exactly at the ceiling |
| `custom` / fenced-with-no-id at 90% | 0, commits nothing |
| anon executing either function | denied |
| `accept_team_split_deal` on an unknown deal | no row |
| `funded_reserve_cents`, `payee_kind`, `artist_id`, `idempotency_key` | all present |

The gross-to-net conversion working in production is the one that mattered: 88% of gross really is
100% of net at Launch, and a validator that missed it would let a deal commit more than the artist
keeps.

### 22.2 Built in this pass

- **All five one-time rails now withhold the reserve**: track, product, booking, live ticket, live
  tip. One canonical calculation (`resolveReserveForSale`); no rail does split math.
- **Settlement proof** (TS-MONEY-009). All five earnings writers record
  `metadata.team_split_reserved` from the map the SETTLED charge carried, never from what checkout
  intended. Idempotent by construction: it derives a value onto a row already deduped by
  `stripe_payment_id`.
- **The destination-charge refund subsidy is CLOSED** (TS-MONEY-007). `recoverArtistShareOnRefund`
  runs from the refund webhook, so it covers Dashboard refunds CRWN never issued. It reverses only
  what is still owed, computed from the CUMULATIVE refunded amount against
  `transfer.amount_reversed`, so a refund already created with `reverse_transfer`, a redelivered
  webhook, and a sequence of partial refunds all converge without double-reversing.
- **Unrecovered money is reported, never hidden.** `RecoveryOutcome.shortfall` lands on the negative
  earnings row as `metadata.refund_recovery`.
- **The Team Split clawback moved to the refund event** (TS-MONEY-010). It was in the daily cron,
  leaving up to 24 hours in which a collaborator could cash out against refunded money. The refund
  webhook is now the authoritative writer and the cron is a repair pass.

**Application-fee refund policy was NOT a founder question.** The repository already defines it: the
refund handler writes `platform_fee: -refundedFee` on the negative earnings row, so CRWN's own ledger
has always booked its fee as proportionally refunded. Stripe is being made to match the ledger.

### 22.3 Why the rail is still 503

Not superstition, and not the refund defect any more. These are genuinely unbuilt:

1. **Subscription renewals are not funded.** The `invoice.created` handler does not exist yet, so no
   renewal carries a reserve. Subscriptions are 48 of the 55 earnings rows in production, so this is
   the majority of the money.
2. **D3 surplus is representable but not returned.** No platform-to-artist transfer exists.
3. **Stripe dispute lifecycle** (created / won / lost) is unhandled for reserves.
4. **Cap concurrency** still relies on over-collection being the safe direction rather than a lock.
5. **No canary.** Nothing has been proved end to end against real Stripe money movement.

Flipping `cashoutFundingReady` with 1, 2 and 3 open would pay collaborators from a rail whose
majority revenue source funds nothing.

---

## 23. Phase 3 (2026-08-13): subscriptions funded. Three blockers left.

**Every payment rail CRWN has now funds the collaborator reserve.** Cashout is still 503; section
23.4 is the honest list of why.

### 23.1 The Stripe premise, re-verified and stronger than assumed

From the invoice lifecycle documentation:

> "Invoices are initially created with `status=draft`, and you can only edit them while they're in
> this state."
>
> "We wait 1 hour after receiving a successful response to the `invoice.created` event from all
> listening webhooks before attempting payment. If we don't receive a successful response within 72
> hours, we attempt to finalize and send the invoice."
>
> "During that time, we won't attempt to charge the customer unless we receive a successful
> response."

So the draft window is not a race to be won: Stripe holds the charge for a full hour AFTER a
successful response. And immutability at finalization is what makes D1 enforceable by Stripe rather
than by CRWN's bookkeeping, since a finalized invoice can never be back-filled into liability.

### 23.2 One path funds every invoice class

`src/lib/teamSplits/invoiceFunding.ts` keys on the INVOICE, not on `billing_reason`. The initial
subscription charge, an ordinary renewal, a proration, a coupon'd invoice and a retried invoice are
all just invoices with a draft phase, so none is a special case and a billing reason Stripe invents
later is funded automatically instead of silently skipped.

Order is preserved: platform fee, then referral/clipper, then the collaborator share from what
remains. A split can never consume a referrer's commission. The fee is bounded by the invoice total
and asserted to be so before the update.

Failure funds NOTHING, always. No reserve means the accrual guard yields zero, so the collaborator
is owed nothing rather than owed money nobody withheld. The handler never throws, so a split
calculation can never stop a fan being charged.

### 23.3 Settlement proof on BOTH subscription writers

The initial charge and every renewal are funded by the same `invoice.created` path, so the proof
lives on the INVOICE. The renewal writer reads `invoice.metadata`; the initial writer fetches the
session's invoice and reads its metadata. A proof on only one of them would strand the other's
collaborators, which is now a mutation-tested invariant rather than a comment.

### 23.4 Why the rail is STILL 503

Three genuine gaps, and one of them needs the founder:

1. **Cap concurrency is still safe-direction, not locked.** Two simultaneous charges near a cap can
   both reserve the same headroom. The result is over-collection, which becomes D3 surplus owed
   back to the artist, so nobody is underpaid. Closing it properly needs a reservation ledger under
   a lock, which is a NEW MIGRATION and therefore a founder action.
2. **D3 surplus is representable but still not returned.** The platform-to-artist transfer does not
   exist, so over-collected reserve currently has no way home. This is what makes (1) more than
   cosmetic.
3. **Stripe dispute lifecycle** (created / won / lost) does not yet reconcile reserves.

**No canary has been run.** Nothing has been proved against real Stripe money movement, and by the
rules of this work that alone keeps the gate shut.

---

## 24. CORRECTION (2026-08-13): the initial subscription invoice has no draft window

Section 23 claimed one `invoice.created` path funded every subscription invoice class. **That was
wrong for the FIRST invoice**, and the error was mine. Stripe is explicit:

> "For subscriptions with `collection_method` set to `charge_automatically`, Stripe creates an
> invoice with the status **`open`** when you create the subscription."
>
> "For Stripe Checkout integrations, **you can't update the subscription or its invoice** if the
> session's subscription is `incomplete`."

CRWN creates subscriptions through Checkout in `mode: 'subscription'`, so the first invoice is
never a draft and can never be updated. The one-hour automatic-advancement delay applies to
**subscription-cycle** invoices, not to the first one.

### What actually happened, and why nobody was harmed

The handler checks `status !== 'draft'` and returns `not_draft`, so it funded NOTHING on first
charges. Because the accrual guard refuses to accrue without a recorded reserve, the failure
direction held: **no collaborator was ever credited money that was not withheld.** The defect was
that first-charge collaborators would silently never be paid, and that the previous report claimed
otherwise.

### The fix: two paths, because Stripe gives two shapes

| Invoice | Funded where | Mechanism |
|---|---|---|
| **First subscription charge** | `api/stripe/checkout` | `subscription_data.application_fee_percent`, the only lever that exists at creation |
| Renewal, proration, coupon'd, retry | `invoice.created` | exact `application_fee_amount` while draft |

The percent carries two decimals, so the first charge can differ from the intended reserve by at
most a rounding step. The accrual guard clamps the accrual to what was ACTUALLY withheld, so a
collaborator can never be credited more than the money that exists. When no split qualifies, the
percent falls back to `effectiveFeePercent` unchanged, so a subscription without a Team Split is
byte-for-byte the economics it had before this existed (pinned by the F-01 suite).

The proof for the first charge therefore lives on the SESSION, not the invoice.

**Lesson worth keeping: "one handler covers every case" is a claim about Stripe's behaviour, and it
needed Stripe's documentation to verify, not the shape of our own code.**

### Still open (unchanged from 23.4, minus the correction above)

1. Cap concurrency: still safe-direction, not locked. Needs a reservation ledger under a lock,
   which is a NEW MIGRATION and therefore a founder action.
2. D3 artist-return transfer: unbuilt.
3. Stripe dispute reconciliation: unbuilt.
4. No canary has been run.

Cashout stays 503.

---

## 25. Phase 4 (2026-08-13): the final controls. Code complete, one migration pending.

Everything Team Splits needs is now built. The only thing between here and an open payout rail is a
migration the founder runs, and a canary that proves the money moves correctly.

### 25.1 First-charge precision (TS-MONEY-014, TS-MONEY-015)

Stripe caps `application_fee_percent` at TWO DECIMALS, and the first subscription invoice can only
be funded through that percentage (section 24). An exact cent target usually cannot be expressed.

Nearest-rounding would have been subsidy-safe but **contract-unsafe**: it can retain fewer cents
than the collaborator's accepted split, and the accrual guard would then clamp the collaborator DOWN
to the short amount. A collaborator would have quietly received less than the deal they signed,
because of a rounding artefact in an API they have never heard of.

`firstChargeFeePlan` rounds the percentage **UP**, always. The first charge may retain a cent or two
more than required, never fewer. The overage is **artist-owned surplus**, recorded as
`team_split_rounding_surplus` and returned through D3. If even 100% cannot cover the target, the
charge funds NO split rather than underfunding one.

### 25.2 Atomic cross-rail cap reservations (TS-MONEY-012, TS-MONEY-013)

The race was invisible in any table: money is WITHHELD at charge time but only ACCRUES after
settlement, so between those two moments the cap was being consumed by something with no row.
`team_split_cap_reservations` gives that interval a row.

| State | Meaning | Cashout value |
|---|---|---|
| `provisional` | the payment intends to retain these cents | **zero** |
| `funded` | Stripe settled it; settlement proof exists | may accrue |
| `released` | terminal non-payment; headroom returns | zero |
| `returned` | funded cents went home to the artist (D3) | zero |

`grant_team_split_reservation` locks the DEAL row and counts accruals **and** live reservations, so
a track purchase and a subscription invoice contend on the same row rather than on two independent
reads. Deals are locked in sorted id order, so two charges touching the same pair cannot deadlock.
The grant is idempotent on the money identity, so a retried invoice or a redelivered webhook reuses
its own reservation instead of taking the cap twice.

Release is **provisional-only**. Funded money is never given back as headroom: real money moved, so
its disposition is a D3 return or a clawback.

### 25.3 D3 artist surplus return (TS-MONEY-016)

Two things that look alike and are not:

- **Reservation release**: the payment never settled. No money moved. Give back cap HEADROOM.
- **Surplus return**: the payment settled, CRWN physically holds artist-owned cents, and they are now
  definitively unowed. This is a real platform-to-artist TRANSFER.

Only the second is D3. The transfer carries a deterministic idempotency key derived from the
reservation, and the RPC refuses a reservation that already carries a transfer id, so a crash
between Stripe and the ledger cannot pay the artist twice. Frozen (disputed) and unfunded
reservations are refused outright.

### 25.4 Stripe disputes (TS-MONEY-017, TS-MONEY-018)

Stripe debits the PLATFORM for a destination-charge dispute, does not automatically pull the
artist's proceeds back, and the collaborator reserve is already sitting in CRWN's balance. That
produces **two different recoveries**, and treating them the same would double count:

- the ARTIST's transferred proceeds may need a transfer reversal
- the COLLABORATOR reserve is already platform-held, so it is FROZEN in the ledger and no Stripe
  call is made for it. Reversing it too would be fabricating a recovery.

Won disputes unfreeze. The artist's transfer is deliberately NOT re-sent automatically: Stripe warns
that re-transferring a previous reversal can hit cross-border restrictions, so a failed restoration
surfaces as reconciliation work rather than a fabricated artist payment.

A Stripe chargeback and a Team Split BUSINESS dispute are different things and never share a path.

### 25.5 The canary, prepared but NOT run

Run in Stripe TEST MODE with dedicated canary identities, after the migration is applied. Each step
must inspect actual Stripe objects and integer cents, not just success.

1. **Initial subscription** — prove the granted reservation, the ceiling percentage, the ACTUAL
   application fee withheld, the funded cents, the rounding surplus, the artist proceeds, and CRWN's
   fee. This one is mandatory and cannot be inferred from a renewal.
2. **Renewal** — draft invoice, atomic grant, exact `application_fee_amount`, settlement proof, and
   no duplicate on webhook redelivery.
3. **One-time purchase** — same chain on a track or product.
4. **Cap concurrency** — cap 1000, two parallel 800 grants across different rails, aggregate <= 1000.
5. **Partial refund** — artist transfer recovery, immediate clawback, no double reversal.
6. **Dispute** — freeze, artist recovery, no collaborator availability, idempotent resolution.
7. **D3 surplus** — exact artist transfer, CRWN revenue unchanged, retry sends nothing.
8. **Collaborator cashout** — funded released balance only, idempotent retry, balance falls once.

Only after all eight may `cashoutFundingReady` be flipped.

### 25.6 What is left

**One migration, and the canary.** Nothing else is outstanding in the application code.
