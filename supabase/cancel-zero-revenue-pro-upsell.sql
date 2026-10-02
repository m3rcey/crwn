-- One-off: stop the "you are ready for Pro" upsell for artists who have made no money.
--
-- WHY. The platform-crm cron enrolled every Launch artist whose Stripe Connect id existed into
-- starter_upgrade_nudge. A Connect id is written the moment an artist STARTS Stripe onboarding, so
-- in the week to 2026-10-02 ten brand-new artists with zero fans and zero revenue were told
-- "you are ready for Pro" ($49/mo). Nine of those enrollments are still active, and step 2 ("What
-- stays locked on Launch") goes out from 2026-10-04. The code fix (artistEmailGate.ts) cancels
-- these at send time, but only once the branch is live; this statement stops them now.
--
-- WHAT IT TOUCHES. Only ACTIVE starter_upgrade_nudge enrollments, only for artists on Launch
-- ('starter') whose real trailing 30-day GROSS earnings are below the Pro break-even ($1,225).
-- Status becomes 'canceled'. Nothing is deleted. The upsell will re-enroll on its own when an
-- artist's real revenue crosses the break-even.
--
-- TO REVERSE: set status = 'active' and next_send_at = now() on the ids the first SELECT lists.
--
-- Run the whole file. The first SELECT is the dry run (expected on 2026-10-02: 9 rows, all with
-- gmv30d_cents = 0). The UPDATE then cancels exactly those rows, and the last block fails loudly
-- if any qualifying enrollment is still active.

WITH upsell AS (
  SELECT id FROM platform_sequences WHERE trigger_type = 'starter_upgrade_nudge'
),
gmv AS (
  SELECT artist_id, COALESCE(SUM(gross_amount), 0) AS gmv30d_cents
  FROM earnings
  WHERE created_at >= now() - interval '30 days'
  GROUP BY artist_id
)
SELECT e.id AS enrollment_id, ap.slug, ap.platform_tier, COALESCE(g.gmv30d_cents, 0) AS gmv30d_cents,
       e.current_step, e.next_send_at
FROM platform_sequence_enrollments e
JOIN artist_profiles ap ON ap.user_id = e.artist_user_id
LEFT JOIN gmv g ON g.artist_id = ap.id
WHERE e.sequence_id IN (SELECT id FROM upsell)
  AND e.status = 'active'
  AND COALESCE(ap.platform_tier, 'starter') = 'starter'
  AND COALESCE(g.gmv30d_cents, 0) < 122500
ORDER BY e.next_send_at;

WITH upsell AS (
  SELECT id FROM platform_sequences WHERE trigger_type = 'starter_upgrade_nudge'
),
gmv AS (
  SELECT artist_id, COALESCE(SUM(gross_amount), 0) AS gmv30d_cents
  FROM earnings
  WHERE created_at >= now() - interval '30 days'
  GROUP BY artist_id
)
UPDATE platform_sequence_enrollments e
SET status = 'canceled', next_send_at = NULL
FROM artist_profiles ap
LEFT JOIN gmv g ON g.artist_id = ap.id
WHERE ap.user_id = e.artist_user_id
  AND e.sequence_id IN (SELECT id FROM upsell)
  AND e.status = 'active'
  AND COALESCE(ap.platform_tier, 'starter') = 'starter'
  AND COALESCE(g.gmv30d_cents, 0) < 122500;

DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining
  FROM platform_sequence_enrollments e
  JOIN platform_sequences s ON s.id = e.sequence_id AND s.trigger_type = 'starter_upgrade_nudge'
  JOIN artist_profiles ap ON ap.user_id = e.artist_user_id
  WHERE e.status = 'active'
    AND COALESCE(ap.platform_tier, 'starter') = 'starter'
    AND COALESCE((SELECT SUM(gross_amount) FROM earnings x
                  WHERE x.artist_id = ap.id AND x.created_at >= now() - interval '30 days'), 0) < 122500;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'cancel-zero-revenue-pro-upsell: % qualifying enrollments still active', remaining;
  END IF;
END $$;
