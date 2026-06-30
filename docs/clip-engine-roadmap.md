# Clip-to-Subscribe Engine: Roadmap (Phases 1.5 to 4)

Status: SPEC ONLY. Do not build any of this until its gate has tripped.

Phases 2 to 4 are gated behind Phase 1 producing real conversion data, because we
do not yet know which content converts or what rev-share clippers accept. Building
ahead of those gates is guessing with engineering time — so this doc intentionally
contains no schema, routes, or components for Phases 2 to 4.

**Phase 1.5 is different.** It is a clipper-friction reducer, not a bet on unproven
conversion economics, and its unit economics are already settled (see memory
`project_unit_economics_model`). So it is design-complete here (schema + route
contracts included) and its only gate is "choose a clipping provider/budget" — not
conversion data. It is the highest-near-term-value phase and the original ask
("give clippers the Opus-Clip capability so it's easier for them").

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
table has real volume, Phases 2 to 4 stay on paper. (Phase 1.5 below does not
wait on this signal — it makes Phase 1 easier to execute.)

---

## Phase 1.5 — Auto-Clip (segment-on-demand)  [DESIGN-COMPLETE, gated only on provider choice]

**Goal.** Remove the biggest clipper-friction point. Today a clipper downloads
the raw full-length VOD via `/api/live/vod` and must edit it themselves. Phase 1.5
lets a clipper mark a moment in the VOD player and get back a ready-to-post 9:16
captioned clip — so clippers post more, and post sooner, which feeds the Phase 1
attribution loop.

**The one non-negotiable design decision: NEVER auto-clip the whole stream.**
Clipping-as-a-service (and any self-host) bills per minute of *source* video. Auto-
clipping every finished stream means paying for every streamed minute whether or not
a clip is ever posted — cost scales with stream length while revenue does not, and it
goes cash-negative on heavy streamers (see `project_unit_economics_model`). Instead:
the clipper scrubs the existing VOD, marks in/out (~30–90s), and **only that segment**
is processed. Cost ≈ $0.10–0.30/clip, incurred only when a human intends to post.
Breakeven ≈ 2.5% clip→sub conversion.

**Build vs buy.** v1 **buys** a clipping API behind a provider-agnostic adapter
(reference: Klap — verified self-serve REST, webhook-native, ~$0.25/clip end-to-end
incl. 9:16 reframe + burned captions; Vizard is the cheaper-but-unverified runner-up).
CRWN never processes a frame in v1 — it hands the provider a signed R2 URL + time
range and gets clip files back. **Migrate to a self-hosted Modal pipeline (~20× cheaper
/clip)** only when aggregate free-tier clip cost crosses ~$300/mo. AI virality ranking
is deliberately skipped — clippers are the artist's own fans and already know the
moment; the whole-video scan is the costly, least-necessary part.

**Architecture (fits Vercel Hobby — no GPU, no worker, no cron).**
- Trigger: **clipper-initiated from the VOD player** (NOT the egress webhook — that is
  whole-stream and breaks the economics).
- `POST /api/live/clips/generate` — body `{ sessionId, startSec, endSec }`. Authorize
  with the **existing `source='clipper'` gate** (same check as `/api/live/vod`). Mint a
  signed R2 URL for the session's `vod_key`, call the provider with `{ videoUrl, startSec,
  endSec, aspect: '9:16' }`, insert a `live_clips` row (`status='processing'`,
  `provider_job_id`).
- `POST /api/live/clips/webhook` — provider completion callback. Copy each rendered clip
  to R2 at `{slug}/clips/{session}/{n}.mp4`, update `live_clips` to `status='ready'` with
  `r2_key` + `caption`. Instant; no polling cron.
- Clipper panel (`ClipperProgram.tsx`) lists ready clips with signed download, reusing the
  `source='clipper'` auth gate. Serving the clips is **free** (R2 zero egress).

**Per-tier caps (the guardrail that bounds free-tier downside).**
- Free Starter: ~20 clip-minutes/mo (worst case ≈ $5/mo/artist even at 0% conversion).
- Pro / $99 tier: generous-to-uncapped. Caps make clipping an upgrade lever, not a cost sink.

**Gate (lighter than 2–4).** Phase 1 is live (it is) **and** a provider is chosen/budgeted.
NOT gated on conversion data — it reduces friction rather than depending on proven
economics. The buy→Modal migration *is* gated, on free-tier clip cost > ~$300/mo.

**Explicitly NOT in Phase 1.5.** Whole-stream auto-clip; AI moment-detection / virality
scoring; B-roll; per-clip attribution (Phase 1 attributes to the clipper, not the clip —
clip-level ids are a Phase 3 prerequisite).

**Schema — `live_clips` (ready to apply; DO NOT auto-run; Josh applies in the SQL editor when greenlit).**

```sql
-- supabase/schema-phase3-clips.sql — Phase 1.5 Auto-Clip (segment-on-demand)
-- DO NOT auto-run. Apply manually in the Supabase SQL editor when Phase 1.5 is greenlit.

create table if not exists public.live_clips (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.live_sessions(id) on delete cascade,
  artist_id        uuid not null references public.artist_profiles(id) on delete cascade,
  created_by       uuid not null references auth.users(id) on delete cascade, -- the clipper
  start_seconds    numeric not null,
  end_seconds      numeric not null,
  status           text not null default 'processing'
                     check (status in ('processing','ready','failed')),
  provider         text,            -- e.g. 'klap'
  provider_job_id  text,            -- provider job/project id, looked up by the webhook
  r2_key           text,            -- {slug}/clips/{session}/{n}.mp4 once ready
  caption          text,
  duration_seconds numeric,
  error            text,
  created_at       timestamptz not null default now(),
  ready_at         timestamptz
);

create index if not exists idx_live_clips_session     on public.live_clips(session_id);
create index if not exists idx_live_clips_created_by   on public.live_clips(created_by);
create index if not exists idx_live_clips_provider_job on public.live_clips(provider_job_id);

alter table public.live_clips enable row level security;

-- Owner artist or the clipper who created it can read. Writes are server-only
-- (service-role client in the /api routes) — no client insert/update policy.
create policy live_clips_select on public.live_clips for select using (
  auth.uid() = created_by
  or exists (
    select 1 from public.artist_profiles ap
    where ap.id = live_clips.artist_id and ap.user_id = auth.uid()
  )
);

-- self-verify (errors loudly in the SQL editor if a partial apply leaves it incomplete)
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='live_clips') then
    raise exception 'live_clips table missing';
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname='public' and tablename='live_clips'
                 and policyname='live_clips_select') then
    raise exception 'live_clips_select policy missing';
  end if;
end $$;
```

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

| Phase | Build trigger |
|-------|----------------------------------------|
| 1.5 Auto-Clip | Provider chosen + budgeted (NOT conversion-gated — it's a friction reducer). Design-complete above. |
| 2 Marketplace | Known, stable clipper conversion rate across multiple artists |
| 3 Leaderboard | Enough clippers + attributed subs that a ranking is signal |
| 4 Archive + AI | VOD depth per artist + content-to-conversion data exists |

Phase 1.5's gate is a budget decision, not a query. Phases 2–4 each gate on a query
against Phase 1's `referrals` / `referral_earnings` / `live_sessions` — when the query
says ready, build the phase, not before. The buy→Modal migration inside Phase 1.5 gates
on free-tier clip cost > ~$300/mo.
