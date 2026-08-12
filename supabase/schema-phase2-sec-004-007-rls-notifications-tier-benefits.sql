-- ============================================================================
-- SEC-004 + SEC-007 — close the two confirmed anonymous WRITE holes
-- ============================================================================
-- Cybersecurity audit 2026-08-12, docs/CYBERSECURITY_AUDIT_2026-08-12.md
--
-- Both were proven against production, not inferred.
--
-- SEC-004 notifications: the INSERT policy is
--     CREATE POLICY "Service role can insert notifications"
--       ON notifications FOR INSERT WITH CHECK (true);
-- with NO `TO service_role`. A policy with no role list applies to PUBLIC, so
-- the name documents an intent the SQL never expressed. Proof: an anonymous
-- INSERT was refused with 23503 (foreign key violation on user_id), NOT 42501.
-- RLS let the write through and only a deliberately fake uuid stopped it. Since
-- profiles.id is anon-readable, real targets are trivially enumerable, so any
-- visitor could push a notification with attacker-chosen title, message and link
-- into any user's feed: an in-product phishing channel wearing CRWN's own UI.
-- Safe to restrict: every notification insert in src/ goes through the
-- service-role client (verified by grep, 14 call sites, zero browser writes).
--
-- SEC-007 tier_benefits: the table has NO CREATE migration anywhere in
-- supabase/ (schema-phase2-promise-calendar.sql line 16 calls it "a manually-created
-- table"), therefore no RLS statement has ever run against it. Proof: anon reads
-- 52 of 52 rows. The browser writes it directly (src/components/artist/TierManager.tsx
-- lines 227/236/309), so the write path is open to at least `authenticated` and,
-- with no RLS, most likely to `anon` as well. That matters because tier benefits
-- ARE entitlements: src/lib/messaging.ts tierHasMessaging() reads this table to
-- grant DM access, and the Promise Calendar derives fan obligations from it. A
-- DELETE by tier_id would wipe every paying tier's promises for any artist.
--
-- Ownership is enforced through a SECURITY DEFINER helper rather than an inline
-- policy subquery. That is deliberate and follows the precedent set by
-- user_passes_artist_gate(): artist_profiles has REVOKED columns, and a policy
-- subquery that touches a revoked column fails the WHOLE statement with 42501
-- (this has bitten CRWN before). A SECURITY DEFINER function runs as its owner
-- and is immune to the caller's column privileges.
--
-- Idempotent. Additive/restrictive only. No data is rewritten.
-- ROLLBACK: drop the policies created here (named below) and, if truly needed,
--   ALTER TABLE public.tier_benefits DISABLE ROW LEVEL SECURITY;
--   CREATE POLICY "Service role can insert notifications" ON public.notifications
--     FOR INSERT WITH CHECK (true);
-- Do not roll back casually: that restores an anonymous write channel.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------------------
-- SEC-004. Restrict the notifications INSERT policy to the service role.
-- ---------------------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
CREATE POLICY "Service role can insert notifications"
  ON public.notifications
  FOR INSERT
  TO service_role          -- the fix: without this the policy applied to PUBLIC
  WITH CHECK (true);

-- Browsers must never write notifications directly. Reads/updates (marking read)
-- are governed by the pre-existing owner policies, which are left untouched.
REVOKE INSERT ON public.notifications FROM anon;
REVOKE INSERT ON public.notifications FROM authenticated;

-- ---------------------------------------------------------------------------------------
-- SEC-007. Give tier_benefits the RLS it never had.
-- ---------------------------------------------------------------------------------------
-- Ownership oracle: does the CALLER own the artist that owns this tier?
-- SECURITY DEFINER so the lookup is immune to the caller's column privileges.
CREATE OR REPLACE FUNCTION public.owns_subscription_tier(p_tier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.subscription_tiers t
      JOIN public.artist_profiles a ON a.id = t.artist_id
     WHERE t.id = p_tier_id
       AND a.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.owns_subscription_tier(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owns_subscription_tier(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.owns_subscription_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_subscription_tier(uuid) TO service_role;

ALTER TABLE public.tier_benefits ENABLE ROW LEVEL SECURITY;

-- READ stays public: benefits are shown on the public artist page
-- (src/app/[slug]/page.tsx line 147) to sell the tier. They are marketing copy,
-- not secrets. Narrowing this would break the storefront.
DROP POLICY IF EXISTS "Tier benefits are viewable by everyone" ON public.tier_benefits;
CREATE POLICY "Tier benefits are viewable by everyone"
  ON public.tier_benefits FOR SELECT
  USING (true);

-- WRITE is owner-only. TierManager writes from the browser, so `authenticated`
-- keeps INSERT/UPDATE/DELETE, but only for tiers the caller actually owns.
DROP POLICY IF EXISTS "Artists insert own tier benefits" ON public.tier_benefits;
CREATE POLICY "Artists insert own tier benefits"
  ON public.tier_benefits FOR INSERT
  TO authenticated
  WITH CHECK (public.owns_subscription_tier(tier_id));

DROP POLICY IF EXISTS "Artists update own tier benefits" ON public.tier_benefits;
CREATE POLICY "Artists update own tier benefits"
  ON public.tier_benefits FOR UPDATE
  TO authenticated
  USING (public.owns_subscription_tier(tier_id))
  WITH CHECK (public.owns_subscription_tier(tier_id));

DROP POLICY IF EXISTS "Artists delete own tier benefits" ON public.tier_benefits;
CREATE POLICY "Artists delete own tier benefits"
  ON public.tier_benefits FOR DELETE
  TO authenticated
  USING (public.owns_subscription_tier(tier_id));

-- anon may read (policy above) but never write.
REVOKE INSERT, UPDATE, DELETE ON public.tier_benefits FROM anon;

COMMIT;

-- ---------------------------------------------------------------------------------------
-- Self-verify. Uses privilege/among-policies facts rather than mere existence, because
-- a bare "a policy row exists" assertion passes vacuously for the superuser running it.
-- ---------------------------------------------------------------------------------------
DO $$
DECLARE v_roles name[];
BEGIN
  -- SEC-004: the INSERT policy must be scoped to service_role, not PUBLIC.
  SELECT polroles::regrole[]::name[] INTO v_roles
    FROM pg_policy
   WHERE polrelid = 'public.notifications'::regclass
     AND polname = 'Service role can insert notifications';

  IF v_roles IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: notifications INSERT policy is missing';
  END IF;
  IF '-' = ANY(v_roles) OR 'public' = ANY(v_roles) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: notifications INSERT policy still applies to PUBLIC (SEC-004 is still open)';
  END IF;
  IF has_table_privilege('anon', 'public.notifications', 'INSERT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon still holds INSERT on notifications';
  END IF;

  -- SEC-007: RLS must actually be ON, not merely policied.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tier_benefits'::regclass) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS is not enabled on tier_benefits (SEC-007 is still open)';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.tier_benefits'::regclass) < 4 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: tier_benefits is missing its read/insert/update/delete policies';
  END IF;
  IF has_table_privilege('anon', 'public.tier_benefits', 'INSERT')
     OR has_table_privilege('anon', 'public.tier_benefits', 'DELETE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: anon can still write tier_benefits';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.owns_subscription_tier(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: authenticated cannot execute owns_subscription_tier, so artists could not edit their own benefits';
  END IF;

  RAISE NOTICE 'SEC-004 + SEC-007 verified.';
END $$;
