-- Widen products.type / products.delivery_type CHECK constraints to match the code.
--
-- WHY: schema-phase2-shop.sql created
--   type CHECK (type IN ('digital','experience','bundle'))
--   delivery_type CHECK (delivery_type IN ('instant','scheduled','custom'))
-- but three live creation paths write type 'physical' with delivery_type 'shipped':
--   - src/app/setup/page.tsx (the artist setup wizard's product screens)
--   - src/app/offers/new/page.tsx (the offer builder, digital/physical only)
--   - src/components/artist/ShopManager.tsx
-- If the original constraint is still in place, every physical-product insert fails with
-- a CHECK violation, which silently breaks the setup wizard's Shop group and the offer
-- builder's physical path. This migration is idempotent and safe to run even if the
-- constraint was already widened by hand.

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE products ADD CONSTRAINT products_type_check
  CHECK (type IN ('digital', 'experience', 'bundle', 'physical'));

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_delivery_type_check;
ALTER TABLE products ADD CONSTRAINT products_delivery_type_check
  CHECK (delivery_type IN ('instant', 'scheduled', 'custom', 'shipped'));

-- Self-verify: fail loudly if either constraint is missing or still rejects the new values.
DO $$
DECLARE
  type_def text;
  delivery_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO type_def
  FROM pg_constraint
  WHERE conname = 'products_type_check' AND conrelid = 'products'::regclass;

  IF type_def IS NULL THEN
    RAISE EXCEPTION 'products_type_check is missing after migration';
  END IF;
  IF type_def NOT LIKE '%physical%' THEN
    RAISE EXCEPTION 'products_type_check does not allow physical: %', type_def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO delivery_def
  FROM pg_constraint
  WHERE conname = 'products_delivery_type_check' AND conrelid = 'products'::regclass;

  IF delivery_def IS NULL THEN
    RAISE EXCEPTION 'products_delivery_type_check is missing after migration';
  END IF;
  IF delivery_def NOT LIKE '%shipped%' THEN
    RAISE EXCEPTION 'products_delivery_type_check does not allow shipped: %', delivery_def;
  END IF;
END $$;
