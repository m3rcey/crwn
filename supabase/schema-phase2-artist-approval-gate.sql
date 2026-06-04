-- schema-phase2-artist-approval-gate.sql
-- Gates BECOMING AN ARTIST behind approval. Fans are completely unaffected
-- (fans never insert into artist_profiles, so this policy never touches them).
--
-- Two ways a user gets approved:
--   1. Redeem an invite code  ->  /signup?invite=CODE  (the link you paste in IG DMs)
--   2. An admin flips is_approved from /admin (the "let whoever I want in" backup)
--
-- Apply in the Supabase SQL Editor. Safe to re-run.

-- 1. Approval flag on profiles (default false; fans never need it set)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT false;

-- 2. Grandfather everyone who is ALREADY an artist/admin so nobody gets locked out
UPDATE profiles SET is_approved = true
WHERE role IN ('artist', 'admin')
   OR id IN (SELECT user_id FROM artist_profiles);

-- 3. Invite codes (the IG-DM bypass). max_uses NULL = unlimited.
CREATE TABLE IF NOT EXISTS invite_codes (
  code        TEXT PRIMARY KEY,
  label       TEXT,
  max_uses    INTEGER,
  uses        INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
-- No public policies on purpose: only the service-role (API routes) reads/writes this table.

-- 4. Atomic redemption: increments uses under a guard and approves the user in one statement,
--    so two simultaneous redemptions can't both slip past a max_uses cap.
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

-- Only the service-role API route may call this (it passes the verified caller's id as p_user).
-- This stops a user from calling the RPC directly with someone else's id.
REVOKE ALL ON FUNCTION redeem_invite(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION redeem_invite(TEXT, UUID) TO service_role;

-- 5. THE GATE: only approved users (or admins) can create an artist profile.
DROP POLICY IF EXISTS "Artists can insert their own profile" ON artist_profiles;
CREATE POLICY "Approved users can insert their own artist profile"
  ON artist_profiles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.is_approved = true OR p.role = 'admin')
    )
  );

-- 6. Seed two invite codes for IG outreach. Rename / disable / add more from /admin -> Access.
INSERT INTO invite_codes (code, label, max_uses) VALUES
  ('FOUNDING', 'Founding artists - IG outreach', 200),
  ('CRWNVIP',  'General VIP invite link',        200)
ON CONFLICT (code) DO NOTHING;
