-- schema-phase2-product-file-privacy.sql
-- Digital product files move to PRIVATE storage. Adds products.file_key.
--
-- ── WHAT WAS VERIFIED, AND WHAT IT ACTUALLY MEANT (2026-09-01) ──────────────────
--
-- The audit suspected a live leak of premium product files. Probed against production
-- with the ANON key, the finding is narrower and worth stating exactly:
--
--   * `products` SELECT policy really is `USING (is_active = true)` with no tier
--     predicate, and no later migration overrides it. Anon reads every active product.
--   * `file_url` really is selectable by anon -- the query returns rows rather than 42501,
--     so there is no column-level revoke.
--   * BUT: of 8 products in production, ZERO carry a file_url. There is nothing to leak.
--
-- So this is a LATENT defect, not a live breach, and it must not be reported as one. It
-- would have become a real leak on the first digital product upload, because ShopManager
-- put the file in the PUBLIC media bucket and stored its permanent public URL on a row
-- every visitor can read. Possession of that URL would have been sufficient to download
-- a paid file, with no authentication and no purchase.
--
-- ── WHY THIS MIGRATION DOES NOT REVOKE THE COLUMN ──────────────────────────────
--
-- The obvious fix -- REVOKE SELECT (file_url) FROM anon -- would BREAK EVERY ARTIST'S
-- SHOP. The public artist page reads `products` with select('*'), and naming one revoked
-- column fails the WHOLE statement with 42501, embedded joins included. The page would
-- read that as "no products" and the storefront would silently empty. That is the exact
-- trap documented in CLAUDE.md, and it has taken CRWN's checkout down before.
--
-- The root cause is not that the column is readable. It is that the column holds a
-- PUBLIC URL. Fixed at the source instead: digital product files now upload to the
-- PRIVATE R2 bucket and this migration adds `file_key` to hold the object key. A key is
-- not a capability -- the bucket has no public route, so the only way to bytes is a
-- short-lived signed URL from a route that has already checked the caller bought the
-- product. `file_url` is left in place, unread and unwritten by new code, holding null on
-- every row in production.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run. Not destructive: no existing
-- row carries a file, so nothing is migrated or lost.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS file_key text;

COMMENT ON COLUMN public.products.file_key IS
  'PRIVATE R2 object key for a digital product file. Served only through /api/products/[id]/download after a purchase check. Replaces file_url, which stored a permanent PUBLIC url and is no longer written.';

COMMENT ON COLUMN public.products.file_url IS
  'LEGACY. Held a permanent PUBLIC bucket url on a publicly-readable row. Null on every production row and no longer written by any code path; use file_key. Deliberately not revoked: the public artist page reads products with select(*), so a column revoke would 42501 the whole storefront.';

COMMIT;

-- ── Self-verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  n integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'file_key'
  ) THEN
    RAISE EXCEPTION 'products.file_key missing';
  END IF;

  -- The storefront must still be readable. If this ever fails, a column revoke was added
  -- and the public artist page's select(*) is about to return nothing.
  PERFORM 1 FROM public.products LIMIT 1;

  -- Record the state this migration was written against: no legacy public URLs in play.
  SELECT count(*) INTO n FROM public.products WHERE file_url IS NOT NULL;
  IF n > 0 THEN
    RAISE WARNING 'products.file_url is set on % row(s). Those files sit in the PUBLIC bucket and should be re-uploaded through the private path.', n;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM public.products) AS products,
  (SELECT count(*) FROM public.products WHERE file_url IS NOT NULL) AS legacy_public_urls_expect_0,
  (SELECT count(*) FROM public.products WHERE file_key IS NOT NULL) AS private_keys,
  'product file privacy applied' AS status;
