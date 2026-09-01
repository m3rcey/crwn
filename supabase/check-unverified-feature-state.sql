-- READ-ONLY state check (changes nothing). Run in the Supabase SQL editor and
-- paste Claude the full output.
--
-- Purpose: four feature states are marked 'unverified' in the architecture
-- registry (src/lib/architecture/invariants.ts, EXPECTED_MIGRATION_STATE +
-- FEATURES) because TODO.md and the Brain docs contradict each other about
-- them. This query answers all four from production.

-- 1. Flag values the docs disagree about.
SELECT key, value
FROM admin_settings
WHERE key IN ('producer_sessions', 'live_tips', 'royalty_readiness');

-- 2. Are the disputed migrations applied? Each row: object we expect the
--    migration to have created, and whether it exists.
SELECT 'schema-phase2-royalty-readiness.sql' AS migration,
       to_regclass('public.royalty_readiness') IS NOT NULL AS applied
UNION ALL
SELECT 'schema-phase2-producer-sessions.sql',
       to_regclass('public.session_submissions') IS NOT NULL
UNION ALL
SELECT 'schema-phase2-sub-avatar.sql',
       to_regclass('public.sub_avatar_audit') IS NOT NULL
UNION ALL
SELECT 'schema-phase2-earnings-live-tip-type.sql',
       EXISTS (
         SELECT 1
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'earnings'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) LIKE '%live_tip%'
       );

-- 3. SEC-003 (cybersecurity audit 2026-08-12). The profiles freeze trigger.
--    This one CANNOT be proved by an anonymous probe, which is why it declares
--    liveCheck 'sql-check' in EXPECTED_MIGRATION_STATE. Two reasons: the finding is
--    about what an AUTHENTICATED user may WRITE, not what anon may read, and
--    PostgREST cannot see a trigger at all. The trigger also reverts silently rather
--    than raising, so the write returns 204 either way and the status code proves
--    nothing. Reading the installed function source is the honest check.
--    Expect applied = true.
SELECT 'schema-phase2-sec-003-profiles-identity-freeze.sql' AS migration,
       (
         SELECT bool_and(position('NEW.' || col IN p.prosrc) > 0)
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN unnest(ARRAY['is_active', 'stripe_connect_id', 'email', 'phone', 'is_approved']) AS col
         WHERE n.nspname = 'public'
           AND p.proname = 'freeze_profiles_protected_cols'
       ) AS applied;

-- 4. Team Split funded reserve (2026-08-12). Declares liveCheck 'sql-check' because both
--    functions it adds are deliberately REVOKED from anon and authenticated, so an anonymous
--    probe can only ever answer "denied", which is indistinguishable from "never created". The
--    honest check asks the catalog whether the objects exist AND whether they are still closed to
--    the Data API roles, which is the security property that matters.
--    Expect applied = true after running supabase/schema-phase2-team-split-funded-reserve.sql.
SELECT 'schema-phase2-team-split-funded-reserve.sql' AS migration,
       (
         to_regprocedure('public.accept_team_split_deal(uuid,uuid,boolean,numeric)') IS NOT NULL
         AND to_regprocedure('public.team_split_committed_percent(uuid,uuid,text,uuid,numeric,text,numeric)') IS NOT NULL
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'team_split_earnings' AND column_name = 'funded_reserve_cents')
         AND EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'team_split_payouts' AND column_name = 'payee_kind')
         AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tsp_idempotency')
         AND NOT has_function_privilege('authenticated', 'public.accept_team_split_deal(uuid,uuid,boolean,numeric)', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.accept_team_split_deal(uuid,uuid,boolean,numeric)', 'EXECUTE')
       ) AS applied;

-- 5. Team Split cap reservations (2026-08-13). Declares liveCheck 'sql-check' because all six
--    functions are deliberately REVOKED from anon and authenticated, so an anonymous probe can only
--    answer "denied", which is indistinguishable from "never created". This asks the catalog for
--    the objects AND for the security property that matters, so it can tell applied-correctly from
--    applied-insecurely.
--    Expect applied = true after running supabase/schema-phase2-team-split-cap-reservations.sql.
SELECT 'schema-phase2-team-split-cap-reservations.sql' AS migration,
       (
         to_regclass('public.team_split_cap_reservations') IS NOT NULL
         AND EXISTS (SELECT 1 FROM pg_class WHERE relname = 'team_split_cap_reservations'
                       AND relnamespace = 'public'::regnamespace AND relrowsecurity)
         AND 0 = (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema = 'public' AND table_name = 'team_split_cap_reservations'
                     AND grantee IN ('anon', 'authenticated'))
         AND to_regprocedure('public.grant_team_split_reservation(uuid,text,text,integer)') IS NOT NULL
         AND to_regprocedure('public.fund_team_split_reservation(text,text,uuid)') IS NOT NULL
         AND to_regprocedure('public.release_team_split_reservation(text,text,text)') IS NOT NULL
         AND to_regprocedure('public.return_team_split_surplus(uuid,integer,text,text)') IS NOT NULL
         AND to_regprocedure('public.freeze_team_split_reservations(uuid,text)') IS NOT NULL
         AND NOT has_function_privilege('authenticated', 'public.grant_team_split_reservation(uuid,text,text,integer)', 'EXECUTE')
         AND NOT has_function_privilege('anon', 'public.return_team_split_surplus(uuid,integer,text,text)', 'EXECUTE')
         AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tscr_money_identity')
       ) AS applied;

