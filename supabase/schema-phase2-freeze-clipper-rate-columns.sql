-- schema-phase2-freeze-clipper-rate-columns.sql
-- Extends the artist_profiles column-freeze (schema-phase2-rls-column-restrictions.sql,
-- applied 2026-03-22) to the clipper commission columns, which were added AFTER that
-- policy (schema-phase2-clipper-attribution.sql / clipper-rate-schedule.sql) and were
-- therefore owner-writable via the browser client.
--
-- Severity is LOW on its own: checkout re-caps the effective clipper cut at
-- (100 - platform fee), so a raw rate write can't create a money-integrity leak. This is
-- defense-in-depth + consistency with referral_commission_rate: rate changes must go
-- through the clamped /api/referrals/artist/clipper endpoint (admin client, which bypasses
-- RLS and is unaffected by this policy), not a direct table update.
--
-- Apply manually in the Supabase SQL Editor.
-- ROLLBACK: re-create the policy without the three clipper_* lines (i.e. the body from
--   schema-phase2-rls-column-restrictions.sql).
BEGIN;

DROP POLICY IF EXISTS "Artists can update own profile safe fields" ON artist_profiles;

CREATE POLICY "Artists can update own profile safe fields"
  ON artist_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    platform_tier IS NOT DISTINCT FROM (SELECT platform_tier FROM artist_profiles WHERE user_id = auth.uid())
    AND stripe_connect_id IS NOT DISTINCT FROM (SELECT stripe_connect_id FROM artist_profiles WHERE user_id = auth.uid())
    AND platform_subscription_status IS NOT DISTINCT FROM (SELECT platform_subscription_status FROM artist_profiles WHERE user_id = auth.uid())
    AND platform_stripe_subscription_id IS NOT DISTINCT FROM (SELECT platform_stripe_subscription_id FROM artist_profiles WHERE user_id = auth.uid())
    AND platform_stripe_customer_id IS NOT DISTINCT FROM (SELECT platform_stripe_customer_id FROM artist_profiles WHERE user_id = auth.uid())
    AND is_founding_artist IS NOT DISTINCT FROM (SELECT is_founding_artist FROM artist_profiles WHERE user_id = auth.uid())
    AND founding_artist_number IS NOT DISTINCT FROM (SELECT founding_artist_number FROM artist_profiles WHERE user_id = auth.uid())
    AND referral_commission_rate IS NOT DISTINCT FROM (SELECT referral_commission_rate FROM artist_profiles WHERE user_id = auth.uid())
    AND clipper_commission_rate IS NOT DISTINCT FROM (SELECT clipper_commission_rate FROM artist_profiles WHERE user_id = auth.uid())
    AND clipper_rate_schedule IS NOT DISTINCT FROM (SELECT clipper_rate_schedule FROM artist_profiles WHERE user_id = auth.uid())
    AND clipper_campaign_started_at IS NOT DISTINCT FROM (SELECT clipper_campaign_started_at FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Self-verify: the policy must exist after this migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'artist_profiles'
      AND policyname = 'Artists can update own profile safe fields'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_profiles update policy missing';
  END IF;
  RAISE NOTICE 'OK: clipper rate columns frozen';
END $$;

COMMIT;
