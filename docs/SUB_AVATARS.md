# The four sub-avatars: acquisition, measurement, and the feedback loop

Shipped 2026-08-03. The founder-approved segmentation of the CRWN ICP (docs/ICP.md: a proven
direct-to-fan seller with a fragmented stack) into four acquisition journeys, each with its own
entry calculator, builder path, onboarding emphasis, nurture module, and cohort report. The goal
metric is stated up front: **which avatar produces the highest retained economic value**, not
which produces the cheapest views or signups.

Labels used: **Implemented** (verified in code), **Deferred** (named follow-up), **Founder
decision** (needs Josh), **Not measured** (no trusted source exists; reported as such, never
zero-filled).

## 1. The taxonomy (Implemented)

`src/lib/avatars/taxonomy.ts`, version `subAvatar@2`, pinned by `taxonomy.test.ts`. These are
IDENTITY segments (priority tier, operating maturity, genre), which is why all four share ONE
calculator: who the artist is decides the framing, the question order, the first offer and the
cohort, while the money model stays the single unified model that refuses to double-count.

**ORDER IS PRECEDENCE.** These segments deliberately overlap (a large R&B seller qualifies as
both an R&B Empire Builder and a highest-priority lead), and a lead counted in two cohorts
corrupts every comparison. Exactly one primary is assigned, ties break toward the earlier entry,
and the runner-up is reported as secondary. Reordering the array is the only change needed to
reorder precedence, and it is a **founder decision**.

| # | id | Label | First CRWN offer |
|---|---|---|---|
| 0 | `highest_priority_empire_builder` | Highest Priority Empire Builder | The full four-tier ladder, launched to buyers who already pay |
| 1 | `established_independent_operator` | Established Independent Minded Operator | A membership built from the catalog and audience already in hand |
| 2 | `brand_led_hip_hop_artist` | Brand-Led Hip-Hop Artist | A membership fed by the content engine |
| 3 | `rnb_empire_builder` | R&B Empire Builder | A depth-first membership: the vault plus a members-only experience |

**Every avatar's front door is the all-in-one calculator** (founder decision, 2026-08-03):
`/tools/opportunity-calculator?from=<avatar id>`. The existing `entryContexts` mechanism leads
with that avatar's questions and shows its note; it REORDERS only, never adding or dropping a
question, so all four cohorts run the identical model off identical inputs. The individual
single-opportunity calculators (vault, live, fan-stack, between-tour, and the rest) still exist
in the tools directory and can still carry `?from=` links; they are simply no longer the
avatar-defining front doors, and a `?from=` naming a TOOL is a topic, not an identity claim.

### Version history

`subAvatar@1` (2026-08-03, retired the same day) was a pain-based taxonomy keyed to four separate
entry calculators: Membership Stack Consolidator, Touring Access Seller, Live Community Creator,
Catalog and Vault Seller. It was replaced before any data accumulated, and safely, because the
avatar was never stored on an event: it has always been re-derived at read time. The migration's
CHECK constraint is dropped and recreated rather than added-if-absent, so re-running it is safe
whether or not the v1 version ever ran.

## 2. Deterministic assignment (Implemented)

`src/lib/avatars/assignment.ts`, pure, no LLM, tested. Because all four avatars share one
calculator, assignment is built on the ANSWERS, not on which tool was run.
`assignSubAvatar(evidence)` scores three evidence classes, each point paired with a
human-readable line:

- **acquisition_path** (+3): the `?from=` avatar funnel they arrived through. A strong declared
  signal, deliberately not decisive, so answers that plainly disagree can outvote the hypothesis
  the content made about them.
- **declared**: audience against the ICP Tier 1 floor (250k) crossed with proven direct sales,
  real supporter counts or real monthly direct revenue, platform count, years releasing or
  catalog depth, genre family, video output, fan promotion, unreleased count, live willingness.
- **behavioral**: Patreon-tagged imports, live sessions hosted, member-gated tracks.

Rules: a valid `manualOverride` wins outright; below 2 points there is NO assignment; ties break
by declared precedence; confidence is score-banded (2 to 3 low, 4 to 5 medium, 6+ high).
**Genre alone is never enough** to call someone brand-led or an empire builder: the content
engine or the depth inventory is what makes the claim assignable, which is why genre scores 2
rather than 3.

**Two questions, two answers, never merged.** `deriveAcquisitionAvatar()` is which content
brought them (the first avatar link they ever clicked, pure and storage-free);
`assignSubAvatar()` is who they appear to be now. `GET /api/artist/avatar` reports both side by
side, and the acquisition avatar is never overwritten by later behavior.

Storage (migration `supabase/schema-phase2-sub-avatar.sql`, fail-soft until applied):
`artist_profiles.sub_avatar_override` (manual override, CHECK-constrained to the four ids, no
client column grants by design) and `sub_avatar_audit` (override history: previous, next,
source, actor, timestamp). `POST /api/artist/avatar` sets the owner's override and writes the
audit row; pre-migration it answers `409 { pending: true }`.

