-- schema-phase3-campaign-winner-selection.sql
-- Record WHICH participant was selected as a campaign's winner. One per campaign, forever.
--
-- WHAT THIS COLUMN MEANS, EXACTLY:
--   "This existing participant has been formally recorded as the selected winner."
-- It does NOT mean CRWN ran a drawing, CRWN judged eligibility, the artist picked a favourite,
-- the prize was fulfilled, or the fan has any entitlement. CRWN RECORDS a winner; it does not
-- CHOOSE one. For V1 the legally-governed selection happens outside the product and its result
-- is written here. There is no drawing engine and none is planned.
--
-- WHY ONE NULLABLE TIMESTAMP AND NOTHING ELSE. The campaign already owns the prize
-- (fan_campaigns.toolkit: prize, prize_tier_id, prize_months, rules, eligibility) and the
-- subscription already owns fulfilment (subscriptions.prize_campaign_id, applied 2026-09-04).
-- A winner needs one more fact: who, and when it was recorded. No is_winner (the timestamp
-- carries both truth and time), no winner_rank (there is one winner), no drawing_id (there is
-- no drawing), no eligibility_status (CRWN does not adjudicate), no fulfilment column
-- (fulfilment is derivable from the subscription; see 22-VIRALITY-ENGINE-ARCHITECTURE §30).
--
-- TWO LAYERS ENFORCE ONE WINNER. The partial unique index is the authority: two concurrent
-- selections cannot both commit, whatever the application believes. The server also checks
-- first, so the normal answer is a sentence rather than a constraint violation.
--
-- APPEND-ONLY, AT THE DATABASE. Once recorded, a winner cannot be changed or cleared through
-- the API by ANY PostgREST role, service_role included. A legal correction is a deliberate,
-- audited act on a direct database connection, which is the only caller the trigger exempts.
--
-- Additive, nullable, no backfill, no row is touched. Production carried ZERO participants when
-- this was written, so nothing existing can violate the new index.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.fan_campaign_participants
  ADD COLUMN IF NOT EXISTS selected_winner_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.fan_campaign_participants.selected_winner_at IS
  'When this participant was RECORDED as the campaign''s selected winner. NULL on every ordinary participant. CRWN records a winner determined by a legally-governed process outside the product; it never selects one. Append-only: settable once through the API, never changed or cleared. Fulfilment is a separate fact and lives on subscriptions.prize_campaign_id.';

-- ONE selected winner per campaign. Mirrors idx_fan_campaigns_one_active, which is how the
-- spine already guarantees one active campaign per artist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fan_campaign_participants_one_winner
  ON public.fan_campaign_participants (campaign_id)
  WHERE selected_winner_at IS NOT NULL;

-- ── The column freeze ─────────────────────────────────────────────────────────
-- WHY A TRIGGER WHEN RLS ALREADY DENIES. fan_campaign_participants has RLS enabled with a
-- SELECT policy and NO insert/update/delete policy, so a client write matches nothing today.
-- But that safety is the ABSENCE of a policy, and absence is not a guarantee: a later migration
-- adding any UPDATE policy to this table (say, letting a fan edit their own role) would silently
-- hand every fan the ability to crown themselves. Probed live 2026-09-04: anon INSERT correctly
-- 42501s, while anon UPDATE and DELETE return 200 with an empty array, denied by matching zero
-- rows rather than by an explicit refusal. That is a quiet control, and self-award is not
-- something to protect quietly. This makes the property explicit and independent of RLS.
CREATE OR REPLACE FUNCTION public.freeze_campaign_winner_selection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- The PostgREST role of the caller. A direct database connection has no JWT claims and is
  -- therefore exempt: that is the deliberate, audited path for a legal correction.
  BEGIN
    v_role := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role';
  EXCEPTION WHEN OTHERS THEN
    v_role := NULL;
  END;

  IF v_role IS NULL THEN
    RETURN NEW;
  END IF;

  -- A fan or an anonymous caller may never touch this column, in any operation.
  IF v_role IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' AND NEW.selected_winner_at IS NOT NULL THEN
      RAISE EXCEPTION 'selected_winner_at cannot be set by a client'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.selected_winner_at IS DISTINCT FROM OLD.selected_winner_at THEN
      RAISE EXCEPTION 'selected_winner_at cannot be changed by a client'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Every other API role (service_role, i.e. the application) may RECORD a winner once, and may
  -- never change or unrecord one. Append-only is a database fact, not a code convention.
  IF TG_OP = 'UPDATE'
     AND OLD.selected_winner_at IS NOT NULL
     AND NEW.selected_winner_at IS DISTINCT FROM OLD.selected_winner_at THEN
    RAISE EXCEPTION 'a recorded campaign winner cannot be changed or cleared through the API'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_campaign_winner_selection ON public.fan_campaign_participants;
CREATE TRIGGER trg_freeze_campaign_winner_selection
  BEFORE INSERT OR UPDATE OF selected_winner_at ON public.fan_campaign_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_campaign_winner_selection();

COMMIT;

-- ── Self-verify: BEHAVIOURAL, not existence-only ──────────────────────────────
-- Structure first, then the trigger is actually exercised against a throwaway campaign and
-- participant which are deleted again in every path, including the failing ones.
DO $$
DECLARE
  v_artist   uuid;
  v_fan      uuid;
  -- A SECOND, DIFFERENT fan. The table already carries UNIQUE (campaign_id, fan_id), so the
  -- two-winner check must use a distinct person: reusing one fan tests that older constraint
  -- instead of the new index, which is exactly how the first run of this migration failed.
  v_fan2     uuid;
  v_campaign uuid;
  v_part     uuid;
  v_part2    uuid;
  v_blocked  BOOLEAN;
