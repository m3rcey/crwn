-- Clip-to-Subscribe Phase 1 — clipper attribution + rev-share
-- Clippers reuse the existing FAN-referral rail: ?ref= -> checkout metadata ->
-- processReferral writes referrals + referral_earnings; the clipper withdraws via
-- the existing /api/stripe/fan-cashout Connect transfer. This migration only adds
-- a source discriminator + a clipper-specific commission rate. Apply manually.

-- 1. Discriminate fan-driven vs clipper-driven attribution on the referrals row.
--    Defaults to 'fan' so every existing row + every existing flow is unchanged.
ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'fan';

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_source_chk;
ALTER TABLE referrals ADD CONSTRAINT referrals_source_chk
  CHECK (source IN ('fan', 'clipper'));

-- 2. Per-artist clipper cut (integer percent). Separate from referral_commission_rate
--    because the clipper share is set independently and (later) ramps high->standard.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS clipper_commission_rate INTEGER NOT NULL DEFAULT 10;

-- 3. Payout: NO new column needed. Clipper earnings land in referral_earnings keyed
--    by referrer_fan_id (the clipper). Confirm the cashout RPC sums them in:
--
--    SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'atomic_fan_cashout';
--
--    If it sums referral_earnings by referrer_fan_id = p_fan_id with NO source filter,
--    clipper earnings are already withdrawable — do nothing. If it filters by a type
--    or joins only fan rows, widen that predicate to include clipper earnings.
--
-- 4. RLS: the clipper reads their own earnings through the existing /api/referrals
--    endpoint (filtered by referrer_fan_id), so no new policy is required for the
--    dashboard. The VOD-download authorization is enforced in /api/live/vod via the
--    service-role client, not RLS.
