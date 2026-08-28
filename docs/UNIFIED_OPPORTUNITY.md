# The Unified CRWN Opportunity Calculator

One calculator for the whole direct-to-fan business, in which the same fan, the same subscriber and
the same dollar can only be counted once.

- **Public route:** `/tools/opportunity-calculator`
- **Model:** `src/lib/opportunity/unifiedModel.ts` (pure, versioned `unifiedOpportunity@1`)
- **Presentation:** `src/lib/opportunity/unifiedAdapter.ts`
- **Re-derivation on edit:** `src/lib/opportunity/recalcUnified.ts`
- **Tests:** `src/lib/opportunity/unifiedModel.test.ts` (40 invariants), `unifiedFunnel.test.ts` (42)
- **No migration. No feature flag.** It is an 18th entry in the existing lead-magnet registry, so it
  inherits the tool page, wizard, lead capture, tokenized result, email, prospect nurture, draft
  claiming and the post-signup journey resolver with no new infrastructure.

---

## 1. Why it exists: the additive fantasy

Each existing calculator is honest on its own terms and dishonest in company, because they are all
modeled off the same audience. Their own published formulas, at 500,000 followers:

| Tool | Its own model | Monthly |
|---|---|---|
| Streaming Loss (`worth`) | 2,250 payers on a $10/$25/$100 ladder | $48,645 net |
| Vault | 7,500 payers at $10 | $75,000 |
| Share-to-Earn | 6,000 referred subs at $10 | $60,000 |
| Clip-to-Earn | 2,500 subs at $10 | $25,000 |
| Executive Producer | 1,500 seats at $200 | $300,000 |
| Own Your Fans | 3,000 payers at $10 | $30,000 |
| Live Experience | 750 tickets plus tips | $12,190 |
| **Naive sum** | **23,500 paying people** | **$550,835** |

That total claims 23,500 payers out of 500,000 followers, while the repo's own audience model says
2,250 of them ever pay for anything. The vault tier alone claims more payers than the entire membership
model. An artist who plans against that number plans a business that does not exist.

The unified model produces roughly **$127,000/mo net** for the same artist with every opportunity
switched on, and a test asserts it stays below half the naive sum.

---

## 2. Opportunity classification

| Opportunity | Classification | Produces revenue? |
|---|---|---|
| Membership ladder | core recurring offer | **yes**, and it is the only recurring line |
| Gold (the vault) | **membership tier** (default) or a standalone offer if explicitly configured | no revenue of its own when it is a tier |
| Member one-off spend | add-on, inside the core | yes, as ARPU on members |
| Share-to-Earn | acquisition channel, referral mechanism, fan role | **no**. It moves the supporter count |
| Clip-to-Earn | acquisition channel, engagement mechanism, fan role | **no**. It lifts conversion on the same pool |
| Live events | ticketed event, one-time purchase | yes, from non-members only |
| Live tips | engagement, one-time | yes, from non-member attendees only |
| Executive Producer Sessions | membership benefit, ticketed event, or both | depends entirely on the structure chosen |
| Proof of Demand | validation mechanism | **no, by design**, and it is excluded from the total |
| Fan missions / squads | retention + engagement | no. Their effect is already inside acquisition |
| Royalty readiness | already-earned money elsewhere | no. Different money entirely; different tool |
| Sponsorship, replay sales | not built in CRWN | no. Deliberately absent from the math and the copy |

---

## 3. The layered model

```
Layer 1  ONE normalized audience
         primaryReach   = max(followers, listeners, ownedContacts)     <- never a sum
         ownedContacts  = min(owned, primaryReach)                     <- a subset, not an addition
         addressable    = owned + (primaryReach - owned) * reachRate   <- inclusion-exclusion

Layer 2  Fan segments (roles overlap, people do not)
         payingSupporters = addressable * min(superfanRate * (1 + clipLift), maxConversion)
                          + referredReach * referredConversion
         sharers, clippers, dualPromoters = min(sharers, clippers) * dualRate
         uniquePromoters  = sharers + clippers - dualPromoters
         nonMemberAddressable = addressable - membersDrawnFromAddressable

Layer 3  ONE membership ladder, applied ONCE to payingSupporters
         Silver $10 (70%) | Gold $25 (22%) | Platinum $100 (8%)

Layer 4  Benefits inside those tiers. The vault IS tier 2 (Gold), so it earns nothing separately.

Layer 5  Incremental purchases, sold ONLY out of nonMemberAddressable
         live tickets, tips from those ticket holders, session seats

Layer 6  Acquisition attribution: a SPLIT of layer 3 revenue, never an addition to it
         organic + clipAttributed + shareAttributed == payingSupporters
```

