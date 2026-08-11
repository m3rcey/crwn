# 23: CRWN Zero To One Strategy (canonical)

> **Status: STRATEGY ONLY. Nothing here has been implemented.** No production UI, route, schema,
> business logic, recommendation, Manager, Rise Mode, onboarding, calculator, homepage, pricing,
> payment, Virality, email or notification was changed by the tasks that produced this document.
>
> Authored 2026-08-10. **Reconciled and partially ratified 2026-08-10** after founder review.
> This is the canonical strategic reference from which homepage, calculator, onboarding and
> Manager copy should later be derived. It is not itself copy.

**Framework source.** The founder's CRWN Drive contains
`Zero_to_One__Notes_on_Startups_or_How_to_-_Peter_Thiel.pdf`, verified founder-side. Claude Code
cannot read Drive from this environment, so the framework is applied from the founder-supplied
constraints recorded in section 0 rather than from the PDF directly. Every CRWN-specific claim is
cited to a repository file. `CLAUDE_PROMPT_FRAMEWORK.md` still does not exist; the substantive
agent manual is `15-AI-AGENT-INSTRUCTIONS.md`.

Evidence labels: **Verified** (cited to a file), **Derived** (arithmetic from verified inputs),
**Plausible**, **Speculative**, **Founder decision**.

---

**Market expression of this strategy: [`docs/POSITIONING.md`](../POSITIONING.md).** This document
is why CRWN wins; that one is how it is said out loud. Every outward-facing surface inherits from
it, and no surface invents its own positioning.

---

## 0. Ratification status

### RATIFIED by the founder, 2026-08-10

| Decision | Status |
|---|---|
| **Category: Fan Economy Operating System** | Ratified. No further name comparison. Section 6 sharpens the definition instead |
| **Beachhead: the Empire Builder sub-avatar first** (`highest_priority_empire_builder`) | Ratified. Section 4 |
| **"First" means narrow ACQUISITION and POSITIONING, never product eligibility** | Ratified. CRWN continues to serve any qualifying ICP artist |
| **CRWN optimizes for fan economic depth, not audience size alone** | Ratified. Section 2 |
| **Network effects are not a meaningful moat today** | Ratified. Section 11 keeps the skeptical labels |
| **Proprietary recommendation intelligence is a FUTURE moat, gated on evidence** | Ratified. Section 9 |
| **Zero To One must reduce feature sprawl, not justify it** | Ratified. Section 17 |

### NOT YET RATIFIED

| Open | Why |
|---|---|
| The exact canonical sentence for the contrarian truth | Section 2 proposes the corrected wording. Founder sign-off pending |
| Hard product behavior for promise reduction vs tier changes | Deliberately parked. Section 13 |
| Any present-tense network-effect claim | Forbidden until the mechanism exists |

### Founder-supplied framework constraints (section 0 reference)

Zero to One is about creating genuinely new value rather than copying existing winners; a startup
should dominate a small market before expanding; durable monopoly beats undifferentiated
competition; monopoly advantage comes from proprietary technology, network effects, economies of
scale and branding; proprietary technology should be an order-of-magnitude improvement rather than
a marginal feature edge; distribution is fundamental, not an afterthought; a durable company needs
a credible reason it stays valuable far into the future; the secret question asks what important
truth the company sees that others overlook; and entering an existing category is not itself a
Zero To One advantage.

---

## 1. Executive Summary

CRWN's strategy rests on a distribution that CRWN already computes and has never said out loud.

`src/lib/opportunity/unifiedModel.ts` (`unifiedOpportunity@1`, 82 invariant tests) models a
500,000-follower artist. On its `expected` scenario (`reachRate` 0.15, `superfanRate` 0.03,
verified at `unifiedModel.ts:178`), with the ladder split `0.70 / 0.22 / 0.08` (verified at
`unifiedModel.ts:189-191`, matching `TIER_SPLIT` in `leadCalculator.ts:49`):

| | People | Share of followers | Share of payers | Monthly | Share of membership MRR |
|---|---|---|---|---|---|
| Followers | 500,000 | 100% | | | |
| Addressable | 75,000 | 15% | | | |
| **Ever pay anything** | **2,250** | **0.45%** | 100% | **$46,125** | 100% |
| Silver $10 | 1,575 | 0.32% | 70% | $15,750 | 34.1% |
| Gold $25 | 495 | 0.099% | 22% | $12,375 | 26.8% |
| Platinum $100 | 180 | 0.036% | 8% | $18,000 | **39.0%** |

**Derived, and this is the precise claim:**
- **0.45% of followers ever pay anything.**
- **Among payers, the top 8% produce 39% of membership revenue; the top 30% produce 66%.**
- **A Platinum member is worth exactly 10x a Silver member per month.**

The claim survives the pessimistic scenario. Under `conservative` (`reachRate` 0.10,
`superfanRate` 0.02) the same artist has 1,000 payers: 700 Silver at $7,000/mo against 80 Platinum
at $8,000/mo. Fewer people, less money, same shape. **The concentration is a property of the
ladder, not of an optimistic knob.**

`docs/REVENUE_RAMP.md` supplies the operational half, **Verified**: "the whale tier fills last...
headcount runs ahead of money for two quarters and money only catches up when the depth work
lands... an artist who stops at 'I launched tiers' plateaus around half their number."

**Put together: the value among an artist's payers is steeply unequal, the high-value end fills
last, and most artists stop building before it arrives.** That is CRWN's secret.

---

## 2. Contrarian Truth (corrected)

### What was wrong with the previous draft, and why the correction matters

The previous version said income is produced by "a few hundred identifiable people" and that
success is decided "not in how much audience the artist adds." Both were overstatements and both
are withdrawn.

- **The numbers do not support "a few hundred."** The model outputs **2,250** payers, not a few
  hundred. What it supports is a claim about *distribution among payers*, not about the payer count.
- **Dismissing audience growth is indefensible.** Audience growth creates real economic value:
  `addressable = ownedContacts + (primaryReach - ownedContacts) * reachRate`
  (`unifiedModel.ts:394`) means every model output scales with reach. An artist who doubles reach
  doubles addressable. Saying reach does not matter would be false, and it would insult an ICP that
  built its audience deliberately.

**The real disagreement is about weighting and measurement, not about whether reach counts.**

### The corrected canonical statement (proposed, awaiting sign-off)