-- 6. Early-access window enforcement (2026-08-13). Declares liveCheck 'sql-check' because the
--    change is a FUNCTION BODY, and PostgREST cannot see one: an anon probe could only report
--    that some track is readable, which says nothing about whether the window is gated. So ask
--    the catalog for the property directly.
--
--    `applied` here means all four at once: can_play_track exists, it READS
--    public_release_date, its is_free short-circuit is WINDOW-GUARDED (the bare
--    `IF t.is_free THEN RETURN true` is gone), and it kept the two properties that make it safe
--    to expose through the views (SECURITY DEFINER with a pinned search_path, and EXECUTE for
--    the Data API roles the views run as).
--
--    Expect applied = true after running
--    supabase/schema-phase2-early-access-window-enforcement.sql, then run
--    supabase/verify-early-access-window.sql for the BEHAVIOURAL proof (it creates each reader
--    shape, asserts, and rolls everything back).
SELECT 'schema-phase2-early-access-window-enforcement.sql' AS migration,
       (
         to_regprocedure('public.can_play_track(uuid,uuid)') IS NOT NULL
         AND pg_get_functiondef(to_regprocedure('public.can_play_track(uuid,uuid)')::oid) LIKE '%public_release_date%'
         AND pg_get_functiondef(to_regprocedure('public.can_play_track(uuid,uuid)')::oid) LIKE '%NOT v_in_window%'
         AND EXISTS (
           SELECT 1 FROM pg_proc
           WHERE oid = to_regprocedure('public.can_play_track(uuid,uuid)')::oid
             AND prosecdef
             AND 'search_path=public' = ANY(COALESCE(proconfig, ARRAY[]::text[]))
         )
         AND has_function_privilege('anon', 'public.can_play_track(uuid,uuid)', 'EXECUTE')
         AND has_function_privilege('authenticated', 'public.can_play_track(uuid,uuid)', 'EXECUTE')
       ) AS applied;

-- 7. Manager outcome-schema drop (2026-08-13). 'sql-check' because the parent tables are
--    service-role-only, so an anon probe reads 42501 whether or not the columns exist.
--    Expect applied = true after running supabase/schema-phase2-drop-manager-outcome-schema.sql.
SELECT 'schema-phase2-drop-manager-outcome-schema.sql' AS migration,
       (
         to_regclass('public.artist_action_outcomes') IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_name = 'artist_agent_actions'
              AND column_name IN ('baseline_metrics', 'outcome_metrics', 'outcome_delta')
         )
       ) AS applied;

-- 8. Founder-test exclusion (2026-08-25). 'sql-check' because the column carries no
--    anon grant, so an anon probe answers 42501 whether or not the migration ran.
--    Expect applied = true after running supabase/schema-phase2-founder-test-exclusion.sql
--    (that file's own self-verify asserts at least the admin-owned account is flagged).
--    information_schema only, so this statement parses even before the column exists.
SELECT 'schema-phase2-founder-test-exclusion.sql' AS migration,
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_name = 'artist_profiles'
            AND column_name = 'is_founder_test'
       ) AS applied;

-- 9. Free-join sequence trigger (2026-08-31). 'sql-check' because a CHECK constraint is
--    invisible to PostgREST: an anon SELECT on `sequences` answers the same whether or not
--    the constraint admits 'free_join', and proving it by INSERT needs a write anon cannot
--    make. So the constraint's own definition is the evidence.
--    Expect applied = true after running supabase/schema-phase2-free-join-sequence-trigger.sql.
SELECT 'schema-phase2-free-join-sequence-trigger.sql' AS migration,
       EXISTS (
         SELECT 1 FROM pg_constraint
          WHERE conname = 'sequences_trigger_type_check'
            AND pg_get_constraintdef(oid) LIKE '%free_join%'
       ) AS applied;

-- 10. Fan funnel foundation (2026-09-01). 'sql-check' because fan_automation_leads and
--     fan_automations are revoked from anon, so a probe answers 42501 whether or not the
--     new columns exist. information_schema only, so this parses pre-migration too.
--     Expect applied = true after running supabase/schema-phase2-fan-funnel-foundation.sql.
SELECT 'schema-phase2-fan-funnel-foundation.sql' AS migration,
       (
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='fan_automation_leads' AND column_name='attribution')
         AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='song_lab_offer_claims' AND column_name='attribution')
         AND EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='fan_automations' AND column_name='nurture_sequence_id')
         AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_fan_automations_nurture_guard')
       ) AS applied;
