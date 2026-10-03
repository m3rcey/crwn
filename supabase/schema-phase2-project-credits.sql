-- ============================================================
-- Project credits: "FOUNDING SUPPORTER #7 on Stompin Thru The Trenches" (founder, 2026-10-03)
-- ============================================================
-- WHAT IT IS. A one-time product that puts a fan's NAME in a project's credits. Two levels:
--   founding  ($250 on Prince Dre's launch): numbered, top billing, a seat at the artist's
--             private listening session for that project.
--   supporter ($150, the downsell shown after a "no thanks"): numbered, listed under founding.
-- RECOGNITION ONLY. Never ownership, equity, royalties or a share of anything. The offer page and
-- the card say so in words, and nothing in this schema touches a money row beyond the ordinary
-- purchase the product already creates.
--
-- WHY A PRODUCT. A one-time product already has the ONE real enforced cap CRWN owns for a sale
-- (products.max_quantity, checked in /api/stripe/product-checkout and incremented atomically by
-- the webhook), so "25 seats" is a promise the code keeps. A tier could not carry it: the paid cap
-- is 3 rungs and the artist already has 3.
--
-- WHAT THIS MIGRATION ADDS
--   1. products.credit_album_id + products.credit_level   (marks a product as a credits package)
--   2. project_credits                                     (one row per credited purchase)
--   3. assign_project_credit(purchase)                     (service_role only; numbers the credit)
--   4. live_sessions.credit_album_id                       (a live that seats that project's
--                                                           founding supporters)
--   5. product_offer_events                                (views / checkout starts / declines,
--                                                           so the offer is judged on evidence)
--
-- DERIVED, NOT STORED: whether a credit is still good. A refund flips purchases.status to
-- 'refunded' (handleChargeRefunded); every reader joins the purchase and requires 'completed', so a
-- refunded credit drops out of the list and loses its seat with no second flag to keep in sync.
-- A refunded number is never reused: a number someone already posted must not later name a
-- different person.
--
-- SECURITY. project_credits and product_offer_events have RLS ON, ZERO policies and ALL revoked
-- from anon/authenticated: the only readers and writers are server routes on the service role,
-- which project public rows through src/lib/projectCredits/credits.ts (name only when the fan
-- opted in). The assigner is SECURITY DEFINER with EXECUTE for service_role only, so a fan cannot
-- mint themselves Founding #1, and it refuses a product whose album belongs to another artist.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

-- ── 1. Which product is a credits package ───────────────────────────────────────
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS credit_album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS credit_level text;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_credit_level_check;
ALTER TABLE public.products ADD CONSTRAINT products_credit_level_check
  CHECK (credit_level IS NULL OR credit_level IN ('founding', 'supporter'));

COMMENT ON COLUMN public.products.credit_album_id IS
  'Set on a project-credits product: buying it credits the buyer on this album. Read by assign_project_credit, which ignores an album owned by another artist.';
COMMENT ON COLUMN public.products.credit_level IS
  'founding | supporter. The credit level a purchase of this product earns. NULL on every ordinary product.';

-- ── 2. The credits ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_credits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id     uuid NOT NULL REFERENCES public.artist_profiles(id) ON DELETE CASCADE,
  album_id      uuid NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  purchase_id   uuid NOT NULL UNIQUE REFERENCES public.purchases(id) ON DELETE CASCADE,
  fan_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level         text NOT NULL CHECK (level IN ('founding', 'supporter')),
  credit_number integer NOT NULL CHECK (credit_number > 0),
  -- The name as the FAN typed it. Never seeded from profiles.display_name, which defaults to the
  -- signup email: printing that would publish an address.
  credit_name   text CHECK (credit_name IS NULL OR char_length(credit_name) BETWEEN 1 AND 40),
  -- One opt-in. Listed means: the name shows in the project's credits AND the shareable card page
  -- exists. Unlisted credits are still counted, never named.
  listed        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_credits_listed_needs_name CHECK (NOT listed OR credit_name IS NOT NULL),
  CONSTRAINT project_credits_number_key UNIQUE (album_id, level, credit_number)
);

CREATE INDEX IF NOT EXISTS idx_project_credits_album ON public.project_credits (album_id, level, credit_number);
CREATE INDEX IF NOT EXISTS idx_project_credits_fan ON public.project_credits (fan_id, album_id);

ALTER TABLE public.project_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_credits FROM PUBLIC;
REVOKE ALL ON public.project_credits FROM anon, authenticated;
GRANT ALL ON public.project_credits TO service_role;

