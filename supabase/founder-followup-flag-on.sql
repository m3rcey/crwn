-- Turn automatic FOUNDER FOLLOW-UP email ON in production.
--
-- What it does once on (docs/crwn-brain/34-FOUNDER-FOLLOW-UP.md): once a day (the platform-crm
-- cron, 05:00 UTC), every lead the scorer bands `sales_priority` is resolved to ONE journey stage
-- (saw result / saved plan / in setup / cannot take money yet / ready, no paying member / asked
-- for a call). If that stage has not had a note yet, the lead is quiet (48h), no other CRWN email
-- went out in 48h, no founder note in 7 days, email consent is on and the address is not
-- suppressed, they get ONE email from "Josh at CRWN <hello@thecrwn.app>", replies to your Gmail.
-- Converted artists (first paid member) and booked calls never get one.
--
-- BEFORE YOU RUN THIS:
--   1. Open /admin -> Acquisition -> Founder and read the drafts. That is exactly what will send.
--   2. Any lead you already emailed by hand: press "I sent this by hand" first, or they get it twice.
--   3. BUSINESS_POSTAL_ADDRESS must be set in Vercel, or the footer prints a placeholder.
--
-- This file only flips the flag; it creates nothing.
-- ROLLBACK: UPDATE admin_settings SET value = '{"enabled": false}'::jsonb WHERE key = 'founder_followup';

INSERT INTO admin_settings (key, value)
VALUES ('founder_followup', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}'::jsonb;

-- Self-verify: the flag row must exist AND read enabled.
DO $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT (value->>'enabled')::boolean INTO v_enabled
  FROM admin_settings WHERE key = 'founder_followup';

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'founder-followup-flag-on: FAILED, no admin_settings row for founder_followup';
  END IF;
  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'founder-followup-flag-on: FAILED, founder_followup is not enabled';
  END IF;
  RAISE NOTICE 'founder-followup-flag-on: OK, founder_followup is enabled';
END $$;
