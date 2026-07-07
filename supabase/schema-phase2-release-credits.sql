-- ─────────────────────────────────────────────────────────────────────────────
-- Release credits  (feature: fans in a credits-enabled tier get credited on a
-- release, and can see themselves credited when it drops)
--
-- Eligibility source is the `credits_on_releases` tier benefit (benefitCatalog.ts).
-- The artist assigns credits to a specific release (a track or an album) via
-- POST /api/release-credits (service role, ownership-checked). Rows are read
-- publicly to render a "Credits" list on the public track/album page.
--
-- A "release" here is a track OR an album (there is no unified releases table),
-- so we carry a (release_type, release_id) pair.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS release_credits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id    UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  release_type TEXT NOT NULL CHECK (release_type IN ('track', 'album')),
  release_id   UUID NOT NULL,
  fan_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_label   TEXT NOT NULL DEFAULT 'Credited Supporter',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (release_type, release_id, fan_id)
);

-- Render lookup: all credited fans for a given release.
CREATE INDEX IF NOT EXISTS idx_release_credits_release
  ON release_credits (release_type, release_id);
-- "Where am I credited?" lookup for a fan.
CREATE INDEX IF NOT EXISTS idx_release_credits_fan
  ON release_credits (fan_id);

ALTER TABLE release_credits ENABLE ROW LEVEL SECURITY;

-- Credits are public recognition — anyone can read them to render the release page.
DROP POLICY IF EXISTS "public_reads_release_credits" ON release_credits;
CREATE POLICY "public_reads_release_credits" ON release_credits
  FOR SELECT USING (true);

-- (Writes happen only through the service-role /api/release-credits route after
--  an ownership check — no client INSERT/UPDATE/DELETE policy on purpose.)

-- ─── Self-verify ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'release_credits'
  ) THEN
    RAISE EXCEPTION 'release_credits table missing after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'release_credits' AND policyname = 'public_reads_release_credits'
  ) THEN
    RAISE EXCEPTION 'public_reads_release_credits policy missing after migration';
  END IF;
END $$;
