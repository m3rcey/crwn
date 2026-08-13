-- schema-phase2-team-split-funded-reserve.sql
--
-- Team Split FUNDED RESERVE + over-commitment enforcement + D3 surplus.
-- Canonical architecture: docs/crwn-brain/28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md
--
-- Three things, all of them money-safety:
--
--   1. ATOMIC OVER-COMMITMENT REJECTION (D4). A deal must not become economically binding if CRWN
--      cannot honour its literal percentage. The TypeScript validator in
--      src/lib/teamSplits/commitment.ts gives the artist a readable reason; THIS function is the
--      enforcement, because two acceptances landing in the same millisecond can both pass a
--      read-then-write check in application code and commit 110% between them. It takes an
--      advisory lock on the artist, recomputes from committed rows, and refuses inside the same
--      transaction that flips the status.
--
--   2. SURPLUS TO ARTIST (D3). `team_split_earnings.reason` gains 'surplus_to_artist', and
--      `team_split_payouts` gains an artist-directed kind plus a durable idempotency key, so
--      reserve that becomes deterministically unowed can be RETURNED and audited. Previously this
--      state was not representable at all, which is the one real schema gap doc 28 found.
--
--   3. RESERVE TRACEABILITY. `team_split_earnings.funded_reserve_cents` records how many cents of
--      the funded reserve a given accrual consumed, so "which customer charge funded this
--      collaborator amount, and how many cents" is answerable from the ledger rather than inferred.
--
-- SAFE BEFORE THIS RUNS: the collaborator cashout rail is 503 and stays 503. Reserve writers
-- degrade when the columns are absent (the app treats a 42703 as "no reserve", which accrues
-- nothing). Nothing in production has ever had a Team Split deal, accrual or payout.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run. Self-verifies real properties.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Reserve traceability on the accrual
-- ---------------------------------------------------------------------------
ALTER TABLE team_split_earnings
  ADD COLUMN IF NOT EXISTS funded_reserve_cents integer;

COMMENT ON COLUMN team_split_earnings.funded_reserve_cents IS
  'Cents of the charge-time reserve (earnings.metadata.team_split_reserved) that funded this accrual. NULL on legacy/clawback rows. A positive accrual may never exceed it.';

-- ---------------------------------------------------------------------------
-- 2) D3 surplus: a returnable, auditable state
-- ---------------------------------------------------------------------------
-- `reason` is free text today, so no CHECK to widen. The constant lives in
-- src/lib/teamSplits/constants.ts and the drift test pins it.

ALTER TABLE team_split_payouts
  ADD COLUMN IF NOT EXISTS payee_kind text NOT NULL DEFAULT 'collaborator',
  ADD COLUMN IF NOT EXISTS artist_id uuid REFERENCES artist_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_split_payouts_payee_kind_chk'
  ) THEN
    ALTER TABLE team_split_payouts
      ADD CONSTRAINT team_split_payouts_payee_kind_chk
      CHECK (payee_kind IN ('collaborator', 'artist_surplus'));
  END IF;
END $$;

