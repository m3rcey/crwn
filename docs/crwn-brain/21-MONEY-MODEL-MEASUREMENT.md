# 21 — The Money Model measurement system (internal)

> Shipped 2026-08-10. Admin-only. Answers ONE question: is the monetization
> strategy producing profitable, repeatable customer economics? It instruments
> the First Revenue Launch offer's "What remains" list from doc 20: tracking
> hours per artist, documenting first-paid-member results, converting results
> into case studies. It changes NO pricing, NO guarantee terms, NO public
> surface, and never charges anyone: the implementation fee stays a manual
> Stripe invoice by explicit founder decision.

## What it is

Three admin-only tables + one pure finance module + one admin tab.

- **`frl_engagements`** — one row per premium engagement (founding_cohort /
  standard / self_serve): status, dates, commercial terms in integer cents,
  scope, per-artist allocated acquisition cost, and consent (case study /
  testimonial / performance data, each not_granted | private | anonymized |
  public, DEFAULT not_granted). One open engagement per artist; a guarantee
  rebuild is the same engagement, never a second row.
- **`frl_work_entries`** — dated labor + direct external cost log (category,
  minutes, optional external cents). Not payroll: no rates stored; cost is
  derived on read from minutes x the founder hourly assumption in
  `admin_settings.frl_cost_assumptions` (no default; unset means labor cost
  reports missing).
- **`frl_checklist_state`** — MANUAL operator checklist items only. Derived
  items are computed live and cannot be stored or overridden (the route
  rejects derived keys against the registry).
- **`frl_evidence`** — one case-study evidence record per engagement:
  before-state, prior stack/revenue/audience evidence, quote, file refs,
  verification status (claimed | system_verified | document_verified |
  admin_reviewed), verified migration savings (manual, from the
  stack-replacement audit only), and a dated `metrics_snapshot` captured from
  the system. Nothing publishes from here; consent lives on the engagement.

Migration: `supabase/schema-phase2-frl-engagements.sql` (RLS: admin-only
SELECT, service-role-only writes, self-verifying, probed by
`verify:migrations`). Sibling fix shipped with it:
`supabase/schema-phase2-earnings-live-tip-type.sql` widens the earnings type
CHECK to include `live_tip` (the webhook inserts it; the old allowlist
silently rejected every live-tip earning wherever applied).

## The finance layer (one place, tested)

`src/lib/frl/economics.ts` is the ONLY place the formulas live; routes fetch
rows and call it. Every money value is a `MoneyMetric { cents | null, state:
complete | modeled | missing, missing: [] }`. **Null is never zero**; a
missing input names itself. 43 tests in `economics.test.ts`.

Definitions (all windows UTC, half-open `[start, start+Nd)`):

- **Service window** = 30 days from `started_on` (the offer's 30-Day Sprint).
- **Guarantee window** = 30 days from `guarantee_eligible_on`, which is
  stamped ONCE when the admin detail view first observes every required
  guarantee condition met (it cannot be recovered retroactively; it is never
  overwritten). Guarantee timing and profitability timing are deliberately
  separate.
- **Artist GMV** = sum of `earnings.gross_amount` in window (same expression
  as the break-even pop-ups; refund rows are negative so sums are
  refund-netted, never subtracted twice).
- **CRWN platform-fee revenue** = sum of `earnings.platform_fee` (snapshotted
  per row at the historical fee rate; never re-derived from the current tier).
- **CRWN plan-subscription revenue** = MODELED as one month of the active
  plan's price (annual billed: annual/12) because no platform invoice table
  exists. Always labeled `modeled`; excluded from the 7-day figure entirely.
- **Implementation revenue** = `fee_collected_cents`, typed in by the founder
  as the manual invoice is paid. A real $0 (founding cohort) is a complete
  zero; unrecorded is missing.
- **CRWN revenue 30d** = implementation + fees30 + modeled plan line; the
  composite inherits the weakest input state.
- **Labor cost** = minutes x founder hourly assumption, transparent recompute
  from dated entries when the assumption changes.
- **Direct cost 30d** = labor30 + external costs30 + allocated acquisition
  cost. **Contribution margin 30d** = revenue30 - directCost30, with pct.
- **CAC payback** = day the cumulative CRWN revenue (implementation at day 0,
  then per-earning fees) covers the acquisition cost; `unknown` until the
  acquisition cost is entered.
- **Diagnostic** — can this engagement's 30-day contribution fund the
  replication cost (its own acquisition + lifetime labor + external costs) of
  one / two more artists? Zero recorded cost cannot prove capacity (returns
  null with the reason). Top revenue / cost source named.
- **LTV**: predictive LTV is UNAVAILABLE by policy; lifetime figures are
  historical sums only.
- **Cohort aggregates** (n=3 by design): mean/median computed over KNOWN
  values only, each with its sample size. No rates presented without their
  denominators. Never zero-filled.

## The operator checklist

`src/lib/frl/checklist.ts`: 20 items. 10 DERIVED (Stripe connected, free
front door, paid tier purchasable, contacts imported, ladder configured,
campaign assets exist, campaign sent, warm fans invited, first paid member,
first fulfillment delivered) evaluate through the same Quest Engine
`evaluateCondition` + queries the guarantee uses; a failed evaluation shows
`not_verifiable`, never done. 10 MANUAL (revenue audit, source exports,
contacts reviewed, buyers identified, revenue model selected, benefits
reviewed, promise calendar reviewed, page reviewed, campaign approved,
thirty-day review) store status/date/note/minutes.

The guarantee checklist itself is computed for ANY artist via
`src/lib/frl/server.ts` (`computeGuaranteeChecklist`) with the SAME defs as
the artist-facing card, so admin and artist can never disagree. The
`launch_partner` flag gates the artist surface only.

## Surfaces

`/admin` -> **Money Model** tab (`src/components/admin/MoneyModelView.tsx`).
Routes (all `requireAdmin()` + service-role):
`/api/admin/frl/engagements` (list/create + `?view=cohort`),
`/api/admin/frl/engagements/[id]` (detail/PATCH),
`/[id]/checklist`, `/[id]/work`, `/[id]/evidence`.
Attribution path per engagement reuses `resolveAttribution` (first-touch),
the `funnel_events` timeline, calculators run, sub-avatar (override or
derived), revenue model (derived like `/api/artist/strategy`), and the stored
plan recommendation. Attribution stays a reporting dimension; nothing here
feeds a price, fee, score, or authorization.

## Known limitations (named, not zero-filled)

- Platform-plan revenue is modeled monthly; no invoice/proration/failed-
  payment history exists (the one genuine gap if historical accuracy is ever
  needed).
- Live-tip earnings are absent from the ledger anywhere the pre-fix type
  CHECK was applied; the widening migration corrects future inserts only.
- Multiple partial refunds on one charge collapse to the first (webhook
  idempotency trade-off, documented in webhookHandlers).
- Per-artist allocation of shared costs (fixed infra, message sends) is NOT
  attempted; acquisition cost is a founder-entered per-artist figure.
- At n=3 hand-picked partners every cohort-rate threshold in FEEDBACK_LOOPS
  is unmet: the honest output is the per-engagement ledger, and the cohort
  block shows sample sizes on every aggregate.

## What stays manual (founder)

Applying the two migrations; setting the founder hourly cost assumption
(Money Model tab); creating each engagement and typing its terms; recording
invoice payments (`fee_collected_cents` + invoice ref); logging hours;
granting consent ONLY after the artist grants it; the ten manual checklist
confirmations; evidence capture + verification status.
