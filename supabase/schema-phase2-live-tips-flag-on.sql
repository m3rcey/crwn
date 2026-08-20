-- Turn the Live Tips + Tip Goals feature ON in production.
--
-- WHY THIS EXISTS (2026-08-16). Live tips shipped DARK behind
-- `admin_settings.live_tips` and were never turned on. Meanwhile the acquisition
-- funnel started selling them:
--
--   * `src/lib/opportunity/unifiedModel.ts` carries a `live_tips` incremental line
--     (tipRate 0.25) and ADDS it to the live monthly gross, so the Opportunity
--     Calculator, CRWN's primary promoted door, shows every artist tip revenue.
--   * The Live Experience Calculator joined `PROMOTED_TOOL_KEYS` on 2026-08-16, and
--     its own model prices tips during the stream.
--
-- So a promoted calculator currently quotes money the product cannot take. That is
-- the "marketing shipped ahead of the product" failure class, and there are exactly
-- two honest ways to close it: turn the built feature on (this file), or remove tips
-- from the models. The founder decision recorded in the 2026-08-16 retraction was
-- that "tips are part of the live room those funnels sell", which points at this file.
--
-- The feature itself is BUILT: `supabase/schema-phase2-live-tips.sql` created
-- `live_tips` and `live_goals`, the Stripe webhook matches a tip BEFORE the ticket
-- branch, and the earnings type exists
-- (`supabase/schema-phase2-earnings-live-tip-type.sql`). This file only flips the
-- flag; it creates nothing.
--
-- ROLLBACK: UPDATE admin_settings SET value = '{"enabled": false}'::jsonb WHERE key = 'live_tips';

INSERT INTO admin_settings (key, value)
VALUES ('live_tips', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}'::jsonb;

-- Self-verify: the flag row must exist AND read enabled, or this migration failed.
DO $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT (value->>'enabled')::boolean INTO v_enabled
  FROM admin_settings WHERE key = 'live_tips';

  IF v_enabled IS NULL THEN
    RAISE EXCEPTION 'schema-phase2-live-tips-flag-on: FAILED, no admin_settings row for live_tips';
  END IF;

  IF v_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'schema-phase2-live-tips-flag-on: FAILED, live_tips is still OFF';
  END IF;

  RAISE NOTICE 'schema-phase2-live-tips-flag-on: OK (live_tips is ON). Verify with: npm run verify:flags';
END $$;

-- Visible confirmation. The RAISE NOTICE above never reaches the Supabase SQL Editor (it
-- does not display notices), so on success this file would otherwise print the same
-- "Success. No rows returned" as a file that did nothing. A failure is still loud, because
-- RAISE EXCEPTION aborts; this is so a SUCCESS is legible too.
SELECT key AS flag,
       (value->>'enabled')::boolean AS enabled,
       'live tips are ON. Tip goals are now available in the live room.' AS result
  FROM admin_settings
 WHERE key = 'live_tips';
