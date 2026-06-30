# Clip-to-Subscribe Engine: Roadmap (Phases 2 to 4)

Status: SPEC ONLY. Do not build any of this until the data-gate for the phase
has tripped. Each phase is gated behind Phase 1 producing real conversion data,
because we do not yet know which content converts or what rev-share clippers
accept. Building ahead of the gate is guessing with engineering time.

This doc is the source of truth for sequencing. It intentionally contains no
schema, routes, or components for Phases 2 to 4.

---

## Phase 1 (BUILT, live on master) — reference

The single loop is closed: one artist grants one clipper a tracked link, a fan
who lands via that link and subscribes is attributed to the clipper, and the
configured clipper share is paid out. Phases 2 to 4 read the data this produces.

What exists (the data + rails every later phase reuses):

- **Attribution.** `referrals.source` discriminates `fan` vs `clipper`
  (`schema-phase2-clipper-attribution.sql`). A clipper-driven subscription is a
  `referrals` row with `source='clipper'`, keyed by `referrer_fan_id` (the
  clipper) and `artist_id`.
- **Rev-share payout.** `referral_earnings.commission_amount` accrues per
  attributed subscription; the clipper withdraws through the existing
  `/api/stripe/fan-cashout` Connect transfer (no separate payout system).
- **Rate.** `artist_profiles.clipper_commission_rate` (integer percent), with a
  high-to-standard ramp in `clipperRate.ts` + `schema-phase2-clipper-rate-schedule.sql`.
- **Clipper view.** Earnings/links read through `/api/referrals` filtered by
  `referrer_fan_id`; UI in `ClipperProgram.tsx` / `ClipperSettings.tsx`.
- **VOD handoff.** Recorded streams (LiveKit Egress to R2) + prerecorded uploads;
  a clipper downloads raw footage via `/api/live/vod`, authorized in that route.

**The signal everything keys on:** count and rate of
`referrals WHERE source='clipper'` and their `referral_earnings`. Until that
table has real volume, the phases below stay on paper.

---

## Phase 2 — Clipper Marketplace

**Goal.** Turn the 1-to-1 trusted-clipper invite into a scalable, two-sided
supply of clippers who self-select which artists to clip for.

**What it adds (spec).**
- A browse surface where clippers see artists who have (a) downloadable VODs and
  (b) a posted rev-share **bounty** (the artist's offered clipper cut, sourced
  from `clipper_commission_rate`, possibly with a per-campaign override).
- Clipper self-enrollment against an artist (today the artist initiates the
  invite; here the clipper opts in), producing the same tracked `?ref=` link and
  the same `referrals`/`referral_earnings` attribution as Phase 1. No new payout
  rail.
- Artist-side controls to list/delist a VOD as "available to clip" and to set or
  schedule the bounty.

**Data-gate (do not build until ALL true).**
- Phase 1 has produced a **known clipper conversion rate** from real data: a
  non-trivial number of distinct clippers, each with `referrals(source='clipper')`
  rows and resulting `referral_earnings`, across more than one artist.
- The rate is stable enough that an artist posting a bounty has a defensible
  expected return. A marketplace built before this is a market for an unproven
  unit economic.

**Explicitly NOT in Phase 2.** Ratings/reputation, escrow, dispute handling,
multi-clipper bidding wars. Those are marketplace-maturity features; ship the
two-sided board first and let usage reveal what is actually needed.

---

## Phase 3 — Attribution Leaderboard

**Goal.** Gamify the attribution data so clippers clip more and harder.

**What it adds (spec).**
- Rankings by **subscriptions driven** (count of `referrals(source='clipper')`,
  and/or `SUM(referral_earnings.commission_amount)`), computed per-artist and
  globally.
- Per-clip granularity if/when clips carry their own identifier (Phase 1
  attributes to the clipper, not yet to the individual clip; ranking *clips*
  requires a clip-level id on the link, which is a small Phase 3 prerequisite,
  not a Phase 2 dependency).
- Surfaces: a public/clipper-facing leaderboard and an artist-facing "top
  clippers for me" view.

**Data-gate (do not build until).**
- There is enough **attribution volume to rank meaningfully**: enough distinct
  clippers and enough attributed subscriptions that a leaderboard is signal, not
  noise. A board with three data points discourages more than it motivates.

**Explicitly NOT in Phase 3.** Cash prizes, tiers/badges economy, anti-gaming
fraud systems. Add only if leaderboard usage shows manipulation or demand.

---

## Phase 4 — Retention Archive + AI Direction

**Goal.** Convert the accumulating VOD library into a retention engine, and use
attribution data to tell artists what to make.

**What it adds (spec).**
- A gated, bingeable **VOD archive** (tier-gated, reusing `live_sessions`
  visibility + the prerecorded watch path) positioned as a reason to stay
  subscribed, not just a one-time watch.
- An **AI Artist Manager** layer that reads attribution + watch data to surface
  which VOD segments, formats, and timeslots convert best, and recommends what to
  stream/clip next.

**Data-gate (do not build until).**
- **Archive depth** exists (enough VODs per artist to binge) AND there is
  **conversion data** tying specific content/segments to subscriptions. The AI
  direction layer is worthless without a corpus of measured outcomes to learn
  from.

**Explicitly NOT in Phase 4.** Automated editing, generative clip creation,
recommendation models beyond simple measured-outcome ranking. Start with "here is
what converted," not a model.

---

## Sequencing summary

| Phase | Build trigger (measured, not guessed) |
|-------|----------------------------------------|
| 2 Marketplace | Known, stable clipper conversion rate across multiple artists |
| 3 Leaderboard | Enough clippers + attributed subs that a ranking is signal |
| 4 Archive + AI | VOD depth per artist + content-to-conversion data exists |

Each gate is a query against Phase 1's `referrals` / `referral_earnings` /
`live_sessions`. When the query says ready, build the phase. Not before.
