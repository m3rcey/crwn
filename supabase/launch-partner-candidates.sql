-- WHO SHOULD BE A LAUNCH PARTNER? READY TO RUN. Nothing to edit.
--
-- Open in the Supabase SQL Editor, press Run, and send me the table.
--
-- It changes NOTHING. It is a single read-only SELECT.
--
-- It answers two questions at once:
--   1. Who is ALREADY in the launch cohort (the "in_cohort" column). If every row says no,
--      then nothing is enrolled yet, whatever a previous run appeared to say.
--   2. Who is READY to be one. A launch partner has to be able to reach a first paid member,
--      so an artist with no music, no photo, no Stripe, or no priced paid tier cannot be one
--      yet no matter how willing they are. The "blocking" column names what is missing.
--
-- What it CANNOT know, and what you still have to judge: prior direct sales, whether they
-- have an exportable fan list, and whether they will actually send the campaign. Those are
-- the three selection criteria that matter most and none of them are in this database.

SELECT
  ap.slug,
  COALESCE(p.display_name, '(no name)')                        AS artist,
  CASE WHEN ap.launch_partner THEN 'YES' ELSE 'no' END         AS in_cohort,

  (SELECT count(*) FROM tracks t
    WHERE t.artist_id = ap.id AND t.is_active)                 AS tracks,

  (SELECT count(*) FROM subscription_tiers st
    WHERE st.artist_id = ap.id AND st.is_active
      AND st.price > 0 AND st.stripe_price_id IS NOT NULL)     AS priced_paid_tiers,

  (SELECT count(*) FROM subscriptions s
    WHERE s.artist_id = ap.id AND s.status = 'active')         AS members,

  CASE WHEN ap.stripe_connect_id IS NOT NULL
       THEN 'connected' ELSE 'NOT CONNECTED' END               AS stripe,

  -- Everything that stands between this artist and a first paid member, named. Empty means
  -- ready. The checks mirror what the product actually enforces, not a wish list.
  NULLIF(concat_ws(', ',
    CASE WHEN (SELECT count(*) FROM tracks t
                WHERE t.artist_id = ap.id AND t.is_active) = 0
         THEN 'no music' END,
    CASE WHEN p.avatar_url IS NULL THEN 'no photo' END,
    CASE WHEN p.display_name IS NULL
           OR p.display_name = ''
           OR p.display_name LIKE '%@%'
         THEN 'name is still an email' END,
    CASE WHEN ap.stripe_connect_id IS NULL THEN 'Stripe not connected' END,
    CASE WHEN (SELECT count(*) FROM subscription_tiers st
                WHERE st.artist_id = ap.id AND st.is_active
                  AND st.price > 0 AND st.stripe_price_id IS NOT NULL) = 0
         THEN 'no paid tier with a live price' END,
    CASE WHEN p.is_active = false THEN 'account deactivated' END
  ), '')                                                        AS blocking

FROM artist_profiles ap
LEFT JOIN profiles p ON p.id = ap.user_id
ORDER BY
  ap.launch_partner DESC,
  -- Ready artists first, then most music, then most existing members.
  (ap.stripe_connect_id IS NOT NULL) DESC,
  (SELECT count(*) FROM subscription_tiers st
    WHERE st.artist_id = ap.id AND st.is_active
      AND st.price > 0 AND st.stripe_price_id IS NOT NULL) DESC,
  (SELECT count(*) FROM subscriptions s
    WHERE s.artist_id = ap.id AND s.status = 'active') DESC,
  (SELECT count(*) FROM tracks t WHERE t.artist_id = ap.id AND t.is_active) DESC,
  ap.slug;
