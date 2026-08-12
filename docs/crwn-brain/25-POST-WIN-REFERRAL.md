# 25 — Post-Win Referral System

> **STATUS: ARCHITECTURE ONLY. NOT SHIPPED. NO CODE EXISTS.**
> Investigated 2026-08-11. Implementation is blocked on two founder decisions (section 12), not on
> engineering. Nothing in this document describes live behavior. Do not cite it as shipped.

## 1. Purpose

When an artist experiences a **verified** CRWN win, use that high-trust moment to make it
frictionless for them to refer another qualified artist.

This is **not** an affiliate programme, a cash referral programme, a leaderboard, a multi-level
scheme, a Virality Engine campaign, or a new acquisition funnel. It is one ask, at one moment,
carrying one link.

## 2. Actor model — five referral systems already exist and none is artist → artist

| System | Referrer | Referred | Attribution carrier | Incentive | Financial rail | Live? |
|---|---|---|---|---|---|---|
| Fan referral | fan | paying fan | `referrals` + cookie | artist-funded commission | `referral_earnings` → fan cashout | yes (0 rows) |
| Clipper | clipper fan | paying fan | `referrals` (`source` discriminator) | rate schedule | same as above | yes |
| Recruiter / partner | recruiter | **artist** | `recruiters.referral_code` → `artist_profiles.recruited_by` | **$50 flat fee + recurring** | `artist_referrals` → `recruiter_payouts` | yes (0 referrals, 5 recruiters) |
| Admin invite | admin | artist | `invite_codes` | none | none | yes |
| Fan Drive (Z11) | artist | paying fan | derived, no new dimension | non-cash badge | none by DB CHECK | yes |
| **Post-Win Referral** | **artist** | **artist** | **does not exist** | **undecided** | **must not exist in V1** | **no** |

**The recruiter row is the trap.** It is the only existing artist-acquisition rail, and reusing it
means inheriting `flat_fee_amount: 5000` — a real $50 obligation written from a Stripe webhook
(`webhookHandlers.ts`). An artist→artist referral must not enter that table in V1.

## 3. The chosen win: `first_paid_conversion`

`src/lib/analytics/paidConversion.ts` is the ONE definition of an artist's first paid fan, and it
is genuinely canonical:

- covers **all six paid rails** (subscription, product, track, booking, live ticket, live tip),
- **deduped per artist** (the first event is the only one that ever lands),
- already carries attribution dimensions,
- emitted from 5+ call sites in `webhookHandlers.ts`,
- is a declared `FUNNEL_STAGES` member.

**Why this win and not another.** Setup completion, Stripe connection and track upload are
*prerequisites*, not realized value: they are CRWN chores, and asking for a referral after a chore
trades on no trust. First paid fan is economically real, observable, memorable and idempotent.

**The honest caveat, and it is not small.** CRWN's ICP is the Independent Empire Builder, who may
already have paying fans elsewhere. "First paid member **on CRWN**" is a proof that CRWN works, not
the first money of their life. The ask must be framed as the former.

## 4. Timing and precedence

```
first_paid_conversion recorded (canonical, deduped)
  → celebration
  → referral ask, ONLY when the pop-up governor allows
  → a genuine fan obligation still outranks it
```

Class: **`celebration`** in the existing Communications Governor taxonomy. Founder policy already
covers the behavior and no new class is needed:
- celebrations coexist with fan obligations in multi-item surfaces,
- celebrations never displace a higher-order interruption,
- no cross-channel cap exists in V1.

A first paid member frequently *creates* a fan obligation. The ask must never appear to say "go
recruit another artist" while a promise is due, and must never be permanently suppressed either:
losing the moment is a deferral, not a cancellation.

## 5. Surface, share UX, destination

- **Surface:** one `PopupDef` in the existing registry. No referral dashboard, no navigation item,
  no new table, no new impression store. Frequency, dismissal, the one-per-day cap and the
  single-winner priority sort all come free from the pop-up engine.
- **Share:** copy a link. One control. No social button grid, no form, no affiliate onboarding.
- **Copy:** truthful to the win, no causal claim ("CRWN got you paid"), no guarantee, no
  "artists like you", no dollar figure.
- **Destination:** the current acquisition journey (calculator → personalized result → builder →
  account), **not** signup. A referred artist is still a prospect who needs to see the value.

## 6. Attribution — this is where it stops

The durable attribution layer (`campaignAttribution.ts`) allowlists eight dimensions:
`channel / platform / campaign / creative / variant / angle / keyword / ref`, plus `from`.

