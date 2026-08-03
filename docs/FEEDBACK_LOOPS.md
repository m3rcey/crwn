# CRWN Feedback Loop Audit and Architecture

Investigation date: 2026-08-03. Branch `claude/rise-mode-full-journey`.
Implementation source of truth: the repository. CRWN Brain reconciled against it below.

**Original pass: investigation only.** A follow-up task on 2026-08-03 implemented the evidence-layer
repairs in §18 Phase 0 and Phase 1 and corrected one wrong finding. Sections carrying an
implementation status say so inline; everything else is still analysis, and the Constraint Engine
(§9, §11) remains deliberately unbuilt.

**Correction log**
- **§4.1 was WRONG and is retracted.** `stripe_connected` and `first_paid_conversion` were both
  emitted all along; the audit's grep was truncated. The real, smaller gaps underneath it (4 of 6
  paid rails unwired, and no calculator attribution on the event) are fixed. See §4.1.
- §4.2 (missed never written) and §4.3 (no tier-level measurement) were **confirmed correct** and
  are now fixed.

---

## 0. Source-of-truth note (read this first)

`CLAUDE_PROMPT_FRAMEWORK.md` **does not exist** anywhere in the repository or in git history
(`find` across the repo excluding `node_modules`, plus `git log --all -- '*PROMPT_FRAMEWORK*'`,
both empty). The closest artifacts are `CLAUDE.md` (the Problem-Solving Principles block:
most-critical-first, first principles, the five-step pass) and `AGENT_INSTRUCTIONS.md`. This
report uses `CLAUDE.md`'s framework, and Section 19 asks whether the missing file should exist.

Everything else below cites a file and, where the claim is load-bearing, a line.

Labels used throughout:

| Label | Meaning |
|---|---|
| **IMPL** | Verified in the repository today |
| **PLAN** | Written down as intended, not built |
| **REPO DRIFT** | Code contradicts itself (a declared thing nothing produces or consumes) |
| **DOC DRIFT** | A Brain or docs statement the code does not support |
| **FOUNDER** | An approved direction recorded in `TODO.md` / `CLAUDE.md` / CHANGELOG |
| **REC** | My recommendation, not established fact |

---

## 1. Executive Summary

**CRWN measures a great deal and learns from almost none of it.**

The measurement layer is genuinely strong. There are 20 canonical funnel stages with DB-level
dedup, a refund-netted opportunity ledger, per-artist cohort retention, churn reasons, NPS, an
experiments engine that is on and running, email open/click at the send level, sequence conversion
with real attribution windows, per-tier promise health, and 43 authoritative `DomainCheck`s that
serve as one shared completion oracle. Very few early-stage products have this much true evidence.

Three structural facts turn that into a problem rather than an advantage:

1. **The evidence flows up, not back.** `funnel_events` is read by exactly three routes, all under
   `/api/admin/*`. `opportunity_ledger` is read by admin routes and the experiments taxonomy. Not
   one artist-facing recommendation reads either table. The learning surfaces the founder, not the
   artist.

2. **Every recommender is deterministic over pre-launch inputs and account state, never over
   outcomes.** `recommendStrategy` (`membershipStrategy.ts:59`), `recommendPlan`
   (`planRecommendation.ts`), `buildStarterOffer` (`starterOffer.ts`), `recommendNextQuest`
   (`quests/recommend.ts`), `buildRoadmapDefs` (`artistRoadmap.ts:82`), `RAMP_PHASES`
   (`revenueRamp.ts:60`) and `getAssumptions` (`leadCalculator.ts:64`) are all pure functions of
   what the artist declared and what rows exist in their account. Not one of them reads a
   conversion rate, a churn rate, a tier mix versus projection, or a promise-health score. The
   product asks "does the thing exist?" and never "is the thing working?"

3. **Exactly one closed learning loop exists in the entire codebase**, and it is the AI Manager:
   `artist_agent_actions.baseline_metrics` captured at execution, `outcome_delta` measured 7 days
   later by `/api/cron/outcome-measure`, aggregated across artists by
   `crossArtistPatterns.ts`, fed back into the next generation prompt. That is a real
   evidence-to-decision loop and it is well built. It is also LLM-mediated, gated (a `starter`
   artist gets rule-based `generateStarterNudges` instead of `generateInsights`,
   `cron/ai-manager/route.ts:298`), needs `n >= 2` per action type before a pattern forms, and is
   **currently dead**: `TODO.md` records DeepSeek returning `HTTP 402 Insufficient Balance`.

The single highest-leverage gap is not analytics volume. It is one missing measurement:
**tier-level view and checkout-start**. `artist_page_visits` records one row per artist per day per
visitor hash and nothing else (`schema-phase2-artist-page-visits.sql`). A grep for
`tier_view`, `tier_viewed`, `checkout_started` across `src/lib` and `src/app/api` returns nothing.
Without it, CRWN cannot separate "nobody came" from "they came and did not click" from "they
clicked and did not pay", and that fork is the branch point of every corrective recommendation
the rest of this report proposes.

**The recommendation is not to build a learning engine.** It is to build one pure, deterministic
function, `readConstraint()`, over evidence CRWN already stores plus one new event, and render its
output in exactly two places: the Rise Mode next-action slot and the Monday email. Cohort learning
and anything predictive come later, and only after the deterministic loop has been observed to
move revenue.

---

## 2. Current Feedback Loop Architecture (as implemented)

The strategic flow is intact and correct. Annotated with what each stage actually produces:

```
Calculator                  -> lead_magnet_results.result_data (stored, never recomputed)
   |                           lead_magnet_events + funnel_events (page/start/complete/reveal)
Unified Opportunity         -> unifiedModel.ts, versioned unifiedOpportunity@1, pure
   |                           recalcUnified re-runs on builder edits (a real, tight loop)
Four-Tier Builder           -> deliverableSpecs 'system' prefill from RECOMMENDED_LADDER
   |                           funnel: builder_opened, builder_published
Signup                      -> funnel: account_created, email_verified
Restore Saved Plan          -> autoClaimForUser binds by verified email + user_metadata token
   |                           seeds recommended_plan, tierProjections
Artist Launch Wizard        -> funnel: setup_started, setup_completed
   |                           applyTierTemplate -> tiers + tier_benefits
Promise Calendar            -> promisePlan.ts -> fulfillment_obligations + fulfillment_events
   |                           revenueRampSeed adds 30 dated roadmap steps
Launch Review               -> markComplete -> /api/artist/complete-setup
Publish                     -> artist_page_visits begins recording (daily unique only)
Import Fans                 -> funnel: fans_imported
Invite Fans                 -> funnel: fan_invited (campaign send)
Launch Campaign             -> campaign_sends (opens/clicks via Resend webhook)
Revenue Ramp                -> computeRampProgress: adapts PACE, never the CURVE
Rise Mode                   -> /api/quests (dark) + /api/artist/roadmap (live)
Repeat                      -> nothing returns to the Calculator or the Opportunity
```

