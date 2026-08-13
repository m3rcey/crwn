-- Turn OFF the live_tips feature flag (pre-PMF surface reduction, 2026-08-13).
--
-- WHY: zero tips have ever been sent, live streaming is not on any promoted content path this
-- phase, and every visible money control is one more thing to keep truthful. The flag is the
-- designed off-switch: src/lib/live/tips.ts fails closed, the tip bar stops rendering, and the
-- tip-checkout route refuses. No code change, no data change, nothing deleted.
--
-- REVERSAL: set enabled back to true in this same row. The re-enable trigger is a pilot artist
-- running a stream and asking for tipping.
--
-- Run in the Supabase SQL editor. Idempotent.

UPDATE admin_settings
   SET value = '{"enabled": false}'::jsonb,
       updated_at = now()
 WHERE key = 'live_tips';

-- Self-verify: the row must exist and read disabled. (A missing row also reads as OFF through
-- the fail-closed gate, but silently "fixing" a typo'd key with an insert would hide a mistake,
-- so a missing row fails loudly here instead.)
DO $$
DECLARE
  v JSONB;
BEGIN
  SELECT value INTO v FROM admin_settings WHERE key = 'live_tips';
  IF v IS NULL THEN
    RAISE EXCEPTION 'FLAG FLIP FAILED: admin_settings.live_tips row not found';
  END IF;
  IF (v->>'enabled')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FLAG FLIP FAILED: live_tips still reads enabled=%', v->>'enabled';
  END IF;
  RAISE NOTICE 'live_tips: OFF';
END $$;
