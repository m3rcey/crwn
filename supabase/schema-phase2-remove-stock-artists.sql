-- ============================================================
-- Remove Stock/Seed Demo Artists from CRWN
--
-- Purpose: Delete all 25 stock artists seeded via seed-demo-admin.sql,
--          keeping real signups (Mercey, GB the Gift, and any others).
--
-- RUN IN:  Supabase SQL Editor
-- SAFE TO RE-RUN: Yes — all DELETEs are idempotent.
--
-- What stays:
--   - Mercey (auth user 612fa313-8d4f-4748-8148-7804fada0d0c)
--   - GB the Gift (real signup, not in the seed UUID range)
--   - Any other real artist signups
--
-- What gets removed:
--   - 25 seed artists (auth IDs aa000001-de00-4000-a000-0000000000XX)
--   - Their artist_profiles (ab000001-de00-4000-a000-0000000000XX)
--   - All dependent rows (CASCADE for most; explicit for the rest)
-- ============================================================

DO $$
DECLARE
  v_stock_users UUID[] := ARRAY[
    'aa000001-de00-4000-a000-000000000001'::UUID, 'aa000001-de00-4000-a000-000000000002'::UUID,
    'aa000001-de00-4000-a000-000000000003'::UUID, 'aa000001-de00-4000-a000-000000000004'::UUID,
    'aa000001-de00-4000-a000-000000000005'::UUID, 'aa000001-de00-4000-a000-000000000006'::UUID,
    'aa000001-de00-4000-a000-000000000007'::UUID, 'aa000001-de00-4000-a000-000000000008'::UUID,
    'aa000001-de00-4000-a000-000000000009'::UUID, 'aa000001-de00-4000-a000-000000000010'::UUID,
    'aa000001-de00-4000-a000-000000000011'::UUID, 'aa000001-de00-4000-a000-000000000012'::UUID,
    'aa000001-de00-4000-a000-000000000013'::UUID, 'aa000001-de00-4000-a000-000000000014'::UUID,
    'aa000001-de00-4000-a000-000000000015'::UUID, 'aa000001-de00-4000-a000-000000000016'::UUID,
    'aa000001-de00-4000-a000-000000000017'::UUID, 'aa000001-de00-4000-a000-000000000018'::UUID,
    'aa000001-de00-4000-a000-000000000019'::UUID, 'aa000001-de00-4000-a000-000000000020'::UUID,
    'aa000001-de00-4000-a000-000000000021'::UUID, 'aa000001-de00-4000-a000-000000000022'::UUID,
    'aa000001-de00-4000-a000-000000000023'::UUID, 'aa000001-de00-4000-a000-000000000024'::UUID,
    'aa000001-de00-4000-a000-000000000025'::UUID
  ];
  v_stock_artists UUID[] := ARRAY[
    'ab000001-de00-4000-a000-000000000001'::UUID, 'ab000001-de00-4000-a000-000000000002'::UUID,
    'ab000001-de00-4000-a000-000000000003'::UUID, 'ab000001-de00-4000-a000-000000000004'::UUID,
    'ab000001-de00-4000-a000-000000000005'::UUID, 'ab000001-de00-4000-a000-000000000006'::UUID,
    'ab000001-de00-4000-a000-000000000007'::UUID, 'ab000001-de00-4000-a000-000000000008'::UUID,
    'ab000001-de00-4000-a000-000000000009'::UUID, 'ab000001-de00-4000-a000-000000000010'::UUID,
    'ab000001-de00-4000-a000-000000000011'::UUID, 'ab000001-de00-4000-a000-000000000012'::UUID,
    'ab000001-de00-4000-a000-000000000013'::UUID, 'ab000001-de00-4000-a000-000000000014'::UUID,
    'ab000001-de00-4000-a000-000000000015'::UUID, 'ab000001-de00-4000-a000-000000000016'::UUID,
    'ab000001-de00-4000-a000-000000000017'::UUID, 'ab000001-de00-4000-a000-000000000018'::UUID,
    'ab000001-de00-4000-a000-000000000019'::UUID, 'ab000001-de00-4000-a000-000000000020'::UUID,
    'ab000001-de00-4000-a000-000000000021'::UUID, 'ab000001-de00-4000-a000-000000000022'::UUID,
    'ab000001-de00-4000-a000-000000000023'::UUID, 'ab000001-de00-4000-a000-000000000024'::UUID,
    'ab000001-de00-4000-a000-000000000025'::UUID
  ];
  v_tbl TEXT;
  v_artist_tables TEXT[] := ARRAY[
    'bookings', 'sms_consent', 'sms_messages', 'sms_campaigns',
    'smart_links', 'smart_link_clicks', 'discount_codes', 'discount_code_uses',
    'sequences', 'sequence_enrollments', 'campaigns', 'campaign_recipients',
    'email_opens', 'email_clicks', 'email_attribution', 'abandoned_carts',
    'fan_contacts', 'retention_surveys', 'earnings', 'artist_notes',
    'marketing_costs', 'playlists'
  ];
