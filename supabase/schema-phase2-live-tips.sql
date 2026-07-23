-- ─────────────────────────────────────────────────────────────────────────────
-- Live Tips + Tip Goals  (Phase 1 of the interactive-live build)
--
-- WHY THIS EXISTS: CRWN had NO tipping primitive of any kind. The only money
-- paths into a live were the subscription tier gate and the pre-sale ticket
-- (schema-phase2-live-tickets.sql). Six requested live features (tip goals,
-- biggest-tipper badges, tip-leader queue sorting, revenue-by-minute, live
-- challenges, tip-goal sponsors) all sit on top of tipping, so tipping is the
-- blocking primitive, not a nice-to-have.
--
-- TWO TABLES:
--   live_tips  — one row per tip attempt. Mirrors live_ticket_purchases exactly:
--                the fan inserts a 'pending' row at checkout, the Stripe webhook
--                (service role) flips it to 'paid'. Only 'paid' rows count.
--   live_goals — a target the fans fund together ("$500 -> play the unreleased
--                song"). metric is generalized now so Live Challenges (#7 on the
--                wishlist) is a row, not a second system: 'tips' is the only
--                metric wired in Phase 1, 'viewers'/'shares' are reserved.
--
-- PUBLIC READ ON PAID TIPS IS DELIBERATE: the tip feed and the "biggest tipper"
-- rail are shown on the stream itself, so a paid tip is already public by intent.
-- PENDING tips are NOT publicly readable (an abandoned checkout must never render
-- as a tip). Amount + fan are exposed; the tip MESSAGE is too, so the API clamps
-- its length and the artist can moderate.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.
-- ROLLBACK: DROP TABLE IF EXISTS live_tips, live_goals CASCADE;
--           (and restore the earnings_type_check from schema-phase2-earnings-type-check.sql)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ============================================================
-- live_tips
-- ============================================================
CREATE TABLE IF NOT EXISTS live_tips (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                 UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  artist_id                  UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  fan_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount                     INTEGER NOT NULL,            -- cents charged
  platform_fee               INTEGER NOT NULL DEFAULT 0,  -- cents
  -- Optional shout-out shown in the tip feed. Clamped by the API, moderatable.
  message                    TEXT,
  is_hidden                  BOOLEAN NOT NULL DEFAULT false, -- artist moderation
  status                     TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'paid', 'refunded')),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id   TEXT,
  paid_at                    TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT live_tips_amount_positive CHECK (amount > 0)
);

-- "What is this session's paid total / who is the top tipper" — the hot path.
CREATE INDEX IF NOT EXISTS idx_live_tips_session_status
  ON live_tips (session_id, status);
-- Artist's tip history across sessions (analytics, top-supporter sorting).
CREATE INDEX IF NOT EXISTS idx_live_tips_artist_fan
  ON live_tips (artist_id, fan_id, status);
-- Webhook lookup by checkout session id.
CREATE INDEX IF NOT EXISTS idx_live_tips_checkout
  ON live_tips (stripe_checkout_session_id);

ALTER TABLE live_tips ENABLE ROW LEVEL SECURITY;

-- Fan creates their own pending tip at checkout (mirrors buyer_inserts_own_ticket).
DROP POLICY IF EXISTS "fan_inserts_own_pending_tip" ON live_tips;
CREATE POLICY "fan_inserts_own_pending_tip" ON live_tips
  FOR INSERT WITH CHECK (auth.uid() = fan_id AND status = 'pending');

-- Anyone may read PAID, non-hidden tips: this is the on-stream tip feed and it
-- is what Supabase Realtime replays to every viewer's goal bar.
DROP POLICY IF EXISTS "anyone_reads_paid_tips" ON live_tips;
CREATE POLICY "anyone_reads_paid_tips" ON live_tips
  FOR SELECT USING (status = 'paid' AND is_hidden = false);

-- A fan always sees their own tips, including pending/hidden ones.
DROP POLICY IF EXISTS "fan_reads_own_tips" ON live_tips;
CREATE POLICY "fan_reads_own_tips" ON live_tips
  FOR SELECT USING (auth.uid() = fan_id);

-- The artist sees every tip on their own sessions (pending + hidden included).
DROP POLICY IF EXISTS "artist_reads_own_session_tips" ON live_tips;
CREATE POLICY "artist_reads_own_session_tips" ON live_tips
  FOR SELECT USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- The artist may hide a tip message (moderation). The status column is frozen by
-- the trigger below so hiding can never be used to fake a payment.
DROP POLICY IF EXISTS "artist_moderates_own_session_tips" ON live_tips;
CREATE POLICY "artist_moderates_own_session_tips" ON live_tips
  FOR UPDATE USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- Money columns are service-role only. Without this, the moderation UPDATE policy
-- above would let an artist set their own tips to 'paid' or raise the amount.
-- Compares OLD vs NEW in-memory (no table read), so it cannot hit the column-
-- privilege wall the way an RLS WITH CHECK subquery does. See
-- schema-phase2-fix-artist-profiles-update-permission.sql for that failure mode.
CREATE OR REPLACE FUNCTION public.freeze_live_tip_money_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW; -- service role / direct SQL: the webhook legitimately writes these
  END IF;
  NEW.status                     := OLD.status;
  NEW.amount                     := OLD.amount;
  NEW.platform_fee               := OLD.platform_fee;
  NEW.fan_id                     := OLD.fan_id;
  NEW.artist_id                  := OLD.artist_id;
  NEW.session_id                 := OLD.session_id;
  NEW.stripe_payment_intent_id   := OLD.stripe_payment_intent_id;
  NEW.stripe_checkout_session_id := OLD.stripe_checkout_session_id;
  NEW.paid_at                    := OLD.paid_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_live_tip_money_cols ON public.live_tips;