**The disjoint-population rule** is what makes the total provable: every modeled dollar is paid
either by a **member** (ladder plus member ARPU) or by a **non-member** (ticket, tip, seat). No
person is in both sets, so no person can pay twice.

### Where each rate comes from

| Rate | Value (expected) | Source |
|---|---|---|
| `reachRate` | 0.15 | `leadCalculator.ts` conservative preset |
| `superfanRate` | 0.03 | `leadCalculator.ts` conservative preset |
| `maxConversion` | 0.10 | new ceiling, so no stack of lifts can run away |
| tier prices / shares | $10/$25/$100, 70/22/8 | `RECOMMENDED_TIER_PRICES` + `tierTemplate.ts` |
| `memberAlacarteCents` | 300 | `leadCalculator.ts` `alacarteArpuCents` |
| `shareRate` / `reachPerSharer` | 0.03 / 20 | Share-to-Earn adapter |
| `referredConversion` | 0.02 | Share-to-Earn adapter |
| `clipRate` | 0.02 | Clip-to-Earn adapter |
| `clipConversionLift` | 0.25 | **new.** Documented conservative default |
| `promoterDualRate` | 0.5 | **new.** Documented default, overridden by the artist's answer |
| ticket $15, tip $5, tipRate 0.25, ticketRate 0.01 | | Live Experience adapter |
| `seatRate` 0.003, seat price bands | | Executive Producer adapter |
| `platformFeePercent` | 8 | sourced from `TIER_LIMITS.pro.platformFeePercent` (the Pro plan rate in `platformTier.ts`) |

The two new rates are the only numbers not lifted from existing repo models. Both are conservative
and both are stated in the artist-facing assumptions block.

**"Lifted from an existing repo model" is REUSE, not evidence.** A 2026-08-14 credibility audit
established that **no assumption in this model is externally validated**; every rate traces either
to `leadCalculator.ts` (which declares them as first-principles judgements) or to one of the
single-opportunity adapters this model exists to correct. The correct phrase is **"not yet
externally validated"**, and it stays that way until first-cohort evidence exists. Do not describe
any of these rates as a benchmark (`POSITIONING.md` section 23 forbids the claim class).

### Two vocabularies reach one model, and BOTH must be read

`toolAdapters.ts` is the single execution path for this tool (`usesLossEngine` is true, so
`PublicToolClient` and `ArtistToolClient` both route through it rather than calling the model).
Two callers arrive speaking different vocabularies:

| Caller | Owned contacts | Unreleased count |
|---|---|---|
| DM / ManyChat (`lead_profiles` columns) | `email_list_size` | `catalog_size` |
| Wizard / homepage (registry input keys) | `owned_contacts` | `unreleased_count` |

The adapter read only the DM names and **overwrote the wizard's answers with zero**, so from any
browser: the owned-audience screen did nothing, `unreleasedCount` was always 0, the vault was never
eligible, the **Gold $25 rung never existed**, and the assumptions block promised a $25 Gold tier
the ladder beside it did not contain. Understated the headline by roughly 30% on the funnel's own
test answers. Fixed 2026-08-14: **read the wizard key first, fall back to the DM column.** Absent,
null and empty mean "not answered"; a real 0 is an answer. Tests in `unifiedFunnel.test.ts`
(`the real browser path carries every answer into the model`) run the ADAPTER on wizard-shaped
values, which is the only place this class of defect is visible: every other test in the suite
calls `buildUnifiedResult` directly and passed throughout.

### The overlap answer

`promoterOverlap` is asked **only** when the artist has both sharers and clippers, and maps to a
dual rate: `mostly_same` 0.8, `some_overlap` 0.5, `mostly_different` 0.2, `unknown` 0.5. There is no
repository-backed overlap rule, so the model asks, and falls back to a documented default.

---

## 4. Financial normalization

- **Recurring** (`recurringGrossCents`) and **one-time** (`oneTimeGrossCents`) are tracked
  separately and only added at the gross line. Both are already monthly-normalized.
- Gross is never mixed with net. `net = gross - platformFee - contributorCommission`.
- Platform fee is applied **once**, to total gross, at the Pro plan rate read from `TIER_LIMITS.pro.platformFeePercent` in `platformTier.ts` (still 8).
- Contributor commission is artist-funded on the **attributed slice only**, capped at
  `gross - platformFee`, matching how `checkout/route.ts` charges an `attributedCut`.
- `currentDirectRevenueCents` is **subtracted**, never added. The headline is what the artist would
  ADD, floored at zero.
- **The headline sentence names all three deductions.** `netNewMonthlyCents` is gross minus the
  CRWN fee, minus artist-funded commissions, minus existing direct revenue, so it is not
  "direct-to-fan revenue". It reads: *"You could build an estimated $X to $Y a month on top of what
  you already earn direct, after CRWN's fee and any commissions you pay."* The verb stays *could
  build* (the ratified language rule in `07-BUSINESS-RULES.md`); what changed is that the
  qualifiers are now present.
