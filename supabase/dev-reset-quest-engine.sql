-- dev-reset-quest-engine.sql
-- DEV UTILITY (not a migration). Resets ONE artist's Quest Engine progression so
-- they experience Rise Mode fresh — new Build pick, quests re-assign, XP/level
-- start at 0 and re-earn correctly.
--
-- SAFE: only clears the four quest-state tables for this user. Does NOT touch any
-- real content — tracks, tiers/offers, campaigns, missions, subscriptions all stay.
-- On the next Rise Mode load the quests re-derive from live data.
--
-- Change the slug below, then run in the Supabase SQL Editor.
DO $$
DECLARE
  v_slug text := 'm3rcey';   -- <-- the artist to reset
  v_user uuid;
  v_artist uuid;
BEGIN
  SELECT user_id, id INTO v_user, v_artist FROM artist_profiles WHERE slug = v_slug;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No artist found for slug %', v_slug;
  END IF;

  -- Order: children first (xp_ledger/quest_unlocks reference quest_instances via
  -- ON DELETE SET NULL, so order is not strictly required, but this is tidy).
  DELETE FROM xp_ledger        WHERE user_id = v_user;
  DELETE FROM quest_unlocks    WHERE user_id = v_user;
  DELETE FROM quest_instances  WHERE user_id = v_user;
  DELETE FROM user_progression WHERE user_id = v_user;

  RAISE NOTICE 'OK: quest state reset for slug=% (user=%, artist=%). Content untouched.', v_slug, v_user, v_artist;
END $$;