CREATE TRIGGER trg_freeze_live_tip_money_cols
  BEFORE UPDATE ON public.live_tips
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_live_tip_money_cols();

-- ============================================================
-- live_goals
-- ============================================================
CREATE TABLE IF NOT EXISTS live_goals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  artist_id     UUID NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  -- What the fans unlock: "Play the unreleased song", "Reveal the album title".
  title         TEXT NOT NULL,
  -- 'tips' = cents of paid tips on this session. 'viewers'/'shares' reserved for
  -- Live Challenges; nothing computes them yet, so the API rejects them today.
  metric        TEXT NOT NULL DEFAULT 'tips'
                CHECK (metric IN ('tips', 'viewers', 'shares')),
  target_amount INTEGER NOT NULL CHECK (target_amount > 0),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  -- Stamped by the webhook the moment the running total crosses target_amount.
  reached_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_goals_session
  ON live_goals (session_id, is_active, sort_order);

ALTER TABLE live_goals ENABLE ROW LEVEL SECURITY;

-- Goals are the on-stream progress bar: public read for active goals.
DROP POLICY IF EXISTS "anyone_reads_active_goals" ON live_goals;
CREATE POLICY "anyone_reads_active_goals" ON live_goals
  FOR SELECT USING (is_active = true);

-- Artist manages their own goals (FOR ALL also restores the owner's SELECT on
-- a soft-deleted goal, the pattern from live_sessions).
DROP POLICY IF EXISTS "artist_manages_own_goals" ON live_goals;
CREATE POLICY "artist_manages_own_goals" ON live_goals
  FOR ALL USING (
    artist_id IN (SELECT id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- reached_at is stamped by the webhook only. An artist marking their own goal
-- reached would be harmless on its own, but it would fire the unlock announcement
-- in chat without the money arriving, which is exactly the trust CRWN sells.
CREATE OR REPLACE FUNCTION public.freeze_live_goal_reached()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  NEW.reached_at := OLD.reached_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_live_goal_reached ON public.live_goals;
CREATE TRIGGER trg_freeze_live_goal_reached
  BEFORE UPDATE ON public.live_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_live_goal_reached();

-- ============================================================
-- earnings.type must accept 'live_tip'
-- The handler inserts an earnings row per paid tip; the CHECK constraint from
-- schema-phase2-earnings-type-check.sql does not list 'live_tip', and that
-- handler returns early on a failed insert, so without this the tip would be
-- charged and never appear in the artist's payouts.
-- ============================================================
ALTER TABLE earnings DROP CONSTRAINT IF EXISTS earnings_type_check;
ALTER TABLE earnings ADD CONSTRAINT earnings_type_check
  CHECK (type IN ('subscription','purchase','booking','live_ticket','live_tip','refund','dispute'));

-- ============================================================
-- Realtime — the goal bar updates from these two streams, with no polling.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_tips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_tips;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_goals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE live_goals;
  END IF;
END $$;

-- ============================================================
-- Dark-launch flag (off by default), same shape as quest_engine / popup_engine.
-- Flip with: UPDATE admin_settings SET value = '{"enabled": true}'::jsonb
--            WHERE key = 'live_tips';
-- ============================================================
INSERT INTO admin_settings (key, value)
VALUES ('live_tips', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ============================================================
-- Self-verify (after COMMIT so a bug here cannot undo a correct apply).
-- ============================================================
DO $$
DECLARE
  n INTEGER;
BEGIN
  IF to_regclass('public.live_tips') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: live_tips table missing';
  END IF;
  IF to_regclass('public.live_goals') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: live_goals table missing';
  END IF;

  IF to_regprocedure('public.freeze_live_tip_money_cols()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze_live_tip_money_cols() missing';
  END IF;
  IF to_regprocedure('public.freeze_live_goal_reached()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze_live_goal_reached() missing';
  END IF;

  -- Both money-freeze triggers must be attached, or the artist moderation UPDATE
  -- policy becomes a way to self-approve tips.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.live_tips'::regclass
      AND tgname = 'trg_freeze_live_tip_money_cols' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: live_tips money-freeze trigger missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.live_goals'::regclass
      AND tgname = 'trg_freeze_live_goal_reached' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: live_goals reached-freeze trigger missing';
  END IF;

  -- RLS must be ON. A policy on a table without RLS enabled is decorative.
  SELECT count(*) INTO n FROM pg_class
   WHERE oid IN ('public.live_tips'::regclass, 'public.live_goals'::regclass)
     AND relrowsecurity = true;
  IF n <> 2 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: RLS not enabled on both live tip tables (% of 2)', n;
  END IF;

  -- Pending tips must NOT be publicly readable.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'live_tips'
       AND policyname = 'anyone_reads_paid_tips'
       AND qual NOT LIKE '%paid%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: public tip read policy does not restrict to paid';
  END IF;

  -- earnings must accept live_tip, or every tip is charged and never paid out.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'earnings_type_check'
       AND conrelid = 'public.earnings'::regclass
       AND pg_get_constraintdef(oid) LIKE '%live_tip%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: earnings_type_check does not allow live_tip';
  END IF;

  -- Realtime, or the goal bar silently never moves.
  SELECT count(*) INTO n FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
     AND tablename IN ('live_tips', 'live_goals');
  IF n <> 2 THEN
    RAISE EXCEPTION 'MIGRATION FAILED: live tip tables not in supabase_realtime (% of 2)', n;
  END IF;

  RAISE NOTICE 'schema-phase2-live-tips: OK (flag admin_settings.live_tips is OFF; flip it to launch)';
END $$;