## 2b. How the shared calculator serves four avatars (Implemented)

- **One new question.** `genre_family` (hip-hop / R&B / something else), on its own opening step.
  It is **not required**: the calculator's standing invariant is that an artist can reach a real
  result from one number, so an unanswered genre reads as `other` rather than blocking the
  funnel. It never touches the money model, exactly like `monetization_status`.
- **Four entry contexts**, keyed by avatar id, each with its own priority step order and note.
  A test asserts every avatar has one, that its priority steps are real step ids, and that the
  reorder never changes which questions get asked.
- **The `?from=` value is persisted** (`crwn_entry_avatar`, first-touch discipline) and rides
  every analytics beacon, so the cohort survives a multi-page visit rather than living in one URL.
- **It is stored server-side** on the result row under the reserved key `_entry_context`
  (validated against the taxonomy at the capture route), which is what carries the acquisition
  cohort past signup as server-side truth.

## 3. The single-opportunity calculators (Implemented, no longer avatar front doors)

Two calculators were built for the retired v1 taxonomy and are KEPT, because they are honest,
tested, and cost nothing to leave in the 19-tool directory. They are ordinary registry entries
inheriting the public page, wizard, server-side recompute, tokenized result, result email,
nurture, claiming, funnel events and the journey resolver. They can still carry `?from=` links
into the all-in-one calculator, and both are declared as tool entry contexts there.

### 3.1 Fan Stack Consolidation Calculator (`fan-stack-calculator`)

Model: `src/lib/avatars/fanStackModel.ts`, version `fanStack@1`, tested. Inputs: platforms used,
monthly tool cost, paid members elsewhere, average revenue per paying fan, other direct monthly
revenue, audience, monetization status. Formula:

- `migratedMembers = paidMembers x migrationRate (0.6; scenario band 0.4 / 0.6 / 0.8)`
- `perFanUplift = migratedMembers x max(0, ladderArpu - currentArpu)` where ladderArpu is the
  70/22/8 split priced off `RECOMMENDED_LADDER` (about $20.50/mo), so an artist already earning
  more per fan is claimed zero uplift
- `memberAlacarte = migratedMembers x $3` (unified-model constant)
- `newPayers = max(0, min(reachable x superfanRate, reachable x maxConversion) - paidMembers)`
  at the entry tier price; reach/superfan/cap rates reuse the leadCalculator conservative preset
- **Headline = uplift + a-la-carte + new payers.** Tool-cost reduction is a separate tile and
  is never summed into revenue. Existing revenue is context, never claimed as new. Nothing
  claims CRWN replaces every platform, and nothing migrates a member automatically.

### 3.2 Between-Tour Revenue Calculator (`between-tour-calculator`)

Model: `src/lib/avatars/betweenTourModel.ts`, version `betweenTour@1`, tested. Inputs: shows per
year, average attendance, VIP buyers per show, average VIP spend, off-months, audience,
monetization status. Formula:

- `uniqueAttendees = shows x attendance x (1 - repeatAttendance 0.3)`; VIP buyers deflate by the
  same factor and are a subset, subtracted before attendee conversion runs (no double count)
- `members = min(vipBuyers x vipConversion (0.25; band 0.15 / 0.25 / 0.4) + nonVipAttendees x
  0.005, cap)` where cap = 10% of max(reachable audience, unique attendees)
- `recurring = members x Gold price ($25/mo from RECOMMENDED_LADDER)`; VIP spend is context and
  proof, never multiplied into the recurring figure
- One paid livestream per off-month sold **only to reachable non-members** (Live Experience
  rates), averaged across the year. Members and ticket buyers are disjoint by construction.

### 3.3 The other calculators (verified, unchanged)

- `live-experience-calculator` and `executive-producer-session` keep their ticket/seat models and
  their builder specs (concept, ticket, replay, run of show; seats + access rules).
- `vault-revenue-planner` keeps its readiness/plan result. Known pre-existing wart, documented
  rather than hidden: its WEB result runs `resultGenerators.vaultRevenuePlan` while its DM adapter
  runs `buildLossResult`, the one slug where the web/DM parity guarantee does not hold. Unifying
  them is **Deferred**: both outputs are honest.
- All 17 pre-existing tools are untouched by this work.

## 4. The journey (Implemented, one shared path, four framings)

