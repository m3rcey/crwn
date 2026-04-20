-- Unsticks tracks that were saved with a one-time price but no tier access path.
-- These tracks currently show "Subscribe to unlock" with an empty tier list on the
-- fan-facing page because per-track purchases were never implemented.
-- Fix: flip them back to free and clear the orphaned price so they play again.

-- Preview what will change (run this first to inspect):
-- SELECT t.id, t.title, t.is_free, t.allowed_tier_ids, t.price, ap.slug
-- FROM tracks t
-- JOIN artist_profiles ap ON ap.id = t.artist_id
-- WHERE t.is_free = false
--   AND (t.allowed_tier_ids IS NULL OR jsonb_array_length(t.allowed_tier_ids) = 0);

UPDATE tracks
SET is_free = true,
    price = NULL,
    allowed_tier_ids = '[]'::jsonb
WHERE is_free = false
  AND (allowed_tier_ids IS NULL OR jsonb_array_length(allowed_tier_ids) = 0);
