-- ============================================================
-- schema-phase2-tier-unlock-months.sql
--
-- Member drip: a track can open to a tier N months after EACH MEMBER'S OWN start
-- (founder, 2026-10-01). Prince Dre's Gold members get one more project a month for
-- three months, ending with his best, counted from the day they subscribed, while
-- Platinum hears everything the day it joins. A fixed calendar could not do this: it
-- gives a member who joins after the last date everything on day one, so the reason
-- to stay decays to nothing. A per-member clock never decays.
--
-- ADDITIVE ONLY:
--   1. tracks.tier_unlock_months jsonb NULL. Shape: { "<tier uuid>": <months> }.
--      NULL or {} means no delay for anyone (every existing row, so on the day this
--      lands behaviour is byte-identical for every track on the platform).
--   2. GRANT SELECT (tier_unlock_months) to anon + authenticated. tracks carries
--      PER-COLUMN select grants (schema-phase2-tracks-audio-column-privs.sql), so a
--      new column is unreadable until granted. It is not sensitive: it says WHEN a
--      tier opens, which the track's own "unlocks in N days" label states anyway.
--      UPDATE stays the table-level grant behind the owner-only RLS policy: an artist
--      may set it on their own tracks, the same authority that already lets them
--      remove a tier from allowed_tier_ids outright.
--   3. can_play_track: ONE new clause, at the very end, after the fan's tier is
--      already known to be in allowed_tier_ids. Everything before it is unchanged.
--   4. tracks_public: tier_unlock_months APPENDED as its last column (CREATE OR
--      REPLACE VIEW refuses unless every existing column keeps name, type and
--      position, so a drifted production view errors here instead of being rewritten).
--
-- WHAT THE NEW CLAUSE CAN AND CANNOT DO
-- It runs only for a fan whose ACTIVE subscription tier is already in
-- allowed_tier_ids, so it can only ever DELAY someone the track already names. It
-- can never grant: a tier absent from allowed_tier_ids still gets false, exactly as
-- before. The owner, a completed purchase of the track, and a free track outside an
-- early-access window all return true BEFORE it runs, so none of them is delayed.
--
-- THE CLOCK is the member's subscription start: COALESCE(started_at, created_at) on
-- their row for this artist. The open moment is start + N months, so the first
-- project lands with the first renewal.
--
-- FAIL DIRECTION, deliberately: OPEN. A malformed value (not an object, not a
-- number, zero or negative) or a missing start date lets the member play. The same
-- choice the release waterfall made ("malformed entries open immediately rather than
-- stranding a paid tier"): a bug here may hand a paying member a project a month
-- early, and must never strand them. N is clamped to 120 so make_interval cannot
-- overflow; an erroring oracle would deny every reader on the platform, not one track.
-- ============================================================

BEGIN;

ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS tier_unlock_months jsonb;

GRANT SELECT (tier_unlock_months) ON public.tracks TO anon, authenticated;

CREATE OR REPLACE FUNCTION can_play_track(p_track UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user      UUID := auth.uid();   -- p_user IGNORED; entitlement is always the caller's
  t           RECORD;
  sub         RECORD;
  v_tiers     JSONB;
  v_in_window BOOLEAN;
  v_delays    JSONB;
  v_months    NUMERIC;
  v_start     TIMESTAMPTZ;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids, public_release_date, tier_unlock_months
    INTO t FROM tracks WHERE id = p_track;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Unchanged from schema-phase2-early-access-window-enforcement.sql.
  v_tiers := to_jsonb(t.allowed_tier_ids);
  v_in_window :=
        t.public_release_date IS NOT NULL
    AND t.public_release_date > now()
    AND v_tiers IS NOT NULL
    AND jsonb_typeof(v_tiers) = 'array'
    AND jsonb_array_length(v_tiers) > 0;

  IF t.is_free AND NOT v_in_window THEN RETURN true; END IF;

  IF v_user IS NULL THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM artist_profiles WHERE id = t.artist_id AND user_id = v_user) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM purchases WHERE fan_id = v_user AND track_id = p_track AND status = 'completed') THEN
    RETURN true;
  END IF;

  SELECT tier_id, started_at, created_at INTO sub
    FROM subscriptions
   WHERE fan_id = v_user AND artist_id = t.artist_id AND status = 'active'
   LIMIT 1;

  IF NOT FOUND OR sub.tier_id IS NULL THEN RETURN false; END IF;
  IF NOT (v_tiers ? sub.tier_id::text) THEN RETURN false; END IF;

  -- NEW: the member drip. Only ever narrows a tier the track already names.
  v_delays := t.tier_unlock_months;
  IF v_delays IS NOT NULL
     AND jsonb_typeof(v_delays) = 'object'
     AND jsonb_typeof(v_delays -> sub.tier_id::text) = 'number' THEN
    v_months := LEAST(floor((v_delays ->> sub.tier_id::text)::numeric), 120);
    v_start := COALESCE(sub.started_at, sub.created_at);
    IF v_months > 0 AND v_start IS NOT NULL THEN
      RETURN v_start + make_interval(months => v_months::int) <= now();
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- Identical to the grant every earlier version carried (CREATE OR REPLACE keeps the
-- ACL, so this is normally a no-op). Safety comes from ignoring p_user.
GRANT EXECUTE ON FUNCTION can_play_track(UUID, UUID) TO anon, authenticated;

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
  t.pin_rank,
  t.tier_unlock_months
FROM tracks t
WHERE t.is_active = true
   OR EXISTS (
        SELECT 1 FROM artist_profiles ap
         WHERE ap.id = t.artist_id AND ap.user_id = auth.uid()
      );

GRANT SELECT ON tracks_public TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify. DEFINITION facts only: the SQL editor runs as a BYPASSRLS superuser,
-- so a read test here passes vacuously. Behavioural proof is
-- supabase/verify-tier-unlock-months.sql (transactional, rolls back).
-- ============================================================
DO $$
DECLARE
  def TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tracks' AND column_name = 'tier_unlock_months'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks.tier_unlock_months missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tracks_public' AND column_name = 'tier_unlock_months'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tracks_public does not expose tier_unlock_months';
  END IF;

  IF NOT has_column_privilege('anon', 'public.tracks', 'tier_unlock_months', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.tracks', 'tier_unlock_months', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tier_unlock_months not readable by anon + authenticated';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'can_play_track' AND n.nspname = 'public'
   LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() missing';
  END IF;
  IF def NOT LIKE '%tier_unlock_months%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() does not read tier_unlock_months';
  END IF;
  -- The early-access fix must survive this rewrite.
  IF def NOT LIKE '%NOT v_in_window%' OR def NOT LIKE '%public_release_date%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the early-access window guard was lost';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'can_play_track'
       AND prosecdef
       AND 'search_path=public' = ANY(COALESCE(proconfig, ARRAY[]::text[]))
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() lost SECURITY DEFINER or its pinned search_path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_name = 'can_play_track'
       AND grantee IN ('anon', 'authenticated')
       AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() lost EXECUTE for anon/authenticated';
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

  RAISE NOTICE 'schema-phase2-tier-unlock-months: OK';
END $$;