```text
avatar entry link  /tools/opportunity-calculator?from=<avatar id>
-> the all-in-one wizard, question order led by that avatar's entry context + note
-> ONE unified model (unifiedOpportunity@1), identical inputs for all four cohorts
-> result (hero range, derivation chain, scenarios, assumptions, estimate disclaimer)
-> ResultToBuilder -> DeliverableBuilder `crwn_business_system` spec: the four-tier ladder,
   growth systems, premium experience and launch order, with recalcUnified re-running the model
   on the artist's own edits
-> email-my-results (capture stores the avatar as `_entry_context` beside the answers) /
   save boundary (unclaimed lead_magnet_results row, 30-day token)
-> signup -> auto-claim derives the avatar from those stored answers and stamps it on
   account_created / email_verified
-> setup wizard: "Your CRWN plan is saved" speaks the avatar's promise; the ladder opens on
   THEIR prices with THEIR projected buyers; catalog-led avatars default to the project path
-> tier create via applyTierTemplate (Promise Calendar seeds), Stripe in-wizard, launch review
-> post-launch: buildStarterOffer reframes the SAME offer per avatar (audience line and reason
   only, never the offer, price or benefits); revenue ramp targets their own number
-> measurement: funnel_events spine + tier_events (views, checkout starts) +
   first_paid_conversion (all six rails) + opportunity_ledger (refund-netted)
-> admin Avatars tab: cohort comparison + deterministic largest-drop constraint
```

## 5. Measurement definitions (Implemented unless noted)

- **Qualified lead**: `calculator_completed` in `funnel_events` (unique identity per cohort
  window). Lead scoring's `sales_priority` remains the sales-qualification overlay.
- **Calculator completion / email capture / account creation / setup**: the existing 20-stage
  `funnel_events` spine, deduped at the DB.
- **Stripe connection**: `stripe_connected`, emitted only on live `charges_enabled` (already
  server-derived; verified, unchanged).
- **Offer/tier viewed and checkout started**: `tier_events` (`tier_card_viewed`,
  `tier_checkout_started` at the Stripe session boundary). This IS the canonical checkout-start
  definition for fan money. A platform-plan checkout-start event does not exist (Not measured;
  out of scope, it is CRWN revenue not artist revenue).
- **First paid conversion / revenue activation**: `first_paid_conversion`, idempotent per artist,
  emitted from all six paid rails in the webhook, stamped with the artist's calculator (verified,
  unchanged).
- **Artist GMV / CRWN revenue, refund-netted**: `opportunity_ledger.captured_cents` (earnings
  net of refunds), attributed by the ARTIST's resolved avatar. Deliberately not by calculator:
  every avatar now runs the same calculator, so a calculator-keyed rollup would put all four
  cohorts' money in one pile.
- **Product activation**: paid tier live + Stripe usable + page launched, already derivable via
  the Quest Engine DomainChecks and the roadmap; the cohort tab reports `setup_completed` and
  `stripe_connected` per avatar. Fifth paid fan / first $100 / first $1,000 are **Deferred**
  reporting milestones (no event exists yet; do not fake them from row counts).
- **Retention / churn / referral / CAC / net contribution at cohort grain**: **Not measured**,
  and the admin tab says so explicitly with the reason each lacks a trusted source. Contribution
  is never substituted with revenue.
- **Projected vs realized**: projections live only in calculator results and are never rendered
  in the cohort report; the report is realized-only by construction.

## 6. Attribution (Implemented)

Because all four avatars share one calculator, the `calculator` dimension can no longer separate
their cohorts. Three mechanisms carry the avatar instead, in this order of trust:

1. **Stamped on the event.** `funnel_events.metadata.subAvatar`, written by the analytics mirror
   for every anonymous top-of-funnel stage and by auto-claim for the two account stages. The
   client-sent value is VALIDATED against the taxonomy server-side, so a hostile body cannot
   invent a cohort.
2. **Stored beside the answers.** The capture route writes the validated `?from=` avatar to
   `lead_magnet_results.input_data._entry_context`, which is what makes the acquisition cohort
   server-side truth that survives signup.
3. **Resolved per identity.** The cohort report resolves each artist or user once from their own
   stored answers, covering every post-signup stage emitted by routes that know nothing about
   avatars. Identity resolution never overrides a stamp, so a cohort cannot gain members halfway
   down its own funnel.

Also: **first-touch UTM persistence** (`crwn_first_touch`) and **avatar entry-context
persistence** (`crwn_entry_avatar`), both first-touch: current-URL values win, the snapshot fills
silence. Experiment attribution is unchanged (`crwn_aid` + server-side variant re-derivation);
avatar-specific experiment experiences are **Deferred** until there is a variant worth testing.

## 7. Cohort reporting + the feedback loop (Implemented)

- `GET /api/admin/avatar-cohorts` (admin-gated like its siblings): per avatar, the 12-stage
  spine with unique-identity counts, stage-to-stage conversion, accounts created, 30/60/90-day
  maturity split, first-paid artists, median days to first paid, refund-netted GMV, a per-cohort
  sample warning under 30 completed calculators, and the row-cap truncation flag. Rendered by
  the admin **Avatars** tab (`AvatarCohortsView`).