**The last arrow is missing.** "Repeat" in the spec is a loop; in the code it is a straight line
that stops. No post-launch fact ever re-enters the Opportunity, the ladder, the ramp curve, or the
calculator assumptions.

### The three brains that run the artist's day

| Surface | Route | What it reads | What it never reads |
|---|---|---|---|
| `RoadmapCard` | `/api/artist/roadmap` | 43 DomainChecks + 3 promise facts + members/paid/MRR | conversion, churn, promise health, tier mix |
| `RiseMode` | `/api/quests` (dark flag) | quest instances, lead-magnet mission | any performance metric |
| `StrategyCard` | `/api/artist/strategy` | declared unreleased count, release cadence, catalog size | whether the chosen strategy is working |

`RoadmapCard.tsx:26` fetches one endpoint. `RiseMode.tsx:99` fetches one endpoint. The command
screen an artist looks at every day cannot see the analytics the platform already computes.

---

## 3. Existing Evidence Systems

| System | Table(s) | Written by | Read by | Loop status |
|---|---|---|---|---|
| Lead-magnet funnel | `funnel_events` (20 stages) | 13 server call sites + `/api/funnel/track` | 3 admin routes only | **Open** |
| Tool analytics | `lead_magnet_events` | client beacon, server-derived allowlist | admin dashboard | **Open** |
| Opportunity ledger | `opportunity_ledger` | `recomputeArtistOpportunity`, daily piggyback on `outcome-measure` | admin + experiments taxonomy | **Open** |
| Agent outcomes | `artist_agent_actions` | agent execute + `cron/outcome-measure` | `crossArtistPatterns` -> AI prompt | **CLOSED** |
| Experiments | `experiments`, `experiment_events` | assignment + outcome recording | admin Experiments tab | **Closed to founder** |
| Page visits | `artist_page_visits` | `/api/admin/track` | `/api/analytics` (revenue-per-visitor) | Partially open |
| Money | `earnings`, `subscriptions`, `referral_earnings` | Stripe webhook | `/api/analytics`, `collectArtistData` | Partially open |
| Churn voice | `cancellation_reasons`, `survey_responses` | cancel modal, survey token | `/api/analytics`, `collectArtistData` | Partially open |
| Email | `campaign_sends`, `sequence_sends` | send routes + Resend webhook + pixel | `admin/email-health`, `cron/lead-scoring` | **Open to the artist** |
| Sequence attribution | `sequence_conversions` | `cron/sequence-conversions` (per-trigger target action, real windows) | sequence UI | Partially closed |
| Promises | `fulfillment_obligations`, `fulfillment_events` | wizard + promise routes | `/api/promise-calendar/health`, `fulfillmentInsights` | Partially closed |
| Completion oracle | none (derived) | n/a | roadmap, quests, `rampReconcile` | Shared, correct |
| Abandoned checkout | `abandoned_checkouts` | `webhookHandlers.ts:2382` (Stripe `checkout.session.expired`) | `/api/abandoned-checkouts` list | **Open** |

Two things deserve explicit credit, because a redesign should not break them:

- **One completion oracle.** `evaluateCondition` in `quests/evaluator.ts` is consumed by the
  roadmap route, by `rampReconcile.ts`, and by the quest engine. Three surfaces, one definition of
  "done". This is exactly right and every new loop below reuses it rather than adding a parallel
  query.
- **Derived on read, stored nowhere.** The roadmap, the strategy, the plan recommendation and the
  starter offer all follow this pattern. It is why they can be changed freely. Every new
  recommendation in this report keeps it.

---

## 4. Current Open Loops

Ordered by cost, most critical first.

### 4.1 ~~The money-close funnel stages are declared and never emitted~~ WRONG, RETRACTED 2026-08-03

**This finding was incorrect and is withdrawn.** The original grep for `recordFunnelEvent` call
sites was truncated by a `head -30`, which cut off the two files that matter:
`src/lib/stripe/connectReconcile.ts` and `src/lib/webhookHandlers.ts`. Both stages WERE emitted,
and both were emitted correctly:

- `stripe_connected` fires in `reconcileStripeConnect` only when a live `accounts.retrieve`
  reports `charges_enabled`, deduped per artist. That is the authoritative state, not "returned
  from Stripe" and not "has an account id".
- `first_paid_conversion` fired from the subscription and product webhook paths, deduped per
  artist, so it could not fire for a free tier (a free join never reaches Stripe checkout) and
  could not repeat.

Two REAL and smaller gaps were found underneath the wrong one, and both were fixed on
2026-08-03:

1. **Rail coverage.** Only 2 of 6 paid rails emitted. Because the stage is deduped per artist and
   only the first event ever lands, an artist whose first dollar came from a track sale, a
   booking, a live ticket or a tip read as "never converted" permanently. All six rails now go
   through one shared recorder (`src/lib/analytics/paidConversion.ts`).
2. **Attribution.** The inline calls passed `artistId` and nothing else, so the row could not be
   joined back to the calculator the artist came in through, which is the entire reason the
   funnel extends below signup. The shared recorder now stamps `calculator` and `resultId` from
   the artist's own claimed result.

Lesson worth keeping: a truncated grep is indistinguishable from an absent result. Verify a
"nothing emits this" claim by grepping the symbol with no pipe limit.

### 4.2 A missed promise is never recorded (REPO DRIFT)

`fulfillment_events.status = 'missed'` is read in nine places (`calendarProjection.ts:58`,
`promise-calendar/health/route.ts:69`, `artist/roadmap/route.ts:71`, the calendar components).
**Nothing writes it.** An undelivered promise stays `pending` forever and is only ever rendered as
"overdue" by comparing `due_at` to now at read time.

Two consequences:

- There is no terminal record of a broken promise, so promise reliability cannot be measured over
  time, only sampled at this instant.
- **Lateness is not measured at all.** A grep for `completed_at` near `due_at` returns nothing. A
  promise delivered three weeks late scores identically to one delivered on the day. Since the
  entire retention thesis in `docs/REVENUE_RAMP.md` rests on "a kept promise is a renewed
  subscription", the product does not measure its own core claim.

### 4.3 Tier-level behavior is not measured at all (missing evidence)

`artist_page_visits` is `(artist_id, visit_date, visitor_hash)` and nothing else. There is no
referrer, no tier id, no checkout-start, no session. So:

- Page-level conversion (visits to members) is computable. **Per-tier conversion is not.**
- Which rung fans look at and reject is unknowable, so price and benefit optimization has no input.
- `abandoned_checkouts` is only populated by a Stripe `checkout.session.expired` webhook, which
  means it records people who reached Stripe and stalled. It does not record people who saw the
  tier and never clicked, which is where the overwhelming majority of loss is.