BEGIN
  -- Explicit deletes for tables whose FKs are NOT ON DELETE CASCADE.
  -- Skip any that don't exist in this environment.
  FOREACH v_tbl IN ARRAY v_artist_tables LOOP
    IF to_regclass('public.' || v_tbl) IS NOT NULL THEN
      EXECUTE format('DELETE FROM %I WHERE artist_id = ANY($1)', v_tbl) USING v_stock_artists;
    END IF;
  END LOOP;

  -- Tables with non-standard column names for the artist FK.
  IF to_regclass('public.subscription_lifecycle') IS NOT NULL THEN
    DELETE FROM subscription_lifecycle WHERE artist_profile_id = ANY(v_stock_artists);
  END IF;
  IF to_regclass('public.cancellation_reasons') IS NOT NULL THEN
    DELETE FROM cancellation_reasons WHERE artist_profile_id = ANY(v_stock_artists);
  END IF;
  IF to_regclass('public.artist_referrals') IS NOT NULL THEN
    -- recruiter_payouts FK to artist_referrals — clear those first.
    IF to_regclass('public.recruiter_payouts') IS NOT NULL THEN
      DELETE FROM recruiter_payouts
        WHERE artist_referral_id IN (
          SELECT id FROM artist_referrals
          WHERE artist_user_id = ANY(v_stock_users) OR artist_id = ANY(v_stock_artists)
        );
    END IF;
    DELETE FROM artist_referrals
      WHERE artist_user_id = ANY(v_stock_users) OR artist_id = ANY(v_stock_artists);
  END IF;
  IF to_regclass('public.platform_sequence_enrollments') IS NOT NULL THEN
    DELETE FROM platform_sequence_enrollments WHERE artist_user_id = ANY(v_stock_users);
  END IF;

  -- Main delete. ON DELETE CASCADE on most FKs cleans up the rest.
  DELETE FROM artist_profiles WHERE id = ANY(v_stock_artists);

  -- Profiles + auth users.
  DELETE FROM profiles WHERE id = ANY(v_stock_users);
  DELETE FROM auth.users WHERE id = ANY(v_stock_users);

  RAISE NOTICE 'Removed stock demo artists. Mercey, GB the Gift, and any real signups preserved.';
END $$;

-- Verify the cleanup worked (all three counts should be 0).
SELECT
  (SELECT COUNT(*) FROM artist_profiles WHERE id::text LIKE 'ab000001-de00-4000-a000-%') AS stock_artists_remaining,
  (SELECT COUNT(*) FROM profiles         WHERE id::text LIKE 'aa000001-de00-4000-a000-%') AS stock_profiles_remaining,
  (SELECT COUNT(*) FROM auth.users       WHERE id::text LIKE 'aa000001-de00-4000-a000-%') AS stock_auth_users_remaining;

-- Remaining artists (sanity check — should show Mercey, GB the Gift, and any real signups):
SELECT p.display_name, ap.slug, ap.created_at
FROM artist_profiles ap
JOIN profiles p ON p.id = ap.user_id
ORDER BY ap.created_at DESC;