- **The summary states the recurring share** beside the number, because the hero says `/mo` and
  between 7% and 48% of it is one-off event and seat money depending on the answers. An artist with
  no event revenue is told that plainly instead of being read a split of nothing.
- The headline is a **range** (conservative to high) run off one set of inputs, so the three
  scenarios stay internally consistent across every layer.
- Annualization is `x12` and nothing longer.

---

## 5. The wizard

Five screens plus review, nine questions, no branches (since 2026-08-28).

**The unified calculator never asks about Share-to-Earn, Clip-to-Earn, live nights or producer
sessions** (founder decision, 2026-08-28). Those questions belong only to the calculators that sell
those features (`share-to-earn-planner`, `clip-to-earn-campaign-planner`,
`live-experience-calculator`, and `executive-producer-session` for its own subject). Every other
calculator models the membership. The adapter (`toUnifiedInputs`) pins `fansPromote: 'unlikely'`,
`videoOutput: 'none'`, `liveWilling: 'no'`, `sessionStructure: 'none'` and does NOT read a stored
answer for them, so a result saved before that date renders the same membership-only page.
`DEFAULT_INPUTS` in the model is off for the same keys. `conversionContract.test.ts` scans every
non-feature calculator's questions for that vocabulary, so a re-added question fails `npm test`.

Only the audience question is required; an artist can reach a real result from one number.

