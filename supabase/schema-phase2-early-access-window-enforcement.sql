-- ============================================================
-- Early access becomes SERVER-ENFORCED
-- ============================================================
-- The "members first, public later" content class (release strategy spec
-- section 5) is encoded by fieldsForClass('paid_first') as:
--
--     is_free = true,  allowed_tier_ids = [...],  public_release_date = <future>
--
-- is_free stays TRUE on purpose: that is what makes "public later" real once
-- the window passes, with no second write and no scheduler involved.
--
-- THE BUG THIS FIXES
-- ------------------
-- can_play_track() short-circuited on `IF t.is_free THEN RETURN true`, and it
-- never read public_release_date. So for the entire early-access window the
-- oracle answered TRUE for EVERY reader, including anonymous. tracks_public
-- hands back audio_url_128/320 on exactly that boolean, and it is granted to
-- anon, so:
--
--   * GET /api/tracks/[id]/stream minted a signed URL for a logged-out visitor
--   * /embed/[trackId] passed its own `is_free` guard (paid_first IS is_free)
--   * every browser read of tracks_public carried the locator in the payload
--
-- The window was enforced only in GatedTrackPlayer, i.e. in React. That
-- violates the standing rule that no client-only visibility decision may be
-- the authority for protected audio. Nine live tier_benefits rows advertise
-- 7-day and 14-day early access, so this is a sold promise, not a hypothetical.
--
-- (The comment in schema-phase2-track-waterfall.sql claiming can_play_track
-- already saw public_release_date was wrong. It is corrected in that file.)
--
-- WHAT CHANGES
-- ------------
-- ONE line of behaviour in the ONE canonical oracle: the is_free short-circuit
-- no longer applies while a track is inside its early-access window. Nothing
-- else moves. No new resolver, no new column, no view change (tracks_public
-- calls this function, so it inherits the fix), no grant change, no RLS change.
--
-- "Inside the window" is defined EXACTLY as classifyTrack() defines
-- 'paid_first' in src/lib/membershipStrategy.ts:
--
--     public_release_date IS NOT NULL
--     AND public_release_date > now()
--     AND allowed_tier_ids is a non-empty array
--
-- The tier-list clause is load-bearing and is NOT a safety fallback bolted on
-- here: a future date with an EMPTY tier list names nobody to give early access
-- to, and the TypeScript contract already classifies it 'free_forever'.
-- Treating it as a locked window would lock out every paying member for the
-- whole window, which is the precise failure the content-class refactor was
-- written to make unrepresentable. Matching classifyTrack keeps one definition.
--
-- WHO CAN STILL PLAY AN IN-WINDOW TRACK
-- -------------------------------------
-- Unchanged, because the rest of the function is untouched: the owning artist,
-- anyone holding a completed purchase of that track, and any fan whose ACTIVE
-- subscription tier is in allowed_tier_ids. Everyone else, including anonymous
-- and a free-tier fan, is denied until the date passes. There is no tier
-- inheritance here and none is introduced: entitlement is exact membership of
-- allowed_tier_ids, which is what the release waterfall expands over time.
--
-- BLAST RADIUS AT APPLY TIME
-- --------------------------
-- Zero rows. Production has NO track with a public_release_date (verified
-- 2026-08-13, anon probe), so on the day this lands the predicate is false for
-- every row and behaviour is byte-identical. It changes the future.

BEGIN;

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
  fan_tier    UUID;
  v_tiers     JSONB;
  v_in_window BOOLEAN;
BEGIN
  SELECT artist_id, is_free, allowed_tier_ids, public_release_date
    INTO t FROM tracks WHERE id = p_track;
  IF NOT FOUND THEN RETURN false; END IF;

  -- to_jsonb() so this holds whether allowed_tier_ids is jsonb, text[] or
  -- uuid[] (the same defensive wrapper the tier check below has always used).
  -- jsonb_typeof guards the non-array case: jsonb_array_length() would ERROR on
  -- an object or scalar, and an erroring oracle denies every reader on the
  -- platform, not just this track.
  v_tiers := to_jsonb(t.allowed_tier_ids);
  v_in_window :=
        t.public_release_date IS NOT NULL
    AND t.public_release_date > now()
    AND v_tiers IS NOT NULL
    AND jsonb_typeof(v_tiers) = 'array'
    AND jsonb_array_length(v_tiers) > 0;

  -- THE FIX. Was: IF t.is_free THEN RETURN true;
  -- A members-first track is is_free = true for its whole window, so the bare
  -- short-circuit handed it to anonymous readers.
  IF t.is_free AND NOT v_in_window THEN RETURN true; END IF;

  IF v_user IS NULL THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM artist_profiles WHERE id = t.artist_id AND user_id = v_user) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM purchases WHERE fan_id = v_user AND track_id = p_track AND status = 'completed') THEN
    RETURN true;
  END IF;

  SELECT tier_id INTO fan_tier
    FROM subscriptions
   WHERE fan_id = v_user AND artist_id = t.artist_id AND status = 'active'
   LIMIT 1;

  IF fan_tier IS NULL THEN RETURN false; END IF;
  RETURN v_tiers ? fan_tier::text;
END;
$$;

-- The views call this with the INVOKER's privilege, so EXECUTE must stay where
-- schema-phase2-fix-entitlement-oracle-via-authuid.sql put it. This is the
-- IDENTICAL grant, re-asserted (CREATE OR REPLACE preserves the ACL, so this is
-- normally a no-op). It is not a widening: safety comes from the function
-- ignoring p_user and answering only for auth.uid(), which the daily rls-canary
-- probes as `can_play_track_not_an_oracle`.
GRANT EXECUTE ON FUNCTION can_play_track(UUID, UUID) TO anon, authenticated;

COMMIT;

-- ============================================================
-- Self-verify
-- ============================================================
-- Asserts facts about the DEPLOYED DEFINITION. It deliberately does not assert
-- "can I see it?": the SQL editor runs as a BYPASSRLS superuser, so a read test
-- here passes vacuously and proves nothing. Behavioural proof is
-- supabase/verify-early-access-window.sql (transactional, rolls back) plus the
-- anon probe in scripts/probe-migrations.mjs.
DO $$
DECLARE
  def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'can_play_track' AND n.nspname = 'public'
   LIMIT 1;

  IF def IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() missing';
  END IF;

  IF def NOT LIKE '%public_release_date%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() does not read public_release_date';
  END IF;

  IF def NOT LIKE '%NOT v_in_window%' THEN
    RAISE EXCEPTION 'MIGRATION FAILED: the is_free short-circuit is not window-guarded';
  END IF;

  -- A definer function with a mutable search_path is an escalation vector.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'can_play_track'
       AND prosecdef
       AND 'search_path=public' = ANY(COALESCE(proconfig, ARRAY[]::text[]))
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() lost SECURITY DEFINER or its pinned search_path';
  END IF;

  -- The views break without this, so a silent revoke must fail loudly here.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
     WHERE routine_name = 'can_play_track'
       AND grantee IN ('anon', 'authenticated')
       AND privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: can_play_track() lost EXECUTE for anon/authenticated';
  END IF;

  RAISE NOTICE 'schema-phase2-early-access-window-enforcement: OK';
END $$;