This is the fork that everything else depends on. See Section 11.

### 4.4 The Opportunity never updates after launch

`lead_magnet_results.result_data` is stored at reveal and, per `docs/PROSPECT_NURTURE.md`, is
deliberately never recomputed for email use. `recalcUnified.ts` re-runs the model when the artist
edits the plan, which is correct and is the tightest loop in the product, but it operates on
declared inputs only. Once the artist has 40 real members at real prices, the Opportunity still
says what it said the day they ran the calculator, with the same confidence.

### 4.5 The Revenue Ramp adapts pace but never the curve

`computeRampProgress` derives `behindDays`, `aheadDays` and `projectedTotalDays = 365 + behind -
ahead` floored at 240. That is genuinely adaptive scheduling and it is well done. But `RAMP_PHASES`
percentages (`mrrPct` 0 / .12 / .26 / .52 / .76 / 1) are hardcoded constants, and
`docs/REVENUE_RAMP.md` "Still open" says so plainly. An artist who converts at triple the assumed
rate is told they are behind; one who converts at a third is told they are on track.

### 4.6 Campaign results reach nothing

`campaign_sends` carries `opened_at` and `clicked_at`, populated by `/api/webhooks/resend` and the
tracking pixel at `/api/campaigns/track/[sendId]`. `sequence_conversions` even runs proper
attribution windows per trigger type. **No artist-facing recommendation reads any of it.** The
readers are `admin/email-health`, `admin/metrics`, `admin/agent/scopes` and `cron/lead-scoring`
(which uses it to score *leads*, not to advise *artists*). The Launch Kit writes the campaign and
never learns whether it worked.

### 4.7 Promise health is computed and thrown away

`/api/promise-calendar/health` computes a per-tier Benefit Health Score (completed vs
overdue-or-missed, per tier). Its only consumer is `PromiseCalendar.tsx:107`. It does not reach
Rise Mode, the roadmap, the AI Manager, the tier recommendation, or the strategy card. The one
signal that most directly predicts churn is rendered on a screen the navigation rules
deliberately removed from the Studio grid.

### 4.8 The roadmap cannot regress

`assembleRoadmap` picks `firstOpen`, the first stage with unfinished steps, and `nextStep` is the
earliest unfinished step in that stage. Steps are monotone existence checks. An artist in "Expand"
who is bleeding 30% monthly churn and has three overdue promises will be told: "Add a product or
experience." The roadmap has no concept of a step that was done and has stopped working.

### 4.9 Calculator assumptions are frozen

`getAssumptions()` returns `PRESET_KNOBS[preset]` spread with `RECOMMENDED_TIER_PRICES`,
`TIER_SPLIT`, `STREAMING` and the Pro fee. `reachRate` 0.15 and `superfanRate` 0.03 are the
conservative preset. `docs/UNIFIED_OPPORTUNITY.md` §10 names `clipConversionLift` 0.25 as "the one
number in the model that would most benefit from real CRWN data". Nothing reads real data into any
of them, and there is no code path that could.

### 4.10 The AI Manager loop is real but structurally starved

The one closed loop is gated to the artists least likely to need generic advice (`starter` gets
`generateStarterNudges`, everyone else gets DeepSeek), requires `n >= 2` outcomes per action type,
looks back only 90 days with a 200-row cap, and is currently returning `HTTP 402`.

---

## 5. Unified Opportunity Feedback Design

**Answers to the questions asked, in order.**

- *Should it remain static?* **No, but the model must.** `unifiedOpportunity@1` is versioned and
  covered by 82 invariant tests for a reason: the disjoint-population rule is what makes the total
  provable. Do not make the model adaptive.
- *Should confidence increase over time?* **Yes. This is the whole answer.**
- *Should the Opportunity itself learn?* No. Its **inputs** should be replaced by measurements as
  they become available, one input at a time, and the model re-run unchanged.
- *Should future calculators become more accurate from historical data?* Yes, but at the cohort
  level and only for inputs with enough observations. See Section 12.

**The smallest safe architecture: input substitution, not model change.**

Add one pure function alongside `recalcUnified.ts`:

```
observedInputs(artistId) -> Partial<UnifiedInputs> + per-field observation counts
```

It returns only fields where the artist's own data has crossed a stated threshold:

| Model input | Replaced by | Threshold before substituting |
|---|---|---|
| `superfanRate` | paying members / addressable | >= 30 members and >= 60 days live |
| tier share split (70/22/8) | actual member distribution by price rank | >= 20 paying members |
| `memberAlacarteCents` | real non-subscription ARPU on members | >= 10 member purchases |
| `reachRate` | unique visitors 30d / declared audience | >= 500 unique visitors |
| `currentDirectRevenueCents` | trailing 30-day net from `earnings` | always (already real) |

Then render the result as a **two-column Opportunity**: "What you modeled" beside "What you are
measuring", with an explicit confidence label derived from how many inputs are now observed rather
than assumed. Zero observed inputs is the honest first state, and it is what artists see today
without being told.

This is safe because: the model is untouched, versioned and tested; substitution is monotone (an
input never reverts to assumption once observed); and every substituted field carries its own
sample count, so the artist can see why the number moved.

**Explicitly reject:** re-running the calculator automatically and showing the artist a smaller
number. A number that silently shrinks reads as a broken promise, which is precisely the failure
`recalcUnified` was built to avoid on the other side. Show both columns, always.

---

## 6. Four-Tier Learning System

The four-rung ladder stays. `tierTemplate.test.ts` pins the names and prices and that constraint is
correct. The question is how each rung earns its keep after launch, without a rebuild.

**The unit of learning is the rung, and each rung has exactly one job:**

| Rung | Job | Success signal (measurable today?) | Failure signal |
|---|---|---|---|
| Bronze ($0) | Capture the list | free members / unique visitors | visits with no free joins: a page problem |
| Silver ($10) | First yes | free-to-Silver conversion within 60d | free members pile up, none convert: an offer problem |
| Gold ($25) | Depth | Silver-to-Gold upgrades | Gold empty while Silver grows: a benefit problem |
| Platinum ($100) | The whale | any Platinum member | zero after 180 days: normal, do not alarm |

Of those, **only "any Platinum member" and raw counts per rung are computable today.**
`subsByTier` exists in `/api/analytics`. Free-to-paid conversion timing is derivable from
`subscriptions.created_at` per fan, and upgrades are inferable from a fan's tier history if
subscription rows are updated in place (worth confirming before relying on it: the unique
constraint is `(fan_id, artist_id)`, so an upgrade may overwrite rather than append, which would
make upgrade rate unmeasurable without a new event).

**What to build, in order, and nothing more:**

