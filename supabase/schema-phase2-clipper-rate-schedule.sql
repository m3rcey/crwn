-- Clip-to-Subscribe — clipper rev-share RAMP (campaign clock)
-- Lets an artist pay clippers a high cut at launch, then step it down over time.
-- Resolved LAZILY at checkout (no cron): time passing changes the answer for free.
-- Because the cut is locked into Stripe metadata at checkout (clipper_rate) and charged
-- as application_fee_percent for the life of that subscription, the ramp only affects
-- NEW conversions — existing subs keep whatever rate was live when their fan converted.
-- Apply manually in the Supabase SQL Editor.

-- 1. The step schedule: ordered array of { "percent": int, "days": int }.
--    "Pay <percent>% for <days> days, then move to the next step." After the last
--    step elapses, the rate falls back to clipper_commission_rate (the standard rate).
--    NULL / [] = no ramp; the flat clipper_commission_rate applies always.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS clipper_rate_schedule JSONB;

-- 2. When the ramp clock starts. NULL = campaign not started -> flat rate applies.
--    Setting/resetting this to now() (re)starts the schedule from step 1 for all
--    future conversions; the artist "restarts the campaign" to re-run a high cut.
ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS clipper_campaign_started_at TIMESTAMPTZ;

-- clipper_commission_rate (added in schema-phase2-clipper-attribution.sql) is now the
-- STANDARD / post-ramp rate. No change to it, to referrals, or to the payout RPC.
