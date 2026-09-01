-- schema-phase2-fan-funnel-foundation.sql
-- Build 1 of the reusable artist fan-sales engine: attribution that survives the funnel,
-- and a funnel-to-nurture pointer.
--
-- THREE SMALL ADDITIVE CHANGES, no new table:
--
-- 1. fan_automation_leads.attribution jsonb
--    The durable first-touch record of how this fan arrived (source / medium / campaign /
--    content and friends), written ONCE at claim time. Values pass through the canonical
--    normalizer (src/lib/analytics/campaignAttribution.ts), which is the length limit and
--    the HTML-safety boundary; raw query strings are never stored. The lead row is the
--    join point that lets a later paid subscription be traced to its origin (same fan,
--    same artist). Attribution is DESCRIPTIVE ONLY: nothing may ever read it into a
--    price, an entitlement, an ownership check, or a redirect.
--
-- 2. song_lab_offer_claims.attribution jsonb
--    The same home on the other live claim surface, so an artist tagging a Song Lab
--    offer link gets the same answer. Written by the same normalizer.
--
-- 3. fan_automations.nurture_sequence_id uuid
--    Which artist-owned sequence a fan entering THROUGH THIS FUNNEL should be nurtured
--    by, overriding the artist's default free_join sequence. This is what makes
--    source-specific nurture a configuration instead of a branching engine: a boxing
--    funnel points at the boxing sequence, a story funnel at the story sequence, and an
--    artist with one sequence for everything sets nothing. Same-artist enforced by
--    trigger for the same reason sequences.goal_tier_id enforces it: a cross-artist
--    pointer would let one artist's funnel enroll fans into another artist's emails.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- Run AFTER schema-phase2-sequence-conversion-goal.sql (independent, but keep one order).

BEGIN;

ALTER TABLE public.fan_automation_leads
  ADD COLUMN IF NOT EXISTS attribution jsonb;

COMMENT ON COLUMN public.fan_automation_leads.attribution IS
  'First-touch acquisition dimensions, normalized by campaignAttribution.ts at claim time. Descriptive only: never price, entitlement, ownership or redirect authority.';

ALTER TABLE public.song_lab_offer_claims
  ADD COLUMN IF NOT EXISTS attribution jsonb;

COMMENT ON COLUMN public.song_lab_offer_claims.attribution IS
  'First-touch acquisition dimensions, normalized by campaignAttribution.ts at claim time. Descriptive only.';

ALTER TABLE public.fan_automations
  ADD COLUMN IF NOT EXISTS nurture_sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fan_automations.nurture_sequence_id IS
  'Optional: the artist-owned sequence a fan claiming through this funnel enters, overriding the default free_join sequence. Same artist enforced by trigger.';

CREATE OR REPLACE FUNCTION public.fan_automations_nurture_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq_artist uuid;
BEGIN
  IF NEW.nurture_sequence_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT artist_id INTO v_seq_artist FROM public.sequences WHERE id = NEW.nurture_sequence_id;
  IF v_seq_artist IS NULL OR v_seq_artist <> NEW.artist_id THEN
    RAISE EXCEPTION 'nurture_sequence_id must reference one of this artist''s own sequences';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fan_automations_nurture_guard ON public.fan_automations;
CREATE TRIGGER trg_fan_automations_nurture_guard
  BEFORE INSERT OR UPDATE OF nurture_sequence_id, artist_id ON public.fan_automations
  FOR EACH ROW EXECUTE FUNCTION public.fan_automations_nurture_guard();

COMMIT;

-- ── Self-verify ────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fan_automation_leads' AND column_name='attribution') THEN
    RAISE EXCEPTION 'fan_automation_leads.attribution missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='song_lab_offer_claims' AND column_name='attribution') THEN
    RAISE EXCEPTION 'song_lab_offer_claims.attribution missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='fan_automations' AND column_name='nurture_sequence_id') THEN
    RAISE EXCEPTION 'fan_automations.nurture_sequence_id missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fan_automations_nurture_guard') THEN
    RAISE EXCEPTION 'nurture guard trigger missing';
  END IF;
  -- The tables these columns live on stay closed to browsers: assert no client grant
  -- appeared on the new attribution columns' tables (they were revoked wholesale; a
  -- column addition must not have re-opened anything).
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('fan_automation_leads','fan_automations')
      AND grantee IN ('anon','authenticated')
  ) THEN
    RAISE EXCEPTION 'client grant present on a fan-automation table; these are service-role only';
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM public.fan_automation_leads WHERE attribution IS NOT NULL) AS leads_with_attribution,
  (SELECT count(*) FROM public.fan_automations WHERE nurture_sequence_id IS NOT NULL) AS funnels_with_nurture,
  'fan funnel foundation applied' AS status;