**`ref` already means "partner/referrer code"** and flows into `partner_code_used` /
`recruited_by` / `artist_referrals`. Putting an artist code in `ref` is one webhook branch away
from a $50 commission obligation. There is **no `artist_referrer` dimension**, so artist→artist
identity has nowhere canonical to live.

**And the carrier is unproven.** `_attribution` is documented as the durable home on
`lead_magnet_results.input_data`. Production: **0 of 41 rows carry it.** The mechanism exists in
code and has never carried a value, so its survival across signup and auto-claim is asserted, not
demonstrated.

## 7. Collision semantics — undefined for this actor

`mergeAttribution` is first-touch and never replaces a set field, which is canonical **for the
dimensions that exist**. Artist-referrer is not one of them, so its precedence against `ref`, a
paid campaign or an organic video is undefined. Post-Win Referral must be an **additional
dimension**, never an overwrite of an existing acquisition owner.

## 8. Incentive: none, and that is the point

No canonical artist→artist incentive exists. **V1 must invent none.** The reason to refer is trust
immediately after realized value, not money. A non-cash V1 also shrinks the abuse surface to
near-nothing: self-referral, duplicate credit and identity loops matter far less when no money
moves.

## 9. Boundaries

- **Virality Engine (22):** artist → *fan participant* → paying *fan*. Different actors, different
  target, different loop. Reuse infrastructure, never ownership.
- **Affiliate/recruiter:** reusing it imports admin approval, commission setup, a partner role,
  payouts and tax. Too heavy for V1, and it drags economics in through the back door.
- **Z3 / Constraint / Manager:** none involved. This is acquisition mechanics after a product win,
  not a recommendation.
- **Not a network effect.** Zero To One states CRWN's network effects are near zero. This is a
  referral loop.

## 10. Measurement

Success is **not** "link copied". Reuse `funnel_events`, which already declares every stage needed:
`account_created → email_verified → setup_completed → first_paid_conversion`. The metric is
**referred artists who reach first paid**, not shares. Same discipline as the calculators: more
top-of-funnel only counts if qualified downstream outcomes follow.

## 11. Production readiness (2026-08-11, read-only)

| Fact | Value |
|---|---|
| Artists | 9 |
| **Artists with ≥1 active paying member** | **2** |
| `first_paid_conversion` rows | **0** |
| `artist_referrals` / `recruiter_payouts` | 0 / 0 |
| `lead_magnet_results` carrying `_attribution` | **0 of 41** |
| Artist acquisition source | 8 organic, 1 founding |

The trigger population is **two artists**, and the win has never been recorded once.

## 12. Why implementation is blocked

Against the eight-condition gate: conditions 1 (no new financial rule, if non-cash), 4 (no
destructive schema), 5 (win verified), 6 (deterministic eligibility) and 7 (funnel carries
downstream) are **satisfied**. Three are not:

- **(2) Attribution semantics are not unambiguous.** No `artist_referrer` dimension exists; `ref`
  belongs to the partner rail; the documented carrier has never carried a value in production.
- **(3) Collision behavior is not canonical** for this actor.
- **(8) Two founder-sensitive rules remain.**

**FOUNDER DECISION 1 — will an artist ever be paid for referring another artist?**
If the answer might become yes, links issued under a no-reward V1 would later need economics
retrofitted onto already-distributed codes. Answering first is cheaper than migrating attribution
that has already gone out into the world.

**FOUNDER DECISION 2 — do artist referrals ever enter the recruiter rail?**
`artist_referrals` carries a $50 flat fee. Either artist→artist stays permanently separate, or it
becomes a recruiter tier with approval and payouts. That choice determines whether V1 may reuse
the table or must stay analytics-only forever.

## 13. Recommended V1, once unblocked

**Option A: post-win share ask, no reward.** One win (`first_paid_conversion`), one ask (a
`celebration` pop-up), one share (copy link), one attribution path (a new reporting-only
`artist_referrer` dimension, additive, never overwriting), one quality measure (referred artists
reaching first paid). Rejected: commissions (C), CRWN credit (D) — both invent economics; reusing
the affiliate system unchanged (E) — imports approval and payouts; non-cash recognition (B) — a
badge is still a reward semantic and can wait for evidence.

## 14. Deferred

Rewards of any kind, recognition, leaderboards, ambassador tiers, multi-level referral, a referral
dashboard, adaptive trigger selection, and any cross-artist recommendation layer.
