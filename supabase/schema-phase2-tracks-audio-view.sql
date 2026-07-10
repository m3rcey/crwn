-- schema-phase2-tracks-audio-view.sql
--
-- STEP 1 of 2. ADDITIVE ONLY. Nothing is revoked here, no policy changes.
-- Applying this file cannot break any existing surface. It only creates the
-- entitlement function and the redacting view that step 2 depends on.
--
-- THE BUG (confirmed from outside with the anon key, 2026-07-10):
--   curl "$URL/rest/v1/tracks?select=audio_url_320&is_free=eq.false" -H "apikey: $ANON"
--   returns a fully-resolvable Supabase Storage URL for every PAID track. The
--   whole paid catalogue is downloadable by anyone. The tier gate lives only in
--   the client. tracks' SELECT policy is `USING (true)` and anon/authenticated
--   hold a TABLE-level SELECT grant, which covers every column.
--
-- WHY NOT THE community_posts SHAPE: that fix restricted ROWS on the base table.
-- RLS is row-level, and `tracks` is read by ~40 files, so restricting rows would
-- silently empty explore, share pages, playlists and the locked-track cards that
-- sell subscriptions. The leak is COLUMN-level, so the fix is column-level:
--   step 1 (this file): a SECURITY DEFINER view that serves audio only to
--                       entitled readers.
--   step 2:             REVOKE the table-level SELECT on `tracks` and re-GRANT
--                       every column EXCEPT audio_url_128 / audio_url_320.
-- The base table's RLS is left exactly as it is, so no surface can go empty.
-- After step 2, `?select=audio_url_320` returns 42501 permission denied for
-- anon and authenticated, while the view still serves audio to people entitled.
--
-- The view is SECURITY DEFINER (the Postgres default: security_invoker is off),
-- so it reads the base table as its owner and keeps working after step 2's
-- REVOKE. Same mechanism as community_posts_feed.
--
-- ENTITLEMENT MIRRORS THE CLIENT EXACTLY: free, or the artist owns the track,
-- or a completed purchase exists, or the reader holds an ACTIVE subscription on
-- a tier named in allowed_tier_ids. NOTE: an EMPTY allowed_tier_ids on a PAID
-- track means NOBODY streams it (purchase-only), because the client requires
-- `allowed_tier_ids.includes(tierId)`. Widening that here would silently
-- publish tracks the artist believes are locked.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- Mutations are wrapped in BEGIN/COMMIT; the verify block runs AFTER the COMMIT
-- so a bug in the check cannot roll back a correct fix.

BEGIN;

-- ============================================================
-- Entitlement helper
-- ============================================================
-- SECURITY DEFINER so the view can consult purchases/subscriptions/artist_profiles
-- without granting the caller SELECT on them. search_path is pinned: a definer
-- function with a mutable search_path is a privilege-escalation vector.
CREATE OR REPLACE FUNCTION can_play_track(p_track UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t        RECORD;
  fan_tier UUID;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids
    INTO t
    FROM tracks
   WHERE id = p_track;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Free tracks stream for everyone, matching the public artist page.
  IF t.is_free THEN
    RETURN true;
  END IF;

  IF p_user IS NULL THEN
    RETURN false;
  END IF;

  -- The artist always plays their own tracks, gated or not.
  IF EXISTS (
    SELECT 1 FROM artist_profiles
     WHERE id = t.artist_id AND user_id = p_user
  ) THEN
    RETURN true;
  END IF;

  -- A completed purchase grants permanent access to that one track.
  IF EXISTS (
    SELECT 1 FROM purchases
     WHERE fan_id = p_user
       AND track_id = p_track
       AND status = 'completed'
  ) THEN
    RETURN true;
  END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = p_user
     AND artist_id = t.artist_id
     AND status = 'active'
   LIMIT 1;

  IF fan_tier IS NULL THEN
    RETURN false;
  END IF;

  -- Deliberately NO "empty list means any subscriber" fallback. See header.
  -- to_jsonb() so this holds whether allowed_tier_ids is jsonb, text[] or uuid[].
  RETURN to_jsonb(t.allowed_tier_ids) ? fan_tier::text;
END;
$$;

-- ============================================================
-- tracks_public: every visible row, audio redacted when not entitled.
-- ============================================================
-- Rows: all active tracks, PLUS the owner's inactive ones. Soft-deleted tracks
-- must stay visible to the artist who deactivated them (the soft-delete gotcha
-- in CLAUDE.md), and the artist dashboard reads this view.
DROP VIEW IF EXISTS tracks_public;
CREATE VIEW tracks_public AS
SELECT
  t.id,
  t.artist_id,
  t.title,
  t.duration,
  t.access_level,
  t.price,
  t.album_art_url,
  t.release_date,
  t.play_count,
  t.created_at,
  t.updated_at,
  t.album_id,
  t."position",
  t.is_free,
  t.allowed_tier_ids,
  t.public_release_date,
  t.is_active,
  t.genre,
  t.record_label,
  t.isrc,
  t.explicit,
  t.ai_generated,
  can_play_track(t.id, auth.uid()) AS can_play,
  CASE WHEN can_play_track(t.id, auth.uid()) THEN t.audio_url_128 END AS audio_url_128,
  CASE WHEN can_play_track(t.id, auth.uid()) THEN t.audio_url_320 END AS audio_url_320
FROM tracks t
WHERE t.is_active = true
   OR EXISTS (
        SELECT 1 FROM artist_profiles ap
         WHERE ap.id = t.artist_id AND ap.user_id = auth.uid()
      );

GRANT SELECT ON tracks_public TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify. Asserts facts about the SCHEMA, not behaviour observed from this
-- session: the SQL editor runs as a BYPASSRLS role, so any "can I see it?" check
-- here would pass vacuously and prove nothing. The real proof is the anon-key
-- curl at the bottom of step 2.
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'can_play_track') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() missing';
  END IF;

  -- A definer function with a mutable search_path is an escalation vector.
  SELECT count(*) INTO n
    FROM pg_proc
   WHERE proname = 'can_play_track'
     AND prosecdef
     AND proconfig @> ARRAY['search_path=public'];
  IF n <> 1 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() must be SECURITY DEFINER with search_path pinned';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema = 'public' AND table_name = 'tracks_public'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public view missing (step 2 would empty the player)';
  END IF;

  -- The view must NOT be security_invoker, or step 2's REVOKE will break it.
  IF EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relname = 'tracks_public'
       AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public must not be security_invoker';
  END IF;

  -- anon/authenticated must be able to read the view.
  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = 'tracks_public'
     AND privilege_type = 'SELECT'
     AND grantee IN ('anon', 'authenticated');
  IF n < 2 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public not granted to anon + authenticated (found %)', n;
  END IF;

  RAISE NOTICE 'schema-phase2-tracks-audio-view: OK (additive; nothing revoked yet)';
END $$;

-- Sanity: no redacted row may carry audio. This runs as a BYPASSRLS role, so it
-- observes can_play for auth.uid() = NULL, i.e. the anonymous case. Paid tracks
-- must show can_play = false and NULL audio.
SELECT is_free, can_play, count(*) AS rows,
       count(audio_url_128) AS rows_with_audio
  FROM tracks_public
 GROUP BY is_free, can_play
 ORDER BY is_free, can_play;
