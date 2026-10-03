-- ============================================================
-- Whole-tape purchase, and project credits that include the tape (founder, 2026-10-03)
-- ============================================================
-- WHAT CHANGES. Until now a purchase could unlock exactly ONE song (purchases.track_id), so the only
-- way to a whole project was a membership, and a $250 Founding Supporter who was not on Platinum
-- could not hear the tape they were credited on. This adds ONE clause to can_play_track: a completed
-- purchase of a product that GRANTS an album plays every track on that album.
--   products.grants_album_id  a whole-tape product ("Stompin Thru The Trenches, $19.99")
--   products.credit_album_id  a project-credits product (already exists), which now includes its tape
--
-- This reverses the 2026-10-01 rule "projects reach fans through tier access only" for products
-- that say so. albums.price stays inert: the product is the price, the purchase is the proof.
--
-- SAFETY.
--   * The clause only ever GRANTS, and only to the buyer (auth.uid(), as every clause here).
--   * It reaches only the SELLING artist's own tracks: the album must belong to the track's artist
--     and the product to the same artist, so an artist-written product cannot unlock someone
--     else's catalog.
--   * A refund flips purchases.status to 'refunded', which revokes it by derivation.
--   * Everything else in the function is copied unchanged from schema-phase2-tier-unlock-months.sql
--     (the early-access window, the owner check, the per-track purchase, the tier gate, the member
--     drip). The self-verify below fails if any of those markers is lost.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS grants_album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.products.grants_album_id IS
  'Set on a whole-project product: a completed purchase plays every track on this album (can_play_track). Must be the seller''s own album, which the oracle enforces.';

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

  -- NEW (schema-phase2-tape-purchase.sql): a completed purchase of a product that grants this
  -- track's album, a whole tape or that project's credits. The seller's own album only.
  IF EXISTS (
    SELECT 1
      FROM purchases pu
      JOIN products pr     ON pr.id = pu.product_id
      JOIN album_tracks atr ON atr.album_id = COALESCE(pr.grants_album_id, pr.credit_album_id)
      JOIN albums al       ON al.id = atr.album_id
     WHERE pu.fan_id = v_user
       AND pu.status = 'completed'
       AND atr.track_id = p_track
       AND al.artist_id = t.artist_id
       AND pr.artist_id = t.artist_id
  ) THEN
    RETURN true;
  END IF;

  SELECT tier_id, started_at, created_at INTO sub
    FROM subscriptions
   WHERE fan_id = v_user AND artist_id = t.artist_id AND status = 'active'
   LIMIT 1;

  IF NOT FOUND OR sub.tier_id IS NULL THEN RETURN false; END IF;
  IF NOT (v_tiers ? sub.tier_id::text) THEN RETURN false; END IF;

  -- The member drip. Only ever narrows a tier the track already names.
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

-- CREATE OR REPLACE keeps the ACL; restated as every earlier version did. Safety comes from
-- ignoring p_user.
GRANT EXECUTE ON FUNCTION can_play_track(UUID, UUID) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify. DEFINITION facts only (the SQL editor runs as a superuser, so a read test here
-- would pass vacuously).
-- ============================================================
DO $$
DECLARE
  def TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'grants_album_id') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: products.grants_album_id missing';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'can_play_track' AND n.nspname = 'public'
   LIMIT 1;
  IF def IS NULL THEN RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() missing'; END IF;
  IF def NOT LIKE '%grants_album_id%' OR def NOT LIKE '%credit_album_id%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() does not read the album grant';
  END IF;
  IF def NOT LIKE '%al.artist_id = t.artist_id%' OR def NOT LIKE '%pr.artist_id = t.artist_id%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the album grant is not bound to the selling artist';
  END IF;
  -- Everything the previous version guarded must survive.
  IF def NOT LIKE '%tier_unlock_months%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the member drip was lost';
  END IF;
  IF def NOT LIKE '%NOT v_in_window%' OR def NOT LIKE '%public_release_date%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the early-access window guard was lost';
  END IF;
  IF def NOT LIKE '%track_id = p_track AND status = ''completed''%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the per-song purchase clause was lost';
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
  IF has_column_privilege('anon', 'public.tracks', 'audio_url_320', 'SELECT')
     OR has_column_privilege('anon', 'public.tracks', 'audio_url_128', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon can read raw audio columns on tracks';
  END IF;
  RAISE NOTICE 'schema-phase2-tape-purchase: OK';
END $$;
