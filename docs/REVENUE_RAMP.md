# The Revenue Ramp: how long the calculator's number actually takes

Built 2026-07-28. Model: [`src/lib/revenueRamp.ts`](../src/lib/revenueRamp.ts).
Seeding: [`src/lib/revenueRampSeed.ts`](../src/lib/revenueRampSeed.ts).

## The problem it solves

The Streaming Loss calculator hands an artist a number. That number is **steady state**: what
they net per month once the recommended ladder exists AND the superfan slice of their audience
has actually converted. The calculator says nothing about *when*.

Two failure modes, both expensive:
- An artist who reads it as "next month" quits in week three when month one is $400.
- An artist with no map takes three years, or never gets there.

CRWN earns a percentage of money the artist collects. The faster they reach the number, the
faster CRWN earns on it, so the ramp is a revenue instrument, not a content piece.

## The answer

**Twelve months to the full number. About half of it by month six. First dollar inside three
weeks.** Run every accelerator step on time and the same curve lands nearer **month eight**.

Three things gate it and nothing else does:

1. **The offer must exist before anyone can pay.** Days, not months. Every day in Foundation is
   a day at zero, which is why that phase is two weeks and not two months.
2. **Awareness saturates slowly.** One post reaches a fraction of an audience. Touching the
   addressable slice takes repeated exposure across weeks, so the launch spike converts the fans
   who were already waiting, and everyone else arrives over the following three quarters.
3. **The whale tier fills last.** Early joiners skew to the cheap entry tier, so headcount runs
   ahead of money for two quarters and money only catches up when the depth work lands. This is
   why `mrrPct` trails `payerPct` in every phase but the last, and why an artist who stops at "I
   launched tiers" plateaus around half their number.

## The phases

| Phase | Days | % of the number | % of supporters | Focus |
|---|---|---|---|---|
| Foundation | 0 to 14 | 0% | 0% | Build the thing fans pay into |
| Founding window | 15 to 45 | 12% | 15% | Convert the fans already waiting, on a deadline |
| Rhythm | 46 to 90 | 26% | 32% | Turn one launch into a repeating reason to stay |
| Fan engine | 91 to 180 | 52% | 60% | Stop being the only person doing your marketing |
| Depth | 181 to 270 | 76% | 78% | Sell more to the fans you already converted |
| Retention | 271 to 365 | 100% | 100% | Keep what you built |

Worked example, ICP floor (250k engaged followers, conservative preset): the calculator returns
**~$24.3k/mo net** and **~1,125 paying supporters**. The ramp targets ~$2.9k/mo by day 45,
~$12.6k by day 180, and the full ~$24.3k by day 365. `revenueRamp.test.ts` asserts the ramp's
final payer count equals the calculator's own `payers` figure, computed from the opposite
direction, so the two models cannot drift apart silently.

## Where it lives

Each of the 30 steps becomes a dated task on the **Promise Calendar**, seeded automatically at
`POST /api/artist/complete-setup` using the artist's own claimed calculator result. Artists who
signed up before this existed get a **"Lay out my first year"** button on the calendar
(`POST /api/promise-calendar/ramp`). Both paths are idempotent per step key.

No migration. Ramp steps reuse `fulfillment_obligations` + `fulfillment_events`
(`source_type: 'custom'`, `benefit_type: 'ramp_step'`, `recurrence: 'none'`), which the calendar
already projects. They render as type **`roadmap`**, distinct from a **`promise`**, because a
promise is owed to a supporter and a roadmap step is owed to yourself.

## Rules if you touch this

- **`auto_create_fan_items` DEFAULTS TO TRUE.** Every ramp insert sets it `false` explicitly.
  Without that one line, every fan's calendar shows their artist's private growth plan,
  including "Personally message your 50 most engaged fans". The fan projection carries a second
  lock that skips any event with a `ramp_step_key`.
- **Never hardcode a price.** `netCentsPerPayer()` derives per-supporter value from
  `getAssumptions()` in `leadCalculator.ts`. A duplicated price map that feeds arithmetic is how
  CRWN once overpaid a commission by 5x.
