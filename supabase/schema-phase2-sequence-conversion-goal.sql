-- schema-phase2-sequence-conversion-goal.sql
-- A sequence may name the membership outcome it is selling, so it can stop when the fan
-- gets there.
--
-- THE DEFECT. sequence_enrollments left a sequence for exactly four reasons (steps
-- exhausted, sequence deactivated, unsubscribed, suppressed). Converting was not one of
-- them: a fan who bought the tier a nurture was selling kept receiving the emails asking
-- them to buy it. This column is the smallest fix, and it is generic: any artist, any
-- tier, no rung names anywhere.
--
-- SEMANTICS. goal_tier_id optionally points at ONE of the artist's own PAID tiers. A fan
-- counts as converted when they hold an active subscription to that tier or any tier
-- ranked at or above it by the artist's own price order (src/lib/tierLadder.ts is the one
-- rank authority in code; nothing here or there reads a tier's NAME). Null = legacy
-- sequence, behavior completely unchanged.
--
-- The same-artist rule is enforced HERE with a trigger, not only in the API, because a
-- goal pointing at another artist's tier would let sequence exits be steered by rows the
-- artist does not own. Paid-only is enforced too: a free goal would mark every free join
-- as a conversion and silently end acquisition nurture at enrollment.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.sequences
  ADD COLUMN IF NOT EXISTS goal_tier_id uuid REFERENCES public.subscription_tiers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sequences.goal_tier_id IS
  'Optional conversion goal: one of THIS artist''s paid tiers. A fan holding an active subscription at or above it (price rank) exits the sequence as converted. Null = no goal semantics (legacy).';

CREATE OR REPLACE FUNCTION public.sequences_goal_tier_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier_artist uuid;
  v_tier_price integer;
BEGIN
  IF NEW.goal_tier_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT artist_id, price INTO v_tier_artist, v_tier_price
    FROM public.subscription_tiers WHERE id = NEW.goal_tier_id;
  IF v_tier_artist IS NULL OR v_tier_artist <> NEW.artist_id THEN
    RAISE EXCEPTION 'goal_tier_id must reference one of this artist''s own tiers';
  END IF;
  IF COALESCE(v_tier_price, 0) <= 0 THEN
    RAISE EXCEPTION 'goal_tier_id must reference a PAID tier';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sequences_goal_tier_guard ON public.sequences;
CREATE TRIGGER trg_sequences_goal_tier_guard
  BEFORE INSERT OR UPDATE OF goal_tier_id, artist_id ON public.sequences
  FOR EACH ROW EXECUTE FUNCTION public.sequences_goal_tier_guard();

COMMIT;

-- ── Self-verify: behavioral, not existence-only ────────────────────────────────
DO $$
DECLARE
  v_artist_a uuid; v_artist_b uuid;
  v_paid_a uuid; v_free_a uuid; v_paid_b uuid;
  v_seq uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sequences' AND column_name='goal_tier_id'
  ) THEN
    RAISE EXCEPTION 'sequences.goal_tier_id missing';
  END IF;

  -- Two distinct artists with usable tiers are needed to prove the cross-artist refusal.
  SELECT t.artist_id, t.id INTO v_artist_a, v_paid_a
    FROM public.subscription_tiers t WHERE t.price > 0 LIMIT 1;
  SELECT t.artist_id, t.id INTO v_artist_b, v_paid_b
    FROM public.subscription_tiers t WHERE t.price > 0 AND t.artist_id <> v_artist_a LIMIT 1;
  SELECT t.id INTO v_free_a
    FROM public.subscription_tiers t WHERE t.price = 0 AND t.artist_id = v_artist_a LIMIT 1;

  IF v_paid_a IS NOT NULL THEN
    -- A valid own-artist paid goal is ACCEPTED.
    INSERT INTO public.sequences (artist_id, name, trigger_type, is_active, goal_tier_id)
    VALUES (v_artist_a, '__goal_canary__', 'free_join', false, v_paid_a)
    RETURNING id INTO v_seq;
    DELETE FROM public.sequences WHERE id = v_seq;

    -- A cross-artist goal is REFUSED.
    IF v_paid_b IS NOT NULL THEN
      BEGIN
        INSERT INTO public.sequences (artist_id, name, trigger_type, is_active, goal_tier_id)
        VALUES (v_artist_a, '__goal_canary_bad__', 'free_join', false, v_paid_b)
        RETURNING id INTO v_seq;
        DELETE FROM public.sequences WHERE id = v_seq;
        RAISE EXCEPTION 'cross-artist goal_tier_id was accepted';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'cross-artist goal_tier_id was accepted' THEN RAISE; END IF;
        NULL; -- refused, correct
      END;
    END IF;

    -- A FREE goal is REFUSED.
    IF v_free_a IS NOT NULL THEN
      BEGIN
        INSERT INTO public.sequences (artist_id, name, trigger_type, is_active, goal_tier_id)
        VALUES (v_artist_a, '__goal_canary_free__', 'free_join', false, v_free_a)
        RETURNING id INTO v_seq;
        DELETE FROM public.sequences WHERE id = v_seq;
        RAISE EXCEPTION 'free goal_tier_id was accepted';
      EXCEPTION WHEN raise_exception THEN
        IF SQLERRM = 'free goal_tier_id was accepted' THEN RAISE; END IF;
        NULL; -- refused, correct
      END;
    END IF;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM public.sequences WHERE goal_tier_id IS NOT NULL) AS sequences_with_goals,
  'sequence conversion goal applied' AS status;