The `proof` step also asks the 40% qualification question, `monetization_status` ("Have you sold
directly to fans before?", one tap), added 2026-07-30. Every loss tool already asked it
(docs/ICP.md); the unified tool was the one place that skipped it, which blinded lead scoring's
biggest dimension for the primary funnel candidate. It feeds ONLY qualification (the hand-raiser
below and lead scoring), never the money model.

### Entry context

A campaign link carries `?from=<tool-slug>` and the wizard leads with that opportunity's questions.
Declared contexts: `vault-revenue-planner`, `share-to-earn-planner`,
`clip-to-earn-campaign-planner`, `worth`, `own-your-fans-calculator`,
`executive-producer-session`, `live-experience-calculator`.

This **reorders only**. Adding or removing questions per entry point would mean different entries
produce different models off different inputs, which defeats the point of having one model. An
unknown `?from=` degrades silently to the normal order.

---

## 6. The generated system

The result CTA drops the artist into `DeliverableBuilder` with a `system` preview: the four-tier
ladder (with the Vault placed inside it) and the launch order, as one business. Everything is
prefilled from `RECOMMENDED_LADDER` and the model's own payload. No required field starts blank.

**The builder does not build Share-to-Earn, Clip-to-Earn, a premium session or a live night**
(founder decision, 2026-08-28; the `share`, `clip`, `sessions` and `live` steps were deleted).
The calculator never asked about them, so offering to build them would be building a thing the
artist never chose. Those features are built from their own calculators.

The artist can move the Vault out of the ladder or sell it on its own. When that changes the money,
`recalcUnified` re-runs the model on the edited choice and the builder shows the new range with a
line saying what moved. A builder that kept showing the original headline after the artist removed
part of the plan would be dishonest in the same way double-counting is, just pointed at a stale
number instead of an inflated one.

### Launch sequence

Phase 1 is always the membership (nothing else can launch before fans have somewhere to pay), then
Proof of Demand. The share, clip and premium-experience phases still exist in the model but are
never eligible from this calculator, so they are omitted entirely, not greyed out.

---

## 7. Signup and restoration

Save is the signup boundary. The signup screen shows the combined range, the claim line, the items
already built, a one-line overlap disclosure (`spec.overlapNote`) and the estimate disclaimer, kept
compact so the form stays above the fold.

After authentication the existing auto-claim binds the draft (verified-email match plus the signup
`user_metadata` token), and `buildDraftConfig` routes the artist into `/offers/new` prefilled with
their entry tier, with the full reviewed ladder as the suggestion. That is phase 1 of their own
launch order. It deliberately does **not** fan out into four parallel prefilled builders, which
would be the same additive mistake applied to the artist's attention instead of their money.

**No referral link is ever fabricated before an account exists.** A test asserts the conversion
payload contains no referral code or link.

### The qualified immediate-call hand-raiser (2026-07-30)

Below the builder (never before it), the artist can tap "Get a call now", enter a callback
number, and explicitly consent to a call and text about launching their plan
(`CALL_CONSENT_VERSION` in `src/lib/acquisition/callRequest.ts`). The server
(`POST /api/lead-magnets/call-request`) then:

- sanitizes the calculator answers against the tool's own input definitions and **recomputes
  qualification through the canonical `scoreLead`** (never a client band);
- claims idempotency on `acquisition_events` (one request per phone per day, insert-as-claim);
- for a `sales_priority` lead only, sends ONE SMS to the server-only `FOUNDER_ALERT_PHONE` via
  the existing Twilio helper, falling back to email to the founder when SMS is unconfigured or
  fails;
- persists the whole CRM record (consent, qualification, calculator answers, alert status,
  manual contact status) in the claim row's `response_snapshot`, surfaced in `/admin` →
  Acquisition → Calls with a manual status dropdown.

The response is uniform (`{ ok: true }`) whether or not the lead qualified, so the endpoint
cannot be used to probe the scoring model. Unqualified requests are recorded, never alerted.
Tests: `src/lib/acquisition/callRequest.test.ts`.

---

## 8. Analytics

Rides the existing `lead_magnet_events` sink. Three events were added to the shared funnel
vocabulary: `opportunity_overlap_explained`, `opportunity_recommendation_edited`,
`opportunity_estimate_recalculated`, and two more on 2026-07-30 for the hand-raiser:
`opportunity_call_option_viewed`, `opportunity_call_requested`. One dimension was added:
`entryContext` (resolved against the tool's declared contexts first, so raw URL text can never
reach the sink). The canonical `funnel_events` taxonomy also grew five journey stages the same
day: `call_requested`, `stripe_connected`, `fans_imported`, `fan_invited`,
`first_paid_conversion`, connecting the anonymous calculator run to the artist's first real
dollar.

The server allowlist in `/api/lead-magnets/analytics` is now **derived** from
`ALL_OPPORTUNITY_EVENT_NAMES` instead of hand-copied. The two lists were duplicated by hand, so
adding a client event previously left the server silently dropping it: a 200 with the row never
written.

`resultVersion` is pinned to `unifiedOpportunity@1` in the funnel overlay. Letting it default would
have stamped it `lossResult@1` and pooled its results with sixteen other tools, the same
mislabelling the royalty overlay exists to prevent.

---

## 9. What is deliberately not claimed

- Proof of Demand, retention, fan missions, royalties and sponsorship are listed in
  "worth doing, but not in the number", with the reason each is excluded.
- No replay sales and no sponsorship anywhere in the math or the copy: neither exists in CRWN.
- The vault (Gold) is not recommended below five unreleased pieces.
- Nothing assumes a live event for an artist who said live is not for them.
- No ten-year projection. Monthly and annual only.

---

## 10. Known limitations

- **Cross-platform audience overlap is unknown and stated as unknown.** The model takes the larger
  platform figure as one base rather than presenting a falsely precise deduplicated audience.
- **Promoter overlap has no repository-backed rule.** The artist is asked; the default is documented.
- **The clip conversion lift (0.25) is a judgement call**, not a measured figure. It is the one
  number in the model that would most benefit from real CRWN data.
- **Churn is not modeled.** Retention is named in the not-in-the-total list for that reason.
- **No assumption here is externally validated.** See "Where each rate comes from" above. Say "not
  yet externally validated", never "benchmark".
- **Fulfillment capacity is not modeled, and the assumptions block now says so.** `seatRate` sells
  seats out of the non-member pool with no ceiling (about 445 seats a month at $300 for a
  1M-follower artist on a ticketed session, roughly 40% of gross), and the model never states how
  many sessions that is. `timeCapacity` reorders recommendations only and can never reduce the
  money. The artist is told the cadence and the room size are theirs to set.
- **`liveWilling: 'maybe'` is modeled identically to `'yes'`**, that is, one live event every
  month. The monthly cadence is now stated in the assumptions block.
- **The scenario band is a one-factor sensitivity sweep, not a confidence interval.** `reachRate`,
  `superfanRate` and `referredConversion` move together as a single latent "how well your fans
  convert" factor, so `high` is the joint case where all three sit at their ceiling. Note also that
  `expected` (0.15 / 0.03) is `leadCalculator`'s **conservative** preset, and `high` (0.20 / 0.05)
  pairs `punchy`'s reach with `aggressive`'s superfan rate, a pairing no preset makes. Recalibrating
  or relabelling any of that is a **founder decision deferred until first-cohort evidence exists**
  and was explicitly out of scope for the 2026-08-14 fix pass.
- **`maxConversion` (0.10) can never bind** at the current knobs (max is 0.05 x 1.25 = 0.0625). The
  copy now describes it as a guard rather than a limit the artist would reach.
- **`currentPayingSupporters` does not move the money.** Only the dollar input is subtracted; the
  supporter count feeds `netNewSupporters` for display.
- **The DM path collects one number**, so a DM-run result is membership-only and conservative. The
  result page is where the artist corrects it.