- **Every step must point at a feature that is LIVE.** A roadmap that sends an artist to a door
  that will not open is worse than no roadmap. Live tips and Executive Producer sessions belong
  in the Depth phase the day their flags flip, and not before.
- **Step keys are permanent.** They are the idempotency key. Renaming one re-seeds it as a
  duplicate on every existing artist's calendar.
- **Targets are projections, not promises**, and the calendar says so under the panel.

## One milestone at a time

Artists do not quit because the goal is hard. They quit because **the next win feels too far
away**. A game never opens with "you will beat this in 200 hours", it says punch a tree, then
craft a pickaxe. The destination never moves; only the next rung is ever in focus.

So the ramp holds the whole arc, and `computeRampProgress()` decides what the artist is actually
shown on the Promise Calendar:

- **Destination**: one thin line at the top. Their number, their current MRR, one percentage.
- **The milestone in play**: its dollar target, a bar that moves, and the single most motivating
  unit there is, **"7 more paying supporters to get there"**.
- **One next action**: the earliest unfinished step, with its own CTA. Nothing else competes.
- **Locked next**: the following two milestones by NAME only. The rest stays quiet.

The bar is **money-based** whenever MRR is known (`currentMrrCents`, active subs priced at their
tier), and falls back to steps-done otherwise, so Foundation still moves even though it earns
nothing by design.

**No XP, badges or levels here on purpose.** The Quest Engine (`src/lib/quests`) already owns
progression, is fully built, and is dark-launched. A second levelling system would be two sources
of truth for the same feeling. The ramp should feed the Quest Engine, never duplicate it.

## Adaptive, without a model

The phase an artist is in is **the phase holding their next unfinished step**, not the one the
calendar date says. Someone three weeks behind is still in Founding window, and telling them they
are in "Rhythm" while they have not launched is how a plan stops being believed.

From that, the ramp re-plans itself on every load:

- `behindDays` = how late the oldest unfinished step is.
- `aheadDays` = runway bought by working early (how far out the next unfinished step sits).
- `projectedTotalDays` = 365 + behind - ahead, floored at the accelerated bound (240) so the
  projection never promises the impossible. Surfaced as "at your current pace the full number
  lands around month 10."

This is deterministic and explainable, and it cannot hallucinate a milestone. **Adaptive does not
have to mean a model.** A true personalized path (weighting release cadence, hours available per
week, content output, and measured per-cohort conversion instead of the static curve) is the next
layer, and it should be built on top of this function rather than replacing it: the coach's answer
to "what is the next highest-leverage action" is already computed here as `nextStep` and
`nextAccelerator`.

## What the entry calculator determines

| Determined by the calculator they signed up through | Where |
|---|---|
| Where they land after setup, with the builder prefilled | `postSetupDestination()` |
| Their first Rise Mode mission and Action Plan ranking | `leadMagnetMissions.ts` (5 tools) |
| The ramp's **target number** | `estimatedMonthlyCents` on their claimed result |
| Which ramp step is **pulled to the front** | `ENTRY_TOOL_FIRST_MOVE` (10 tools) |

The 30 steps themselves are the same for everyone. Only the order changes, and Foundation never
moves: Stripe and a ladder still have to exist before anyone can pay, whatever they came in for.

One sharp edge: the seed reads the artist's **most recent** claimed result, not their biggest. An
artist who ran three calculators is aimed at whichever they finished last.

## Still open

- Milestones are static percentages. Once real cohorts exist, replace the curve with measured
  conversion so the projection is calibrated instead of assumed. Everything needed to do that is
  already recorded (`funnel_events`, `opportunity_ledger`, subscriptions per artist per month).
- The personalized path does not yet weight **release cadence, content output, or hours available
  per week**. None of those are collected today. `engagement_level` and `years_releasing` now
  exist on the lead profile (see `docs/ICP.md`) but are pre-signup only and are not read here.
- The ramp does not yet feed the **Quest Engine**. When that flag flips, a completed ramp step
  should award XP through the existing engine rather than the ramp growing its own levels.
- The seed reads the most recent claimed calculator result rather than the largest opportunity.