> **An artist's most valuable business asset is not the size of their audience but the economic
> depth of the identifiable minority within it who pay, keep paying, participate and bring others.**

### The strategic contrast, in one line

> **The traditional music-growth stack optimizes for reach, because reach is what it can see.
> CRWN optimizes for fan economic value, because CRWN can measure it.**

### Supporting sub-beliefs (not competing truths)

1. **Value among payers is steeply unequal.** Top 8% of payers produce 39% of membership revenue;
   a Platinum member is worth 10x a Silver member per month. **Derived** from verified inputs.
2. **The high-value end fills last**, so the artist's felt experience for two quarters is "this is
   not working" precisely when it is working. **Verified**, `REVENUE_RAMP.md`.
3. **Evidence of past direct sales predicts success better than audience size.** `docs/ICP.md`
   weights direct monetization history **40%** against audience size **25%**, implemented in
   `leadScoring.ts` (`SCORE_VERSION` 2.0.0). **Verified.** This is the sharpest existing statement
   of the overvaluation thesis, and CRWN already acts on it.
4. **Summing opportunities is the industry's standard error, and CRWN refuses.** Seven CRWN
   calculators, honest alone, sum to 23,500 payers and $550,835/mo for an artist the unified model
   says has 2,250 payers. **Verified**, `UNIFIED_OPPORTUNITY.md` section 1.
5. **A kept promise is a renewed subscription, so obligations are data.** CRWN models what an
   artist owes fans as dated, deduplicated, inheritable rows with completion rates and lateness.
   **Verified.** No adjacent product does this.
6. **Fixing a leak beats winning a customer.** The Constraint Engine evaluates fulfillment and
   retention *before* acquisition, and says why: "Sending them to recruit more fans into a system
   that is failing the fans already inside it makes the leak bigger." **Verified**, `engine.ts`.

### Industry consensus vs CRWN belief

| | Industry consensus | CRWN belief |
|---|---|---|
| What the asset is | The audience. Bigger is better | The identifiable minority who pay, stay and advocate. Reach is an input to that, not a substitute for it |
| What is measured | Followers, streams, views, list size | Per-fan economic value over time |
| What a platform sells | Tools. Here is a page, a store, a list, go be creative | A decision. Here is the one thing to do next, with the evidence |
| How revenue grows | Add reach, add another product, another funnel | Deepen the rungs that convert, and keep the promises attached to them |
| Time horizon sold | Launch week | Twelve months, with the money weighted to the back half |
| What a fan is | An audience member to be reached | A participant in an ongoing, identifiable value exchange |

### Why it matters economically

An artist who believes the consensus optimizes the wrong variable for a year: chases followers,
launches a flat $5 tier because it feels approachable, never builds depth, watches headcount rise
while money does not, concludes direct-to-fan does not work. CRWN's model says the top of their
ladder, which they never built, was 39% of the revenue.

### Product consequence

- **Default to a laddered offer, never a flat one.** Already true (`RECOMMENDED_LADDER`
  $0/$10/$25/$100, pinned by `tierTemplate.test.ts`).
- **Diagnose depth as a first-class constraint.** Already true (`DEPTH` stage).
- **Rank leaks above growth.** Already true (evaluation order).
- **Hold the artist through the trough.** Already true (Revenue Ramp).
- **Treat promises as first-class**, because depth is sold on promises.
- **Measure per-fan economic value, not activity.** Partly true. Section 3 is the honest split.

---

## 3. Fan Economic Value: what CRWN can and cannot measure

**Fan economic value is not subscription revenue.** It is the total measurable value a fan
contributes over their relationship with the artist. CRWN must not claim measurement it lacks.

### Measurable today (Verified, with the source)

| Dimension | Source |
|---|---|
| Direct purchases (lifetime, per fan) | `earnings` grouped by `fan_id`, refund-netted |
| Recurring membership value | `subscriptions` joined to `subscription_tiers.price` |
| Retention / churn | `computeChurn`, plus a platform benchmark |
| Referrals and attributable acquisition | `referrals`, `referral_earnings`, `referral_clicks` |
| Participation | `mission_participants`, `clip_bounty_submissions`, squad membership, `fan_events` |
| Advocacy through clipping | `clip_bounty_submissions` with attributed subs, revenue, clicks |
| Tier consideration | `tier_events` (views, checkout starts) |
| Fulfillment relationship (artist side) | `fulfillment_events`, per-tier benefit health |
| Cancellation reasons | `cancellation_reasons`, `survey_responses` |

### NOT measurable today (Verified gaps, do not claim)

