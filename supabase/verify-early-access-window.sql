-- ============================================================
-- BEHAVIOURAL proof for early-access enforcement. Run AFTER
-- schema-phase2-early-access-window-enforcement.sql
-- ============================================================
-- Read-only in effect: every row it creates is destroyed by the ROLLBACK on the
-- last line. It touches no real track, no real subscription and no real fan.
--
-- WHY THIS EXISTS SEPARATELY FROM THE MIGRATION'S SELF-VERIFY
-- The migration asserts the deployed DEFINITION. That cannot prove behaviour.
-- And an anon curl cannot prove it either while production has zero tracks with
-- a public_release_date: the probe would pass vacuously. This script MAKES the
-- state, asks the oracle as each kind of reader, then throws it all away.
--
-- HOW IT IMPERSONATES A READER
-- can_play_track answers only for auth.uid(), which Supabase derives from the
-- request.jwt.claims GUC. Setting that GUC inside the transaction is exactly
-- what PostgREST does per request, so these answers are the real ones, not a
-- simulation. With the GUC unset, auth.uid() is NULL: that is ANONYMOUS.
--
-- Expected output: nine NOTICE lines, all reading PASS, then ROLLBACK.
-- Any FAIL raises and aborts. Nothing persists either way.

BEGIN;

DO $$
DECLARE
  v_artist     UUID;
  v_owner      UUID;
  v_tier_in    UUID;   -- tier that IS allowed early
  v_tier_out   UUID;   -- tier that is NOT allowed early
  v_fan_in     UUID;
  v_fan_out    UUID;
  v_track      UUID;
  v_member_only UUID;
  v_public     UUID;
  r            BOOLEAN;
  fails        INT := 0;

  -- An assert helper would need a local function, which a DO block cannot
  -- declare, so every check below is written out. Verbose on purpose: this is a
  -- security proof, and a clever abstraction here is one more thing to trust.
