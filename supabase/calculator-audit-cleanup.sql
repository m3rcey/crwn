-- ============================================================================
-- ONE-OFF CLEANUP (NOT a migration): remove everything the GPT-6 calculator
-- bottleneck audit (docs/GPT6_CALCULATOR_BOTTLENECK_AUDIT.md) left behind.
--
-- Run in the Supabase SQL Editor, one STEP at a time, in order. Modeled on
-- astra-audit-cleanup.sql. Scoped by TWO handles, because the audit writes two
-- kinds of rows:
--   (a) rows that carry the audit mailbox (email-only calculator leads, their
--       nurture enrollments, saved results, the four auth users). Matched by
--       the email prefix below.
--   (b) anonymous event rows that carry NO id at all (lead_magnet_events for
--       calculator starts/completions from a browser that set crwn_dnt late or
--       not at all). Matched ONLY by the run's time window from the report.
--
-- BEFORE RUNNING:
--   1. Replace 'crwn.audit.mailbox+test' in EVERY step with the mailbox prefix
--      you gave GPT-6 (it matches +test-p1 through +test-p4). The founder
--      address joshn.wms@gmail.com never matches, and neither does any real artist.
--   2. Replace 'ig_test_handle' in STEP 0 with the throwaway Instagram handle,
--      lowercase, no @. Skip STEP 0 entirely if DM_PATH_ALLOWED was NO.
--   3. Replace the two timestamps in STEP 4 with the exact start and end
--      wall-clock times from section 1 of the report, in UTC.
--
-- Stripe is never touched: the audit stops before Stripe.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0: the DM path (only if DM_PATH_ALLOWED was YES). The keyword comment
-- created a lead_identities row under the test handle; sessions, answers, the
-- lead profile and acquisition events all cascade from it. The crwn_dnt cookie
-- never covered this path (ManyChat calls the server directly), so this is the
-- only way those rows go away. Preview, then delete.
-- ---------------------------------------------------------------------------
SELECT id, instagram_username, manychat_contact_id, created_at
  FROM public.lead_identities
 WHERE instagram_username = lower('ig_test_handle');

DELETE FROM public.lead_identities
 WHERE instagram_username = lower('ig_test_handle');

-- ---------------------------------------------------------------------------
-- STEP 1: PREVIEW the identified rows. Run ALONE first and eyeball the counts.
-- Expect: up to 4 auth users, a handful of leads, results and enrollments.
-- ---------------------------------------------------------------------------
SELECT 'auth_users' AS what, count(*) FROM auth.users
 WHERE email ILIKE 'crwn.audit.mailbox+test%'
UNION ALL
SELECT 'lead_magnet_leads', count(*) FROM public.lead_magnet_leads
 WHERE email ILIKE 'crwn.audit.mailbox+test%'
UNION ALL
SELECT 'prospect_nurture_enrollments', count(*) FROM public.prospect_nurture_enrollments
 WHERE email ILIKE 'crwn.audit.mailbox+test%'
UNION ALL
SELECT 'lead_magnet_results (by lead or user)', count(*) FROM public.lead_magnet_results r
 WHERE r.lead_id IN (SELECT id FROM public.lead_magnet_leads WHERE email ILIKE 'crwn.audit.mailbox+test%')
    OR r.user_id IN (SELECT id FROM auth.users WHERE email ILIKE 'crwn.audit.mailbox+test%');

-- ---------------------------------------------------------------------------
-- STEP 2: identified rows. Order matters: results first (lead_id is SET NULL on
-- lead delete, which would orphan them), then leads (enrollments cascade),
-- then the auth users (profiles / artist_profiles / owned results cascade).
-- ---------------------------------------------------------------------------
DELETE FROM public.lead_magnet_results r
 WHERE r.lead_id IN (SELECT id FROM public.lead_magnet_leads WHERE email ILIKE 'crwn.audit.mailbox+test%')
    OR r.user_id IN (SELECT id FROM auth.users WHERE email ILIKE 'crwn.audit.mailbox+test%');

DELETE FROM public.lead_magnet_leads
 WHERE email ILIKE 'crwn.audit.mailbox+test%';

DELETE FROM auth.users
 WHERE email ILIKE 'crwn.audit.mailbox+test%';

-- ---------------------------------------------------------------------------
-- STEP 3: ONLY if CALL_REQUEST_ALLOWED was YES. Removes any event row that
-- carries a persona email in its metadata (harmless when there are none).
-- ---------------------------------------------------------------------------
DELETE FROM public.lead_magnet_events
 WHERE metadata::text ILIKE '%crwn.audit.mailbox+test%';

-- ---------------------------------------------------------------------------
-- STEP 4: anonymous event rows inside the run window. These carry no id, so
-- the window is the only handle. PREVIEW first: the count should be small and
-- every row should sit inside the audit's hours. If real traffic overlapped
-- the window (check funnel_events for a page_viewed burst you recognize as
-- yours), narrow the window before deleting.
-- ---------------------------------------------------------------------------
SELECT 'lead_magnet_events in window' AS what, count(*)
  FROM public.lead_magnet_events
 WHERE created_at BETWEEN '2026-09-18 14:00:00+00' AND '2026-09-18 19:00:00+00'
UNION ALL
SELECT 'funnel_events in window', count(*)
  FROM public.funnel_events
 WHERE created_at BETWEEN '2026-09-18 14:00:00+00' AND '2026-09-18 19:00:00+00';

-- Uncomment after the preview reads as expected.
-- DELETE FROM public.lead_magnet_events
--  WHERE created_at BETWEEN '2026-09-18 14:00:00+00' AND '2026-09-18 19:00:00+00';
-- DELETE FROM public.funnel_events
--  WHERE created_at BETWEEN '2026-09-18 14:00:00+00' AND '2026-09-18 19:00:00+00';

-- ---------------------------------------------------------------------------
-- STEP 5: VERIFY. Every count must be 0.
-- ---------------------------------------------------------------------------
SELECT 'auth_users' AS what, count(*) FROM auth.users WHERE email ILIKE 'crwn.audit.mailbox+test%'
UNION ALL
SELECT 'lead_magnet_leads', count(*) FROM public.lead_magnet_leads WHERE email ILIKE 'crwn.audit.mailbox+test%'
UNION ALL
SELECT 'prospect_nurture_enrollments', count(*) FROM public.prospect_nurture_enrollments WHERE email ILIKE 'crwn.audit.mailbox+test%';
