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

`src/lib/avatars/taxonomy.ts`, version `subAvatar@1`, pinned by `taxonomy.test.ts`. Four stable
machine ids that must never be renamed once analytics data exists under them:

| id | Label | Entry calculator | First CRWN offer |
|---|---|---|---|
| `membership_stack_consolidator` | Membership Stack Consolidator | `fan-stack-calculator` (NEW) | Rebuild the existing monetization as the four-tier ladder |
| `touring_access_seller` | Touring Access Seller | `between-tour-calculator` (NEW) | A recurring VIP access membership (Gold rung) |
| `live_community_creator` | Live Community Creator | `live-experience-calculator` (+ `executive-producer-session`) | Free public live into a paid continuation or replay |
| `catalog_vault_seller` | Catalog and Vault Seller | `vault-revenue-planner` | A paid monthly vault from the existing backlog |

**The avatar of an event is the avatar of its calculator, mapped at read time.** No event or
result row stores an avatar column; `calculatorToSubAvatar()` re-slices history under whatever
taxonomy version is current. Calculators outside the four (worth, opportunity-calculator, own
your fans, the mission/demand tools) deliberately map to **null**: running them is real funnel
activity but not avatar evidence, and cohort reports carry them as one labeled "unassigned"
bucket so totals never silently shrink.

## 2. Deterministic assignment (Implemented)

`src/lib/avatars/assignment.ts`, pure, no LLM, tested. `assignSubAvatar(evidence)` scores three
evidence classes, each point paired with a human-readable line:

- **acquisition_path**: mapped calculators the lead ran (+3 for the first, +2 for later ones).
- **declared**: what they typed into a calculator (platform count, paid members elsewhere,
  shows per year, VIP buyers, live willingness, video output, unreleased count).
- **behavioral**: what the account contains (Patreon-tagged imports, live sessions hosted,
  gated tracks).

Rules: a valid `manualOverride` wins outright (source `manual`); below 2 points there is NO
assignment (unassigned is honest, guessed is poison); ties break toward the acquisition-path
avatar; confidence is score-banded (2 low, 3 medium, 4+ high). **The original acquisition
avatar is never overwritten**: `deriveAcquisitionAvatar()` is a pure function of the oldest
claimed result, which is permanent data, so it needs no storage. Acquisition and observed
avatars are reported side by side by `GET /api/artist/avatar`.

Storage (migration `supabase/schema-phase2-sub-avatar.sql`, fail-soft until applied):
`artist_profiles.sub_avatar_override` (manual override, CHECK-constrained to the four ids, no
client column grants by design) and `sub_avatar_audit` (override history: previous, next,
source, actor, timestamp). `POST /api/artist/avatar` sets the owner's override and writes the
audit row; pre-migration it answers `409 { pending: true }`.

## 3. The two new calculators (Implemented)

Both are ordinary 19th/20th entries in the shared lead-magnet registry, so they inherit the
public page (`/tools/<slug>`), wizard, server-side recompute + storage (`/api/lead-magnets/capture`),
tokenized result, result email, prospect nurture enrollment, draft claiming, funnel events, and
the journey resolver with zero new infrastructure. Results render through the shared loss engine
(`buildLossResult`), so web and DM outputs are structurally identical.

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

### 3.3 Existing calculators (verified, reused)

- **Live Community Creator** rides `live-experience-calculator` (ticket + tips model,
  `lossResult@1`) and `executive-producer-session`. Their DeliverableSpecs already cover the
  free/paid split (concept, ticket, replay, run of show; session seats + access rules).
  Free-to-paid *scheduling* automation is the live templates' job (membershipStrategy), not the
  calculator's. No changes were needed or made.
- **Catalog and Vault Seller** rides `vault-revenue-planner`. Known pre-existing wart, now
  documented rather than hidden: its WEB result runs `resultGenerators.vaultRevenuePlan` (a
  readiness/plan result) while its DM adapter runs `buildLossResult` (a money reveal), the one
  slug where the web/DM parity guarantee does not hold. Unifying them is **Deferred**: both
  outputs are honest, and rewriting the web generator was out of scope for this build.

