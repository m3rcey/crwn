-- schema-phase2-member-files.sql
-- MEMBER FILES: downloadable files an artist gives to a membership rung.
--
-- WHY A NEW PRIMITIVE AND NOT A PRODUCT. Stems are a membership benefit, not a purchase.
-- `products` gates on PURCHASE: allowed_tier_ids there controls whether the Buy button
-- renders, never whether a file may be fetched, and a $0 product cannot be sold (Stripe
-- refuses amounts under $0.50). There is no path in the shop by which an entitled member
-- receives a file for free, so "Silver gets the stems" could not be expressed at all.
--
-- WHY THE FILE KEY IS NOT A URL. A product file today is uploaded to the PUBLIC media
-- bucket and its permanent public URL is stored on a row every visitor can read. Nothing
-- has ever exercised that path (zero products carry a file, verified against production
-- 2026-09-01), so it is a latent defect rather than a live leak -- but building stems the
-- same way would have created the leak on GB's first upload. Here the row stores an R2
-- OBJECT KEY into the private bucket. Knowing the key grants nothing: the object has no
-- public route, and the only way to bytes is a short-lived signed URL minted by a route
-- that has already checked the caller's live entitlement.
--
-- CLOSED TABLE. RLS on, and ALL revoked from anon and authenticated by name. There is no
-- client read path at all -- not even for the artist, who reads through an owner-checked
-- API. That is deliberate: the row carries file keys, and a table a browser can select is
-- a table whose keys can be enumerated. The same rule as artist_social_connections.
--
-- One row is one BUNDLE (a stem pack), and `files` is the ordered set within it, so
-- "drums / bass / vocals / synth" is one benefit a fan receives rather than four
-- unexplained rows. Entitlement is per bundle.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.member_files (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id    uuid NOT NULL REFERENCES public.artist_profiles(id) ON DELETE CASCADE,

  title        text NOT NULL,
  description  text,

  -- [{ "key": "...", "name": "drums.wav", "size": 12345, "type": "audio/wav" }]
  -- `key` is a PRIVATE R2 object key, never a URL. Written server-side only.
  files        jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Which rungs may download. Cumulative lists are produced at WRITE time by
  -- expandFromTier (src/lib/tierLadder.ts), exactly as every other gated surface does, so
  -- "Silver and above" stores Silver, Gold and Platinum. Empty = nobody, never everybody.
  allowed_tier_ids jsonb NOT NULL DEFAULT '[]'::jsonb,

  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT member_files_files_is_array  CHECK (jsonb_typeof(files) = 'array'),
  CONSTRAINT member_files_tiers_is_array  CHECK (jsonb_typeof(allowed_tier_ids) = 'array'),
  CONSTRAINT member_files_title_len       CHECK (char_length(title) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_member_files_artist
  ON public.member_files (artist_id, is_active);

ALTER TABLE public.member_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_files FROM anon, authenticated;

COMMENT ON COLUMN public.member_files.files IS
  'Ordered [{key,name,size,type}]. `key` is a PRIVATE R2 object key, never a public URL. Server-written only; reachable solely through a signed URL from an entitlement-checked route.';

COMMIT;

-- ── Self-verify: privilege and RLS facts, not mere existence ────────────────────
DO $$
DECLARE
  n integer;
BEGIN
  IF to_regclass('public.member_files') IS NULL THEN
    RAISE EXCEPTION 'member_files was not created';
  END IF;

  SELECT count(*) INTO n FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relname = 'member_files' AND c.relrowsecurity;
  IF n <> 1 THEN
    RAISE EXCEPTION 'RLS is not enabled on member_files';
  END IF;

  -- No client role may hold ANY privilege. This is what makes storing file keys safe.
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'member_files'
     AND grantee IN ('anon', 'authenticated');
  IF n <> 0 THEN
    RAISE EXCEPTION 'member_files still grants % privileges to client roles', n;
  END IF;

  -- A URL column would defeat the whole design.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'member_files'
     AND column_name ~ 'url';
  IF n <> 0 THEN
    RAISE EXCEPTION 'member_files has a url column; files must be keys, not URLs';
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM public.member_files) AS bundles,
  (SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name='member_files'
      AND grantee IN ('anon','authenticated')) AS client_grants_must_be_zero,
  'member files applied' AS status;
