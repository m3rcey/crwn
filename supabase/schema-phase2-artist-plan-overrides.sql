-- schema-phase2-artist-plan-overrides.sql
-- PER-ARTIST PLAN CAPABILITY OVERRIDES. Comped features, one artist at a time.
--
-- Why this exists. Plan capabilities (live, DMs, scheduling, bundles, clipper) are decided
-- by artist_profiles.platform_tier, and that is right: they are what a plan sells. But a
-- founder sometimes needs to comp a capability to ONE artist without moving them to a plan
-- they are not paying for. GB The G1ft is on Launch; his tier ladder promises Executive
-- Producer Sessions (a live session) and direct interaction / Q&A (DMs), and a tier benefit
-- CRWN refuses to deliver is a promise broken to a paying fan.
--
-- ADDITIVE ONLY, enforced in code (applyPlanOverrides in platformTier.ts). An override can
-- turn a capability ON. It can NEVER turn one off. A field that could revoke would be a
-- silent downgrade of an artist who paid for the plan, invisible in the billing record.
--
-- ── TWO CORRECTIONS AFTER THE FIRST RUN (2026-09-01) ────────────────────────────
--
-- 1. THE ARTIST COULD HAVE COMPED THEMSELVES. artist_profiles has an owner UPDATE policy,
--    and column protection is a DENYLIST in freeze_artist_profiles_protected_cols(). A new
--    column is unprotected by default, so any artist could have set their own
--    plan_feature_overrides from the browser and granted themselves live + DMs for free:
--    a paywall bypass, silent, on every account. This file now adds the column to that
--    trigger. song_lab_enabled had the identical hole and is added with it.
--
-- 2. THE SELF-VERIFY OVER-ASSERTED and failed on a correct database. It matched ANY
--    privilege on the column, and `authenticated` legitimately holds UPDATE on
--    artist_profiles because artists edit their own profile. The property that matters is
--    READABILITY, so the check is now scoped to SELECT, exactly as launch_partner does it.
--    The first run committed the column and the comp before raising; re-running is safe.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE artist_profiles
  ADD COLUMN IF NOT EXISTS plan_feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN artist_profiles.plan_feature_overrides IS
  'Comped plan capabilities for THIS artist, e.g. {"allowsLive": true, "allowsDMs": true}. Additive only: true grants, false is ignored. Server-only, and frozen against client updates.';

-- ── Freeze both capability columns against browser updates ──────────────────────
-- Full replacement of the existing function, preserving every column it already froze
-- (schema-phase2-fix-artist-profiles-update-permission.sql) and adding the two capability
-- fields. A capability an artist can set on themselves is not a capability, it is a
-- suggestion.
CREATE OR REPLACE FUNCTION public.freeze_artist_profiles_protected_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only browser end-users are frozen. service_role and direct SQL legitimately edit these.
  IF coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  NEW.platform_tier                   := OLD.platform_tier;
  NEW.stripe_connect_id               := OLD.stripe_connect_id;
  NEW.platform_subscription_status    := OLD.platform_subscription_status;
  NEW.platform_stripe_subscription_id := OLD.platform_stripe_subscription_id;
  NEW.platform_stripe_customer_id     := OLD.platform_stripe_customer_id;
  NEW.is_founding_artist              := OLD.is_founding_artist;
  NEW.founding_artist_number          := OLD.founding_artist_number;
  NEW.referral_commission_rate        := OLD.referral_commission_rate;
  NEW.clipper_commission_rate         := OLD.clipper_commission_rate;
  NEW.clipper_rate_schedule           := OLD.clipper_rate_schedule;
  NEW.clipper_campaign_started_at     := OLD.clipper_campaign_started_at;
  -- Capability grants. Founder-set only: comping a paid capability, and enabling an
  -- artist-scoped experiment, are both decisions the artist must not make for themselves.
  NEW.plan_feature_overrides          := OLD.plan_feature_overrides;
  NEW.song_lab_enabled                := OLD.song_lab_enabled;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_artist_profiles_cols ON public.artist_profiles;
CREATE TRIGGER trg_freeze_artist_profiles_cols
  BEFORE UPDATE ON public.artist_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_artist_profiles_protected_cols();

-- GB The G1ft: Executive Producer Sessions (Gold) and direct interaction / Q&A (Platinum)
-- while he stays on Launch. Founder decision 2026-08-22. Nobody else is comped.
DO $$
DECLARE
  v_count integer;
BEGIN
  UPDATE artist_profiles
     SET plan_feature_overrides = '{"allowsLive": true, "allowsDMs": true}'::jsonb
   WHERE slug = 'gb';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 artist with slug gb, updated %', v_count;
  END IF;
END $$;

COMMIT;

-- ── Self-verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_comped integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'artist_profiles'
      AND column_name = 'plan_feature_overrides'
  ) THEN
    RAISE EXCEPTION 'artist_profiles.plan_feature_overrides missing';
  END IF;

  -- READABILITY is the property. Scoped to SELECT because `authenticated` holds UPDATE on
  -- this table by design (artists edit their own profile); matching any privilege made the
  -- previous version of this check fail on a perfectly correct database.
  IF EXISTS (
    SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'artist_profiles'
      AND column_name = 'plan_feature_overrides'
      AND grantee IN ('anon','authenticated')
      AND privilege_type = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'plan_feature_overrides must not be SELECTable by anon/authenticated';
  END IF;

  -- The freeze must actually name both capability columns, or an artist can grant
  -- themselves a paid feature from the browser.
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'freeze_artist_profiles_protected_cols')
       NOT LIKE '%plan_feature_overrides%' THEN
    RAISE EXCEPTION 'freeze trigger does not protect plan_feature_overrides';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'freeze_artist_profiles_protected_cols')
       NOT LIKE '%song_lab_enabled%' THEN
    RAISE EXCEPTION 'freeze trigger does not protect song_lab_enabled';
  END IF;

  SELECT count(*) INTO v_comped
    FROM artist_profiles
   WHERE plan_feature_overrides <> '{}'::jsonb;
  IF v_comped <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 comped artist, found %', v_comped;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM artist_profiles
     WHERE slug = 'gb' AND plan_feature_overrides ? 'allowsLive'
  ) THEN
    RAISE EXCEPTION 'gb is not the comped artist';
  END IF;
END $$;

SELECT
  (SELECT count(*) FROM artist_profiles WHERE plan_feature_overrides <> '{}'::jsonb) AS comped_artists,
  (SELECT slug FROM artist_profiles WHERE plan_feature_overrides <> '{}'::jsonb LIMIT 1) AS comped_slug,
  'plan overrides applied and frozen' AS status;
