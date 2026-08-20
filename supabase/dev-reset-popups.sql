-- dev-reset-popups.sql
-- DEV UTILITY (not a migration). Diagnoses, then clears, ONE artist's pop-up history
-- so the Pop-up Engine re-arbitrates from scratch on the next page load.
--
-- IT RETURNS ROWS, DELIBERATELY. The first version of this file did its reporting with
-- RAISE NOTICE inside a DO block. The Supabase SQL Editor does not display notices, so
-- running it printed "Success. No rows returned" and every diagnostic was invisible
-- while the delete silently happened anyway. A diagnostic whose output cannot reach the
-- human is worse than none, because it looks like it worked. Everything below is a
-- SELECT or a DELETE ... RETURNING, so the editor shows it.
--
-- WHY THIS EXISTS. The engine shows at most ONE pop-up per user per calendar day, and
-- always the highest-priority eligible one. Correct for an artist, useless for testing:
-- a low-priority pop-up can be unreachable for days while higher ones drain one per day.
--
-- `announcedAt` suppresses an announcement for accounts created ON OR AFTER the
-- announced date, so a genuinely NEW artist sees no backlog at all. An OLD row that only
-- NOW finished the setup wizard is still owed every announcement it predates. That is
-- the case this file exists to untangle. Nothing is broken; the account is just old.
--
-- SAFE: touches `popup_events` only, for one user. Not quests, XP, content, money, or
-- `popup_survey_responses` (a deleted survey answer is real data lost, and clearing
-- events is enough to re-arm a pop-up anyway).
--
-- HOW TO RUN: change the slug, then just run the file. It is READ-ONLY: the only thing
-- that executes is the diagnosis below. Read the verdict row at the bottom of the results.
--
--   STEP 1  diagnose (read-only)
--   STEP 2  retire the announcement backlog. Lives in dev-show-resume-popup.sql, which is
--           ready to run as-is. Almost always the one you want.
--   STEP 3  wipe the history entirely. Re-arms every announcement, so it is the WRONG
--           tool for draining a backlog. Use it only to return to a clean slate.


