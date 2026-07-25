-- ============================================================================
-- CRWN Opportunity Ledger
-- ============================================================================
-- Apply MANUALLY in the Supabase SQL editor (not auto-run). Idempotent.
--
-- Tracks the dollar opportunity a calculator revealed, through its lifecycle, per artist and
-- per FEATURE (not per calculator). Feature grain is the duplicate-counting defense: two
-- calculators can describe the SAME money (Streaming Loss and the Vault planner both point at
-- membership), so they are collapsed to one feature row (max reveal), and captured revenue is a
-- real feature-level number that cannot be double-counted.
--
-- States on each row:
--   revealed_cents   what the calculator estimated (monthly)
--   activated        the artist built the feature
--   captured_cents   real money earned from that feature (recomputed from live revenue tables)
--   remaining_cents  max(0, revealed - captured)
--
-- Security: writes ONLY via service-role recompute (routes/cron authenticate themselves). Artists
-- may read their OWN rows; admins read all.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS opportunity_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  artist_id uuid NOT NULL,
  feature   text NOT NULL CHECK (feature IN ('membership', 'live', 'referral')),

  -- The calculator that produced the current reveal (the max for this feature). A dimension, not
  -- the grain: the grain is (artist_id, feature), so a re-run never adds a second row.
  calculator text,

  revealed_cents  bigint NOT NULL DEFAULT 0,
  captured_cents  bigint NOT NULL DEFAULT 0,
  remaining_cents bigint NOT NULL DEFAULT 0,

  activated    boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  revealed_at  timestamptz,  -- when the opportunity was first revealed (may predate this period)

  -- The month/year the captured/remaining figures pertain to. Part of the grain, so the ledger is
  -- a per-feature MONTHLY time series (a dashboard groups by these directly). Captured is that
  -- month's realized revenue; revealed is the standing estimate carried into the month.
  period_month int NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year  int NOT NULL,

  last_recomputed_at timestamptz,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- The grain and the dedup guarantee: one row per artist per feature per month. Recompute upserts
-- the CURRENT month's row; past months stay frozen as history. A calculator re-run never adds a
-- row (it updates revealed on the current-month row), and two calculators for one feature collapse
-- to one row (max reveal), so nothing is ever double-counted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunity_artist_feature_period
  ON opportunity_ledger (artist_id, feature, period_year, period_month);

-- Dashboard indexes: by feature, by calculator, by period, by artist.
CREATE INDEX IF NOT EXISTS idx_opportunity_feature ON opportunity_ledger (feature);
CREATE INDEX IF NOT EXISTS idx_opportunity_calculator ON opportunity_ledger (calculator) WHERE calculator IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunity_period ON opportunity_ledger (period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_opportunity_artist ON opportunity_ledger (artist_id);

-- Keep updated_at honest.
CREATE OR REPLACE FUNCTION touch_opportunity_ledger() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_touch_opportunity_ledger ON opportunity_ledger;
CREATE TRIGGER trg_touch_opportunity_ledger BEFORE UPDATE ON opportunity_ledger
  FOR EACH ROW EXECUTE FUNCTION touch_opportunity_ledger();

-- RLS: an artist reads their own opportunity; admins read all. Service role bypasses RLS to write.
ALTER TABLE opportunity_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artist_read_own_opportunity" ON opportunity_ledger;
CREATE POLICY "artist_read_own_opportunity" ON opportunity_ledger
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "admin_read_opportunity" ON opportunity_ledger;
CREATE POLICY "admin_read_opportunity" ON opportunity_ledger
  FOR SELECT USING (auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin'));

REVOKE INSERT, UPDATE, DELETE ON opportunity_ledger FROM anon, authenticated;

COMMIT;

-- ---------------------------------------------------------------------------
-- Self-verify (fails LOUDLY on partial apply)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.opportunity_ledger') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: opportunity_ledger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_opportunity_artist_feature_period') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: opportunity_ledger (artist,feature,period) unique index missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'opportunity_ledger' AND policyname = 'artist_read_own_opportunity'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: opportunity_ledger artist read policy missing';
  END IF;
  RAISE NOTICE 'OK: opportunity_ledger created';
END $$;