## 4. The journey (Implemented, per avatar)

```text
entry page (/tools/<slug>, loss-framed hero, one CTA)
-> calculator wizard (shared, server recompute)
-> result (hero number, derivation chain, scenarios, assumptions, estimate disclaimer)
-> ResultToBuilder transition -> DeliverableBuilder (avatar spec in deliverableSpecs.ts:
   consolidated_membership = mapping step + four-tier ladder; vip_membership = one VIP tier
   with capacity + cadence) with the ladder/offer preview
-> email-my-results (capture route) / save boundary (opportunity-drafts, unclaimed
   lead_magnet_results row, 30-day token)
-> signup (token in user_metadata) -> auto-claim (verified email or token; emits
   account_created/email_verified stamped with the calculator)
-> setup wizard: "Your CRWN plan is saved" intro now speaks the avatar promise; ladder screen
   opens on THEIR prices with THEIR projected buyers; vault avatar defaults the catalog step
   to the project path
-> tier create via applyTierTemplate (Promise Calendar seeds), Stripe in-wizard, launch review
-> post-launch: buildStarterOffer has avatar cases (consolidator = migrate-and-invite framing,
   touring = the VIP tier with touring-safe promises); revenue ramp target from their number
-> measurement: funnel_events spine + tier_events (views, checkout starts) +
   first_paid_conversion (all six rails, calculator-stamped) + opportunity_ledger (refund-netted)
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
  net of refunds), grouped by calculator, mapped to avatar at read time.
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

- Calculator attribution rides the existing rails: capture stamps `email_submitted`, auto-claim
  stamps `account_created`/`email_verified`, paidConversion stamps `first_paid_conversion`, all
  with `calculator` + `resultId`. Avatar = read-time mapping of `calculator`.
- **First-touch UTM persistence (NEW)**: `readUtm()` snapshots the first attributed visit into
  `localStorage (crwn_first_touch)` and falls back to it when the current URL carries no UTMs.
  Current-URL values always win, so last-touch is preserved and first-touch fills silence.
- Experiment attribution is unchanged (`crwn_aid` cookie + server-side variant re-derivation).
  Avatar-specific experiment experiences are **Deferred** until there is a variant worth testing.

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

## 8. Nurture (Implemented)

One universal prospect-nurture core sequence, avatar-personalized through the existing
calculator-module mechanism: bespoke modules for `fan-stack-calculator` (fragmentation, fan
data, migration, revenue per fan) and `between-tour-calculator` (off-month revenue, VIP
conversion, sustainable promises) in `src/lib/prospectNurture/calculatorModules.ts`. Consent,
suppression, dedup, idempotent sends and exit-on-signup are inherited unchanged. Four separate
sequence systems were deliberately NOT built; the module layer is the architecture.

## 9. How to add a future avatar safely

1. Add its entry calculator to the lead-magnet registry (+ adapter + DeliverableSpec + nurture
   module + starterOffer case), exactly like the two added here.
2. Add the avatar to `SUB_AVATARS` with its `calculatorSlugs`; bump
   `SUB_AVATAR_TAXONOMY_VERSION`; extend the migration CHECK constraint in a NEW migration.
3. Never rename an existing id, never remove a calculator slug from a mapping (history is
   re-sliced at read time), and never let a calculator map to two avatars.
4. `taxonomy.test.ts` pins all of this; it fails before an artist sees drift.

## 10. Founder decisions still open

- When the two new funnels get first traffic and which creative angles run (TODO.md item).
- Whether an artist-facing avatar picker should exist (the override API supports it; no UI
  surfaces it beyond the derived intro copy, deliberately, until the journeys have data).
- Bespoke hero photos for the two new calculators (placeholders documented in TODO.md).
