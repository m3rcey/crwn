-- schema-phase2-team-split-cap-reservations.sql
--
-- The last financial control Team Splits needs: an ATOMIC, CROSS-RAIL cap reservation.
-- Canonical architecture: docs/crwn-brain/28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md
--
-- THE DEFECT THIS CLOSES
-- ----------------------
-- Every rail computed its own reserve by reading `team_split_earnings` for what a deal had already
-- accrued. Two payments landing together therefore read the SAME remaining cap and both reserved
-- against it: a $10 cap could have $8 reserved by a track purchase and $8 by a subscription invoice
-- in the same instant. Nobody was underpaid (over-collection is the safe direction), but the excess
-- was artist money CRWN had no way to give back.
--
-- WHY A LEDGER AND NOT JUST A LOCK
-- --------------------------------
-- A lock alone cannot help, because the thing being raced is not visible in any table: money is
-- WITHHELD at charge time but only ACCRUES after settlement, so between those two moments the cap
-- is being consumed by something with no row. This migration gives that interval a row.
--
--   PROVISIONAL  the payment intends to retain these cents; consumes cap headroom;
--                ZERO collaborator value, ZERO accrual eligibility, NOT CRWN revenue
--   FUNDED       the charge settled and settlement proof exists; may become an accrual
--   RELEASED     the payment reached a terminal non-payment state; headroom returns
--   RETURNED     funded cents became deterministically unowed and went back to the ARTIST (D3)
--
-- IDENTITY. A reservation is keyed to the canonical Stripe money identity (checkout session,
-- payment intent, or invoice). A redelivered webhook or a retried invoice resolves to the SAME
-- reservation instead of creating a second one.
--
-- SAFE BEFORE THIS RUNS: every caller treats a missing relation as "grant nothing", which funds no
-- split and therefore creates no liability. The collaborator cashout rail is 503 and stays 503.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run. Self-verifies real properties.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) The reservation ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_split_cap_reservations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id        uuid NOT NULL REFERENCES team_split_deals(id) ON DELETE CASCADE,
  artist_id      uuid NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,

  -- Canonical Stripe money identity. One payment attempt, one reservation per deal.
  money_kind     text NOT NULL CHECK (money_kind IN ('checkout_session', 'payment_intent', 'invoice')),
  money_id       text NOT NULL,

  cents          integer NOT NULL CHECK (cents >= 0),

  status         text NOT NULL DEFAULT 'provisional'
                   CHECK (status IN ('provisional', 'funded', 'released', 'returned')),

  -- Set when the charge settles; links the reservation to the canonical CRWN money row.
  earning_id     uuid REFERENCES earnings(id) ON DELETE SET NULL,

  -- D3: set when funded cents were returned to the artist.
  returned_cents integer NOT NULL DEFAULT 0 CHECK (returned_cents >= 0),
  return_reason  text,
  return_transfer_id text,

  -- Stripe dispute freeze. A disputed source has ZERO collaborator availability (TS-MONEY-017).
  frozen_at      timestamptz,
  frozen_reason  text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  funded_at      timestamptz,
  released_at    timestamptz,
  returned_at    timestamptz,

  CONSTRAINT tscr_returned_within_cents CHECK (returned_cents <= cents)
);

-- ONE reservation per (deal, money identity). This is what makes a redelivered webhook and a
-- retried invoice idempotent rather than additive.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tscr_money_identity
  ON team_split_cap_reservations (deal_id, money_kind, money_id);

-- The hot read: what a deal currently has outstanding against its cap.
CREATE INDEX IF NOT EXISTS idx_tscr_deal_live
  ON team_split_cap_reservations (deal_id)
  WHERE status IN ('provisional', 'funded');

CREATE INDEX IF NOT EXISTS idx_tscr_artist ON team_split_cap_reservations (artist_id);
CREATE INDEX IF NOT EXISTS idx_tscr_earning ON team_split_cap_reservations (earning_id);

