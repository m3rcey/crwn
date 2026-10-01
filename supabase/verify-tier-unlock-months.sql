-- ============================================================
-- BEHAVIOURAL proof for the member drip. Run AFTER
-- schema-phase2-tier-unlock-months.sql
-- ============================================================
-- Read-only in effect: every row it creates is destroyed by the ROLLBACK on the last
-- line. It touches no real track, subscription or fan. Same method as
-- verify-early-access-window.sql: can_play_track answers only for auth.uid(), which
-- Supabase derives from the request.jwt.claims GUC, so setting that GUC here is
-- exactly what PostgREST does per request. With the GUC unset the reader is ANONYMOUS.
--
-- Expected: a single row reading PASS. Any failed check raises and aborts.

BEGIN;

DO $$
DECLARE
  v_artist    UUID;
  v_owner     UUID;
  v_drip      UUID;   -- the delayed tier (Gold, in Prince Dre's case)
  v_now       UUID;   -- a tier the track names with NO delay (Platinum)
  v_outsider  UUID;   -- a tier the track does NOT name, but the delay map does
  v_fan       UUID;
  v_fan_out   UUID;
  v_track     UUID;
  r           BOOLEAN;
  fails       INT := 0;
BEGIN
  -- The artist with the FEWEST tracks, so the Launch-plan track cap cannot fire.
  SELECT ap.id, ap.user_id INTO v_artist, v_owner
    FROM artist_profiles ap
    LEFT JOIN tracks t ON t.artist_id = ap.id
   GROUP BY ap.id, ap.user_id
   ORDER BY count(t.id) ASC
   LIMIT 1;
  IF v_artist IS NULL THEN RAISE EXCEPTION 'no artist_profiles row to test against'; END IF;

  INSERT INTO subscription_tiers (artist_id, name, price, is_active)
  VALUES (v_artist, '__drip_selfcheck_drip__', 2500, true) RETURNING id INTO v_drip;
  INSERT INTO subscription_tiers (artist_id, name, price, is_active)
  VALUES (v_artist, '__drip_selfcheck_now__', 10000, true) RETURNING id INTO v_now;
  INSERT INTO subscription_tiers (artist_id, name, price, is_active)
  VALUES (v_artist, '__drip_selfcheck_outsider__', 1000, true) RETURNING id INTO v_outsider;

  SELECT u.id INTO v_fan FROM auth.users u
   WHERE u.id <> v_owner
     AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.fan_id = u.id AND s.artist_id = v_artist)
   ORDER BY u.created_at ASC LIMIT 1;
  SELECT u.id INTO v_fan_out FROM auth.users u
   WHERE u.id <> v_owner AND u.id <> v_fan
     AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.fan_id = u.id AND s.artist_id = v_artist)
   ORDER BY u.created_at ASC LIMIT 1;
  IF v_fan IS NULL OR v_fan_out IS NULL THEN
    RAISE EXCEPTION 'need two auth.users with no subscription to artist %', v_artist;
  END IF;

  INSERT INTO subscriptions (fan_id, artist_id, tier_id, stripe_subscription_id, status, started_at)
  VALUES (v_fan, v_artist, v_drip, '__drip_selfcheck_fan__', 'active', now());
  INSERT INTO subscriptions (fan_id, artist_id, tier_id, stripe_subscription_id, status, started_at)
  VALUES (v_fan_out, v_artist, v_outsider, '__drip_selfcheck_out__', 'active', now() - interval '5 years');

  -- Members-only, named for the drip tier and the immediate tier. The delay map ALSO
  -- names the outsider tier, to prove a delay entry can never grant.
  INSERT INTO tracks (artist_id, title, is_free, allowed_tier_ids, public_release_date, is_active, access_level, explicit, ai_generated, tier_unlock_months)
  VALUES (v_artist, '__drip_selfcheck_track__', false, to_jsonb(ARRAY[v_drip::text, v_now::text]), NULL, true, 'free', false, false,
          jsonb_build_object(v_drip::text, 1, v_outsider::text, 1))
  RETURNING id INTO v_track;

  -- 1. A drip-tier member who joined TODAY waits.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan)::text, true);
  r := can_play_track(v_track, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 1 a day-one drip member can already play a 1-month track'; END IF;

  -- 2. The same member one month and a day later plays.
  UPDATE subscriptions SET started_at = now() - interval '1 month 1 day' WHERE fan_id = v_fan AND artist_id = v_artist;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 2 a drip member past their month is STILL LOCKED OUT'; END IF;

  -- 3. Three months: denied at two, allowed past three.
  UPDATE tracks SET tier_unlock_months = jsonb_build_object(v_drip::text, 3) WHERE id = v_track;
  UPDATE subscriptions SET started_at = now() - interval '2 months' WHERE fan_id = v_fan AND artist_id = v_artist;
  r := can_play_track(v_track, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 3 a 3-month track opened at month 2'; END IF;
  UPDATE subscriptions SET started_at = now() - interval '3 months 1 day' WHERE fan_id = v_fan AND artist_id = v_artist;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 4 a 3-month track still locked after month 3'; END IF;

  -- 5. A tier the track names WITHOUT a delay plays on day one (Platinum).
  UPDATE subscriptions SET tier_id = v_now, started_at = now() WHERE fan_id = v_fan AND artist_id = v_artist;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 5 an undelayed tier member was LOCKED OUT on day one'; END IF;

  -- 6. A delay entry never grants: the outsider tier is in the map, not in allowed_tier_ids,
  --    and its member started five years ago.
  UPDATE tracks SET tier_unlock_months = jsonb_build_object(v_drip::text, 1, v_outsider::text, 1) WHERE id = v_track;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan_out)::text, true);
  r := can_play_track(v_track, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 6 a delay entry GRANTED a tier the track does not name'; END IF;

  -- 7. Anonymous is denied, as before.
  PERFORM set_config('request.jwt.claims', '', true);
  r := can_play_track(v_track, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 7 anonymous can play a members-only drip track'; END IF;

  -- 8. The owner is never delayed.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 8 the owner was delayed on their own track'; END IF;

  -- 9. Fail OPEN on a malformed value: a string where a number belongs, and a bare array.
  UPDATE subscriptions SET tier_id = v_drip, started_at = now() WHERE fan_id = v_fan AND artist_id = v_artist;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fan)::text, true);
  UPDATE tracks SET tier_unlock_months = jsonb_build_object(v_drip::text, 'soon') WHERE id = v_track;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 9 a malformed delay stranded a paying member'; END IF;
  UPDATE tracks SET tier_unlock_months = '[1,2]'::jsonb WHERE id = v_track;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 10 a non-object delay stranded a paying member'; END IF;

  -- 11. Zero, negative and huge values: zero/negative open, huge clamps without erroring.
  UPDATE tracks SET tier_unlock_months = jsonb_build_object(v_drip::text, 0) WHERE id = v_track;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 11 a zero delay locked a member out'; END IF;
  UPDATE tracks SET tier_unlock_months = jsonb_build_object(v_drip::text, 1e12) WHERE id = v_track;
  r := can_play_track(v_track, NULL);
  IF r THEN fails := fails + 1; RAISE WARNING 'FAIL 12 a huge delay opened on day one'; END IF;

  -- 13. NULL map: no delay for anyone (every existing track on the platform).
  UPDATE tracks SET tier_unlock_months = NULL WHERE id = v_track;
  r := can_play_track(v_track, NULL);
  IF NOT r THEN fails := fails + 1; RAISE WARNING 'FAIL 13 a track with no delay map locked a member out'; END IF;

  -- 14. The view hands back the locator on exactly the same answer.
  UPDATE tracks SET tier_unlock_months = jsonb_build_object(v_drip::text, 1) WHERE id = v_track;
  IF EXISTS (SELECT 1 FROM tracks_public WHERE id = v_track AND (can_play OR audio_url_128 IS NOT NULL)) THEN
    fails := fails + 1; RAISE WARNING 'FAIL 14 tracks_public served a locator to a waiting member';
  END IF;

  IF fails > 0 THEN
    RAISE EXCEPTION 'MEMBER DRIP VERIFICATION FAILED: % check(s) failed. Nothing was written (rolled back).', fails;
  END IF;
END $$;

-- The Supabase SQL Editor does not display notices, so success is a visible row.
SELECT 'PASS' AS result,
       14 AS checks_passed,
       'Drip members wait their months; undelayed tiers, the owner and malformed values open; a delay never grants. Nothing was written.' AS meaning;

ROLLBACK;