1. **`tier_events`** (one small table, one event type to start): `tier_card_viewed` and
   `tier_checkout_started`, `(artist_id, tier_id, visitor_hash, occurred_at)`, deduped per visitor
   per day like `artist_page_visits`. This is the missing measurement. It unlocks per-rung
   conversion, price testing, and the whole constraint diagnosis in Section 11.
2. **A tier ledger view**, derived on read, never stored: per rung, per 30 days: views,
   checkout starts, joins, churned, net. Same shape as `opportunity_ledger`'s discipline.
3. **Rung-level recommendations**, deterministic, only when the sample supports it:
   - `views >= 200 && joins == 0` on Bronze: the page is the constraint, not the price.
   - `bronze_members >= 50 && silver_joins == 0` after 30 days: the Silver promise is the
     constraint. Recommend changing the benefit, not the price.
   - `silver_members >= 20 && gold_members == 0` after 60 days: Gold has no reason to exist yet.
     Recommend one specific depth benefit from `benefitCatalog.ts` (available ones only).
   - `checkout_started >= 20 && joins / checkout_started < 0.3`: checkout friction or trust.
     Distinct fix, distinct copy.

**Workload is a first-class output, not an afterthought.** `promisePlan.ts` already computes a
recurring-workload estimate with dedup and inheritance. Feed the measured promise-completion rate
back into it: if an artist completes under 60% of their obligations across two cycles, the correct
recommendation is **to remove a promise**, not to add a tier. That is the five-step pass applied to
the artist's own product, and it is the single most differentiated thing CRWN could do. No
competitor tells an artist to promise less.

---

## 7. Revenue Ramp Feedback Design

Keep the 30 steps, keep the phase structure, keep the pace adaptation. Change one thing: **replace
the assumed curve with the artist's own measured curve once there is one, and never before.**

| Input | Should the ramp adapt to it? | Automatic or founder-defined |
|---|---|---|
| Artist revenue | Yes: the milestone bar already uses `currentMrrCents` | Automatic (already) |
| Artist execution (steps done, late) | Yes: already `behindDays`/`aheadDays` | Automatic (already) |
| Promise completion rate | **Yes, new**: below 60% should block Depth-phase steps | Automatic, threshold founder-defined |
| Fan retention | **Yes, new**: churn above the platform benchmark reorders Retention ahead of Depth | Automatic, threshold founder-defined |
| Tier performance | **Yes, new**: an empty Gold pulls the Gold benefit step forward | Automatic |
| Campaign performance | Only as a step outcome, not a curve input | Automatic |
| Launch cadence, promotion consistency | **No.** Not collected. Do not pretend | n/a |

**The curve itself:** `RAMP_PHASES` percentages stay founder-defined **as the prior**. The
measured replacement is `payerPct` observed at day N for the artist's own cohort, and it should
only replace the constant when the artist has >= 25 paying members and >= 90 days live. Below that
the sample is noise and a personalized curve would be a fabricated number, which the house rule
forbids.

**The one structural change:** phase *order* should be reorderable by constraint, while phase
*content* stays fixed. Today the ramp always runs Foundation, Founding window, Rhythm, Fan engine,
Depth, Retention. If churn crosses the benchmark during Fan engine, Retention steps should be
promoted ahead of Depth. `docs/REVENUE_RAMP.md` already establishes the principle that "the phase
an artist is in is the phase holding their next unfinished step", so this is an extension of an
existing rule rather than a new mechanism.

---

## 8. Promise Calendar Feedback Design

The Promise Calendar is already the best-instrumented part of the product and it is one write away
from being a real measurement engine.

**Fix first (this is a bug, not a feature):**

- **Write `status = 'missed'`.** A daily job (piggyback, do not add a cron: Hobby limit, and
  `vercel.json` has 25 entries) should transition `pending` events whose `due_at` is more than N
  days past to `missed`. N is a founder decision; 14 days is my suggestion. Until this exists,
  every "missed" read in the codebase evaluates to zero forever.
- **Record lateness.** `completed_at - due_at` at completion time. One derived number, no new
  column strictly needed if computed on read, but a stored `days_late` makes trend queries cheap.

**Then the measures, all derivable once the above exists:**

| Measure | Definition | Feeds |
|---|---|---|
| Completion rate | completed / (completed + missed), trailing 90d | Ramp phase order, Rise Mode, tier recommendation |
| Late rate | completed with `days_late > 0` / completed | Workload recommendation |
| Median lateness | days | Cadence recommendation (monthly to quarterly) |
| Per-tier health | already built at `/api/promise-calendar/health` | Which rung to fix |
| Capacity | obligations per month vs completion rate | **Remove a promise** recommendation |
| Fulfillment quality | **Do not measure.** See Section 10 | n/a |

**Where the signals go:**

- **Revenue Ramp:** completion rate below 60% blocks Depth-phase steps and promotes a Retention
  step. Rationale: selling more depth to fans you are already failing accelerates churn.
- **Rise Mode:** an overdue promise outranks every growth mission. This partially exists already
  through `fulfillmentInsights.ts`, which correctly runs for **every** plan tier
  (`cron/ai-manager/route.ts`, the fulfillment block sits outside the tier branch). Extend the same
  precedence to the roadmap's `nextStep`.
- **Offer recommendation:** an artist at 40% completion should be offered a **simpler** ladder, and
  `applyTierTemplate` already supports dropping a rung. `promisePlan.ts` already knows the workload
  cost of each benefit. The two just need to be joined.

---

## 9. Rise Mode Feedback Design

Rise Mode should become the corrective-action engine, and the smallest way to do that is **not** to
make missions adaptive. It is to put one deterministic constraint reading above the mission board.

