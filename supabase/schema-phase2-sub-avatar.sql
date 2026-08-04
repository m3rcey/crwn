-- Sub-avatar taxonomy: the ONLY stored pieces of the avatar system.
--
-- The avatar itself is DERIVED ON READ (src/lib/avatars/*): the acquisition avatar from the
-- artist's oldest claimed calculator result, the observed avatar from declared inputs plus
-- account behavior. Neither is stored, so neither can go stale. What IS stored:
--   1. artist_profiles.sub_avatar_override  - a manual, authorized override (artist or admin).
--   2. sub_avatar_audit                     - the audit history of override changes.
--
-- COLUMN PRIVILEGES, DELIBERATE: sub_avatar_override gets NO grant to anon/authenticated.
-- All reads and writes go through /api/artist/avatar with the service-role client and an
-- explicit ownership check. Do NOT "fix" this by granting the column: a browser-side
-- select('*') on artist_profiles must keep working exactly as before, and per the house rule a
-- newly granted column would also need the artist_profiles_public view rebuilt. Server-only
-- access sidesteps both.
--
-- Fail-soft: every code path that touches these objects tolerates their absence, so shipping
-- code before this migration runs breaks nothing.

-- 1. The override column.
ALTER TABLE artist_profiles ADD COLUMN IF NOT EXISTS sub_avatar_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sub_avatar_override_valid'
  ) THEN
    ALTER TABLE artist_profiles
      ADD CONSTRAINT chk_sub_avatar_override_valid CHECK (
        sub_avatar_override IS NULL OR sub_avatar_override IN (
          'membership_stack_consolidator',
          'touring_access_seller',
          'live_community_creator',
          'catalog_vault_seller'
        )
      );
  END IF;
END $$;

-- 2. The audit history. One row per override change, written only by the service role.
CREATE TABLE IF NOT EXISTS sub_avatar_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL,
  previous_avatar text,
  next_avatar text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'system')),
  actor_user_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_avatar_audit_artist ON sub_avatar_audit (artist_id, created_at DESC);

ALTER TABLE sub_avatar_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sub_avatar_audit' AND policyname = 'admin_read_sub_avatar_audit'
  ) THEN
    CREATE POLICY admin_read_sub_avatar_audit ON sub_avatar_audit
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON sub_avatar_audit FROM anon, authenticated;

-- 3. Self-verify (house rule: a partial apply must error loudly, never half-land).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'artist_profiles' AND column_name = 'sub_avatar_override'
  ) THEN
    RAISE EXCEPTION 'sub-avatar migration incomplete: artist_profiles.sub_avatar_override missing';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_sub_avatar_override_valid') THEN
    RAISE EXCEPTION 'sub-avatar migration incomplete: chk_sub_avatar_override_valid missing';
  END IF;

  IF to_regclass('public.sub_avatar_audit') IS NULL THEN
    RAISE EXCEPTION 'sub-avatar migration incomplete: sub_avatar_audit table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sub_avatar_audit' AND policyname = 'admin_read_sub_avatar_audit'
  ) THEN
    RAISE EXCEPTION 'sub-avatar migration incomplete: admin_read_sub_avatar_audit policy missing';
  END IF;

  RAISE NOTICE 'sub-avatar migration verified OK';
END $$;
