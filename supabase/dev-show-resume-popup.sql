-- dev-show-resume-popup.sql
-- READY TO RUN. Nothing to uncomment, nothing to edit unless you want a different artist.
-- Open in the Supabase SQL Editor, press Run, then reload /profile/artist in the app.
--
-- WHAT IT DOES, in two statements:
--   1. Un-retires the resume prompt itself, by deleting its own event rows.
--   2. Retires the announcement pop-ups this account is still owed, so the resume prompt
--      (priority 40) stops losing the daily slot to them.
--
-- Statement 1 exists because the prompt retires itself the moment you answer it. ANY
-- terminal action counts, clicking the CTA as well as dismissing, so pressing "Finish it"
-- closes it for good. That is the anti-nag rule working, and it is also why running this
-- file once is not enough to see the pop-up twice. Run it again whenever you want it back.
--
-- Note the two halves pull in OPPOSITE directions on purpose. Deleting rows RE-ARMS a
-- pop-up; inserting rows RETIRES one. Announcements need retiring, the resume prompt needs
-- re-arming, so this file does one of each rather than clearing everything.
--
-- WHY RETIRE INSTEAD OF DELETE: the engine shows ONE pop-up per user per day, highest
-- priority first. Deleting popup_events RE-ARMS every announcement, so clearing to get
-- past them is a loop that never ends. Writing a 'dismissed' row retires each one for
-- good, because a `once` pop-up is only eligible while it has no events at all. The
-- daily governor counts only 'shown' rows, so this does NOT spend today's slot: the
-- resume prompt can appear on the very next page load.
--
-- SAFE: writes to popup_events only, for one artist. It marks announcements as already
-- dismissed. It touches no quests, XP, content, money, or survey answers, and it cannot
-- affect any other user.
--
-- To use a different artist, change the slug in BOTH statements (two places).

-- 1. Un-retire the resume prompt so it can fire again.
DELETE FROM popup_events
 WHERE popup_key = 'artist_resume_rise'
   AND user_id = (SELECT user_id FROM artist_profiles WHERE slug = 'lago');

-- 2. Retire the announcements that outrank it. The result of THIS statement is what the
--    editor shows: the rows it wrote, or none if they were already retired.
INSERT INTO popup_events (user_id, popup_key, action)
SELECT ap.user_id, k.popup_key, 'dismissed'
  FROM artist_profiles ap
  CROSS JOIN (VALUES
    ('announce_hub_navigation'),
    ('announce_fan_preview'),
    ('announce_membership_strategy'),
    ('announce_rise_one_move'),
    ('announce_live_tips'),
    ('announce_royalty_readiness'),
    ('announce_producer_sessions'),
    ('announce_launch_limits'),
    ('announce_support_chat')
  ) AS k(popup_key)
 -- Idempotent: running this twice adds nothing the second time.
 WHERE NOT EXISTS (
   SELECT 1 FROM popup_events e
    WHERE e.user_id = ap.user_id AND e.popup_key = k.popup_key
 )
   AND ap.slug = 'lago'
RETURNING popup_key, action;
