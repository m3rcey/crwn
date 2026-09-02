-- schema-phase2-tier-offer-experiences.sql
-- The Tier Offer Experience: how a tier's value is PRESENTED before purchase.
--
-- WHY A NEW TABLE, when subscription_tiers already has a jsonb column. Two disqualifiers,
-- both verified in code before this file was written:
--   1. TierManager's save writes `access_config: { benefits: [...] }` WHOLE, so anything
--      else stored there is silently wiped the next time the artist edits a tier.
--   2. access_config is read by every storefront tier query for every visitor; a full
--      sales-page config (previews, FAQs, VSL refs) does not belong on that hot path.
--
-- WHAT THIS TABLE IS NOT. It grants nothing. There is no entitlement, no price, no
-- benefit flag in it: subscription_tiers and the can_play_track oracle keep defining what
-- a fan GETS; this row only defines how that value is shown before they buy. The config
-- jsonb is parsed exclusively through src/lib/offerExperience/normalize.ts, which bounds
-- every string, caps every list, refuses previews without a declared REAL/EXAMPLE truth
-- state, refuses "Join <tier>" CTAs, and strips any media reference that is not a plain
-- public https URL, so a stored row can neither leak protected bytes nor bypass the
-- benefit-CTA rule. This is the row the future Offer Builder writes.
--
-- Service-role only, like member_files: the drop page reads it server-side, artist CRUD
-- arrives with the Offer Builder, and no browser role can touch it meanwhile.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tier_offer_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id uuid NOT NULL REFERENCES public.artist_profiles(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.subscription_tiers(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tier_offer_experiences_one_per_tier UNIQUE (tier_id),
  CONSTRAINT tier_offer_experiences_config_is_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_tier_offer_experiences_artist
  ON public.tier_offer_experiences (artist_id);

-- The tier must belong to the artist on the row, or one artist's sales page could be
-- steered by another's config. Same trigger shape as sequences.goal_tier_id.
CREATE OR REPLACE FUNCTION public.tier_offer_experiences_owner_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_artist uuid;
BEGIN
  SELECT artist_id INTO v_tier_artist FROM public.subscription_tiers WHERE id = NEW.tier_id;
  IF v_tier_artist IS NULL OR v_tier_artist <> NEW.artist_id THEN
    RAISE EXCEPTION 'tier_id must belong to the artist on this row';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tier_offer_experiences_owner ON public.tier_offer_experiences;
CREATE TRIGGER trg_tier_offer_experiences_owner
  BEFORE INSERT OR UPDATE OF tier_id, artist_id ON public.tier_offer_experiences
  FOR EACH ROW EXECUTE FUNCTION public.tier_offer_experiences_owner_guard();

ALTER TABLE public.tier_offer_experiences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tier_offer_experiences FROM anon, authenticated;

COMMIT;

-- ── Self-verify: behavioral where it can be ───────────────────────────────────
DO $$
DECLARE
  v_artist_a uuid; v_tier_a uuid; v_tier_b uuid; v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname='public' AND c.relname='tier_offer_experiences' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'tier_offer_experiences missing or RLS not enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
             WHERE table_schema='public' AND table_name='tier_offer_experiences'
               AND grantee IN ('anon','authenticated')) THEN
    RAISE EXCEPTION 'client grant present; this table is service-role only';
  END IF;

  SELECT t.artist_id, t.id INTO v_artist_a, v_tier_a FROM public.subscription_tiers t LIMIT 1;
  SELECT t.id INTO v_tier_b FROM public.subscription_tiers t WHERE t.artist_id <> v_artist_a LIMIT 1;
  IF v_tier_a IS NOT NULL THEN
    INSERT INTO public.tier_offer_experiences (artist_id, tier_id, config)
    VALUES (v_artist_a, v_tier_a, '{}'::jsonb)
    ON CONFLICT (tier_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NOT NULL THEN DELETE FROM public.tier_offer_experiences WHERE id = v_id; END IF;

    IF v_tier_b IS NOT NULL THEN
      BEGIN
        INSERT INTO public.tier_offer_experiences (artist_id, tier_id, config)
        VALUES (v_artist_a, v_tier_b, '{}'::jsonb)
        RETURNING id INTO v_id;
        DELETE FROM public.tier_offer_experiences WHERE id = v_id;
        RAISE EXCEPTION 'cross-artist tier_id was accepted';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'cross-artist tier_id was accepted' THEN RAISE; END IF;
        NULL; -- refused, correct
      END;
    END IF;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM public.tier_offer_experiences) AS offer_experiences,
  'tier offer experiences applied' AS status;
