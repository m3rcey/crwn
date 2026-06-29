# Clip-to-Subscribe — Phase 1 Spec

**Status as of 2026-06-28 (verified against the repo, not assumed).**

## What is already DONE — do not rebuild

The "keystone" (native live → downloadable VOD in R2) is shipped:

- **Egress → R2:** `EgressClient.startRoomCompositeEgress` writes the MP4 straight to R2 (S3-compatible). [src/lib/livekit/livekit.ts](src/lib/livekit/livekit.ts)
- **Egress webhook:** signature-verified, flips `live_sessions.vod_status` and stores `vod_key` on `egress_ended`. [src/app/api/live/egress-webhook/route.ts](src/app/api/live/egress-webhook/route.ts)
- **VOD retrieval:** owner-only signed R2 download URL — comment already names it as the seam Phase 1 reuses for clipper handoff. [src/app/api/live/vod/route.ts](src/app/api/live/vod/route.ts)
- **Schema:** `vod_status` (none|recording|processing|ready|failed), `vod_egress_id`, `vod_key`, `vod_duration_seconds`, `vod_visibility` (public|private). [supabase/schema-phase3-vod.sql](supabase/schema-phase3-vod.sql)

**Decisions already settled in code — no confirmation needed:** host = LiveKit Cloud (managed `EgressClient`); storage = R2 via `@/lib/r2/client`. Any other choice forks the stack.

## The referral rail Phase 1 REUSES (do not rebuild payouts)

A complete attribution + commission path already exists for fan referrals. The clipper is just another referrer; clone the wiring, don't invent new infra:

1. **Link → param:** `?ref=<code>` persisted to sessionStorage across navigation. [src/components/shared/ReferralPersist.tsx](src/components/shared/ReferralPersist.tsx)
2. **Param → checkout metadata:** checkout passes `referral_code` in Stripe session metadata. [src/app/api/stripe/checkout/route.ts:148](src/app/api/stripe/checkout/route.ts#L148)
3. **Metadata → attribution:** webhook reads `session.metadata.referral_code` and calls `processReferral(...)`. [src/lib/webhookHandlers.ts:245](src/lib/webhookHandlers.ts#L245)
4. **Attribution → commission:** resolves referrer, blocks self-referral, applies `artist_profiles.referral_commission_rate`, writes a `referrals` row. [src/lib/referrals.ts](src/lib/referrals.ts)

---

## Two open phases (in critical order)

### PHASE 1 — Close the clip loop *(most critical — this is the product)*

Reuse the rail above. Net-new is thin:

- **Clipper identity + link.** A clipper gets a tracked link to the artist page carrying `?ref=<clipper_code>`. If clippers are just fans, the existing `useReferralCode` code works as-is. If clippers need a distinct entity/rate from fan-referrers, add a `clipper_code` namespace and a parallel resolve branch in `processReferral` — **decision point, see below.**
- **Attribution row.** On subscribe via a clipper link: clipper, artist, tier, gross amount, timestamp. This is what `processReferral` already writes; extend the row with `source = 'clipper'` if clippers and fan-referrers must be reported separately.
- **Rev-share at artist-set %.** Reuse `referral_commission_rate`, or add `clipper_commission_rate` on `artist_profiles` if the clipper cut differs from the fan-referral cut. Payout routes through the **existing Stripe Connect path** — do not build a new payout.
- **VOD handoff.** Grant the clipper a signed download via the existing `/api/live/vod` rail (extend its owner-only check to "owner OR authorized clipper for this artist").
- **Minimal clipper view.** A variant of the recruiter/referral dashboard ([src/components/referrals/ReferralDashboard.tsx](src/components/referrals/ReferralDashboard.tsx)) — earnings, links, downloadable VODs.

**Acceptance:** one test subscription via a clipper link produces (a) a correct attribution row AND (b) a correct Connect payout. Loop demonstrably closes.

**Open decision (the only thing blocking the build prompt):** Is a clipper a *distinct entity* from a fan-referrer, or the same `?ref=` mechanism with a different label? This determines whether Phase 1 is "add `source`/`clipper_commission_rate` columns + one resolve branch" (small) or "new clipper table + dashboard + rate" (medium). Everything else is settled.

### PHASE 2 — RTMP Ingress *(genuinely missing — confirmed 0 refs to ingress/rtmp/stream_key in the repo)*

Lets a rapper already live on Kick/Twitch paste a CRWN stream key into their existing OBS/Restream as one more destination; CRWN passively records via the same Egress. Lowest-friction acquisition path, but **secondary to Phase 1** — the clip loop must demonstrably close on *native* streams first, then widen the funnel of what gets recorded.

- Per-artist `IngressClient` RTMP URL + stream key.
- Ingress feed lands as a `live_session` identical to a native stream → same Egress → same VOD → same clip loop.

**Acceptance:** an OBS feed pushed to the CRWN ingress key produces a VOD identical to a native stream.

## Deleted from the original plan (correctly)

- **Step 1 "stand up Egress→VOD"** — already shipped. Removed.
- **"Cloud vs self-host?" / "Supabase vs S3 vs R2?"** — answered in code (Cloud, R2). Removed.
- **Server-side restreaming** (CRWN fanning out to Twitch/Kick) — uptime liability; let the artist's own OBS/Restream fan out. Deferred to roadmap, not built.

## Future (roadmap doc, not code)

Clipper marketplace, attribution leaderboard, AI Artist Manager, retention archive.
