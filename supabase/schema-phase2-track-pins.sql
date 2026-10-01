-- ============================================================
-- schema-phase2-track-pins.sql
--
-- Top Songs pins (founder, 2026-09-30). An artist's public Music tab now reads like a
-- streaming artist page, and Top Songs is "the artist's pins, then most plays"
-- (src/lib/artistMusicLayout.ts). This adds the one stored fact that needs: which
-- tracks the artist pinned, and in what order.
--
-- WHY A NEW COLUMN AND NOT tracks.position. position is the running order, and bulk
-- upload writes it for EVERY track in a batch, so reading it as a pin would pin a whole
-- catalog and play count would never count (Prince Dre's 94 tracks all carry one).
--
-- ADDITIVE ONLY:
--   1. tracks.pin_rank smallint NULL (1 leads; NULL = not pinned).
--   2. GRANT SELECT (pin_rank) to anon + authenticated. tracks carries PER-COLUMN
--      SELECT grants since schema-phase2-tracks-audio-column-privs.sql, so a new column
--      is NOT readable until granted. UPDATE is still a table-level grant, so the
--      artist's own update (owner-only RLS) covers it; the self-verify asserts that.
--   3. tracks_public gets pin_rank APPENDED as its last column. CREATE OR REPLACE VIEW
--      refuses unless every existing column keeps its name, type and position, so if
--      production's view has drifted from the body below this errors instead of
--      silently rewriting it (probed 2026-09-30: production's columns match exactly).
--      The view stays SECURITY DEFINER (not security_invoker) and keeps its grants.
--
-- Until this runs the page and Studio still work: pin_rank reads as absent, Top Songs
-- falls back to plays then running order, and the Studio pin button shows an error toast.
-- ============================================================

BEGIN;

ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS pin_rank smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tracks_pin_rank_positive') THEN
    ALTER TABLE public.tracks ADD CONSTRAINT tracks_pin_rank_positive CHECK (pin_rank IS NULL OR pin_rank >= 1);
  END IF;
END $$;

GRANT SELECT (pin_rank) ON public.tracks TO anon, authenticated;

CREATE OR REPLACE VIEW tracks_public AS
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
  CASE WHEN can_play_track(t.id, auth.uid()) THEN t.audio_url_320 END AS audio_url_320,
  t.pin_rank
FROM tracks t
WHERE t.is_active = true
   OR EXISTS (
        SELECT 1 FROM artist_profiles ap
         WHERE ap.id = t.artist_id AND ap.user_id = auth.uid()
      );

GRANT SELECT ON tracks_public TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify. Schema facts only (the SQL editor is a BYPASSRLS role).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'pin_rank'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks.pin_rank missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tracks_public' AND column_name = 'pin_rank'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public does not expose pin_rank';
  END IF;

  IF NOT has_column_privilege('anon', 'public.tracks', 'pin_rank', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.tracks', 'pin_rank', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: pin_rank not readable by anon + authenticated';
  END IF;

  IF NOT has_column_privilege('authenticated', 'public.tracks', 'pin_rank', 'UPDATE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated cannot update pin_rank (the Studio pin button would fail)';
  END IF;

  -- The audio hardening must survive untouched.
  IF has_column_privilege('anon', 'public.tracks', 'audio_url_320', 'SELECT')
     OR has_column_privilege('anon', 'public.tracks', 'audio_url_128', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon can read raw audio columns on tracks';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c
     WHERE c.relname = 'tracks_public'
       AND c.reloptions @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public must not be security_invoker';
  END IF;

  IF NOT has_table_privilege('anon', 'public.tracks_public', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public not granted to anon';
  END IF;

  RAISE NOTICE 'schema-phase2-track-pins: OK';
END $$;