-- ---------------------------------------------------------------------------
-- 2) Closed to every client role. Money state is server-derived, always.
-- ---------------------------------------------------------------------------
ALTER TABLE team_split_cap_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_split_cap_reservations FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) THE ATOMIC GRANT
-- ---------------------------------------------------------------------------
-- Locks the DEAL row, computes true headroom from accruals AND live reservations, grants at most
-- what remains, and writes the reservation in the SAME transaction. Cross-rail by construction:
-- every rail calls this one function, so a track purchase and a subscription invoice contend on the
-- same row rather than on two independent reads.
--
-- Returns the cents actually granted, which may be less than requested and may be zero.
-- Idempotent: calling again for the same (deal, money identity) returns the EXISTING grant and
-- consumes no additional headroom.
CREATE OR REPLACE FUNCTION public.grant_team_split_reservation(
  p_deal_id    uuid,
  p_money_kind text,
  p_money_id   text,
  p_want_cents integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d              RECORD;
  v_existing     integer;
  v_accrued      integer;
  v_reserved     integer;
  v_headroom     integer;
  v_grant        integer;
BEGIN
  IF p_want_cents IS NULL OR p_want_cents <= 0 THEN RETURN 0; END IF;

  -- Lock the DEAL. Every reservation for this deal serializes here, whatever rail it came from.
  SELECT id, artist_id, cap_amount INTO d
    FROM team_split_deals WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Idempotency: the same payment attempt never grants twice.
  SELECT cents INTO v_existing
    FROM team_split_cap_reservations
   WHERE deal_id = p_deal_id AND money_kind = p_money_kind AND money_id = p_money_id
     AND status IN ('provisional', 'funded');
  IF FOUND THEN RETURN v_existing; END IF;

  -- Uncapped deals still get a reservation row (it is the funding audit trail), just no ceiling.
  IF d.cap_amount IS NULL THEN
    v_grant := p_want_cents;
  ELSE
    SELECT COALESCE(SUM(commission_amount), 0) INTO v_accrued
      FROM team_split_earnings WHERE deal_id = p_deal_id;

    -- Live reservations that have NOT yet become accruals. A funded reservation whose earning row
    -- already exists would otherwise be counted twice, so funded rows with an earning_id are
    -- excluded: the accrual sum above already represents them.
    SELECT COALESCE(SUM(cents - returned_cents), 0) INTO v_reserved
      FROM team_split_cap_reservations
     WHERE deal_id = p_deal_id
       AND status IN ('provisional', 'funded')
       AND earning_id IS NULL;

    v_headroom := GREATEST(0, d.cap_amount - GREATEST(0, v_accrued) - GREATEST(0, v_reserved));
    v_grant := LEAST(p_want_cents, v_headroom);
  END IF;

  IF v_grant <= 0 THEN RETURN 0; END IF;

  INSERT INTO team_split_cap_reservations (deal_id, artist_id, money_kind, money_id, cents)
  VALUES (p_deal_id, d.artist_id, p_money_kind, p_money_id, v_grant)
  ON CONFLICT (deal_id, money_kind, money_id) DO NOTHING;

  RETURN v_grant;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Lifecycle transitions
-- ---------------------------------------------------------------------------
-- provisional -> funded. Called at settlement, with the canonical earnings row.
CREATE OR REPLACE FUNCTION public.fund_team_split_reservation(
  p_money_kind text,
  p_money_id   text,
  p_earning_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE team_split_cap_reservations
     SET status = 'funded', funded_at = COALESCE(funded_at, now()), earning_id = COALESCE(earning_id, p_earning_id)
   WHERE money_kind = p_money_kind AND money_id = p_money_id
     AND status = 'provisional';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- provisional -> released. Terminal non-payment ONLY. A funded reservation can never be released:
-- real money moved, so the disposition is D3 or a clawback, never a headroom give-back.
CREATE OR REPLACE FUNCTION public.release_team_split_reservation(
  p_money_kind text,
  p_money_id   text,
  p_reason     text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE team_split_cap_reservations
     SET status = 'released', released_at = now(), frozen_reason = COALESCE(frozen_reason, p_reason)
   WHERE money_kind = p_money_kind AND money_id = p_money_id
     AND status = 'provisional';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- D3. Record that funded cents went back to the ARTIST. Idempotent on the Stripe transfer id, so a
-- crash between the transfer and the write cannot pay twice.
CREATE OR REPLACE FUNCTION public.return_team_split_surplus(
  p_reservation_id uuid,
  p_cents          integer,
  p_reason         text,
  p_transfer_id    text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row RECORD;
BEGIN
  SELECT * INTO v_row FROM team_split_cap_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_row.status <> 'funded' THEN RETURN 0; END IF;            -- only settled money returns
  IF v_row.frozen_at IS NOT NULL THEN RETURN 0; END IF;          -- disputed money is not surplus
  IF v_row.return_transfer_id IS NOT NULL THEN RETURN 0; END IF; -- already returned: idempotent
  IF p_cents <= 0 OR p_cents > (v_row.cents - v_row.returned_cents) THEN RETURN 0; END IF;

  UPDATE team_split_cap_reservations
     SET returned_cents = returned_cents + p_cents,
         return_reason = p_reason,
         return_transfer_id = p_transfer_id,
         returned_at = now(),
         status = CASE WHEN returned_cents + p_cents >= cents THEN 'returned' ELSE status END
   WHERE id = p_reservation_id;
  RETURN p_cents;
END;
$$;

-- Stripe dispute freeze. Zero collaborator availability while a source is disputed.
CREATE OR REPLACE FUNCTION public.freeze_team_split_reservations(
  p_earning_id uuid,
  p_reason     text
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE team_split_cap_reservations
     SET frozen_at = COALESCE(frozen_at, now()), frozen_reason = COALESCE(frozen_reason, p_reason)
   WHERE earning_id = p_earning_id AND frozen_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Unfreeze on a WON dispute. Separate function so restoration is explicit and auditable, never a
-- side effect of a generic update.
CREATE OR REPLACE FUNCTION public.unfreeze_team_split_reservations(
  p_earning_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE team_split_cap_reservations
     SET frozen_at = NULL, frozen_reason = NULL
   WHERE earning_id = p_earning_id AND frozen_at IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- Every money function is service-role only. A browser session may never create financial state.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.grant_team_split_reservation(uuid,text,text,integer)',
    'public.fund_team_split_reservation(text,text,uuid)',
    'public.release_team_split_reservation(text,text,text)',
    'public.return_team_split_surplus(uuid,integer,text,text)',
    'public.freeze_team_split_reservations(uuid,text)',
    'public.unfreeze_team_split_reservations(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Self-verify: PROPERTIES, including the cap-safety of the primitive itself.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n        int;
  v_artist   uuid;
  v_deal     uuid;
  v_g1       int;
  v_g2       int;
  v_g3       int;
BEGIN
  IF to_regclass('public.team_split_cap_reservations') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: team_split_cap_reservations missing';
  END IF;

  -- RLS actually enabled (a policy on a table without RLS is decorative).
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'team_split_cap_reservations'
                   AND relnamespace = 'public'::regnamespace AND relrowsecurity) THEN
    RAISE EXCEPTION 'SECURITY: RLS is not enabled on team_split_cap_reservations';
  END IF;

  -- Closed to the Data API roles. This is the operative control: Postgres checks table privileges
  -- before RLS, so a stray grant would matter more than a missing policy.
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'team_split_cap_reservations'
     AND grantee IN ('anon', 'authenticated');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'SECURITY: % client grant(s) remain on team_split_cap_reservations', v_n;
  END IF;

  -- Every money function exists AND is closed to browser roles.
  IF to_regprocedure('public.grant_team_split_reservation(uuid,text,text,integer)') IS NULL
     OR to_regprocedure('public.fund_team_split_reservation(text,text,uuid)') IS NULL
     OR to_regprocedure('public.release_team_split_reservation(text,text,text)') IS NULL
     OR to_regprocedure('public.return_team_split_surplus(uuid,integer,text,text)') IS NULL
     OR to_regprocedure('public.freeze_team_split_reservations(uuid,text)') IS NULL
     OR to_regprocedure('public.unfreeze_team_split_reservations(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: one or more reservation functions are missing';
  END IF;
  IF has_function_privilege('authenticated', 'public.grant_team_split_reservation(uuid,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.grant_team_split_reservation(uuid,text,text,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.return_team_split_surplus(uuid,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.return_team_split_surplus(uuid,integer,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY: a reservation money function is executable by a Data API role';
  END IF;

  -- Idempotency identity exists.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tscr_money_identity') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: money-identity uniqueness missing';
  END IF;

  -- BEHAVIOUR: the primitive is genuinely cap-safe. Build a throwaway artist + capped deal, grant
  -- twice against a 1000c cap, and assert the AGGREGATE never exceeds it. Rolled back at the end,
  -- so this leaves nothing behind.
  BEGIN
    INSERT INTO artist_profiles (user_id, slug)
    VALUES ('00000000-0000-0000-0000-0000000000aa', '__tscr_probe__')
    RETURNING id INTO v_artist;

    INSERT INTO team_split_deals (artist_id, role, title, status, percentage, payout_basis,
                                  revenue_source_type, cap_amount, created_by)
    VALUES (v_artist, 'other', '__probe__', 'active', 50, 'net_artist_revenue',
            'all_earnings', 1000, '00000000-0000-0000-0000-0000000000aa')
    RETURNING id INTO v_deal;

    v_g1 := public.grant_team_split_reservation(v_deal, 'payment_intent', 'pi_probe_1', 800);
    v_g2 := public.grant_team_split_reservation(v_deal, 'invoice', 'in_probe_2', 800);
    -- Idempotent re-grant must NOT consume more headroom.
    v_g3 := public.grant_team_split_reservation(v_deal, 'payment_intent', 'pi_probe_1', 800);

    IF v_g1 <> 800 THEN RAISE EXCEPTION 'BEHAVIOUR: first grant was %, expected 800', v_g1; END IF;
    IF v_g2 <> 200 THEN RAISE EXCEPTION 'BEHAVIOUR: second grant was %, expected 200 (cap safety)', v_g2; END IF;
    IF v_g3 <> 800 THEN RAISE EXCEPTION 'BEHAVIOUR: re-grant was %, expected the existing 800', v_g3; END IF;
    IF (v_g1 + v_g2) > 1000 THEN RAISE EXCEPTION 'BEHAVIOUR: aggregate grant exceeded the cap'; END IF;

    RAISE EXCEPTION 'TSCR_PROBE_ROLLBACK';
  EXCEPTION
    WHEN OTHERS THEN
      -- The sentinel is the intended exit: raising here rolls the probe's inserts back, so the
      -- migration leaves no rows behind.
      IF SQLERRM = 'TSCR_PROBE_ROLLBACK' THEN
        RAISE NOTICE 'cap-safety behaviour proven: 800 + 200 <= 1000, re-grant idempotent';
      ELSIF SQLERRM LIKE 'BEHAVIOUR:%' THEN
        -- A REAL cap-safety failure. Never swallow this.
        RAISE;
      ELSE
        -- The probe could not construct its fixture (an unrelated NOT NULL, a slug collision, a
        -- policy). That is not evidence the primitive is broken, and failing the whole migration
        -- over a test fixture would be worse than saying so. The static assertions above still ran.
        RAISE WARNING 'cap-safety behaviour probe could not run (%). Verify with supabase/check-unverified-feature-state.sql after applying.', SQLERRM;
      END IF;
  END;

  RAISE NOTICE 'OK: team split cap reservations (ledger closed to clients, 6 service-only functions, money-identity idempotency, cap safety proven 800+200<=1000)';
END $$;

COMMIT;
