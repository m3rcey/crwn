-- ============================================================
-- Remove Demo Recruiters & Demo Admin Settings from CRWN
--
-- Purpose: Delete the 4 seed recruiters (Tanya Bridges, Derek Osman,
--          Camille Frost, Jaylen Scott) and the demo fixed/variable
--          cost settings, so /admin shows an honest baseline.
--
-- RUN IN:  Supabase SQL Editor
-- SAFE TO RE-RUN: Yes — all DELETEs are idempotent.
--
-- Prereq: schema-phase2-remove-stock-artists.sql has already been run.
--
-- NOT touched:
--   - admin_metrics_cache (regenerates on next cron tick)
-- ============================================================

DO $$
DECLARE
  v_rec_users UUID[] := ARRAY[
    'cc000001-de00-4000-a000-000000000001'::UUID,
    'cc000001-de00-4000-a000-000000000002'::UUID,
    'cc000001-de00-4000-a000-000000000003'::UUID,
    'cc000001-de00-4000-a000-000000000004'::UUID
  ];
  v_rec_rows UUID[] := ARRAY[
    'ee000001-de00-4000-a000-000000000001'::UUID,
    'ee000001-de00-4000-a000-000000000002'::UUID,
    'ee000001-de00-4000-a000-000000000003'::UUID,
    'ee000001-de00-4000-a000-000000000004'::UUID
  ];
BEGIN
  -- Payouts first (FK to recruiters and artist_referrals).
  IF to_regclass('public.recruiter_payouts') IS NOT NULL THEN
    DELETE FROM recruiter_payouts WHERE recruiter_id = ANY(v_rec_rows);
  END IF;

  -- Any remaining referrals tied to these recruiters.
  IF to_regclass('public.artist_referrals') IS NOT NULL THEN
    DELETE FROM artist_referrals WHERE recruiter_id = ANY(v_rec_rows);
  END IF;

  -- Demo referral clicks (pattern-matched by code).
  IF to_regclass('public.referral_clicks') IS NOT NULL THEN
    DELETE FROM referral_clicks WHERE referral_code LIKE 'DEMO_%';
  END IF;

  -- Recruiters row, then profile, then auth user.
  IF to_regclass('public.recruiters') IS NOT NULL THEN
    DELETE FROM recruiters WHERE id = ANY(v_rec_rows);
  END IF;
  DELETE FROM profiles WHERE id = ANY(v_rec_users);
  DELETE FROM auth.users WHERE id = ANY(v_rec_users);

  -- Demo admin settings so dashboard starts with real costs.
  IF to_regclass('public.admin_settings') IS NOT NULL THEN
    DELETE FROM admin_settings WHERE key IN ('fixed_costs', 'variable_costs');
  END IF;

  RAISE NOTICE 'Removed 4 demo recruiters and demo cost settings.';
END $$;

-- Verify (all four should be 0).
SELECT
  (SELECT COUNT(*) FROM recruiters       WHERE id::text  LIKE 'ee000001-de00-4000-a000-%') AS demo_recruiters_remaining,
  (SELECT COUNT(*) FROM profiles         WHERE id::text  LIKE 'cc000001-de00-4000-a000-%') AS demo_recruiter_profiles_remaining,
  (SELECT COUNT(*) FROM auth.users       WHERE id::text  LIKE 'cc000001-de00-4000-a000-%') AS demo_recruiter_auth_remaining,
  (SELECT COUNT(*) FROM admin_settings   WHERE key IN ('fixed_costs', 'variable_costs'))    AS demo_cost_settings_remaining;