| Dimension | Why not |
|---|---|
| **Upgrade / downgrade behavior** | **Hard gap.** `subscriptions` is UNIQUE `(fan_id, artist_id)` and an upgrade overwrites `tier_id` in place, so **no transition history exists**. `07-BUSINESS-RULES.md:209-210` records that a test asserts no diagnosis may mention upgrade or downgrade. Nothing in the codebase reads a tier transition. This is notable because "deepening" is central to the truth and CRWN currently cannot observe the single clearest instance of it |
| **Predictive lifetime value** | Unavailable **by policy**. `21-MONEY-MODEL-MEASUREMENT.md`: lifetime figures are historical sums only |
| **Retention cohorted by acquisition source** | `computeChurn` exists but is not cohorted, so a fan acquired by a campaign cannot be compared to an organic one |
| **Advocacy beyond referral links and clips** | No representation for a fan who brings people without a link |
| **Fulfillment quality as experienced by the fan** | Deliberately not measured (`FEEDBACK_LOOPS.md` section 10: gameable, demoralizing, makes CRWN the judge of the artist's work). Retention is the quality proxy |

**Strategic consequence: the single most valuable missing measurement for the corrected truth is
tier transition history.** Without it, CRWN can state that depth is where the money is but cannot
observe an individual fan deepening. That is a candidate for the instrumentation roadmap, not a
present capability.

---

## 4. Fan Economy Definition (corrected canonical)

> **A fan economy is the identifiable network of people around an artist who exchange attention,
> money, participation, advocacy, access and status with that artist over time, together with the
> offers, relationships and obligations that govern the exchange.**

**The distinguishing feature is an ongoing system of identifiable value exchange.** Not size, not
interaction, not contactability.

**Corrected from the previous draft:** the earlier definition required exchange "with the artist
and with each other." That is withdrawn. **Fans do not need to transact with each other for a fan
economy to exist**, and implying they do would have smuggled in a network-effect claim CRWN cannot
support (section 11).

### What it is not

| Not a fan economy | Missing element |
|---|---|
| **Follower count** | Not identifiable, no exchange. A reach estimate |
| **An audience** | One-directional attention. No participation, no commerce, no obligation |
| **A mailing list** | Contactability without commitment or reciprocity |
| **A community** | Interaction without commerce or obligation. Necessary, not sufficient |
| **A subscription base** | One flow of several, and a snapshot rather than a system over time |

### The flows it carries, and CRWN's instrumentation

| Flow | Direction | Instrumented |
|---|---|---|
| Attention | fan to artist | `artist_page_visits`, `tier_events` **Verified** |
| Money | fan to artist | `earnings`, `subscriptions` **Verified** |
| Access | artist to fan | content classes, `allowed_tier_ids` **Verified** |
| Obligation | artist to fan | `fulfillment_obligations` / `fulfillment_events` **Verified** |
| Participation | fan to artist's world | missions, squads, bounties, city unlocks **Verified** |
| Advocacy | fan to new fan | `referrals`, `referral_earnings` **Verified** |
| Status | artist to fan | `fan_badges`, squad roles **Verified** |
| Deepening | fan to higher rung | **NOT instrumented** (section 3) |

---

## 5. Monopoly Wedge (ratified)

### Beachhead

**`highest_priority_empire_builder`** (`src/lib/avatars/taxonomy.ts:92`, `subAvatar@2`, index 0,
which is precedence position 0). Canonical label in code: **"Highest Priority Empire Builder."**

> **Naming note.** The founder's ratification names this the **"Independent Empire Builder."** The
> repository label is "Highest Priority Empire Builder" and the id is
> `highest_priority_empire_builder`. These refer to the same segment (precedence index 0, first
> CRWN offer: "the full four-tier ladder, launched to buyers who already pay"). **Recommendation:**
> keep the code id unchanged (it is referenced by the taxonomy test, the entry route, cohort
> reporting and the CHECK constraint) and, if the founder prefers the friendlier label, change only
> the `label` string. Small item, listed in section 20.

Concretely, from `docs/ICP.md` Tier 1: 250k to 5M followers, 100k to 3M monthly listeners, 40 to
300 released songs, 3+ years releasing, **and has already sold something directly.** Hip hop and
R&B focus.

### What "first" means operationally (ratified)

**Narrow acquisition and positioning. Never product eligibility.**

| Concentrate on the Empire Builder | Remains open to any qualifying ICP artist |
|---|---|
| Founder-led outreach and sales | Signup |
| Acquisition messaging and creative | Onboarding |
| Case studies and proof | Every product feature |
| Positioning and category language | Pricing and plans |
| Which cohort we learn from first | Support |

**Rationale, and it is Thiel's:** dominate a small market before expanding. But rejecting valuable
inbound artists would cost revenue and evidence for no strategic gain. **The narrowing is a
go-to-market discipline, not a gate.**

### The narrow problem

Not "artists do not make money." Specifically: **this artist already has buyers, running through
five to seven disconnected tools, so nobody, including them, can see the fan economy whole, and the
high-value rungs where 39% of the revenue lives never get built.**

`src/lib/stackReplacement.ts` (`stackReplacement@1`) already models the fragmentation across
membership, storefront, email, community, ticketing, link-in-bio and scheduling, and is honest
enough to mark ticketing and scheduling as things CRWN does **not** replace. **Verified.**

### Initial use case CRWN must be obviously best at

**Taking an artist who already has buyers scattered across a fragmented stack and producing their
first high-rung member on CRWN inside 30 days, with the economics visible and the promise attached
to that rung scheduled and kept.**

Activation is already defined as first paid member in `20-FIRST-REVENUE-LAUNCH-OFFER.md`.
**Verified.**

### Why underserved

Patreon sees conversion but not the pre-launch audience, and defaults artists toward flat low
tiers, which is precisely what the concentration math punishes. The real competitor is
Shopify + email + Patreon + Discord + Linktree, which is a stack, and no member of a stack can see
the whole economy, so no member can say what to do next. Labels and distributors see audience and
streaming, not direct conversion. Nobody models obligations, so nobody can tell an artist their
calendar is why they are churning.

### Expansion path

| Step | Gate before proceeding |
|---|---|
| 1. `highest_priority_empire_builder` | 3 partners reach first paid member; Money Model shows positive contribution |
| 2. `established_independent_operator` | Cohort report shows comparable activation at a stated sample floor |
| 3. `brand_led_hip_hop_artist` | Same |
| 4. `rnb_empire_builder` | Same. Depth-first avatar, so it should benefit most from the corrected truth |
| 5. ICP Tier 2 (50k-250k followers) | Onboarding no longer assumes an artist with nothing |
| 6. Adjacent genres | Cohort evidence, not intuition |
| 7. Label / org accounts | Org accounts and cross-artist infra exist. Not near-term |

Do not skip to "all creators." CRWN's obligation model, release strategy and catalog primitives are
music-shaped, and the ICP weighting is calibrated on music direct-sales behavior.

---

## 6. Category: Fan Economy Operating System (ratified)

### Definition

> **A Fan Economy Operating System is the system through which an artist operates the identifiable
> people who pay them: observing the state of that economy, deciding what to do next, structuring
> what is offered, maintaining what is owed, moving the money, and measuring whether it worked.**

### What "Operating System" must mean architecturally

The term is load-bearing, not decorative. An OS owns **state**, **scheduling**, and **the decision
of what runs next**. It does not have to implement every program. CRWN earns the description only
if it holds all seven of the following. Current status:

| OS responsibility | CRWN today | Evidence |
|---|---|---|
| **Observes the business** | **Yes** | `assembleConstraintEvidence` reuses the canonical owner of each fact rather than re-deriving |
| **Diagnoses the current constraint** | **Yes** | `readConstraint`, 8 stages, sample floors, refuses below them |
| **Determines priority** | **Yes, in one place** | Evaluation order puts fulfillment and retention first, deliberately |
| **Coordinates execution** | **Partial** | Actions deep-link to real surfaces; the queue is fragmented across six owners |
| **Maintains obligations** | **Yes** | Promise Calendar, dedup, inheritance, missed sweep, lateness |
| **Measures outcomes** | **Partial** | Money and fulfillment ledgers are strong; per-recommendation outcome is absent |
| **Feeds evidence back into future decisions** | **No** | The flywheel's missing box (section 9) |

**Five of seven, with two partial and one absent. CRWN is architecturally close and does not yet
earn the term in full.** Saying so is the difference between a category claim and a slogan.

### Own / orchestrate / integrate / do not build

| CRWN must OWN | Why |
|---|---|
| Canonical artist and fan economic state | Nobody else can see it whole; it is the substrate |
| Constraint diagnosis | This is the product |
| The next-action decision | The one thing a stack cannot produce |
| Offer and membership logic | Depth is where the money is |
| Fan relationships and the owned list | The artist's asset, and what makes the economy identifiable |
| Promises and obligations | Predicts churn; nobody else models it |
| Attributable direct revenue | Owning the transaction makes evidence trustworthy |
| Evidence of outcomes and recommendation history | The future moat |

| CRWN should ORCHESTRATE | Existing substrate |
|---|---|
| Campaigns and fan mobilization | Virality Engine over missions, bounties, squads, city unlocks |
| Release actions | `waterfall.ts`, scheduled-releases cron |
| External communication | `campaigns`, `sequences`, Resend |
| Live | LiveKit |
| Referral economics | `referrals`, `referral_earnings`, clipper rails |

| CRWN can INTEGRATE | Provider |
|---|---|
| Payments and payouts | Stripe Connect |
| Email delivery | Resend |
| Video and storage | LiveKit, R2 |
| DSP distribution | Leave entirely outside |

| CRWN should NOT build | Fails the test |
|---|---|
| Streaming or DSP distribution | No fan-economy leverage |
| Physical ticketing / box office | Already excluded in `stackReplacement.ts` |
| General dropship storefront | Commodity; Shopify wins it |
| Social scheduling / content tools | Does not touch the loop |
| DAW or creation tooling | Not the wedge |
| Sync licensing marketplace | Different buyer entirely |
| Multi-artist label org accounts | Until the wedge is won |

**The test for any proposed feature:** does it improve fan economic value, decision quality,
evidence quality, execution, fulfillment, growth, switching costs or proprietary intelligence? If
not, it is sprawl regardless of how reasonable it sounds.

---

## 7. The CRWN Operating Loop (refined)

The previous four-verb-plus-Learn loop conflated two different things under "Deliver": the artist
*acting* and the fan *receiving*. Those are distinct, and the Promise Calendar exists specifically
for the second. Corrected:

```
OBSERVE   ──▶  DIAGNOSE  ──▶  DIRECT  ──▶  DELIVER  ──▶  LEARN
   ▲                                                        │
   └────────────────────────────────────────────────────────┘
```

| Verb | What CRWN does | Built? | Evidence |
|---|---|---|---|
| **OBSERVE** | Assemble one evidence snapshot of the fan economy, reusing the canonical owner of each fact | **Yes** | `assembleConstraintEvidence` |
| **DIAGNOSE** | Name the one binding constraint, with its evidence, or refuse | **Yes** | `readConstraint`, 8 stages, `insufficient_evidence` |
| **DIRECT** | Return exactly one action with a real destination, never a menu | **Yes** | `CorrectiveAction` |
| **DELIVER** | **Two halves.** The artist executes (builds the rung, sends the campaign) **and the fan receives** (the promise is kept, dated and tracked) | **Yes**, both | Rise Mode / offer surfaces; `fulfillment_events` |
| **LEARN** | Link the recommendation to the outcome and improve the next decision | **No** | The gap. Exists only for AI Manager actions |

**Why DELIVER spans both halves rather than splitting into a sixth verb:** in CRWN's model they are
one commitment. The artist's action creates an obligation to a fan, and the obligation is what makes
the action durable. Splitting them would let the product treat "launched the tier" as done, which is
exactly the failure `REVENUE_RAMP` describes.

**Why growth is not its own verb:** a campaign is one kind of DIRECTed action, admitted only when
the diagnosis is `REACH` or `FIRST_PAID`. Promoting growth to a verb would imply CRWN always
recommends growth, contradicting the evaluation order that puts leaks first.

**What makes the loop distinctive is the refusals, not the steps.** It returns nothing on
insufficient evidence, returns one action rather than a list, ranks leaks above growth, and shows
evidence so the artist can disagree. A dashboard is easy to copy. A system that declines to advise
you is not.

---

## 8. The 10x Thesis: decision quality per hour of artist attention

**The 10x is not feature count.** Feature-for-feature CRWN is at parity or behind: Patreon's
memberships are more mature, Shopify's storefront is better, Discord's community is better. Thiel's
test is order-of-magnitude improvement, and CRWN's is in a different dimension.

### The fragmented alternative, step by step

An artist running the stack must, every week: open five to seven dashboards; reconcile
inconsistent numbers across them; decide which number matters; form a hypothesis about cause;
choose a tactic; configure the tool that executes it; remember what they promised fans and when;
manually check whether anything moved; and decide what to do next. **That is nine cognitive steps,
most of them performed by a musician between other jobs, with no feedback on whether the previous
week's guess was right.**

### CRWN's compression

**Observe → Diagnose → Direct → Deliver → Learn** collapses those nine into: open one screen, read
one sentence with its evidence, click through to the surface that does it.

The measurable claim is **time-to-correct-decision**, not features. If the stack takes hours per
week and produces a guess, and CRWN takes minutes and produces an evidence-backed action, that is
the order-of-magnitude improvement Thiel requires, and it is only possible because one system holds
evidence, decision, execution, obligation and money.

### Honest qualification

Two of the nine steps are not yet compressed. **Coordination is fragmented** (six recommendation
owners compete to be the daily screen), and **learning does not exist** (nothing tells the artist
or CRWN whether last week's action worked). So the 10x is **architecturally available and not yet
delivered.** Section 21 sequences the closing of both.

---

## 9. Proprietary Intelligence: the moat, stated precisely

**Not "we use AI."** The strategic asset is structured evidence of:

> **artist state x recommended action x action taken x business outcome**

### The five layers, and the threshold to advance between them

| Layer | What it is | Status | Threshold to reach the next layer |
|---|---|---|---|
| **1. Deterministic decision logic** | Pure, tested rules over the artist's own data | **Strong today.** `readConstraint`, `recommendStrategy`, `recommendPlan`, `buildStarterOffer`, `assignSubAvatar`, `computeRampProgress` | Recommendation and outcome must be **linked and stored**. Without that, nothing below is reachable |
| **2. Artist-specific history** | This artist's own observed rates replace assumed constants, one field at a time | **Absent.** `getAssumptions()` constants never move | Per-field observation counts at a stated minimum (`FEEDBACK_LOOPS.md` section 5 proposes 30 members / 60 days for `superfanRate`, 20 paying members for the tier split) |
| **3. Comparable-artist evidence** | Benchmark this artist against a **matched** cohort, not the platform mean | **Partial.** `retentionBenchmark` does it for churn only; `readCohortConstraint` does it for avatar funnels at `COHORT_MIN_SAMPLE = 30` | Generalize the matched-cohort pattern to all 8 constraint stages; **sample floor of 8 minimum** for anything shown to an artist (`crossArtistPatterns.ts` currently uses `n >= 2`, which is not a pattern) |
| **4. Cross-artist pattern discovery** | Which action, in which state, for which sub-avatar, produced which outcome | **Absent** | Enough closed recommendation-outcome records per (sub-avatar x constraint x action) cell to clear the floor |
| **5. Adaptive recommendation** | Thresholds and priors calibrated from observed outcomes rather than declared | **Absent, and correctly last** | Layer 4 sustained, plus evidence that calibrated thresholds outperform declared ones |

### The prerequisite primitive: recommendation to outcome linkage

**This is the single highest-value missing thing in the entire strategy.** CRWN must be able to
record, for each recommendation:

- what was recommended, and by which engine
- why (the constraint and its confidence)
- what artist state existed at recommendation time
- whether the artist acted
- which relevant metric moved
- over what window
- whether the movement is plausibly associated with the recommendation

Today CRWN records this for **AI Manager actions and nothing else**
(`artist_agent_actions.baseline_metrics` + `outcome_delta`, `/api/cron/outcome-measure`). Every
deterministic recommendation, including the Constraint Engine's, is unmeasured.

**Not implemented in this task.** Recorded as the prerequisite for layers 2 through 5.

### What this could eventually improve

Constraint resolution, offer recommendations, retention recommendations, release strategy,
fulfillment decisions, acquisition recommendations, Virality campaign selection, and
sub-avatar-specific defaults. **Pricing recommendations only where separately approved**, since
pricing is a founder domain.

### Why it is credible as a moat

CRWN observes the entire chain from a stranger's follower count to a recurring charge, on one
platform, **with money as the label**. Patreon sees conversion but not the pre-launch audience.
Distributors see audience but not conversion. Nobody else holds both ends. The discipline that
protects it is already house style: derived on read, versioned (`unifiedOpportunity@1`,
`subAvatar@2`, `stackReplacement@1`), null never zero.

### Data CRWN should not collect

Play counts as a decision input (vanity proxy, explicitly downgraded); fan ratings of a delivered
promise (gameable, makes CRWN judge the artist's work); external social view counts (no
integration exists, self-reported only); any cohort narrow enough to identify an individual artist
without consent; and any fan-level behavioral data with no decision attached to it.

---

## 10. Intelligence Flywheel

```mermaid
flowchart TD
    A["ARTIST STATE<br/>calculator answers, sub-avatar,<br/>evidence snapshot"] --> B
    B["DIAGNOSE<br/>readConstraint over one snapshot"] --> C
    C["RECOMMEND<br/>one action, with its evidence"] --> D
    D["ARTIST ACTS<br/>or does not. Both are data"] --> E
    E["OUTCOME<br/>earnings, subscriptions,<br/>fulfillment_events, tier_events.<br/>Money as the label"] --> F
    F{"RECOMMENDATION -> OUTCOME<br/>LINKAGE<br/>(the missing primitive)"}
    F --> G["Layer 2<br/>artist-specific history"]
    F --> H["Layer 3/4<br/>comparable-artist +<br/>cross-artist patterns"]
    G --> B
    H --> I["Layer 5<br/>calibrated priors improve<br/>the NEXT artist's first estimate"]
    I --> A

    style F fill:#2A2A2A,stroke:#D4AF37
```

**Built:** A, B, C, D, E. **Missing:** F, and therefore everything after it. One box.

---

## 11. Defensibility Stack (skeptical, ratified)

Network effects are **not** a meaningful moat for CRWN today, and this document will not claim
otherwise.

### Near-term (real today)

| Mechanism | Strength | Evidence |
|---|---|---|
| **Switching costs** | **Strong** | Earnings ledger, fan contacts, live Stripe prices per tier, promise calendar, team splits. Leaving means rebuilding the offer and abandoning the financial history |
| **Accumulated artist state** | **Moderate** | The longer an artist operates on CRWN, the more the evidence snapshot is worth to them |
| **Integrated direct-to-fan economics** | **Moderate** | One ledger for six paid rails is genuinely hard to reassemble from a stack |
| **Workflow depth** | **Weak today** | Weak precisely because six systems compete to be the daily screen. Becomes strong when one loop owns it |
| **Founder / category positioning** | **Weak today** | No category is claimed anywhere in the product. This document is the first attempt |

### Medium-term (plausible, requires the missing primitive)

| Mechanism | Requires |
|---|---|
| Recommendation and outcome history | Section 9's linkage primitive |
| Artist-specific intelligence | Layer 2 thresholds met |
| Contributor and fan graph | Virality Engine V1 shipping and accumulating participation |
| Better campaign and offer evidence | Closed campaigns with money-labeled outcomes |

### Long-term (the actual monopoly, none of it true yet)

| Mechanism | Honest label |
|---|---|
| Cross-artist proprietary evidence | **Plausible.** The strongest available moat, gated on the primitive |
| Recommendation advantage | **Plausible.** Downstream of the above |
| Cross-side network effects (a fan reused across artists; a proven contributor known-good to the next artist) | **Speculative.** Real mechanism, unbuilt, and the contributor half is also a privacy decision |
| Category ownership | **Plausible.** Requires the category to be claimed consistently for years |
| Economies of scale | **Weak.** Single operator, Vercel Hobby, daily cron cap |

**Summary: CRWN is defended today by switching costs and integrated economics. Everything stronger
is future and gated on one missing primitive.**

---

## 12. Timing, People, Distribution, Durability, Secret

### Timing (why now)

**Supported:** payout infrastructure for the long tail is solved (Stripe Connect Express, in
production); fragmentation is at its peak (`stackReplacement.ts` enumerates seven tool categories
for one artist); fans already pay creators directly at scale, so the behavior does not need
teaching to this ICP, whose defining attribute is that they **have already sold**.

**Do not claim:** that AI makes this newly possible. CRWN's advantage here is deterministic.

### People

Capabilities this specific strategy requires: willingness to do concierge work by hand at n=3
(already true, and instrumented by the Money Model); **the discipline to say no to features**
(currently the weakest, evidenced by 241 API routes and six recommendation owners); credibility
with hip hop and R&B artists (a distribution asset); and willingness to hold the deterministic line
when an AI shortcut ships faster.

### Distribution (fundamental, not an afterthought)

| Channel | Status | Fit with the wedge |
|---|---|---|
| Calculator funnel (18 tools; the homepage **is** the calculator) | **Live** | **Strong.** The calculator is the argument, delivered as arithmetic about the artist's own numbers |
| Organic video + ManyChat DM funnel | **Live, tagged** | Strong; it is how the beachhead is actually reached |
| Founder-led sales (First Revenue Launch) | **Live, n=3** | Strong now; correctly not pretending to scale |
| Recruiter / partner program | **Live** | Plausible; economics unproven |
| Post-Win Referral | **Unbuilt** | Plausible, and the cheapest future channel |
| Virality Engine | **Architecture only** | Indirect: grows the artist's audience, which grows CRWN's take |
| Paid acquisition | Not started | Correctly last. CAC is unknowable until the funnel converts to first dollar |

**The defensible insight:** competitors cannot run CRWN's calculator without conceding CRWN's
argument, because the honest version of the math is what makes the case.

### Durability

Today: switching costs plus integrated economics. In ten years: outcome-labeled launch data that
nobody else is positioned to collect, because nobody else sees both the pre-launch audience and the
recurring charge.

### The secret

> **Nobody is building the system that decides what an independent artist should do next and can
> prove it was right.**

The industry's entire software layer is execution surfaces with no decision layer, because no
single tool can see enough to have an opinion. CRWN can see enough.

---

## 13. Fulfillment Capacity: principle established, product rule parked

**Zero To One establishes the principle:**

> **Protect fulfilled, sustainable fan value over maximizing nominal offer value.**

An over-promised calendar destroys the retention that depth depends on, and depth is where 39% of
the revenue is. The principle follows directly from the corrected truth.

**No hard product rule is created here.** Specifically, nothing in this document authorizes:
removing a tier, changing tier pricing, reducing an artist's promises, or forcing a plan change.
All four remain **founder decisions** and are explicitly unresolved.

**This does not block Zero To One implementation.** It is a future recommendation behavior, and it
should stay parked until CRWN encounters or simulates an artist whose fulfillment capacity is
genuinely exceeded. Carried from `FEEDBACK_LOOPS.md` section 20.

---

## 14. Positioning Architecture

The strategic source from which copy is later derived. **Not copy.**

| Element | Statement |
|---|---|
| **Contrarian truth** | An artist's most valuable business asset is not the size of their audience but the economic depth of the identifiable minority within it who pay, keep paying, participate and bring others |
| **Category** | Fan Economy Operating System |
| **Customer** | Hip hop and R&B artists, 250k+ followers, who have already sold directly and run five to seven disconnected tools |
| **Problem** | Their fan economy is real and invisible. No tool in the stack sees it whole, so nobody can say what to do next, and the high-value rungs never get built |
| **Promise** | Your first high-rung member in 30 days, and a system that names the one thing to do next for the eleven months after |
| **Unique mechanism** | Observe, Diagnose, Direct, Deliver, Learn: one system holding state, decision, execution, obligation and money |
| **Proof** | Paying members retained, promise completion rate, revenue per member over time, and the constraint that cleared. Never followers, streams or plays |
| **Enemy / old way** | The fragmented stack, and the belief it encodes: that reach converts to income on its own |

---

## 15. Product Implications

### Already aligned

`src/lib/constraint/*`; `RECOMMENDED_LADDER` and `applyTierTemplate`; `promisePlan` and the
obligation model; `unifiedModel` and the disjoint-population rule; `paidConversion`; the Money
Model; `assignSubAvatar`; Revenue Ramp; `stackReplacement.ts`; content classes; the release
waterfall.

### Needs copy / positioning change (architecture fine)

Homepage (lead with the value distribution, not a generic monetization promise); calculator result
(name the distribution explicitly: of your payers, the top 8% are 39% of the money); onboarding
ladder screen (explain why the top rung exists and that it fills last); nurture (reframe around
depth and the trough); Rise Mode proof line (members retained, not activity); getting-started
guides (category language).

### Needs logic change

Ramp steps scored as broken fan promises (**already Phase 0**); `/api/leaderboard` score inversion
(**already Phase 0**); Manager prompts decide *what* rather than *how to say it* and are unaware of
content classes, waterfall, strategy and the Constraint Engine; `getAssumptions()` frozen
constants; the weekly report does not carry the constraint.

### Needs consolidation

Manager, Action Plan, Playbooks, Roadmap, Rise Mode and Constraint all answer "what next." Target
sharpened by this strategy: one loop owns the day.

### Needs new capability

**Recommendation to outcome linkage** (highest value in this document); **tier transition history**
(the clearest instance of deepening, currently unobservable); retention cohorted by acquisition
source; observed-input substitution; matched-cohort benchmarks across all 8 stages;
`stackReplacement` surfaced (the beachhead's opening argument has no UI).

### Should be de-emphasized

Section 17.

---

## 16. Features That Reinforce the Wedge

The Constraint Engine and its evidence layer (**this is the product**); the four-rung ladder and
`applyTierTemplate`; the Promise Calendar; the unified Opportunity Calculator; `earnings` as the
single money ledger; fan contacts and the owned list; sub-avatar assignment and cohort reporting;
the Revenue Ramp; Stack Replacement; the Money Model.

---

## 17. Features That Risk Dilution

**Candidates only. Nothing is deleted, and this is not authorization to delete.**

| Feature | Concern |
|---|---|
| **Playbooks** | A sixth recommender, overlapping Virality archetypes |
| **Missions, Squads, City Unlocks, Road To, Proof of Demand as five Studio destinations** | Virality primitives without a campaign wrapper. Five nav slots for one concept, none of them a decision |
| **`/studio/sync`** | Different buyer (supervisors, not fans), different economy |
| **Royalty Readiness** | `UNIFIED_OPPORTUNITY.md`: "already-earned money elsewhere. Different money entirely." Fine as a lead magnet, a distraction as a product surface |
| **Executive Producer Sessions** | High complexity, blocked on legal, narrow. Correctly dark |
| **Action Plan page** | Already queued for retirement |
| **Legacy `posts`/`comments`/`likes` beside `community_posts`** | Two social layers |
| **`src/app/artist/[slug]/*` duplicate subroutes** | Known drift |
| **Booking / Calendly remnants** | Not imported anywhere |

**The pattern:** most exist because "an artist might want it," not because they improve fan economic
value, decision quality, evidence, execution, fulfillment, growth, switching costs or intelligence.

---

## 18. Zero To One Scorecard

Reconciliation corrected the truth's *precision*, not the product. Only one score moves.

| Dimension | Current | Potential | Note |
|---|---|---|---|
| Contrarian truth | **5** (was 4) | 9 | Now stated precisely and ratified in a canonical doc. Still absent from every product surface, which is why it is not higher |
| Technology / 10x | **4** | 8 | Constraint engine is rare and has one consumer; learning layer absent |
| Monopoly wedge | **5** | 9 | ICP and sub-avatars sharp and implemented; acquisition still runs four journeys at n=3 |
| Timing | **7** | 8 | Mostly exogenous, favorable |
| Distribution | **5** | 8 | 18 calculators, live DM funnel; no paid loop; attribution to first dollar only just landed |
| Durability | **3** | 7 | Switching costs only; data moat unbuilt |
| Proprietary intelligence | **3** | 9 | Excellent evidence, almost no learning. The one closed loop is at HTTP 402 |
| Network effects | **2** | 5 | Near zero today, and the potential is modest and mostly cross-side |
| Switching costs | **5** | 8 | Real: ledger, contacts, Stripe prices, calendar |
| Category ownership | **2** | 7 | Now ratified internally; unexpressed in product |
| Product coherence | **3** | 8 | Six recommendation owners, nine dilution candidates, 241 routes |
| **Average** | **4.0** | **7.8** | |

**Reading the gap:** foundations score far better than expression. Nobody is told the truth, no
single loop owns the day, and nothing measures whether the advice worked. All three are addressable
without new infrastructure.

---

## 19. Remaining Founder Decisions

Only genuine blockers.

1. **Sign off the corrected contrarian truth sentence** (section 2). Everything downstream in copy
   derives from it. The numerical and audience-growth overstatements are corrected; this is a
   wording ratification, not a reopened question.
2. **The Empire Builder label.** Founder ratification says "Independent Empire Builder"; the code
   says `highest_priority_empire_builder` / "Highest Priority Empire Builder." Same segment.
   Recommendation: keep the id, change only the display label if preferred. Low stakes, but it
   should be settled before the label appears in outreach.

**Explicitly not blockers:** the promise-reduction / tier-change rule (parked by section 13); the
category name (ratified); the beachhead (ratified).

---

## 20. Implementation Roadmap (future only, nothing executed)

Re-sequenced against the corrected strategy. The material change from the previous version: the
**recommendation-to-outcome primitive moves earlier**, because every intelligence claim in this
document depends on it and it is cheap relative to its leverage.

| Phase | Objective | Depends on | Risk |
|---|---|---|---|
| **Z0** | Sign off the truth sentence and the label (section 19) | Nothing | None. Blocks copy |
| **Z1** | ~~`docs/POSITIONING.md` written from section 14~~ **DONE 2026-08-10.** [`../POSITIONING.md`](../POSITIONING.md) is the canonical market expression of this strategy: the messaging ladder, the calculator spine, the feature-to-outcome map, the binding claim-maturity table, and the copy guardrails. **No copy constant was added to `src/lib`** | Z0 | Low |
| **Z2** | Homepage + calculators express the value distribution. **COMPLETE 2026-08-11.** Shipped: homepage hero, four homepage marketing sections, `worth` (anti-streaming framing removed), vault / share-to-earn / live-experience heroes, root metadata; **spine beat 3 on all 17 loss-engine tools** via one shared `fanDepth` section in `buildLossResult`, reaching BOTH result renderers (4 bespoke, 13 tested non-numeric fallback); and **personalized concentration on the Opportunity Calculator** (`unifiedFanDepth`, derived purely from the ladder split the model already produces, returns null rather than claiming a concentration it cannot support). **Inventory corrected: 20 adapters, and the tools OUTSIDE the loss engine are `worth`, `proofOfDemandTest` and `unifiedOpportunity`. `royaltyReadiness` IS in the engine** (an earlier note here said otherwise and was wrong). **Z2A (strategic half) CLOSED 2026-08-10.** Inventory verified from two independent sources: **20 adapters** (19 registry tools plus the standalone `worth` route), 17 on the loss engine, 3 outside it (`worth`, `proofOfDemandTest`, `unifiedOpportunity`). All 13 fallback consumers were individually audited: **10 gained a bespoke, model-backed depth line; 3 deliberately keep the generic one** (movement page and quest path model the absence of a participation route rather than a distribution among fans; team split models collaborator economics, where fans are not the segmented party). `royaltyReadiness` carries a bespoke line stating the beat does NOT apply, because it recovers money earned elsewhere and its own copy says fans lose nothing. Rule recorded in `POSITIONING.md`. **Z2B partially closed:** heroes, subheads, primary CTAs, result CTAs, metadata (centralized in one `generateMetadata` reading the registry) and beginner-framing all audited and already passing; one CTA claim fixed ("Start Owning My Fans" became "Build My Direct Fan List", because the tool NAME may stay but a claim that an artist owns people may not). **Z2B-1 field audit, method + partial result:** fields are declared as `key` in the registry and consumed as `raw[key]`, so consumption is greppable by key rather than inferable from labels. **Most loss tools carry only TWO fields** (`social_followers`, `monetization_status`) on a 3-step wizard, so friction is already low and is concentrated in a few heavy tools. `monetization_status` is segmentation, not math, and says so in its own help text, matching the ICP's 40% weight on proven direct sales. **Vault, the heaviest form at 14 inputs, was fully traced: every field has a live consumer in `resultGenerators.ts`, and `unreleasedSongs` additionally feeds sub-avatar assignment. Zero removal candidates.** **Z2B-1 CLOSED 2026-08-11:** the remaining heavy tools were traced by set difference (one repo-wide pass over every declared key, then hand-tracing the residue). Consumption is enumerable: result generation, builder prefill, `evidenceFromInputs`, the `sanitizeCalculatorInputs` scorer, persistence. **Storage is not a consumer** (every reader is an allowlist), so removing a registry field cannot break a saved row. Three dead fields removed (`fan-mission.goal`, `fan-mission.proof`, `clip-to-earn.sourceUrl`) with their two now-empty wizard steps; `genre_family` and `monetization_status` KEPT (segmentation + the ICP scorer). Email boundary is identical on all 20: post-result, optional, below the builder, no `preview` phase and `leadCapture.required` false everywhere; the false "Unlock my result" button was corrected to each tool's own `cta.publicSecondary`. **Z2B-2 CLOSED 2026-08-11:** Quest Path's two required free-text questions were ignored by an `execute()` that takes no arguments, so every artist got the same "Execution leakage 68/100" and "8 to 16 weeks lost". No canonical blocker-to-quest-to-time mapping exists (the Constraint Engine needs a real artist's measured world), so branching would have meant inventing a business rule: the questions and the fabricated figures are gone, the tool now delivers the order itself, and it stamps its own `questPath@1` instead of the shared `lossResult@1`. Clip-to-Earn now carries `sourceContent`/`moments`/`rules` into the builder additively (no `GENERATOR_VERSION` bump: math and rendered sections unchanged, and the version is shared with three untouched generators). Lower homepage audited section by section: no stale category positioning, **no future-capability leakage at all** (no "smarter", "artists like you", cross-artist, adaptive or Virality claims), streaming de-villainized in both comparison tables, and "Claim your fans" corrected to "Claim your fan list". All 20 calculators certified at least Acceptable on every value-equation dimension | Z1 | Low. Copy plus two additive result sections. No formula, event, experiment or continuation id touched |
| **Z3** | **Recommendation to outcome linkage. COMPLETE 2026-08-11.** Migration applied to production and verified against the real database: identity holds on the live partial unique index (three issuances, one row, `issued_at` unmoved, baseline immutable), a REAL `FULFILLMENT` diagnosis was issued and stored through the production writer, `complete`/`missing` evidence states survive the round trip, anonymous read returns `[]` while a row exists, anonymous writes are denied, and the cron authenticates, queries the live table and leaves a not-yet-due row alone. Collection is prospective-only: the table held 0 rows before and after verification. Authenticated cross-artist read remains SQL-verified rather than dynamically tested (no user credentials in that environment). The prerequisite primitive. Canonical doc: [`24-RECOMMENDATION-OUTCOME-LINKAGE.md`](24-RECOMMENDATION-OUTCOME-LINKAGE.md). The claim in section 9 was VERIFIED and is accurate: the AI Manager already had baseline/outcome linkage (`artist_agent_actions` + `schema-phase2-agent-outcomes.sql`, measured by the `outcome-measure` cron), and no general primitive existed. The deterministic path had none at all, because the Constraint Engine reads and never writes, so nothing recorded what it said. Now: `/api/artist/constraint` records the issued recommendation (idempotent, one open row per artist per constraint via a partial unique index, baseline never refreshed, `insufficient_evidence` records nothing), and a daily cron reads the action via the Quest Engine's own DomainCheck and the outcome by RE-RUNNING `readConstraint`. **No invented thresholds** (the engine's own founder-adjustable policy classifies), **no invented windows** (`thresholds.ts` lookbacks; RETENTION / FIRST_PAID / DEPTH define none and are recorded as an open limitation, a founder decision), **no causal claim**, **no financial recomputation** (the first slice, FULFILLMENT, is not money). Evidence vocabulary reuses the Money Model's `complete\|modeled\|missing`. **Two cautions found in the existing Manager loop and documented rather than changed:** `snapshotArtistMetrics` derives its own MRR instead of reading the canonical rails, and defaults every metric to `0`, so it cannot distinguish "no data" from "zero"; and its outcomes already feed back into the AI prompt, which is artist-specific learning that predates Z3. **Still open:** the migration is unapplied, so zero evidence exists yet | Phase 0 evidence integrity | Medium. **Highest leverage item in this document** |
| **Z4** | Widen `readConstraint` readership: weekly report first | Z3 | Low |
| **Z5** | Recommendation consolidation: one loop owns the day | Z1 | Medium |
| **Z6** | Surface `stackReplacement` for the beachhead conversation | Z0 | Low |
| **Z7** | Onboarding reframed for a proven seller with a catalog | Z1 | Medium |
| **Z8** | Tier transition history (make deepening observable) | Z3 | Medium. Schema change, founder-gated |
| **Z9** | Observed-input substitution (intelligence layer 2) | Z3, Z8 | Medium |
| **Z10** | Matched-cohort benchmarks across 8 stages (layer 3) | Z3, volume | Medium |
| **Z11** | Virality Engine V1 | Z1, Phase 0 | Medium |
| **Z12** | Dilution audit: decide the section 17 candidates | Z0 | Low, founder-gated |

**Preserved from the unified plan:** security and evidence integrity (Phase 0) precede all of the
above; Zero To One precedes Virality V1; recommendation consolidation follows positioning.

---

*Companion documents:
[`22-VIRALITY-ENGINE-ARCHITECTURE.md`](22-VIRALITY-ENGINE-ARCHITECTURE.md),
[`21-MONEY-MODEL-MEASUREMENT.md`](21-MONEY-MODEL-MEASUREMENT.md),
[`20-FIRST-REVENUE-LAUNCH-OFFER.md`](20-FIRST-REVENUE-LAUNCH-OFFER.md),
[`../FEEDBACK_LOOPS.md`](../FEEDBACK_LOOPS.md),
[`../UNIFIED_OPPORTUNITY.md`](../UNIFIED_OPPORTUNITY.md),
[`../ICP.md`](../ICP.md), [`../SUB_AVATARS.md`](../SUB_AVATARS.md),
[`../CRWN_UNIFIED_PRODUCT_ARCHITECTURE_PLAN.md`](../CRWN_UNIFIED_PRODUCT_ARCHITECTURE_PLAN.md).*
