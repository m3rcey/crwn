-- schema-phase2-fan-automation-link-provider.sql
-- A fan funnel whose traffic comes from a LINK is a first-class source, not a workaround.
--
-- WHY. fan_automations.provider was constrained to ('instagram','facebook') because the
-- feature was born as comment-to-DM automation. But the funnel underneath (capture, free
-- join, magnet delivery, primary offer, downsell, checkout) never needed Meta at all: the
-- /drop/<token> page resolves by token and works for an artist whose traffic comes from a
-- bio link, a QR code, or an external tool like ManyChat. Until now the wizard could not
-- express that, which is why the first such funnel had to be created by script.
--
-- WHAT MAKES A FUNNEL LINK-ONLY AT RUNTIME IS connection_id BEING NULL, not this label,
-- and that is unchanged. The comment matcher only routes events through automations that
-- HAVE an active connection, so a link funnel simply never receives one. This column only
-- lets the row say what it is, so the UI stops calling a bio link "instagram".
--
-- Nothing is loosened: 'instagram' and 'facebook' keep their exact meaning, existing rows
-- are untouched, and no policy or grant changes.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.fan_automations DROP CONSTRAINT IF EXISTS fan_automations_provider_check;
ALTER TABLE public.fan_automations ADD CONSTRAINT fan_automations_provider_check
  CHECK (provider IN ('instagram', 'facebook', 'link'));

COMMENT ON COLUMN public.fan_automations.provider IS
  'Where the fans come from. instagram/facebook listen on comments through an active connection; link means the artist shares the /drop URL themselves (bio, QR, external tool) and no connection exists.';

COMMIT;

-- ── Self-verify: behavioral, not existence-only ────────────────────────────────
DO $$
DECLARE
  v_artist uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_artist FROM public.artist_profiles LIMIT 1;
  IF v_artist IS NULL THEN RETURN; END IF;

  -- 'link' must now be ACCEPTED.
  INSERT INTO public.fan_automations (artist_id, provider, status, public_token)
  VALUES (v_artist, 'link', 'draft', 'canary_' || substr(md5(random()::text), 1, 12))
  RETURNING id INTO v_id;
  DELETE FROM public.fan_automations WHERE id = v_id;

  -- Nonsense must still be REFUSED, so the constraint was widened and not dropped.
  BEGIN
    INSERT INTO public.fan_automations (artist_id, provider, status, public_token)
    VALUES (v_artist, 'definitely_not_a_provider', 'draft', 'canary_' || substr(md5(random()::text), 1, 12))
    RETURNING id INTO v_id;
    DELETE FROM public.fan_automations WHERE id = v_id;
    RAISE EXCEPTION 'the provider constraint accepted an invalid value';
  EXCEPTION WHEN check_violation THEN
    NULL; -- refused, which is correct
  END;
END $$;

SELECT
  (SELECT count(*) FROM public.fan_automations WHERE provider = 'link') AS link_funnels,
  'fan automation link provider applied' AS status;