BEGIN
  -- 1. The column.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='fan_campaign_participants'
       AND column_name='selected_winner_at' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: selected_winner_at missing or not nullable';
  END IF;

  -- 2. The one-winner index, unique AND partial. A non-partial unique index would allow only
  --    one participant per campaign at all, which would break joining.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename='fan_campaign_participants'
       AND indexname='idx_fan_campaign_participants_one_winner'
       AND indexdef LIKE '%UNIQUE%'
       AND indexdef LIKE '%WHERE (selected_winner_at IS NOT NULL)%'
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: one-winner partial unique index missing or not partial';
  END IF;

  -- 3. The freeze.
  IF to_regprocedure('public.freeze_campaign_winner_selection()') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION FAILED: freeze_campaign_winner_selection() missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname='trg_freeze_campaign_winner_selection'
       AND tgrelid='public.fan_campaign_participants'::regclass
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: winner column is not frozen (a fan could crown themselves)';
  END IF;

  -- 4. The RLS assumption this leans on: still no client write policy on the table.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='fan_campaign_participants'
       AND cmd IN ('INSERT','UPDATE','ALL')
  ) THEN
    RAISE EXCEPTION 'MIGRATION FAILED: a client write policy now exists on fan_campaign_participants; re-audit the winner freeze';
  END IF;

  -- 5. BEHAVIOUR. Superusers do not bypass triggers, so unlike an RLS check this is not
  --    vacuous. request.jwt.claims is set to impersonate each API role in turn.
  SELECT id INTO v_artist FROM public.artist_profiles ORDER BY id LIMIT 1;
  SELECT id INTO v_fan FROM public.profiles ORDER BY id LIMIT 1;
  SELECT id INTO v_fan2 FROM public.profiles WHERE id <> v_fan ORDER BY id LIMIT 1;
  IF v_artist IS NULL OR v_fan IS NULL THEN
    RAISE NOTICE 'no artist/profile available; behavioural checks skipped';
    RETURN;
  END IF;

  INSERT INTO public.fan_campaigns (artist_id, archetype, title, status, ends_at)
       VALUES (v_artist, '__winner_selfverify', '__winner_selfverify', 'draft', now() + interval '1 day')
    RETURNING id INTO v_campaign;
  INSERT INTO public.fan_campaign_participants (campaign_id, fan_id)
       VALUES (v_campaign, v_fan) RETURNING id INTO v_part;

  BEGIN
    -- 5a. An authenticated fan must NOT be able to crown themselves.
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","sub":"x"}', true);
    v_blocked := false;
    BEGIN
      UPDATE public.fan_campaign_participants SET selected_winner_at = now() WHERE id = v_part;
    EXCEPTION WHEN insufficient_privilege THEN
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'MIGRATION FAILED: an authenticated client set selected_winner_at';
    END IF;

    -- 5b. The application (service_role) may record a winner once.
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE public.fan_campaign_participants SET selected_winner_at = now() WHERE id = v_part;
    IF (SELECT selected_winner_at FROM public.fan_campaign_participants WHERE id = v_part) IS NULL THEN
      RAISE EXCEPTION 'MIGRATION FAILED: service_role could not record a winner';
    END IF;

    -- 5c. ...and may never change or clear it afterwards.
    v_blocked := false;
    BEGIN
      UPDATE public.fan_campaign_participants SET selected_winner_at = NULL WHERE id = v_part;
    EXCEPTION WHEN insufficient_privilege THEN
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'MIGRATION FAILED: a recorded winner was cleared through the API';
    END IF;

    -- 5d. A SECOND winner in the same campaign must be refused by the index. Needs a DIFFERENT
    --     fan: UNIQUE (campaign_id, fan_id) already forbids the same person joining twice, so
    --     reusing v_fan would prove that older constraint and never reach the new index.
    PERFORM set_config('request.jwt.claims', '', true);
    IF v_fan2 IS NULL THEN
      RAISE NOTICE 'only one profile exists; the two-winner check needs a second person and was skipped';
    ELSE
      INSERT INTO public.fan_campaign_participants (campaign_id, fan_id, role)
           VALUES (v_campaign, v_fan2, 'second') RETURNING id INTO v_part2;
      v_blocked := false;
      BEGIN
        UPDATE public.fan_campaign_participants SET selected_winner_at = now() WHERE id = v_part2;
      EXCEPTION WHEN unique_violation THEN
        v_blocked := true;
      END;
      IF NOT v_blocked THEN
        RAISE EXCEPTION 'MIGRATION FAILED: a campaign accepted two selected winners';
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', '', true);
    DELETE FROM public.fan_campaigns WHERE id = v_campaign;  -- cascades to participants
    RAISE;
  END;

  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM public.fan_campaigns WHERE id = v_campaign;    -- cascades to participants

  IF EXISTS (SELECT 1 FROM public.fan_campaigns WHERE archetype = '__winner_selfverify') THEN
    RAISE EXCEPTION 'MIGRATION FAILED: self-verify left test rows behind';
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM public.fan_campaign_participants) AS participants_total,
  (SELECT count(*) FROM public.fan_campaign_participants WHERE selected_winner_at IS NOT NULL) AS selected_winners_expect_0,
  'campaign winner selection applied' AS status;
