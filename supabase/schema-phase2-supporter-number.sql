-- ============================================================
-- Supporter numbers: "PLATINUM #3" (founder decision, 2026-10-02)
-- ============================================================
-- WHAT IT IS. The Nth person who ever PAID a given artist. Stamped once, the first time a fan's
-- subscription is paid for, and never changed again: not on upgrade, not on downgrade, not when
-- they cancel and come back. It is TENURE, not tier, which is the whole point. A fan who moves
-- Silver -> Platinum keeps #3, and so does a fan who moves Platinum -> Silver.
--
-- WHY IT REPLACES A CAP. The alternative was a Founder Window ("first 100"), and with zero members
-- there is no honest number to cap at: too high and the scarcity is visibly fake, too low and it
-- caps the artist's best tier the moment it works. A number has no wrong setting, never expires as
-- urgency (it only ever goes up), and does not advertise how few members there are. It also stands
-- in for Day One on an artist with no founder window: is_founder is never set there, so without
-- this there is no early-member signal at all.
--
-- WHY IT IS STORED AND NOT DERIVED. CRWN derives rather than stores wherever it can. Not here: a
-- fan treats this as their identity, and a derived position would shift if any earlier row were
-- ever deleted. A number that can change is worse than one that is written down.
--
-- ONE SEQUENCE PER ARTIST, across every rung, because the number answers "how early did you back
-- him", not "what do you pay". Free members get none: the number marks backers.
--
-- SECURITY. The assigner is SECURITY DEFINER and EXECUTE is granted to service_role ONLY, so a fan
-- cannot mint themselves a number. A trigger additionally freezes the column against anon and
-- authenticated writes, because a fan who could UPDATE their own subscription row could otherwise
-- just set supporter_number = 1.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS supporter_number integer;

COMMENT ON COLUMN public.subscriptions.supporter_number IS
  'The Nth person who ever paid this artist. Stamped once at the first paid checkout and never changed: survives upgrade, downgrade, cancellation and rejoin. NULL for members who have never paid.';

-- Two numbers can never collide for one artist, which is also what makes a concurrent double
-- checkout fail loudly instead of silently handing out #3 twice.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_artist_supporter_number_key
  ON public.subscriptions (artist_id, supporter_number)
  WHERE supporter_number IS NOT NULL;

-- ── The assigner ────────────────────────────────────────────────────────────────
-- Idempotent: a row that already carries a number keeps it and the existing value is returned.
-- The advisory lock is per artist, so two people checking out at the same second queue rather
-- than race. Returns NULL when there is no such subscription row.
CREATE OR REPLACE FUNCTION public.assign_supporter_number(p_fan uuid, p_artist uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_next integer;
BEGIN
  SELECT supporter_number INTO v_existing
    FROM subscriptions
   WHERE fan_id = p_fan AND artist_id = p_artist;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;  -- stamped once, never re-stamped
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('supporter_number:' || p_artist::text));

  SELECT COALESCE(MAX(supporter_number), 0) + 1 INTO v_next
    FROM subscriptions
   WHERE artist_id = p_artist;

  UPDATE subscriptions
     SET supporter_number = v_next
   WHERE fan_id = p_fan AND artist_id = p_artist AND supporter_number IS NULL;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_supporter_number(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_supporter_number(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_supporter_number(uuid, uuid) TO service_role;

-- ── Freeze the column against the browser roles ─────────────────────────────────
-- Without this, any fan who can UPDATE their own subscription row can award themselves #1.
CREATE OR REPLACE FUNCTION public.freeze_subscription_supporter_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    NEW.supporter_number := OLD.supporter_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_supporter_number ON public.subscriptions;
CREATE TRIGGER trg_freeze_supporter_number
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_subscription_supporter_number();

-- ── Backfill ────────────────────────────────────────────────────────────────────
-- Everyone who has ever paid, in the order they first did, per artist. A membership on a free
-- tier is skipped: the number marks backers. Runs once; re-running changes nothing because every
-- row it would touch already has a number.
WITH paid AS (
  SELECT s.id,
         s.artist_id,
         row_number() OVER (PARTITION BY s.artist_id ORDER BY s.created_at, s.id) AS n
    FROM subscriptions s
    JOIN subscription_tiers t ON t.id = s.tier_id
   WHERE s.supporter_number IS NULL
     AND COALESCE(t.price, 0) > 0
)
UPDATE subscriptions s
   SET supporter_number = paid.n
  FROM paid
 WHERE s.id = paid.id;

COMMIT;

-- ============================================================
-- Self-verify: the column, the uniqueness, the assigner, its grants, and the freeze.
-- ============================================================
DO $$
DECLARE
  v_dupes integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'subscriptions' AND column_name = 'supporter_number'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: subscriptions.supporter_number missing';
  END IF;

  IF to_regprocedure('public.assign_supporter_number(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: assign_supporter_number() missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'assign_supporter_number'
       AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a browser role can execute assign_supporter_number (a fan could mint their own number)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_freeze_supporter_number' AND tgrelid = 'subscriptions'::regclass
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: trg_freeze_supporter_number missing (a fan could set their own number)';
  END IF;

  SELECT COUNT(*) INTO v_dupes FROM (
    SELECT artist_id, supporter_number FROM subscriptions
     WHERE supporter_number IS NOT NULL
     GROUP BY artist_id, supporter_number HAVING COUNT(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: % artist(s) have a duplicate supporter number', v_dupes;
  END IF;

  RAISE NOTICE 'schema-phase2-supporter-number: OK';
END $$;
