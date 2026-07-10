-- schema-phase2-quest-notifications.sql
-- Widen the notifications.type CHECK enum so Quest Engine notifications persist.
--
-- Context: notifications.type is a hard CHECK enum. The app already emits many
-- types (badge_awarded, fan_milestone, cashout, direct_message, campaign_reached,
-- ai_insight, and more) — a hardcoded list can't be trusted to be complete, and a
-- narrower list would start REJECTING legitimate existing types on new inserts.
--
-- So this migration builds the allowed set DYNAMICALLY as:
--     (every distinct type already present in the table)  ∪  (Quest Engine types)
-- That guarantees no existing row is violated AND the new quest types are allowed.
-- Idempotent — safe to re-run. Quest code .catch()'s its inserts, so it works with
-- or without this migration.
--
-- Apply in the Supabase SQL Editor.
BEGIN;

DO $$
DECLARE
  c record;
  allowed text;
BEGIN
  -- 1. Drop whatever CHECK constraint currently governs the type column (name-agnostic).
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%type%'
  LOOP
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', c.conname);
  END LOOP;

  -- 2. Build the allowed set: existing distinct types UNION the Quest Engine types.
  SELECT string_agg(quote_literal(t), ',') INTO allowed
  FROM (
    SELECT DISTINCT type AS t FROM public.notifications WHERE type IS NOT NULL
    UNION
    SELECT unnest(ARRAY[
      -- Quest Engine
      'quest_completed','quest_milestone','level_up','feature_unlocked',
      'role_upgraded','quest_available',
      -- known app types (harmless to include even if not currently present)
      'new_subscriber','new_purchase','new_comment','subscription_canceled',
      'new_track','new_post','new_shop_item','cashout','direct_message',
      'badge_awarded','fan_milestone','campaign_reached','ai_insight'
    ])
  ) s;

  -- 3. Re-add the constraint from the computed set (existing rows already all included).
  EXECUTE format(
    'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
    allowed
  );
END $$;

-- 4. SELF-VERIFY: constraint exists AND a quest type actually passes it.
DO $$
DECLARE
  ok boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.notifications'::regclass
      AND conname = 'notifications_type_check'
  ) THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: notifications_type_check not present';
  END IF;

  -- Confirm 'quest_completed' satisfies the freshly-installed constraint.
  SELECT pg_get_constraintdef(oid) ILIKE '%quest_completed%' INTO ok
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND conname = 'notifications_type_check';
  IF NOT ok THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: quest types not in the new constraint';
  END IF;

  RAISE NOTICE 'OK: notifications.type widened for Quest Engine (existing types preserved).';
END $$;

COMMIT;