-- ── 3. The assigner ─────────────────────────────────────────────────────────────
-- Idempotent per purchase: a replayed webhook returns the number already given. Returns NULL for
-- anything that is not a completed purchase of a credits product on the seller's own album.
CREATE OR REPLACE FUNCTION public.assign_project_credit(p_purchase uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fan uuid;
  v_artist uuid;
  v_status text;
  v_product uuid;
  v_album uuid;
  v_level text;
  v_existing integer;
  v_next integer;
BEGIN
  SELECT p.fan_id, p.artist_id, p.status, pr.id, pr.credit_album_id, pr.credit_level
    INTO v_fan, v_artist, v_status, v_product, v_album, v_level
    FROM purchases p
    JOIN products pr ON pr.id = p.product_id
   WHERE p.id = p_purchase;

  IF NOT FOUND OR v_album IS NULL OR v_level IS NULL THEN
    RETURN NULL;
  END IF;
  IF v_status IS DISTINCT FROM 'completed' THEN
    RETURN NULL;
  END IF;
  -- The album must be the SELLER's. products is artist-writable, so this is the line that stops a
  -- product from crediting buyers on somebody else's project.
  IF NOT EXISTS (SELECT 1 FROM albums WHERE id = v_album AND artist_id = v_artist) THEN
    RETURN NULL;
  END IF;

  SELECT credit_number INTO v_existing FROM project_credits WHERE purchase_id = p_purchase;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('project_credit:' || v_album::text || ':' || v_level));

  SELECT COALESCE(MAX(credit_number), 0) + 1 INTO v_next
    FROM project_credits
   WHERE album_id = v_album AND level = v_level;

  INSERT INTO project_credits (artist_id, album_id, product_id, purchase_id, fan_id, level, credit_number)
  VALUES (v_artist, v_album, v_product, p_purchase, v_fan, v_level, v_next)
  ON CONFLICT (purchase_id) DO NOTHING;

  SELECT credit_number INTO v_existing FROM project_credits WHERE purchase_id = p_purchase;
  RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_project_credit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_project_credit(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_project_credit(uuid) TO service_role;

-- ── 4. A live that seats a project's founding supporters ────────────────────────
-- Read by seat checks in src/lib/live/access.ts, which require the credit's artist to be the
-- session's artist, so pointing a session at a foreign album seats nobody.
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS credit_album_id uuid REFERENCES public.albums(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.live_sessions.credit_album_id IS
  'When set, every Founding Supporter credited on this album (purchase still completed, same artist) holds a seat, alongside the tier gate and paid tickets.';

-- ── 5. Offer events ─────────────────────────────────────────────────────────────
-- The tier_events twin for a product offer. tier_events cannot hold these: its tier_id is NOT NULL
-- with a foreign key to subscription_tiers. Views and declines come from a beacon; checkout starts
-- are recorded server-side inside product-checkout. One row per visitor per product per event per
-- placement per day, so a refresh is not a second viewer.
CREATE TABLE IF NOT EXISTS public.product_offer_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id    uuid NOT NULL REFERENCES public.artist_profiles(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN ('offer_viewed', 'offer_checkout_started', 'offer_declined')),
  placement    text NOT NULL DEFAULT 'primary' CHECK (placement IN ('primary', 'downsell')),
  event_date   date NOT NULL DEFAULT CURRENT_DATE,
  visitor_hash text NOT NULL,
  fan_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_offer_events_grain_key UNIQUE (product_id, event_type, placement, visitor_hash, event_date)
);

CREATE INDEX IF NOT EXISTS idx_product_offer_events_product ON public.product_offer_events (product_id, event_type);

ALTER TABLE public.product_offer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_offer_events FROM PUBLIC;
REVOKE ALL ON public.product_offer_events FROM anon, authenticated;
GRANT ALL ON public.product_offer_events TO service_role;

COMMIT;

-- ============================================================
-- Self-verify
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'credit_album_id') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: products.credit_album_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'credit_level') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: products.credit_level missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'live_sessions' AND column_name = 'credit_album_id') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: live_sessions.credit_album_id missing';
  END IF;
  IF to_regclass('public.project_credits') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: project_credits missing';
  END IF;
  IF to_regclass('public.product_offer_events') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: product_offer_events missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.project_credits'::regclass) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS is off on project_credits';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_offer_events'::regclass) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS is off on product_offer_events';
  END IF;
  IF has_table_privilege('anon', 'public.project_credits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.project_credits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.project_credits', 'UPDATE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a browser role can still read or write project_credits';
  END IF;
  IF has_table_privilege('anon', 'public.product_offer_events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.product_offer_events', 'INSERT') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a browser role can still write product_offer_events';
  END IF;
  IF to_regprocedure('public.assign_project_credit(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: assign_project_credit() missing';
  END IF;
  IF has_function_privilege('anon', 'public.assign_project_credit(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.assign_project_credit(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a browser role can execute assign_project_credit()';
  END IF;
  RAISE NOTICE 'project credits: OK';
END $$;