BEGIN
  -- Pick the artist with the FEWEST tracks, so the Launch-plan track-cap
  -- trigger (schema-phase2-track-cap-enforcement.sql) cannot fire on us.
  SELECT ap.id, ap.user_id INTO v_artist, v_owner
    FROM artist_profiles ap
    LEFT JOIN tracks t ON t.artist_id = ap.id
   GROUP BY ap.id, ap.user_id
   ORDER BY count(t.id) ASC
   LIMIT 1;

  IF v_artist IS NULL THEN
    RAISE EXCEPTION 'no artist_profiles row to test against';
  END IF;

  -- Two distinct tiers for this artist. Created here (and rolled back) rather
  -- than borrowed, so the script does not depend on how any artist priced up.
  INSERT INTO subscription_tiers (artist_id, name, price, is_active)
  VALUES (v_artist, '__ea_selfcheck_in__', 1000, true) RETURNING id INTO v_tier_in;
  INSERT INTO subscription_tiers (artist_id, name, price, is_active)
  VALUES (v_artist, '__ea_selfcheck_out__', 500, true) RETURNING id INTO v_tier_out;

  -- Two synthetic fans, borrowed from real auth users so the FKs hold. They must
  -- NOT already subscribe to this artist: subscriptions is UNIQUE (fan_id,
  -- artist_id), and colliding with a real row would abort the script (harmless,
  -- but it would look like a failure of the thing under test).
  SELECT u.id INTO v_fan_in
    FROM auth.users u
   WHERE u.id <> v_owner
     AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.fan_id = u.id AND s.artist_id = v_artist)
   ORDER BY u.created_at ASC LIMIT 1;

  SELECT u.id INTO v_fan_out
    FROM auth.users u
   WHERE u.id <> v_owner AND u.id <> v_fan_in
     AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.fan_id = u.id AND s.artist_id = v_artist)
   ORDER BY u.created_at ASC LIMIT 1;

  IF v_fan_in IS NULL OR v_fan_out IS NULL THEN
    RAISE EXCEPTION 'need two auth.users with no existing subscription to artist % to test entitled / non-entitled readers', v_artist;
  END IF;

  INSERT INTO subscriptions (fan_id, artist_id, tier_id, stripe_subscription_id, status)
  VALUES (v_fan_in, v_artist, v_tier_in, '__ea_selfcheck_in__', 'active');
  INSERT INTO subscriptions (fan_id, artist_id, tier_id, stripe_subscription_id, status)
  VALUES (v_fan_out, v_artist, v_tier_out, '__ea_selfcheck_out__', 'active');

  -- The three track shapes from the content-class contract.
  --
  -- access_level is 'free' on all three ON PURPOSE. It is the LEGACY access model
  -- (superseded by content classes); can_play_track does not read it, every one of
  -- the 72 real tracks in production is 'free', and its CHECK only permits
  -- free/subscriber/purchase. Setting it to anything else here would test the old
  -- column's constraint instead of the thing under test, which is exactly what a
  -- first run of this script did ('subscribers' -> 23514, transaction aborted).
  INSERT INTO tracks (artist_id, title, is_free, allowed_tier_ids, public_release_date, is_active, access_level, explicit, ai_generated)
  VALUES (v_artist, '__ea_selfcheck_paid_first__', true, to_jsonb(ARRAY[v_tier_in::text]), now() + interval '7 days', true, 'free', false, false)
  RETURNING id INTO v_track;

  -- is_free = false IS the members-only encoding. access_level plays no part.
  INSERT INTO tracks (artist_id, title, is_free, allowed_tier_ids, public_release_date, is_active, access_level, explicit, ai_generated)
  VALUES (v_artist, '__ea_selfcheck_member_only__', false, to_jsonb(ARRAY[v_tier_in::text]), NULL, true, 'free', false, false)
  RETURNING id INTO v_member_only;

  INSERT INTO tracks (artist_id, title, is_free, allowed_tier_ids, public_release_date, is_active, access_level, explicit, ai_generated)
  VALUES (v_artist, '__ea_selfcheck_public__', true, '[]'::jsonb, NULL, true, 'free', false, false)
  RETURNING id INTO v_public;

  -- ── B. members-first, INSIDE the window ────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);
  r := can_play_track(v_track, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 1 anonymous CAN play an in-window track'; ELSE RAISE NOTICE 'PASS 1 anonymous denied in-window'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan_out)::text, true);
  r := can_play_track(v_track, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 2 non-entitled fan CAN play an in-window track'; ELSE RAISE NOTICE 'PASS 2 non-entitled fan denied in-window'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan_in)::text, true);
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 3 ENTITLED PAYING FAN LOCKED OUT in-window'; ELSE RAISE NOTICE 'PASS 3 entitled paying fan allowed in-window'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 4 owner locked out of own in-window track'; ELSE RAISE NOTICE 'PASS 4 owner allowed in-window'; END IF;

  -- ── C. same track, AFTER the window ────────────────────────────────────
  UPDATE tracks SET public_release_date = now() - interval '1 day' WHERE id = v_track;
  PERFORM set_config('request.jwt.claims', '', true);
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 5 anonymous still denied AFTER the public date'; ELSE RAISE NOTICE 'PASS 5 anonymous allowed after the public date'; END IF;

  -- ── E. degenerate: future date, EMPTY tier list ────────────────────────
  -- classifyTrack() calls this 'free_forever'. It must stay public, or a stray
  -- date would lock out every paying member for the whole window.
  UPDATE tracks SET public_release_date = now() + interval '7 days', allowed_tier_ids = '[]'::jsonb WHERE id = v_track;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 6 future date + empty tier list locked everyone out'; ELSE RAISE NOTICE 'PASS 6 future date + no tiers stays public (matches classifyTrack)'; END IF;

  -- ── D. members-only, unchanged ─────────────────────────────────────────
  r := can_play_track(v_member_only, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 7 anonymous CAN play a members-only track'; ELSE RAISE NOTICE 'PASS 7 members-only still denied anonymously'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan_in)::text, true);
  r := can_play_track(v_member_only, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 8 entitled member lost members-only access'; ELSE RAISE NOTICE 'PASS 8 entitled member keeps members-only access'; END IF;

  -- ── A. ordinary public track, unchanged ────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);
  r := can_play_track(v_public, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 9 ordinary free track no longer public'; ELSE RAISE NOTICE 'PASS 9 ordinary free track still public'; END IF;

  IF fails > 0 THEN
    RAISE EXCEPTION 'EARLY-ACCESS VERIFICATION FAILED: % check(s) failed. Nothing was written (rolled back).', fails;
  END IF;

  RAISE NOTICE '--- all 9 checks passed ---';
END $$;

-- Nothing above is kept. This is the point.
ROLLBACK;