-- The durable idempotency key. A retry after a Stripe success but a failed DB write must not pay
-- twice; the unique index is what makes that structural rather than hopeful.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tsp_idempotency
  ON team_split_payouts (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN team_split_payouts.payee_kind IS
  'collaborator = normal Team Split payout. artist_surplus = D3 reserve that became deterministically unowed and was returned to the ARTIST. Never CRWN revenue.';

-- ---------------------------------------------------------------------------
-- 3) D4: atomic over-commitment enforcement
-- ---------------------------------------------------------------------------
-- Returns the total committed percent-of-net on the candidate's overlapping scope, INCLUDING the
-- candidate. The caller compares against 100 and refuses. Kept as a pure read so the same function
-- serves both the pre-check and the enforcement; the LOCK is what makes the enforcement atomic.
--
-- Overlap semantics MUST match src/lib/teamSplits/commitment.ts:
--   * all_earnings overlaps every fenceable source and itself
--   * a fenced source overlaps only the same (type, id), plus all_earnings
--   * custom / none / a fence with no id accrue nothing and conflict with nothing
--   * a gross_revenue basis is converted to percent-of-net using the artist's plan fee
CREATE OR REPLACE FUNCTION public.team_split_committed_percent(
  p_artist_id uuid,
  p_deal_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_percentage numeric,
  p_payout_basis text,
  p_platform_fee_percent numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artist_share numeric := GREATEST(1, 100 - LEAST(GREATEST(COALESCE(p_platform_fee_percent, 12), 0), 99));
  v_total numeric := 0;
  v_candidate numeric := 0;
  r RECORD;
BEGIN
  -- Serialize every commitment decision for THIS artist. Two acceptances cannot both read the old
  -- world and both commit.
  PERFORM pg_advisory_xact_lock(hashtext('team_split_commit:' || p_artist_id::text));

  -- An unfenced candidate accrues nothing, so it commits nothing.
  IF p_source_type IN ('custom', 'none')
     OR COALESCE(p_percentage, 0) <= 0
     OR (p_source_type <> 'all_earnings' AND p_source_id IS NULL) THEN
    RETURN 0;
  END IF;

  v_candidate := CASE
    WHEN p_payout_basis = 'gross_revenue' THEN (p_percentage * 100.0) / v_artist_share
    ELSE p_percentage
  END;
  v_total := v_candidate;

  FOR r IN
    SELECT id, percentage, payout_basis, revenue_source_type, revenue_source_id
    FROM team_split_deals
    WHERE artist_id = p_artist_id
      AND id IS DISTINCT FROM p_deal_id
      AND status IN ('accepted', 'active')
      AND COALESCE(percentage, 0) > 0
      AND revenue_source_type NOT IN ('custom', 'none')
  LOOP
    -- Same overlap rule as the TypeScript.
    IF NOT (
      p_source_type = 'all_earnings'
      OR r.revenue_source_type = 'all_earnings'
      OR (r.revenue_source_type = p_source_type AND r.revenue_source_id IS NOT DISTINCT FROM p_source_id)
    ) THEN
      CONTINUE;
    END IF;
    IF r.revenue_source_type <> 'all_earnings' AND r.revenue_source_id IS NULL THEN
      CONTINUE; -- a fence with no id attributes nothing
    END IF;

    v_total := v_total + CASE
      WHEN r.payout_basis = 'gross_revenue' THEN (r.percentage * 100.0) / v_artist_share
      ELSE r.percentage
    END;
  END LOOP;

  RETURN ROUND(v_total, 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.team_split_committed_percent(uuid, uuid, text, uuid, numeric, text, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.team_split_committed_percent(uuid, uuid, text, uuid, numeric, text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.team_split_committed_percent(uuid, uuid, text, uuid, numeric, text, numeric) FROM authenticated;

-- The ENFORCED acceptance. Flips the status only if the commitment still fits, inside the same
-- transaction as the lock. Returns the new status, or NULL when it would over-commit.
CREATE OR REPLACE FUNCTION public.accept_team_split_deal(
  p_deal_id uuid,
  p_collaborator_id uuid,
  p_go_active boolean,
  p_platform_fee_percent numeric
)
RETURNS TABLE (new_status text, committed_percent numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d RECORD;
  v_total numeric;
  v_status text;
BEGIN
  SELECT * INTO d FROM team_split_deals WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF d.collaborator_user_id IS DISTINCT FROM p_collaborator_id THEN
    RETURN; -- authority is the bound collaborator, never the caller's claim
  END IF;
  IF d.status NOT IN ('sent', 'viewed', 'changes_requested') THEN
    RETURN;
  END IF;

  v_total := public.team_split_committed_percent(
    d.artist_id, d.id, d.revenue_source_type, d.revenue_source_id,
    d.percentage, d.payout_basis, p_platform_fee_percent
  );

  IF v_total > 100 THEN
    -- Refuse. The deal stays exactly where it was: no partial state, no silently reduced
    -- percentage, nothing binding.
    RETURN QUERY SELECT NULL::text, v_total;
    RETURN;
  END IF;

  v_status := CASE WHEN p_go_active THEN 'active' ELSE 'accepted' END;
  UPDATE team_split_deals
     SET status = v_status,
         collaborator_accepted_at = now(),
         accepted_at = now(),
         starts_at = COALESCE(starts_at, CASE WHEN p_go_active THEN now() ELSE NULL END),
         updated_at = now()
   WHERE id = p_deal_id;

  RETURN QUERY SELECT v_status, v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_team_split_deal(uuid, uuid, boolean, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_team_split_deal(uuid, uuid, boolean, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.accept_team_split_deal(uuid, uuid, boolean, numeric) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Self-verify: assert the PROPERTIES, not that objects exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'team_split_earnings' AND column_name = 'funded_reserve_cents') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: team_split_earnings.funded_reserve_cents missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name = 'team_split_payouts' AND column_name = 'payee_kind') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: team_split_payouts.payee_kind missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tsp_idempotency') THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: payout idempotency index missing';
  END IF;

  IF to_regprocedure('public.accept_team_split_deal(uuid,uuid,boolean,numeric)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: accept_team_split_deal missing';
  END IF;
  IF to_regprocedure('public.team_split_committed_percent(uuid,uuid,text,uuid,numeric,text,numeric)') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION INCOMPLETE: team_split_committed_percent missing';
  END IF;

  -- SECURITY: neither money function may be callable from a browser session.
  IF has_function_privilege('authenticated', 'public.accept_team_split_deal(uuid,uuid,boolean,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.accept_team_split_deal(uuid,uuid,boolean,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY: accept_team_split_deal is executable by a Data API role';
  END IF;
  IF has_function_privilege('authenticated', 'public.team_split_committed_percent(uuid,uuid,text,uuid,numeric,text,numeric)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.team_split_committed_percent(uuid,uuid,text,uuid,numeric,text,numeric)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SECURITY: team_split_committed_percent is executable by a Data API role';
  END IF;

  -- BEHAVIOUR: the over-commitment rule actually rejects. Proven against a synthetic artist id with
  -- no rows, so the candidate alone decides: 101% of net must exceed the ceiling, 100% must not.
  IF public.team_split_committed_percent(
       '00000000-0000-0000-0000-000000000001'::uuid, NULL, 'all_earnings', NULL, 101, 'net_artist_revenue', 12) <= 100 THEN
    RAISE EXCEPTION 'BEHAVIOUR: 101 percent of net did not register as over-committed';
  END IF;
  IF public.team_split_committed_percent(
       '00000000-0000-0000-0000-000000000001'::uuid, NULL, 'all_earnings', NULL, 100, 'net_artist_revenue', 12) > 100 THEN
    RAISE EXCEPTION 'BEHAVIOUR: exactly 100 percent of net was wrongly rejected';
  END IF;
  -- A gross-basis deal is a BIGGER claim than the same number on net: 88% of gross is 100% of net
  -- at the Launch fee, so 89% must exceed it.
  IF public.team_split_committed_percent(
       '00000000-0000-0000-0000-000000000001'::uuid, NULL, 'all_earnings', NULL, 89, 'gross_revenue', 12) <= 100 THEN
    RAISE EXCEPTION 'BEHAVIOUR: gross-basis percentage was not converted to percent-of-net';
  END IF;
  -- An unfenced deal commits nothing.
  IF public.team_split_committed_percent(
       '00000000-0000-0000-0000-000000000001'::uuid, NULL, 'custom', NULL, 90, 'net_artist_revenue', 12) <> 0 THEN
    RAISE EXCEPTION 'BEHAVIOUR: an unfenced deal was treated as committing revenue';
  END IF;

  SELECT count(*) INTO v_n FROM team_split_deals;
  RAISE NOTICE 'OK: team split funded reserve (reserve traceability, D3 surplus payout kind + idempotency, D4 atomic over-commitment). Existing deals: %', v_n;
END $$;

COMMIT;
