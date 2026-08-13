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