-- ============================================================================
-- STEP 1 - DIAGNOSE (read-only, changes nothing). This is what runs if you Run the file.
-- ============================================================================
WITH params AS (SELECT 'lago'::text AS want_slug),
me AS (
  SELECT p.want_slug, ap.user_id AS uid, pr.role, pr.created_at
  FROM params p
  LEFT JOIN artist_profiles ap ON ap.slug = p.want_slug
  LEFT JOIN profiles pr ON pr.id = ap.user_id
),
facts AS (
  SELECT
    me.want_slug, me.uid, me.role, me.created_at,
    (SELECT count(*) FROM popup_events e WHERE e.user_id = me.uid) AS ev_total,
    (SELECT count(*) FROM popup_events e
       WHERE e.user_id = me.uid AND e.action = 'shown'
         AND e.created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')) AS ev_today,
    (SELECT qi.title FROM quest_instances qi
       WHERE qi.user_id = me.uid AND qi.status IN ('active','in_progress')
         AND qi.progress_percent > 0 AND qi.progress_percent < 100
       ORDER BY qi.progress_percent DESC LIMIT 1) AS q_title,
    (SELECT qi.progress_percent FROM quest_instances qi
       WHERE qi.user_id = me.uid AND qi.status IN ('active','in_progress')
         AND qi.progress_percent > 0 AND qi.progress_percent < 100
       ORDER BY qi.progress_percent DESC LIMIT 1) AS q_pct,
    (SELECT count(*) FROM quest_instances qi WHERE qi.user_id = me.uid) AS q_total
  FROM me
),
-- The nine announcement pop-ups and their announcedAt dates, copied from
-- src/lib/popups/registry.ts. If you add an announcement there, add it here, or this
-- file will under-report the backlog.
ann(key, priority, announced_at) AS (
  VALUES
    ('announce_hub_navigation',      60, DATE '2026-07-26'),
    ('announce_fan_preview',         58, DATE '2026-07-31'),
    ('announce_membership_strategy', 58, DATE '2026-08-01'),
    ('announce_rise_one_move',       56, DATE '2026-08-13'),
    ('announce_live_tips',           55, DATE '2026-07-24'),
    ('announce_royalty_readiness',   55, DATE '2026-07-27'),
    ('announce_producer_sessions',   55, DATE '2026-07-24'),
    ('announce_launch_limits',       45, DATE '2026-07-31'),
    ('announce_support_chat',        45, DATE '2026-07-31')
)
SELECT 1 AS n, 'artist' AS item,
       COALESCE(want_slug, '(none)') || CASE WHEN uid IS NULL THEN '  <-- NO ARTIST WITH THIS SLUG, fix it above' ELSE '' END AS detail
  FROM facts
UNION ALL
SELECT 2, 'role',
       COALESCE(role, '?') || CASE WHEN role = 'admin'
         THEN '  <-- STOP. The engine returns null for admins before targeting. This account can never see ANY pop-up.'
         ELSE '  (can receive pop-ups)' END
  FROM facts
UNION ALL
SELECT 3, 'account created', COALESCE(created_at::text, '?') FROM facts
UNION ALL
SELECT 4, 'shown today',
       ev_today::text || CASE WHEN ev_today > 0
         THEN '  <-- daily cap already spent, nothing else can appear until you clear or wait'
         ELSE '  (slot is free)' END
  FROM facts
UNION ALL
SELECT 5, 'popup_events rows', ev_total::text FROM facts
UNION ALL
SELECT 6, 'quests assigned',
       q_total::text || CASE WHEN q_total = 0
         THEN '  <-- open Rise Mode once; /api/quests is what assigns them'
         ELSE '' END
  FROM facts
UNION ALL
SELECT 7, 'RESUMABLE',
       CASE WHEN q_title IS NULL
         THEN 'none  <-- no open quest strictly between 0 and 100 percent, so artist_resume_rise is CORRECTLY silent. Clearing events will not summon it.'
         ELSE '"' || q_title || '" at ' || q_pct::text || ' percent  -->  expect the modal to read: Finish this: ' || q_title
       END
  FROM facts
UNION ALL
-- Every announcement this account PREDATES still owes it a slot, and all of them
-- outrank artist_resume_rise (priority 40). This is the queue standing in the way.
SELECT 8, 'blocks resume (priority ' || ann.priority::text || ')', ann.key
  FROM facts, ann
 WHERE facts.created_at IS NOT NULL
   AND facts.created_at < ann.announced_at
UNION ALL
-- Reads FROM facts like every other row rather than using scalar subqueries against the
-- CTE. Legal either way, but this file cannot be executed locally before it is handed
-- over, so fewer distinct constructs is worth more than brevity.
SELECT 9, 'verdict',
       CASE
         WHEN role = 'admin' THEN 'Test on a non-admin artist. Nothing else matters until then.'
         WHEN q_title IS NULL THEN 'Resume cannot fire: nothing is partly done. Make real progress on a quest first.'
         ELSE 'Resume is eligible. Open supabase/dev-show-resume-popup.sql, press Run, then reload Rise Mode.'
       END
  FROM facts
ORDER BY n, item, detail;


-- ============================================================================
-- STEP 2 - RETIRE THE ANNOUNCEMENT BACKLOG so a lower-priority pop-up can win.
-- ============================================================================
--
-- That action lives in its own ready-to-run file, so the list of announcement keys is
-- written down ONCE and cannot drift between two copies:
--
--     supabase/dev-show-resume-popup.sql
--
-- Open it and press Run. Nothing to edit.
--
-- DO NOT reach for STEP 3 instead. Deleting popup_events RE-ARMS every announcement,
-- because `passesFrequency` for a `once` pop-up is `mine.length === 0`. Clearing to drain
-- a backlog is a loop that never ends: clear, meet an announcement, clear, meet the next.
-- Inserting is what retires them, and because the daily governor counts only
-- `action = 'shown'`, writing 'dismissed' rows leaves today's slot free.
--
-- Behavioural pop-ups that outrank resume (40) are deliberately left alone, and as of
-- 2026-08-20 none of them can win here anyway: artist_connect_stripe (100) needs Stripe
-- disconnected, artist_first_broadcast (80) has `audience: () => false`, both break-even
-- pop-ups (75) need real GMV, and artist_upgrade_pro (50) needs 3+ supporters.


-- ============================================================================
-- STEP 3 - START OVER (rarely what you want; read STEP 2 first).
-- Wipes this user's pop-up history, which RE-ARMS every announcement too.
-- Use it to put the account back to a clean slate, not to drain a backlog.
-- ============================================================================
-- DELETE FROM popup_events
--  WHERE user_id = (SELECT user_id FROM artist_profiles WHERE slug = 'lago')
--  RETURNING popup_key, action, created_at;
