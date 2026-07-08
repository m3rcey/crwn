-- ============================================================================
-- Forge-guard: tighten WITH CHECK(true) INSERT policies  (security audit M1)
-- ============================================================================
-- These tables feed downstream logic (missions/squads/city-unlocks/badges read
-- fan_events as "what the fan did"; bounty submissions feed the payout decision;
-- discount_code_uses enforces usage caps). Each had an INSERT/ALL policy with
-- `WITH CHECK (true)`, which — because RLS policies apply to the authenticated
-- role (only the service role bypasses RLS) — let any signed-in client forge
-- rows the app then trusts.
--
-- All legitimate writes go through the service-role client in API routes / lib
-- helpers (verified: no browser-client inserts in src/), so restricting the
-- client-facing WITH CHECK does NOT affect the app.
--
-- Each block is guarded by table existence, so this applies cleanly regardless
-- of which feature tables are deployed (e.g. discount_code_uses may not exist
-- yet — its source migration is separately hardened to be born WITH CHECK false).
-- ============================================================================

-- fan_events: service-role only (recordFanEvent). Block client inserts. --------
DO $$ BEGIN
  IF to_regclass('public.fan_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service role inserts fan events" ON fan_events;
    CREATE POLICY "Service role inserts fan events" ON fan_events
      FOR INSERT WITH CHECK (false);
  END IF;
END $$;

-- fan_badge_awards: service-role only (awardBadge). Block self-awarding. -------
DO $$ BEGIN
  IF to_regclass('public.fan_badge_awards') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service role inserts badge awards" ON fan_badge_awards;
    CREATE POLICY "Service role inserts badge awards" ON fan_badge_awards
      FOR INSERT WITH CHECK (false);
  END IF;
END $$;

-- discount_code_uses: service-role only (webhook redemption). --------------
DO $$ BEGIN
  IF to_regclass('public.discount_code_uses') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service role inserts discount code uses" ON discount_code_uses;
    CREATE POLICY "Service role inserts discount code uses" ON discount_code_uses
      FOR INSERT WITH CHECK (false);
  END IF;
END $$;

-- clip_bounty_submissions: submissions are created via the API route (service
-- role). Keep the owning-artist read/manage scope, but the WITH CHECK must
-- mirror ownership instead of `true` so a random clipper can't insert a
-- self-"approved" submission with inflated view counts against any bounty.
DO $$ BEGIN
  IF to_regclass('public.clip_bounty_submissions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service manages submissions" ON clip_bounty_submissions;
    CREATE POLICY "Service manages submissions" ON clip_bounty_submissions
      FOR ALL USING (
        bounty_id IN (SELECT id FROM clip_bounties WHERE artist_id IN
          (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
      )
      WITH CHECK (
        bounty_id IN (SELECT id FROM clip_bounties WHERE artist_id IN
          (SELECT id FROM artist_profiles WHERE user_id = auth.uid()))
      );
  END IF;
END $$;

-- ============================================================================
-- Self-verify — for every table that EXISTS, its targeted policy must exist
-- with a non-permissive check.
-- ============================================================================
DO $$
DECLARE
  offending text;
BEGIN
  -- The three service-only INSERT policies must be WITH CHECK (false)
  -- wherever their table exists.
  SELECT tablename || '.' || policyname INTO offending
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      (tablename = 'fan_events'          AND policyname = 'Service role inserts fan events') OR
      (tablename = 'fan_badge_awards'    AND policyname = 'Service role inserts badge awards') OR
      (tablename = 'discount_code_uses'  AND policyname = 'Service role inserts discount code uses')
    )
    AND (with_check IS DISTINCT FROM 'false')
  LIMIT 1;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'forge-guard: policy still permissive (expected WITH CHECK false): %', offending;
  END IF;

  -- The bounty-submission policy, if that table exists, must NOT be WITH CHECK(true).
  IF to_regclass('public.clip_bounty_submissions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'clip_bounty_submissions'
         AND policyname = 'Service manages submissions'
         AND with_check IS DISTINCT FROM 'true'
     ) THEN
    RAISE EXCEPTION 'forge-guard: clip_bounty_submissions "Service manages submissions" missing or still WITH CHECK(true)';
  END IF;

  RAISE NOTICE 'forge-guard-rls: OK (present tables locked to service role)';
END $$;
