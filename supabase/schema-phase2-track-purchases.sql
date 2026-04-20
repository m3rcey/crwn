-- Adds per-track one-time purchases.
-- Before this, artists could set `tracks.price` but nothing read it — fans hit
-- a dead-end "Subscribe to unlock" with no actual purchase path. This migration
-- extends the existing `purchases` table so a row can reference EITHER a
-- `product_id` OR a `track_id`, adds the needed indexes, and opens the RLS
-- insert policy for the service role (webhooks already use the admin client).

-- 1. Add track_id column (nullable)
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS track_id UUID REFERENCES tracks(id) ON DELETE CASCADE;

-- 2. Drop NOT NULL on product_id so track purchases can leave it empty
ALTER TABLE purchases
  ALTER COLUMN product_id DROP NOT NULL;

-- 3. Enforce XOR: every row must reference exactly one of product_id / track_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchases_product_or_track'
  ) THEN
    ALTER TABLE purchases
      ADD CONSTRAINT purchases_product_or_track
      CHECK ((product_id IS NOT NULL) <> (track_id IS NOT NULL));
  END IF;
END $$;

-- 4. Index for per-track access lookups (fan_id + track_id)
CREATE INDEX IF NOT EXISTS idx_purchases_fan_track
  ON purchases(fan_id, track_id)
  WHERE track_id IS NOT NULL;

-- 5. Index for artist-level track sales reporting
CREATE INDEX IF NOT EXISTS idx_purchases_track
  ON purchases(track_id)
  WHERE track_id IS NOT NULL;
