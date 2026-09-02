-- schema-phase2-tier-events-offer-vocabulary.sql
-- Two high-signal events for the Tier Offer Experience, in the EXISTING fan-side table.
--
-- tier_events is already the fan funnel's evidence spine (daily-unique per visitor,
-- source dimension, tier_card_viewed / tier_checkout_started), so the offer page reuses
-- it rather than growing a parallel stack. Two additions and no more:
--
--   tier_vsl_started    the fan pressed play on the offer video
--   tier_offer_declined the fan explicitly declined this tier's offer (the downsell or
--                       stay-free tap), which turns "viewed but never checked out" from
--                       an inference into a fact
--
-- View and CTA are deliberately NOT new events: tier_card_viewed already is the view, and
-- checkout start is already recorded server-side where it cannot be forged. Code emits
-- the two new types today and the daily-unique insert simply fails the CHECK until this
-- runs, so nothing waits on it; analytics never breaks a page.
--
-- Apply manually in the Supabase SQL Editor. Safe to re-run.

BEGIN;

ALTER TABLE public.tier_events DROP CONSTRAINT IF EXISTS tier_events_event_type_check;
ALTER TABLE public.tier_events ADD CONSTRAINT tier_events_event_type_check
  CHECK (event_type IN ('tier_card_viewed', 'tier_checkout_started', 'tier_vsl_started', 'tier_offer_declined'));

COMMIT;

-- ── Self-verify ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_tier RECORD; v_id uuid;
BEGIN
  SELECT id, artist_id INTO v_tier FROM public.subscription_tiers LIMIT 1;
  IF v_tier.id IS NULL THEN RETURN; END IF;

  INSERT INTO public.tier_events (artist_id, tier_id, event_type, visitor_hash, event_date)
  VALUES (v_tier.artist_id, v_tier.id, 'tier_vsl_started', 'canary_' || md5(random()::text), CURRENT_DATE)
  RETURNING id INTO v_id;
  DELETE FROM public.tier_events WHERE id = v_id;

  BEGIN
    INSERT INTO public.tier_events (artist_id, tier_id, event_type, visitor_hash, event_date)
    VALUES (v_tier.artist_id, v_tier.id, 'not_a_real_event', 'canary_' || md5(random()::text), CURRENT_DATE)
    RETURNING id INTO v_id;
    DELETE FROM public.tier_events WHERE id = v_id;
    RAISE EXCEPTION 'the event_type constraint accepted an invalid value';
  EXCEPTION WHEN check_violation THEN
    NULL; -- refused, correct
  END;
END $$;

SELECT 'tier events offer vocabulary applied' AS status;