- `readCohortConstraint()` (`src/lib/avatars/cohortConstraint.ts`, pure, tested) finds the
  largest observed proportional drop between adjacent measured stages. House rules from the
  Constraint Engine apply: below `COHORT_MIN_SAMPLE` (30) there is no diagnosis; null counts are
  silence; a downstream count exceeding its upstream refuses to diagnose; output names an
  INVESTIGATION ("Investigate offer clarity, benefit strength, pricing presentation...") and
  never a causal verdict. Admin-only; nothing reaches an artist.

### 7a. Genre is a DIMENSION, not a fifth cohort (Implemented 2026-08-04)

The scorer's qualification bar (large audience plus proven direct sales, 7 points) reliably
outscores every genre segment, so **every big seller lands in Highest Priority Empire Builder
whatever they make**, and the genre cohorts quietly become "artists who did not qualify as big
sellers". Comparing cohort revenue would then answer "which cohort holds the biggest artists?"
(tautologically, the one defined that way) rather than "which content works?".

Genre and priority are orthogonal, so genre cuts each cohort instead of competing with it:

- `buildGenreBreakdown()` (`src/lib/avatars/cohortGenre.ts`, pure, tested) returns all four genre
  rows in fixed order per cohort: identities, first-paid artists, refund-netted GMV, and a
  within-genre first-paid rate that is **null below 5 identities** rather than a noisy percentage.
- **`other` and `unknown` are never merged.** `other` means the artist told us a genre outside the
  two families; `unknown` means they never told us (every anonymous row, plus anyone who skipped
  the optional question). Folding them would report an absence as a measured result.
- One identity is counted once however many events it produced, and an artist row and its owning
  user are canonicalized to ONE person so nobody is double-counted.
- `?genre=` filters the whole report. Genre costs no extra query: it is read from the same stored
  answers the identity resolution already loads.

The question this makes answerable, which the cohorts alone could not: *did the empire-builder
funnel bring more hip-hop or R&B artists, and which of them converted better?*

## 8. Nurture and post-launch recommendations (Implemented)

One universal prospect-nurture core sequence, personalized by AVATAR rather than by slug, since
all four avatars now run the same calculator and the slug alone would give every one of them
identical copy. `moduleFor(slug, subAvatar?)` prefers the avatar module; the nurture cron derives
the avatar from the enrollment's stored result. The two single-opportunity tool modules remain
for leads who ran those tools directly. Consent, suppression, dedup, idempotent sends and
exit-on-signup are inherited unchanged. Four separate sequence systems were deliberately NOT
built; the module layer is the architecture.

`buildStarterOffer` takes an optional `subAvatar` and reframes the SAME recommended offer per
avatar: the audience line and the reason change, never the offer, the price or the benefits. A
recommendation can therefore never cost an artist money because a segment guess was wrong.

## 9. How to add a future avatar safely

1. Add the avatar to `SUB_AVATARS` (position in the array IS its precedence) with its entry
   context, priority steps, note, nurture themes and post-launch focus.
2. Add the matching `entryContexts` entry to the all-in-one calculator in the lead-magnet
   registry, using the avatar id as the key. Tests assert both halves exist and agree.
3. Add its nurture module (`AVATAR_MODULES`) and, if the framing differs, its `AVATAR_FRAMING`
   entry in `starterOffer.ts`.
4. Bump `SUB_AVATAR_TAXONOMY_VERSION`, and update the migration's CHECK constraint (it is
   drop-and-recreate, so re-running the same file is safe).
5. Never rename a live id once data exists under it. Renaming is only free while nothing has
   accumulated, which is exactly why v1 to v2 was safe on its first day and would not be later.

## 10. Founder decisions

**SETTLED 2026-08-04: the precedence order stays as declared.** Verified against the real scorer
rather than assumed: a big R&B seller scores Highest Priority 7 vs R&B Empire 6, so it wins on
POINTS, not on the tiebreak. Precedence only decides an exact tie, which is rare, and where it
does apply, qualification-first is the right default for a stranger. The genuine issue underneath
it (the qualification bar absorbing every big seller, making cross-cohort revenue comparisons
tautological) is addressed by §7a's genre dimension rather than by reordering. **Consequence worth
knowing:** in the derived fallback, "R&B Empire Builder" means an R&B artist not yet at Tier 1
scale. To make it mean *all* R&B artists, genre would have to outscore the qualification bar,
which is a scoring change and not a reorder.

Still open:

- When each avatar funnel gets first traffic and which creative angles run (TODO.md item).
- Whether an artist-facing avatar picker should exist (the override API supports it; no UI
  surfaces it beyond the derived intro copy, deliberately, until the journeys have data).
- Bespoke hero photos for the two single-opportunity calculators (documented in TODO.md).
