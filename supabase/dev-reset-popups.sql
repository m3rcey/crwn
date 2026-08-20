-- dev-reset-popups.sql
-- DEV UTILITY (not a migration). Diagnoses, then clears, ONE artist's pop-up history
-- so the Pop-up Engine re-arbitrates from scratch on the next page load.
--
-- WHY THIS EXISTS. The engine shows at most ONE pop-up per user per calendar day, and
-- it always shows the highest-priority eligible one. That is correct for an artist and
-- miserable for testing: a lower-priority pop-up can be genuinely unreachable for days
-- while higher-priority ones drain, one per day. Verifying `artist_resume_rise`
-- (priority 40) on an account owed a queue of announcements (45 to 60) took an
-- estimated week of real calendar days, which is not a test.
--
-- It also explains the surprise that prompted this file. `announcedAt` suppresses an
-- announcement for accounts created ON OR AFTER the announced date, so a genuinely NEW
-- artist sees none of them. An OLD account that only NOW finished the setup wizard is
-- still owed every announcement it predates, so it meets the backlog instead of the
-- behavioural pop-ups. Nothing is broken; the account is just old.
--
-- SAFE: touches `popup_events` only, for this one user. It does not touch quests, XP,
-- content, money, or `popup_survey_responses` (a deleted survey answer is real data
-- lost, and clearing events is enough to re-arm the pop-up anyway).
--
-- Change the slug below, then run in the Supabase SQL Editor. Read the NOTICE output:
-- it tells you whether a resumable quest even exists before you go looking for the
-- prompt, which is the other half of why it may not appear.
DO $$
DECLARE
  v_slug text := 'lago';   -- <-- the artist to reset
  v_user uuid;
  v_role text;
  v_created timestamptz;
  v_events int;
  v_shown_today int;
  v_resumable_title text;
  v_resumable_pct numeric;
BEGIN
  SELECT ap.user_id INTO v_user FROM artist_profiles ap WHERE ap.slug = v_slug;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No artist found for slug %', v_slug;
  END IF;

  SELECT p.role, p.created_at INTO v_role, v_created FROM profiles p WHERE p.id = v_user;

  -- The single most common reason "the pop-up is not showing": the engine refuses to
  -- interrupt an admin at all, before any targeting runs. An admin account can never
  -- verify a pop-up, no matter what else is true.
  IF v_role = 'admin' THEN
    RAISE NOTICE 'HEADS UP: role=admin. The engine returns NULL for admins before targeting, so this account cannot see ANY pop-up. Test on a role=artist account.';
  END IF;

  SELECT count(*) INTO v_events FROM popup_events WHERE user_id = v_user;
  SELECT count(*) INTO v_shown_today
    FROM popup_events
    WHERE user_id = v_user AND action = 'shown'
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');

  -- The resume prompt is gated on a quest STRICTLY between 0 and 100 that is still
  -- open. If this comes back empty, clearing events changes nothing: there is simply
  -- nothing to resume, and the prompt is correctly staying silent.
  SELECT qi.title, qi.progress_percent
    INTO v_resumable_title, v_resumable_pct
    FROM quest_instances qi
    WHERE qi.user_id = v_user
      AND qi.status IN ('active', 'in_progress')
      AND qi.progress_percent > 0
      AND qi.progress_percent < 100
    ORDER BY qi.progress_percent DESC
    LIMIT 1;

  RAISE NOTICE '--- BEFORE ---';
  RAISE NOTICE 'artist=% user=% role=% created=%', v_slug, v_user, v_role, v_created;
  RAISE NOTICE 'popup_events rows=%, shown today=% (1 or more today means the daily cap is already spent)', v_events, v_shown_today;
  IF v_resumable_title IS NULL THEN
    RAISE NOTICE 'RESUMABLE: none. No open quest sits strictly between 0%% and 100%%, so artist_resume_rise is correctly ineligible. Open Rise Mode at least once (that is what assigns quests) and make some real progress first.';
  ELSE
    -- plpgsql RAISE uses % as the ONLY placeholder and %% as a literal percent sign.
    -- "percent" is spelled out rather than risking the ambiguous %%% sequence next to
    -- a placeholder, which reads left to right and would print the sign before the number.
    RAISE NOTICE 'RESUMABLE: "%" at % percent. The prompt should read: Finish this: %', v_resumable_title, v_resumable_pct, v_resumable_title;
  END IF;

  DELETE FROM popup_events WHERE user_id = v_user;

  RAISE NOTICE '--- AFTER ---';
  RAISE NOTICE 'popup_events cleared. Reload /profile/artist or /home: the engine re-arbitrates and shows the highest-priority ELIGIBLE pop-up. Announcements this old account predates (45 to 60) outrank resume (40), so expect one of those first unless you clear again.';
END $$;
