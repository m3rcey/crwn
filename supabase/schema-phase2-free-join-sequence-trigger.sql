-- schema-phase2-free-join-sequence-trigger.sql
-- A nurture sequence that fires when a fan joins a FREE tier.
--
-- THE GAP THIS CLOSES. Sequence enrolment lived only inside the Stripe webhook, so every
-- automatic nurture trigger required a payment. A fan who joins a free rung -- the entire
-- top of an artist's funnel -- received one delivery email and then silence. The artist's
-- own funnel (content -> free join -> nurture -> paid) had no middle.
--
-- OPT-IN BY CONSTRUCTION, which is the important property. This adds a NEW trigger type
-- rather than reusing 'new_subscription'. Reusing that one would have swept every artist
-- who already has a welcome sequence into emailing their free members, without anyone
-- asking for it. No sequence anywhere carries 'free_join' today, so this migration changes
-- nobody's behaviour until an artist deliberately builds one.
--
-- The existing constraint is replaced wholesale because Postgres has no ADD VALUE for a
-- CHECK. Every value already permitted is preserved; two that the application emits but
-- the constraint never listed (abandoned_cart, loyalty_survey) are included, because a
-- write of either is refused today and that is a latent defect, not an intention.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_trigger_type_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_trigger_type_check
  CHECK (trigger_type IN (
    'new_subscription',
    'new_purchase',
    'tier_upgrade',
    'post_purchase_upsell',
    'win_back',
    'inactive_subscriber',
    'abandoned_cart',
    'loyalty_survey',
    'free_join'
  ));

COMMIT;

-- Self-verify: the constraint must ACCEPT the new value and still REFUSE nonsense.
DO $$
DECLARE
  v_artist uuid;
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sequences_trigger_type_check'
      AND pg_get_constraintdef(oid) LIKE '%free_join%'
  ) THEN
    RAISE EXCEPTION 'sequences_trigger_type_check does not permit free_join';
  END IF;

  -- Behavioural proof, not mere existence: insert a real row, then remove it. A CHECK that
  -- is present but wrong would pass a string match and fail here.
  SELECT id INTO v_artist FROM artist_profiles LIMIT 1;
  IF v_artist IS NOT NULL THEN
    INSERT INTO sequences (artist_id, name, trigger_type, is_active)
    VALUES (v_artist, '__migration_canary__', 'free_join', false)
    RETURNING id INTO v_id;
    DELETE FROM sequences WHERE id = v_id;

    BEGIN
      INSERT INTO sequences (artist_id, name, trigger_type, is_active)
      VALUES (v_artist, '__migration_canary_bad__', 'definitely_not_a_trigger', false)
      RETURNING id INTO v_id;
      DELETE FROM sequences WHERE id = v_id;
      RAISE EXCEPTION 'the constraint accepted an invalid trigger_type';
    EXCEPTION WHEN check_violation THEN
      NULL; -- refused, which is correct
    END;
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM sequences WHERE trigger_type = 'free_join') AS free_join_sequences,
  'free join sequence trigger applied' AS status;
