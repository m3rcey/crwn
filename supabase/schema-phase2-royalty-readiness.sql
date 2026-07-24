-- Royalty Readiness Check — the diagnostic layer for money the artist already
-- earned but may never have been set up to collect.
--
-- CRWN is NOT becoming a publisher, an administrator, or a collection society.
-- This stores a self-reported coverage checklist and nothing else: no royalty
-- amounts, no claims, no statements. The question set and the scoring live in
-- code (src/lib/royalty/readiness.ts) so the in-app check and the public tool
-- score identically. Only the answers live here.
--
-- Apply manually in the Supabase SQL editor. Self-verifies at the end.
-- Ships DARK: admin_settings.royalty_readiness is off until deliberately flipped.

-- 1) One check per user, overwritten as they update it. Answers are a flat
--    { question_key: 'yes' | 'no' | 'unsure' } map; the shape is validated in the
--    API route against the question catalog, so the column stays a plain JSONB.
--    `score` is CACHED, not authoritative: answers are the source of truth and the
--    score is always recomputed on read. It is stored so a future cohort query or
--    AI Manager prompt does not have to re-run the scorer over every row.
CREATE TABLE IF NOT EXISTS royalty_readiness (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers      JSONB NOT NULL DEFAULT '{}'::jsonb,
  score        INT NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_royalty_readiness_user ON royalty_readiness(user_id);

ALTER TABLE royalty_readiness ENABLE ROW LEVEL SECURITY;

-- A user reads and writes ONLY their own check. There is no public read: the
-- answers describe an artist's business affairs (who administers their catalog,
-- what is undocumented), which is nobody else's business. Server routes use the
-- service-role client and bypass RLS.
DROP POLICY IF EXISTS "royalty_readiness_select_own" ON royalty_readiness;
CREATE POLICY "royalty_readiness_select_own" ON royalty_readiness
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "royalty_readiness_insert_own" ON royalty_readiness;
CREATE POLICY "royalty_readiness_insert_own" ON royalty_readiness
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "royalty_readiness_update_own" ON royalty_readiness;
CREATE POLICY "royalty_readiness_update_own" ON royalty_readiness
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) updated_at maintenance. The check is edited repeatedly as an artist works
--    the list, and "when did they last touch this" is the only progress signal.
CREATE OR REPLACE FUNCTION touch_royalty_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_royalty_readiness ON royalty_readiness;
CREATE TRIGGER trg_touch_royalty_readiness
  BEFORE UPDATE ON royalty_readiness
  FOR EACH ROW EXECUTE FUNCTION touch_royalty_readiness();

-- 3) Dark-launch flag. Off by default. The API returns { enabled: false } and the
--    page renders nothing until this is flipped.
INSERT INTO admin_settings (key, value)
VALUES ('royalty_readiness', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Self-verify: fail loudly on a partial apply instead of silently half-landing.
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF to_regclass('public.royalty_readiness') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: royalty_readiness table missing';
  END IF;

  IF to_regprocedure('public.touch_royalty_readiness()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: touch_royalty_readiness() missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.royalty_readiness'::regclass
       AND tgname = 'trg_touch_royalty_readiness' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: updated_at trigger missing';
  END IF;

  -- RLS must be ON. A policy on a table without RLS enabled is decorative, and
  -- these answers must never be readable by another user.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.royalty_readiness'::regclass AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS not enabled on royalty_readiness';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'royalty_readiness';
  IF n < 3 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: expected 3 owner policies on royalty_readiness, found %', n;
  END IF;

  -- No policy may expose another user's answers.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'royalty_readiness'
       AND cmd = 'SELECT' AND qual NOT LIKE '%auth.uid()%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a SELECT policy does not scope to auth.uid()';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'royalty_readiness') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: royalty_readiness admin_settings flag missing';
  END IF;

  RAISE NOTICE 'schema-phase2-royalty-readiness: OK (flag admin_settings.royalty_readiness is OFF; flip it to launch)';
END $$;