**Why not adaptive missions:** quest progress is STORED (`quest_instances`, `xp_ledger`,
`user_progression`), the catalog is about to be rewritten for the release strategy (`TODO.md`, "On
Claude's plate"), and the engine is dark. Making mission selection depend on live metrics before
that rewrite compounds two moving parts. `recommendNextQuest` already re-weights side quests by
build and correctly never branches the main spine. Leave that alone.

**What to build instead:**

```
readConstraint(evidence) -> { constraint, confidence, oneAction, why, evidenceShown }
```

A pure function, tested, in `src/lib/constraint.ts`. It runs above the mission board and above the
roadmap's `nextStep`, and when it returns a constraint with sufficient evidence, **it wins**. When
it returns `insufficient_evidence`, the roadmap's existing `nextStep` shows, exactly as today. That
fallback is what makes this safe to ship: on day one for every artist, and for every artist below
the evidence thresholds, nothing changes.

Mapping from the situations named in the brief:

| Situation | Evidence required | The one action |
|---|---|---|
| Low traffic | visits30d < 100 and page complete | Share your link (specific channel from their own socials) |
| Low conversion | visits >= 200, free joins == 0 | Fix the free front door: what a visitor sees first |
| Low paid conversion | free >= 50, paid == 0, 30d | Change the Silver promise (not the price) |
| High churn | churn > platform benchmark x 1.5, n >= 10 | Read your cancel reasons, then keep the next promise early |
| Poor fulfillment | completion < 60%, n >= 5 | Remove a promise (name which one) |
| Missed promises | any overdue | Deliver the oldest overdue promise |
| Weak promotion | 0 campaigns sent in 30d with contacts >= 50 | Send the Launch Kit follow-up |
| High upgrade rate | Gold joins / Silver members > 0.15 | Add the next Gold benefit, raise depth |
| Strong retention | churn < benchmark x 0.5, n >= 10 | Now is when depth pays: add the premium experience |
| Capacity issue | obligations/month > 4 and late rate > 40% | Cut cadence from monthly to quarterly |

The platform churn benchmark **already exists** and is already computed in `/api/analytics`
(`retentionBenchmark`, with a `rating` band). That is cohort learning CRWN already has and does not
use for guidance.

---

## 10. Campaign Learning System

**Measure only what the artist can act on, and only what CRWN actually observes.**

| Metric | Available today? | Keep? |
|---|---|---|
| Sends, opens, clicks | Yes: `campaign_sends`, Resend webhook + pixel | Yes |
| Unsubscribes attributed to a campaign | Yes: `unsubscribe_events` with `source_id` | Yes, this is the most under-used signal in the product |
| Conversions in window | Yes for sequences (`sequence_conversions`); **no for campaigns** | Build: campaigns need the same attribution window |
| Revenue attributed | Partially (`schema-phase2-email-attribution.sql`) | Yes |
| Tier performance from a campaign | No: needs `tier_events` | Build after §6.1 |
| Live attendance | Yes: `live_sessions` | Yes |
| Referrals, share-to-earn | Yes: `referrals`, `referral_earnings` | Yes |
| Content consumption | `play_count`, `play_history` | **Downgrade.** Plays are a vanity proxy; keep for the artist's curiosity, never as an input to a recommendation |
| Campaign ROI | Derivable once campaign conversions exist | Yes, and it is the number that should headline |

**What campaign results should change:** exactly three things, deterministically.

1. **Send time and cadence.** After 3 campaigns, recommend the artist's own best-performing day
   and hour by open rate. Deterministic, needs no model.
2. **Audience.** If unsubscribe rate on a segment exceeds a threshold, recommend narrowing.
   `unsubscribe_events.source_id` makes this a single query.
3. **Whether to send at all.** Below a floor open rate across 3 campaigns, the constraint is list
   quality, not copy, and the correct recommendation is to re-permission rather than to send more.
   This is a genuinely valuable, genuinely unusual recommendation.

**Do not** attempt subject-line learning per artist. The per-artist sample will never support it,
and cohort-level subject learning across artists is a text-modeling problem that returns almost
nothing at CRWN's scale.

**Fulfillment quality: do not measure it.** There is no honest signal. Fan ratings of an artist's
delivered promise would be a scoring surface between an artist and the people paying them, and it
would be gameable, demoralizing, and would make CRWN the judge of an artist's work. Retention is
the quality measure. It is already collected and it is not gameable.

---

## 11. Constraint Diagnosis Framework

**The principle: diagnose in funnel order and stop at the first failing stage.** Downstream metrics
are meaningless while an upstream stage is broken, and recommending a price change to an artist
with nine visitors is how a product loses trust in one screen.

```
1 REACH        visits30d                    -> if < 100: constraint = AUDIENCE. Stop.
2 CAPTURE      free joins / visits          -> if < 2% at n>=200: constraint = PAGE/POSITIONING. Stop.
3 OFFER        paid joins / free members    -> if 0 at n>=50 over 30d: constraint = OFFER. Stop.
4 PRICE        checkout starts / tier views -> if >=0.3 but joins/starts < 0.3: PRICE or TRUST. Stop.
5 CHECKOUT     joins / checkout starts      -> if < 0.5 at n>=20: CHECKOUT/PRODUCT FRICTION. Stop.
6 DELIVERY     promise completion rate      -> if < 60% at n>=5: FULFILLMENT. Stop.
7 RETENTION    churn vs platform benchmark  -> if > 1.5x at n>=10: RETENTION. Stop.
8 DEPTH        gold+platinum share of MRR   -> if < 20% at n>=20 paid: DEPTH/EXECUTION.
   otherwise: no constraint, recommend the next roadmap step (today's behavior).
```

Stages 4 and 5 **cannot be evaluated today**. That is the case for `tier_events` in one line.

**Evidence thresholds are the design.** Every stage carries a minimum n, and below it the stage is
skipped rather than judged. A constraint reading with a small sample is worse than none, because it
sends the artist to rebuild something that was never tested. The function must be able to return
`insufficient_evidence`, and on a brand-new artist it always will, which is correct: a new artist's
constraint is that they have not launched, and the roadmap already handles that case well.

**Confidence must be shown, not implied.** Every reading renders with its own evidence
("18 of your 43 visitors opened a tier, 0 started checkout") so the artist can disagree with it.
An artist who can see the evidence and disagree is being coached. One who cannot is being managed.

---

## 12. Artist vs Product vs Offer: the blame framework

This is the most important safety property in the whole design. CRWN charges a percentage of the
artist's revenue, so a recommendation engine that blames the artist for a product failure is
extracting money for advice while causing the loss.

**Three classes, and a test that separates them:**

| Class | Definition | The distinguishing test |
|---|---|---|
| **Product problem** | The same failure appears across many artists at the same funnel stage | Cohort rate at that stage is bad **platform-wide** |
| **Offer problem** | This artist's structure or price fails where peers succeed | This artist is an outlier **against a matched cohort** |
| **Execution problem** | The artist has not done a thing that is in their control and that measurably works | The action exists, is incomplete, and its completion correlates with improvement |

**Three hard rules:**

1. **Never blame the artist for a stage with no evidence.** Below the threshold, say "not enough
   data yet", never "you need to try harder."
2. **Never blame the artist for a stage that fails platform-wide.** If checkout conversion is bad
   for 80% of artists, that is a CRWN bug and it goes into the founder's queue, not the artist's.
   This requires computing every constraint reading platform-wide as well as per artist, which is
   cheap and should run on the existing daily piggyback.
3. **Compare against a matched cohort, never the platform mean.** Matching dimensions available
   today: audience size band, days since launch, plan, and (once the strategy override migration
   runs) membership strategy. A 200-follower artist compared against a 200k-follower artist
   produces advice that is worse than silence.

**The escalation path this creates is a feature, not overhead.** When a constraint reading is
classified as a product problem, it should write to the founder's queue automatically. That is the
first time CRWN would learn about its own defects from artist behavior rather than from Josh's
live testing, which is how the last nine findings were found (`live-test-sweep-2026-07-31`).

---

## 13. Learning Engine Architecture

Four tiers, in the order they should be built, with an explicit statement of where each stops.

### Tier 1: Founder-defined rules (build now, this is 90% of the value)

Pure functions over the artist's own data with declared thresholds. `readConstraint`, the tier
ledger, the promise measures, campaign cadence. Deterministic, testable, explainable, and
correctable in one file when wrong. Everything in Sections 5 to 11 is Tier 1.

The precedent is already in the repo and it works: `recommendStrategy`, `recommendPlan`,
`buildStarterOffer` and `computeRampProgress` are all Tier 1 and all shipped without a model.
`docs/REVENUE_RAMP.md` states the principle directly: "Adaptive does not have to mean a model."

### Tier 2: Artist-specific learning (build second)

Substituting the artist's own measured rates for assumed constants, per Section 5. Still
deterministic, still explainable. The only new machinery is a per-field observation count and a
threshold table.

### Tier 3: Cohort learning (build third, and only what is asked for)

Two things, and I would build only these:

1. **Matched-cohort benchmarks** for every constraint stage. The pattern already exists:
   `/api/analytics` computes `retentionBenchmark` across up to 5000 platform subscriptions and
   bands the artist against it. Generalize that one function to every stage of Section 11.
2. **Prior calibration**: replace `superfanRate`, `reachRate`, the tier split and
   `clipConversionLift` with platform-observed medians per audience band, once there are enough
   launched artists. This is what makes the *next* artist's calculator better, and it is the moat.

The threshold for a cohort claim should be stated in code, not vibes. `crossArtistPatterns.ts`
currently uses `n >= 2`, which is too low to be called a pattern. **REC:** raise it to 8 for any
cohort figure that reaches an artist, and label anything below that as directional only.

### Tier 4: Predictive intelligence (do not build)

**Reject for now**, and the reason is not caution, it is arithmetic. Prediction earns its keep when
a rule cannot express the relationship. Every relationship in this report is monotone and has an
obvious threshold. Churn prediction, next-best-action ranking and price optimization at CRWN's
current artist count would fit noise and would be unexplainable, which breaks rule 3 of Section 12
(the artist must be able to see the evidence and disagree).

**Where an LLM is genuinely right:** turning a deterministic reading into artist-specific language,
and reading free-text (`cancellation_reasons.freeform`, survey freeform, support chat) into
categories. The AI Manager already does the first. The second is unexploited and is the one place
where a model beats a rule, because there is no rule for reading prose.

**Where the AI Manager is currently wrong:** it decides *what* to say. It should decide *how* to
say what `readConstraint` decided. That inversion makes the advice correct when the LLM is down,
which today it is.

---

## 14. Data Moat Strategy

The moat is not the volume of events. It is **outcome-labeled launch data**, and CRWN is one of
very few products positioned to have it, because it observes the entire chain from a stranger's
follower count to a fan's recurring charge, on one platform, with money as the label.

What compounds, and how:

| Asset | Year 1 | Year 3 | Why nobody else has it |
|---|---|---|---|
| Audience-band to paying-conversion curves | replaces `reachRate`/`superfanRate` guesses | segmented by genre, band, strategy | Patreon sees conversion but not the pre-launch audience; distributors see audience but not conversion |
| Tier-price elasticity per band | first honest answer to "what should I charge?" | per-genre price recommendation at wizard time | requires per-tier view data, which is why §6.1 is the keystone |
| Promise-to-retention coefficients | "artists who keep 80% of promises retain 2x" | cadence recommendations per benefit type | nobody else models promises as first-class objects |
| Launch-sequence effectiveness | which of the 30 ramp steps actually correlate with revenue | the ramp curve becomes measured, and steps that do not correlate get DELETED | CRWN owns both the plan and the outcome |
| Calculator calibration | model version 2, honest to real data | each cohort makes the next artist's first estimate better | the calculator is the top of the funnel AND the product's plan |

**The compounding mechanism is one sentence:** every launched artist labels a set of pre-launch
inputs with a post-launch outcome, and the calculator that produced those inputs is the same
calculator the next artist runs. That is a closed loop with money as the label, and it gets
strictly better with every artist, which is exactly what a moat is.

**Two things would destroy it, so state them now:**

- Storing derived values instead of deriving on read. The repo's existing discipline (roadmap,
  strategy, plan, starter offer all derived) is what will let the model be corrected retroactively.
  Keep it.
