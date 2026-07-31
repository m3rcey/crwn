-- ============================================================
-- community_posts.is_artist_post must mean what it says
-- ============================================================
-- THE BUG: `is_artist_post` renders a post with the artist's badge, styled as
-- the artist speaking to their community. Its INSERT policy is only
-- `auth.uid() = author_id`, so NOTHING stopped any authenticated user from
-- setting it true on someone else's page. The client made it reachable without
-- any crafted request: the public page computed "is this viewer an artist?"
-- instead of "does this viewer own THIS page", so any artist posting on another
-- artist's page had their post written as that artist's own.
--
-- The client is fixed, but a client check is not a control. This trigger makes
-- the database the authority: the flag survives only for the page owner.
--
-- Same reasoning for `is_active`-style moderation columns is NOT applied here:
-- deletion is already correctly gated by the existing owner DELETE policy.

BEGIN;

CREATE OR REPLACE FUNCTION enforce_artist_post_authorship()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only the artist who owns the community may post AS the artist. Anyone else
  -- writes a normal fan post; we downgrade the flag rather than erroring, so a
  -- stale client cannot break posting for a fan who did nothing wrong.
  IF COALESCE(NEW.is_artist_post, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM artist_profiles
       WHERE id = NEW.artist_id
         AND user_id = NEW.author_id
    ) THEN
      NEW.is_artist_post := false;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_artist_post_authorship ON community_posts;
CREATE TRIGGER trg_enforce_artist_post_authorship
  BEFORE INSERT OR UPDATE OF is_artist_post, artist_id, author_id ON community_posts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_artist_post_authorship();

-- Repair any row that already carries a false claim of artist authorship.
UPDATE community_posts p
   SET is_artist_post = false
 WHERE p.is_artist_post = true
   AND NOT EXISTS (
     SELECT 1 FROM artist_profiles a
      WHERE a.id = p.artist_id
        AND a.user_id = p.author_id
   );

COMMIT;

-- ============================================================
-- Self-verify: a partial apply must fail loudly rather than leave the
-- authorship flag unguarded.
-- ============================================================
DO $$
DECLARE
  bad_rows INTEGER;
BEGIN
  IF to_regprocedure('enforce_artist_post_authorship()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: enforce_artist_post_authorship() missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_enforce_artist_post_authorship'
       AND tgrelid = 'community_posts'::regclass
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_enforce_artist_post_authorship missing (is_artist_post is spoofable)';
  END IF;

  SELECT COUNT(*) INTO bad_rows
    FROM community_posts p
   WHERE p.is_artist_post = true
     AND NOT EXISTS (
       SELECT 1 FROM artist_profiles a
        WHERE a.id = p.artist_id AND a.user_id = p.author_id
     );

  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % post(s) still claim artist authorship they do not have', bad_rows;
  END IF;

  RAISE NOTICE 'schema-phase2-artist-post-authorship: OK';
END $$;
