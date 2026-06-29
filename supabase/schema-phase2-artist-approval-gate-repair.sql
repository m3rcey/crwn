-- schema-phase2-artist-approval-gate-repair.sql
-- REPAIR for a broken partial apply of schema-phase2-artist-approval-gate.sql.
--
-- Symptom: every new artist hit "Your account isn't approved to publish an
-- artist page yet" and NO new artist_profiles row could be created (none in
-- months). Root cause: the function artist_gate_enabled() was missing from the
-- DB, but the INSERT policy "Gated artist profile insert" calls it. A policy
-- that references a non-existent function makes EVERY insert evaluation error
-- out -> RLS rejects the insert (42501) -> the form shows the approval message.
--
-- This script is idempotent and safe to re-run. It (re)creates the function and
-- the gate row FIRST, then rebuilds the insert policy LAST so the dependency
-- can never be half-applied again. The gate row defaults to disabled (OFF =
-- open publishing), so running this immediately unblocks new artists.
--
-- Apply in the Supabase SQL Editor.

-- 1. Approval flag (no-op if already present)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- 2. Grandfather existing artists/admins so nobody is locked out if the gate is ever turned ON
UPDATE profiles SET is_approved = true
WHERE is_approved = false
  AND (role IN ('artist', 'admin') OR id IN (SELECT user_id FROM artist_profiles));

-- 3. Ensure the gate switch row exists. Default disabled = gate OFF = open signups.
INSERT INTO admin_settings (key, value) VALUES ('artist_gate', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. (Re)create the gate-reader function. THIS is what was missing.
CREATE OR REPLACE FUNCTION artist_gate_enabled()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean FROM admin_settings WHERE key = 'artist_gate'),
    false
  );
$$;
GRANT EXECUTE ON FUNCTION artist_gate_enabled() TO authenticated, anon;

-- 5. (Re)create invite redemption (also lost in the partial apply if it errored here)
CREATE OR REPLACE FUNCTION redeem_invite(p_code TEXT, p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok BOOLEAN := false;
BEGIN
  UPDATE invite_codes
     SET uses = uses + 1
   WHERE lower(code) = lower(p_code)
     AND is_active = true
     AND (max_uses IS NULL OR uses < max_uses)
  RETURNING true INTO v_ok;

  IF v_ok THEN
    UPDATE profiles SET is_approved = true WHERE id = p_user;
  END IF;

  RETURN COALESCE(v_ok, false);
END;
$$;
REVOKE ALL ON FUNCTION redeem_invite(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_invite(TEXT, UUID) TO service_role;

-- 6. Rebuild the insert policy LAST, now that the function it depends on exists.
--    With the gate OFF (default), this is open to any authenticated user.
DROP POLICY IF EXISTS "Artists can insert their own profile" ON artist_profiles;
DROP POLICY IF EXISTS "Approved users can insert their own artist profile" ON artist_profiles;
DROP POLICY IF EXISTS "Gated artist profile insert" ON artist_profiles;
CREATE POLICY "Gated artist profile insert"
  ON artist_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT artist_gate_enabled()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND (p.is_approved = true OR p.role = 'admin')
      )
    )
  );

-- 7. SELF-VERIFY: fail LOUDLY if any piece didn't land. This is the template for
--    every future migration — end with assertions so a partial apply ERRORS in the
--    SQL editor instead of silently leaving onboarding half-broken (which is exactly
--    how artist_gate_enabled() went missing for months). Copy this pattern.
DO $$
BEGIN
  IF to_regprocedure('public.artist_gate_enabled()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: function artist_gate_enabled() is missing';
  END IF;
  IF to_regprocedure('public.redeem_invite(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: function redeem_invite(text,uuid) is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'artist_gate') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: admin_settings artist_gate row is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'artist_profiles' AND cmd = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: artist_profiles has NO INSERT policy — publishing is blocked';
  END IF;
  RAISE NOTICE 'OK: approval gate verified — function, redeem_invite, gate row, and insert policy all present.';
END $$;