- Pooling `resultVersion` across model versions. `docs/UNIFIED_OPPORTUNITY.md` §8 already caught
  this once with `unifiedOpportunity@1`. Every calibration dataset must carry the model version
  that produced it or the history becomes unusable.

---

## 15. Feedback Placement Recommendations

**Do not build a dashboard.** `/studio/analytics` already exists, is rich, and per `CLAUDE.md`'s
navigation rules was deliberately pulled out of the Studio grid because it is a reference screen,
not a work screen. Adding insight to a screen artists visit when they are already curious does
nothing for the artists who are not.

Ranked by probability the artist acts:

| Rank | Placement | Why | What goes there |
|---|---|---|---|
| 1 | **Rise Mode next-action slot** (`RoadmapCard` above `RiseMode`) | It is the artist's landing screen and the one place they already look for "what now" | The single constraint reading with one action and its evidence. Replaces `nextStep` when confidence is sufficient |
| 2 | **Monday email** (`cron/weekly-report` exists at `0 14 * * 1`) | The only channel that reaches an artist who has stopped opening the app, which is exactly the artist a feedback loop must reach | One constraint, one action, one link. Not a metrics digest |
| 3 | **Promise Calendar** | The artist is already there with the intent to deliver | Completion rate, per-tier health (already computed), the "remove a promise" recommendation |
| 4 | **In-context, at the moment of the decision** | Highest conversion, lowest reach | Per-rung conversion on the tier editor; open rate on the campaign composer; "your last 3 sends did best on Thursday" |
| 5 | **Notification bell** | Already exists, already rate-limited | Only state changes: a promise went overdue, churn crossed the benchmark |
| 6 | **Launch Review** | One-time screen | Nothing new. It is pre-launch; there is no evidence yet by definition |
| 7 | **Analytics** | Reference | Everything, unchanged. It is the place to go deeper after a reading, not the place to discover one |

**Not recommended:** mobile push (no push listener exists in `public/sw.js`, and building one for
insight delivery is a large cost for a marginal channel), a new "Insights" destination (it would
violate the navigation rule that Studio holds work destinations and the hamburger holds the
complete index), and any new pop-up (the Pop-up Engine caps at one per user per day and that budget
should stay reserved for announcements).

**The governance rule that must hold:** a constraint reading is not an interruption, it is the
content of a screen the artist chose to open. It must never become a pop-up or a notification
except on a genuine state change, or it burns the one-per-day cap the interruption governor exists
to protect.

---

## 16. North-Star Metrics

