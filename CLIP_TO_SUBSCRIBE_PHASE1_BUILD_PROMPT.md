# Phase 1 Build Prompt — Clip-to-Subscribe (paste into Claude Code)

> Shape decided: **clipper = the existing FAN-referral mechanism, lightly extended.** NOT a new entity/table, NOT the recruiter cron rail. Reuse `?ref=` → checkout metadata → `processReferral` (writes `referral_earnings`) → clipper cashes out via the existing `/api/stripe/fan-cashout` Connect transfer. Net-new is only: a `source` discriminator, a clipper rate, and a VOD download grant. **Payout is already built — do not write payout code.**

---

## Prompt

Read CLAUDE.md first and apply its problem-solving principles. This is a surgical, reuse-first build — do not refactor adjacent code or invent new infrastructure. The VOD/Egress/R2 keystone is already shipped; do not touch it.

**Goal:** close the clip-to-subscribe loop. A clipper shares a tracked link to an artist page; a fan who subscribes via that link is attributed to the clipper and the clipper earns an artist-set cut, which accrues as a `referral_earnings` row and is withdrawn through the **existing fan-cashout** Connect rail. The clipper can also download the raw VOD to chop.

**Reuse these existing rails (verify each before changing it):**
- `?ref=` persistence: [src/components/shared/ReferralPersist.tsx](src/components/shared/ReferralPersist.tsx)
- Checkout metadata (`referral_code` already passed): [src/app/api/stripe/checkout/route.ts:148](src/app/api/stripe/checkout/route.ts#L148)
- Attribution + commission: `processReferral` in [src/lib/referrals.ts](src/lib/referrals.ts), called from [src/lib/webhookHandlers.ts:245](src/lib/webhookHandlers.ts#L245)
- VOD download (owner-only signed R2 URL): [src/app/api/live/vod/route.ts](src/app/api/live/vod/route.ts)
- **Payout (already built — reuse, do not rebuild):** clipper earnings accrue as `referral_earnings` rows via `processReferral`; withdrawal is the existing [src/app/api/stripe/fan-cashout/route.ts](src/app/api/stripe/fan-cashout/route.ts) (`atomic_fan_cashout` RPC → `stripe.transfers.create` to `profiles.stripe_connect_id`, $25 min). A clipper is a profile with a Connect id, so this works unchanged.
- Dashboard to clone for the clipper view: [src/components/referrals/ReferralDashboard.tsx](src/components/referrals/ReferralDashboard.tsx)

### STEP 0 — Verify before building (do this first, report findings, do not skip)
1. **Cashout source.** Open the `atomic_fan_cashout` Postgres RPC and confirm which table/column it sums into `fan_payouts` (expected: the earner's `referral_earnings`). If it filters by a type/source that would exclude clipper earnings, note the one-line change needed so clipper earnings are withdrawable. Do NOT build a new payout path — only confirm clipper earnings flow into this existing one.
2. **Referrer resolution.** `processReferral` resolves the referrer by `profiles.username` match. Confirm a clipper will have a `profiles` row with a `stripe_connect_id` (they must, to cash out). If clippers can be external/non-users, flag it — that changes scope.
3. Confirm the actual columns on `referrals`, `referral_earnings`, and `artist_profiles.referral_commission_rate` so the migration matches reality.

### STEP 1 — Attribution discriminator (smallest change)
- Carry an attribution **source** end to end. Add `?src=clipper` to the clipper link, persist it alongside `crwn_ref` in `ReferralPersist`, read it in checkout, and pass `attribution_source` in the Stripe session `metadata` next to `referral_code`.
- In `processReferral` (or a thin sibling), accept `attributionSource` and:
  - stamp `source` (`'fan' | 'clipper'`) on the `referrals` row,
  - when `source === 'clipper'`, use `artist_profiles.clipper_commission_rate` instead of `referral_commission_rate`.
- Default `source` to `'fan'` when absent so existing fan-referral behavior is byte-for-byte unchanged.

### STEP 2 — Clipper rate
- Add `clipper_commission_rate` (integer percent) to `artist_profiles`, default sensible (e.g. matches the recruiter default). One settable rate only — the high→step-down ramp is a LATER scheduling layer, not Phase 1.

### STEP 3 — VOD handoff
- Extend [src/app/api/live/vod/route.ts](src/app/api/live/vod/route.ts) owner check from "owner of the artist_profile" to **"owner OR an authorized clipper for this artist."** Keep it a short-lived signed R2 URL via `getSignedDownloadUrl`. Define "authorized clipper" minimally (e.g. has at least one attribution row for this artist, or an explicit allow row) — pick the simplest that's safe and say which you chose.

### STEP 4 — Minimal clipper view
- Clone [src/components/referrals/ReferralDashboard.tsx](src/components/referrals/ReferralDashboard.tsx) into a clipper variant: their tracked link, attributed subs (`source='clipper'`), earnings, and downloadable VODs for artists they clip. Reuse existing components/styles; no new design system.

### SQL migration
- Put all schema changes in `supabase/schema-phase2-clipper-attribution.sql` (do NOT auto-run; Josh applies it manually in the Supabase SQL Editor). Provide it ready-to-copy. Use `ADD COLUMN IF NOT EXISTS`, include any RLS policy updates needed for the clipper view to read its own rows, and respect existing `is_active`/owner-override patterns.

### Constraints
- Prices are integers in cents. Display `(x/100).toFixed(2)`.
- Admin/service-role client only in `/api/` routes; env vars with `|| 'fallback'`, never `!`.
- Middleware matcher must keep excluding `/api/`.
- `npm run build` must pass clean. Then bump the SW cache version (frontend changed).

### Acceptance
1. A fan subscribing via a **fan** referral link behaves exactly as today (`source='fan'`, fan rate). No regression.
2. A fan subscribing via a **clipper** link (`?ref=...&src=clipper`) produces a `referrals` row with `source='clipper'` and a `referral_earnings` row at the **clipper** rate — correct amount. That earning is withdrawable via the existing `/api/stripe/fan-cashout` (confirm it sums in, per Step 0).
3. An authorized clipper can fetch a signed VOD download URL for that artist; an unauthorized user gets 403.
4. Build passes; migration file is ready to copy.

Report at the end: what `atomic_fan_cashout` sums (Step 0), the columns you added, and any place reality differed from this prompt.