**Explicitly rejected** (per the brief, and each is already reachable in the admin panel, which is
where they should stay): accounts created, onboarding completed, pages published, tracks uploaded,
followers, likes, plays. Every one of them can rise while the business does nothing. `play_count`
in particular should never feed a recommendation.

**The hierarchy:**

### North star (one number)

**Artist Recurring Revenue Retained: total MRR across all artists, net of churn, trailing 30 days.**

It is a single number that cannot be gamed by activity. It rises only when artists acquire paying
fans and keep them, and CRWN's own revenue is a fixed percentage of it. Alignment is structural
rather than aspirational.

### Tier 1: the two inputs (weekly)

1. **Activated artists**: artists with >= 1 paying member and >= 1 delivered promise in the last 30
   days. Both halves matter. A paying member with no delivered promise is churn that has not
   happened yet.
2. **Net revenue retention per artist cohort**: does an artist's MRR grow month over month after
   launch. This is the number that says whether the product compounds.

### Tier 2: the diagnostic five (the constraint stages, platform-wide)

Visits to free join. Free to paid. Checkout start to join. Promise completion rate. Monthly churn
versus the benchmark. **These are the same five that drive the per-artist constraint reading**, so
one function serves both the artist's guidance and the founder's roadmap. That is the deepest
design point in this report: the founder's metrics and the artist's coaching should be the same
computation at two aggregation levels, or they will drift.

### Tier 3: leading indicators (watch, never target)

Time from signup to first paying member. Promise lateness median. Campaign unsubscribe rate.
Calculator-to-first-dollar rate per tool (blocked today by §4.1).

### Explicitly not a north star

Artist retention on the CRWN platform. It is a lagging consequence of the north star and targeting
it directly invites lock-in tactics over value. If artists make money and keep fans, they stay.

---

## 17. Closed Loop Audit Table

| System | Evidence produced | Decision influenced | Who uses it | What changes | Loop closed? |
|---|---|---|---|---|---|
| Calculator | `lead_magnet_results.result_data`, funnel stages 1-6 | ramp target, roadmap goal, tier projections, plan recommendation | artist (indirectly), founder | the artist's target number | **No.** Outcomes never revise the assumptions |
| Unified Opportunity | `unifiedOpportunity@1` payload, 3 analytics events | builder prefill, launch sequence | artist | the plan they build | **Partial.** `recalcUnified` closes the edit loop; nothing closes the outcome loop |
| Four-Tier Builder | tiers, `tier_benefits`, `builder_published` | what fans can buy | artist, fans | the offer | **No.** No per-tier performance exists |
| Artist Launch Wizard | `setup_completed`, obligations, workload estimate | promise schedule | artist | the calendar | **No.** Workload estimate is never compared to actual |
| Promise Calendar | `fulfillment_events`, per-tier health score | AI Manager fulfillment insight, roadmap fact | artist, AI Manager | an urgent nudge | **Partial.** Health computed, only one consumer, `missed` never written |
| Revenue Ramp | 30 dated steps, `behindDays`, `projectedTotalDays` | next action, projected finish | artist | pace estimate and next step | **Partial.** Pace adapts; the curve never does |
| Rise Mode / Quests | `quest_instances`, `xp_ledger`, 2 funnel stages | next quest | artist | the mission board | **No**, and dark. `recommendNextQuest` reads only quest state |
| Roadmap | derived stages, `nextStep`, real member/MRR stats | the one next move | artist | command screen | **Partial.** Reads state, never performance; cannot regress |
| Campaigns | `campaign_sends` opens/clicks, `unsubscribe_events` | nothing artist-facing | founder, lead scoring | nothing for the artist | **No** |
| Sequences | `sequence_sends`, `sequence_conversions` with windows | sequence reporting | artist (view only) | nothing automatic | **Partial** |
| Analytics | MRR, ARPU, LTV, churn, cohorts, benchmark, cancel reasons, NPS | AI Manager prompt via `collectArtistData` | artist (if they visit), AI Manager | insights, if Pro and if DeepSeek is funded | **Partial** |
| AI Manager | `ai_insights`, `artist_agent_actions` + `outcome_delta` | next generation prompt, cross-artist patterns | artist, all artists | what the agent suggests next | **YES.** The only fully closed loop |
| Experiments | `experiment_events`, variant-attributed outcomes | which experience ships | founder | product decisions | **Closed to founder only** |
| Opportunity Ledger | revealed / activated / captured / remaining | admin rollups | founder | nothing automatic | **No** |
| Funnel events | 18 of 20 stages | admin dashboards | founder | nothing automatic | **No**, and the money-close stages are dead |
| Artist Dashboard | n/a | n/a | artist | n/a | It is a renderer, not an evidence system |

---

## 18. Highest-Priority Open Loops

Triaged by the CLAUDE.md definition: what fails worst if ignored, where critical means blocks
artist acquisition or breaks money flows.

**P0 (breaks the money loop or the acquisition decision)**

1. ~~**Emit `stripe_connected` and `first_paid_conversion`.**~~ **DONE 2026-08-03, and the premise
   was wrong** (see §4.1). Both already emitted. What was actually missing and is now fixed: 4 of
   6 paid rails were unwired, and the event carried no calculator attribution, so it could not be
   joined back to the funnel it exists to close.
2. ~~**`tier_events`: tier card viewed and checkout started.**~~ **DONE 2026-08-03.** Table +
   migration (`supabase/schema-phase2-tier-events.sql`), server recorder, view beacon at half-card
   visibility, checkout start recorded server-side at the Stripe session boundary, and a derived
   reader. Still the keystone: constraint stages 4 and 5 become evaluable once data accumulates.

**P1 (real risk, nothing on fire)**

3. ~~**Write `fulfillment_events.status = 'missed'` and record lateness.**~~ **DONE 2026-08-03.**
   `MISSED_GRACE_DAYS = 14` (one constant, founder-adjustable), swept daily on the existing 6am
   cron, lateness derived from `due_at`/`completed_at` with no new column.
4. **`readConstraint()` plus the Rise Mode slot.** The pure function and one render. Safe because
   it falls back to today's `nextStep` on insufficient evidence. **This is now the next task.**
5. **Route campaign and promise evidence to the artist.** Both are already computed. This is
   plumbing, not new measurement: `/api/promise-calendar/health` to Rise Mode, campaign open and
   unsubscribe rates to the composer.

**P2 (compounding, not urgent)**

6. Observed-input substitution in the Opportunity (Section 5).
7. Matched-cohort benchmarks generalized from the existing `retentionBenchmark` function.
8. Measured ramp curve, gated behind the n >= 25 / 90-day threshold.
9. Raise the `crossArtistPatterns` sample floor from 2 to 8.

---

## 19. Smallest Safe Implementation Roadmap

Each phase is independently shippable, independently reversible, and leaves the product correct if
the next phase never happens. Applying the five-step pass to the roadmap itself: phases 0 and 1 are
mostly *deletion and repair* of things already half-built, which is why they come first.

### Phase 0: close what is already declared (no new concepts) — SHIPPED 2026-08-03

- ~~Emit the two dead funnel stages.~~ They were never dead. Instead: all six paid rails now
  emit `first_paid_conversion` through one shared recorder, stamped with the artist's calculator.
- Write `missed`; derive lateness. Done, on the existing 6am cron.
- Raise the cross-artist sample floor. **NOT done, deliberately deferred**: it changes what the AI
  Manager says, which is recommendation behavior and out of scope for an evidence-layer task.
- **Founder-blocking:** none. No migration. No env var.

### Phase 1: one new measurement — SHIPPED 2026-08-03

- `tier_events` table plus beacon. Migration required and self-verifying, per the house rule.
- Derived per-rung reader, no storage.
- **Founder-blocking:** one migration to apply (`supabase/schema-phase2-tier-events.sql`).
- **Note:** the reader exists as an API, and no artist-facing surface renders it yet. That is
  intentional. Building the screen before the constraint reading exists would be the dashboard
  §15 argues against.

### Phase 2: the constraint reading — SHIPPED 2026-08-03

Built as specified below, with two deliberate departures, both explained in
`docs/crwn-brain/CHANGELOG.md`: the evaluation order puts fulfillment and retention FIRST
(protecting revenue already earned outranks winning revenue not yet earned), and launch
readiness is delegated entirely to the Roadmap rather than re-derived. Thresholds live in
`src/lib/constraint/thresholds.ts`. The card renders nothing unless a diagnosis clears its
evidence bar, so the default experience is unchanged.

### Phase 2 as originally specified

- `src/lib/constraint.ts`, pure, tested, with explicit thresholds and an
  `insufficient_evidence` return.
- `/api/artist/constraint`, derived on read, storing nothing, reusing `evaluateCondition` and the
  existing analytics computations rather than re-querying.
- Rendered in the Rise Mode next-action slot; falls back to `nextStep`.
- **Founder-blocking:** the threshold table needs founder sign-off (Section 20).
- **Ships value alone?** Yes, and it is the phase that changes artist behavior.

### Phase 3: route existing evidence to existing surfaces

- Promise health to Rise Mode and to the tier recommendation.
- Campaign performance to the composer.
- Constraint reading into the Monday email.
- **Ships value alone?** Yes. Pure plumbing, no new evidence.

### Phase 4: platform-wide constraint reading and the blame separator

- The same function at platform aggregation, per Section 12 rule 2.
- Product-classified constraints escalate to the founder queue automatically.
- **Ships value alone?** Yes, to the founder: it is CRWN's first automated defect detector.

### Phase 5: observed-input substitution and matched cohorts

- Only after phases 1 to 4 have run long enough to have samples.

**Explicitly deferred until the loop is proven:** any predictive model, per-artist subject-line
learning, adaptive quest selection, and automating any corrective action. Step 5 of the five-step
pass is automate, and it is last for a reason: automating a corrective recommendation before the
recommendation has been observed to be right would let one bad threshold act on every artist at
once.

**Sequencing dependency worth naming:** the Quest Engine catalog rewrite (`TODO.md`, next up)
should land before Phase 2 renders anything inside Rise Mode's mission board. The constraint slot
sits *above* the board and does not touch quest state, so the two are compatible, but shipping them
in the wrong order would mean touching `RiseMode.tsx` twice.

---

## 20. Founder Decisions Required

Ordered by what blocks the most work.

1. **The threshold table.** Every number in Section 11 is a founder call, not a technical one. My
   suggested starting values, all changeable in one file: 100 visits for reach, 2% capture, 50 free
   members and 30 days for offer, 60% promise completion, 1.5x benchmark for churn, 20 paying
   members for depth. Wrong thresholds are recoverable; absent ones block Phase 2.

2. **Days overdue before a promise is `missed`.** I suggest 14. This determines how quickly the
   product tells an artist they broke a promise, and there is a real tension: too short is
   punishing, too long makes the signal useless.

3. **Should CRWN ever tell an artist to promise less, and to drop a tier?** This is the most
   valuable and most counter-intuitive recommendation in the design, and it reduces the artist's
   short-term revenue to protect their retention. It needs an explicit yes.

4. **Does `CLAUDE_PROMPT_FRAMEWORK.md` exist elsewhere?** It is referenced in the brief and is not
   in the repository or its history. If it exists outside the repo it should be committed, because
   this report was written against `CLAUDE.md`'s framework instead and any divergence is
   unaccounted for.

5. **Cohort comparison consent.** Matched-cohort benchmarks mean showing an artist how they compare
   to peers. `/api/analytics` already does this in aggregate (`retentionBenchmark` exposes
   `totalArtistsOnPlatform`). Narrower cohorts get closer to identifying individuals, and that line
   should be drawn deliberately before Phase 5, not discovered afterward.

6. **DeepSeek balance** (already in `TODO.md` as P1). Not a decision so much as a dependency: the
   only closed loop in the product is currently returning 402, and Section 13's inversion (the LLM
   phrases, the rules decide) is what makes that failure non-fatal in future.

---

## 21. Final Recommendation

**Do not build a learning system. Build one function and one slot.**

CRWN's problem is not that it lacks evidence. It has more real, refund-netted, dedup-guarded
evidence than most Series A products. Its problem is that the evidence has exactly one destination,
the admin panel, and the artist's daily screen is driven by three deterministic functions that
cannot see any of it.

The whole architecture reduces to one change of direction:

> Today: artist actions produce evidence, evidence flows to the founder, the founder changes the
> product.
>
> Should be: artist actions produce evidence, evidence flows back to the artist as one corrective
> action, and the same computation at platform aggregation flows to the founder as a product
> defect.

One function computes both. That is what keeps the artist's coaching and the founder's roadmap from
drifting apart, and it is what makes CRWN's guidance improve without a model.

Three properties make this safe to ship into a live product:

1. **It falls back to today's behavior.** `insufficient_evidence` renders the existing `nextStep`.
   On day one, for every artist, nothing changes.
2. **It is deterministic and explainable.** Every reading shows the evidence that produced it, so an
   artist can disagree. That is the difference between coaching and managing, and it is what stops
   CRWN from blaming an artist for a CRWN defect.
3. **It stores nothing.** Derived on read, like the roadmap, the strategy, the plan and the starter
   offer already are. Every threshold stays correctable retroactively, which is the property that
   turns a year of launches into a calibrated model rather than a year of frozen guesses.

Everything else in this report is downstream of that, and the cheapest first move is not any of it:
it is the two missing `recordFunnelEvent` calls that would let CRWN finally see which of its
eighteen calculators produces artists who get paid.
