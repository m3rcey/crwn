-- ============================================================
-- CRWN Admin & Platform Demo Data Seed
-- Purpose: Populate admin dashboard, recruiter program, funnel,
--          pipeline, and platform metrics for pitch demo video.
--
-- RUN AFTER: seed-demo-data.sql (fan data for m3rcey)
-- HOW TO USE: Paste into Supabase SQL Editor and run.
-- SAFE TO RE-RUN: Cleanup at top removes previous demo data.
-- ============================================================

DO $$
DECLARE
  -- m3rcey (real admin/artist)
  v_admin_user_id UUID := '612fa313-8d4f-4748-8148-7804fada0d0c';
  v_admin_artist_id UUID := '0cfd2ad9-c37c-4b68-863e-6db0aa939893';

  -- Demo artist UUIDs (deterministic for re-runs)
  -- Format: aa = artist auth, ap = artist profile
  v_aa CONSTANT UUID[] := ARRAY[
    'aa000001-de00-4000-a000-000000000001'::UUID, -- Artist 1
    'aa000001-de00-4000-a000-000000000002'::UUID, -- Artist 2
    'aa000001-de00-4000-a000-000000000003'::UUID, -- Artist 3
    'aa000001-de00-4000-a000-000000000004'::UUID, -- Artist 4
    'aa000001-de00-4000-a000-000000000005'::UUID, -- Artist 5
    'aa000001-de00-4000-a000-000000000006'::UUID, -- Artist 6
    'aa000001-de00-4000-a000-000000000007'::UUID, -- Artist 7
    'aa000001-de00-4000-a000-000000000008'::UUID, -- Artist 8
    'aa000001-de00-4000-a000-000000000009'::UUID, -- Artist 9
    'aa000001-de00-4000-a000-000000000010'::UUID, -- Artist 10
    'aa000001-de00-4000-a000-000000000011'::UUID, -- Artist 11
    'aa000001-de00-4000-a000-000000000012'::UUID, -- Artist 12
    'aa000001-de00-4000-a000-000000000013'::UUID, -- Artist 13
    'aa000001-de00-4000-a000-000000000014'::UUID, -- Artist 14
    'aa000001-de00-4000-a000-000000000015'::UUID, -- Artist 15
    'aa000001-de00-4000-a000-000000000016'::UUID, -- Artist 16
    'aa000001-de00-4000-a000-000000000017'::UUID, -- Artist 17
    'aa000001-de00-4000-a000-000000000018'::UUID, -- Artist 18
    'aa000001-de00-4000-a000-000000000019'::UUID, -- Artist 19
    'aa000001-de00-4000-a000-000000000020'::UUID, -- Artist 20
    'aa000001-de00-4000-a000-000000000021'::UUID, -- Artist 21
    'aa000001-de00-4000-a000-000000000022'::UUID, -- Artist 22
    'aa000001-de00-4000-a000-000000000023'::UUID, -- Artist 23
    'aa000001-de00-4000-a000-000000000024'::UUID, -- Artist 24
    'aa000001-de00-4000-a000-000000000025'::UUID  -- Artist 25
  ];

  v_ap CONSTANT UUID[] := ARRAY[
    'ab000001-de00-4000-a000-000000000001'::UUID,
    'ab000001-de00-4000-a000-000000000002'::UUID,
    'ab000001-de00-4000-a000-000000000003'::UUID,
    'ab000001-de00-4000-a000-000000000004'::UUID,
    'ab000001-de00-4000-a000-000000000005'::UUID,
    'ab000001-de00-4000-a000-000000000006'::UUID,
    'ab000001-de00-4000-a000-000000000007'::UUID,
    'ab000001-de00-4000-a000-000000000008'::UUID,
    'ab000001-de00-4000-a000-000000000009'::UUID,
    'ab000001-de00-4000-a000-000000000010'::UUID,
    'ab000001-de00-4000-a000-000000000011'::UUID,
    'ab000001-de00-4000-a000-000000000012'::UUID,
    'ab000001-de00-4000-a000-000000000013'::UUID,
    'ab000001-de00-4000-a000-000000000014'::UUID,
    'ab000001-de00-4000-a000-000000000015'::UUID,
    'ab000001-de00-4000-a000-000000000016'::UUID,
    'ab000001-de00-4000-a000-000000000017'::UUID,
    'ab000001-de00-4000-a000-000000000018'::UUID,
    'ab000001-de00-4000-a000-000000000019'::UUID,
    'ab000001-de00-4000-a000-000000000020'::UUID,
    'ab000001-de00-4000-a000-000000000021'::UUID,
    'ab000001-de00-4000-a000-000000000022'::UUID,
    'ab000001-de00-4000-a000-000000000023'::UUID,
    'ab000001-de00-4000-a000-000000000024'::UUID,
    'ab000001-de00-4000-a000-000000000025'::UUID
  ];

  -- Recruiter UUIDs (4 recruiters)
  v_rec_1 UUID := 'cc000001-de00-4000-a000-000000000001';
  v_rec_2 UUID := 'cc000001-de00-4000-a000-000000000002';
  v_rec_3 UUID := 'cc000001-de00-4000-a000-000000000003';
  v_rec_4 UUID := 'cc000001-de00-4000-a000-000000000004';

  -- Recruiter table row IDs
  v_rec_row_1 UUID := 'ee000001-de00-4000-a000-000000000001';
  v_rec_row_2 UUID := 'ee000001-de00-4000-a000-000000000002';
  v_rec_row_3 UUID := 'ee000001-de00-4000-a000-000000000003';
  v_rec_row_4 UUID := 'ee000001-de00-4000-a000-000000000004';

  v_i INTEGER;
  v_j INTEGER;
  v_day DATE;

  -- Artist name/slug arrays
  v_names TEXT[] := ARRAY[
    'Kira Voss', 'Dante Reyes', 'Soleil Park', 'Juno Blake', 'Rio Nakamura',
    'Aria Fontaine', 'Zeke Holloway', 'Nova Sterling', 'Milo Cross', 'Sage Deluca',
    'Lyric Okafor', 'Phoenix Bae', 'Indigo Wells', 'Raven Cruz', 'Atlas Young',
    'Ember Sato', 'Quinn Mercer', 'Onyx Rivera', 'Cleo Ashford', 'Reign Torres',
    'Bodhi Kim', 'Sable Montgomery', 'Echo Vasquez', 'Wren Calloway', 'Zuri Adeyemi'
  ];

  v_slugs TEXT[] := ARRAY[
    'kiravoss', 'dantereyes', 'soleilpark', 'junoblake', 'rionakamura',
    'ariafontaine', 'zekeholloway', 'novasterling', 'milocross', 'sagedeluca',
    'lyricokafor', 'phoenixbae', 'indigowells', 'ravencruz', 'atlasyoung',
    'embersato', 'quinnmercer', 'onyxrivera', 'cleoashford', 'reigntorres',
    'bodhikim', 'sablemontgomery', 'echovasquez', 'wrencalloway', 'zuriadeyemi'
  ];

  -- Recruiter names
  v_rec_names TEXT[] := ARRAY['Tanya Bridges', 'Derek Osman', 'Camille Frost', 'Jaylen Scott'];

BEGIN

-- ============================================================
-- 1. CLEANUP
-- ============================================================

-- Recruiter payouts
DELETE FROM recruiter_payouts WHERE recruiter_id IN (v_rec_row_1, v_rec_row_2, v_rec_row_3, v_rec_row_4);

-- Artist referrals
DELETE FROM artist_referrals WHERE recruiter_id IN (v_rec_row_1, v_rec_row_2, v_rec_row_3, v_rec_row_4);

-- Referral clicks (demo)
DELETE FROM referral_clicks WHERE referral_code LIKE 'DEMO_%';

-- Platform sequence enrollments for demo artists
DELETE FROM platform_sequence_enrollments WHERE artist_user_id = ANY(v_aa);

-- Cancellation reasons for demo
DELETE FROM cancellation_reasons WHERE user_id = ANY(v_aa);

-- Site visits (demo)
DELETE FROM site_visits WHERE visitor_hash LIKE 'demo_%';

-- Earnings for demo artists (platform-level)
DELETE FROM earnings WHERE stripe_payment_id LIKE 'demo_platform_%';

-- CRM contacts (demo)
DELETE FROM crm_contacts WHERE email LIKE '%@demo.crwn';

-- Artist notes for demo
DELETE FROM artist_notes WHERE artist_id = ANY(v_ap);

-- Artist profiles + profiles + auth.users for demo artists
DELETE FROM artist_profiles WHERE id = ANY(v_ap);
DELETE FROM profiles WHERE id = ANY(v_aa);
DELETE FROM auth.users WHERE id = ANY(v_aa);

-- Recruiters
DELETE FROM recruiters WHERE id IN (v_rec_row_1, v_rec_row_2, v_rec_row_3, v_rec_row_4);
DELETE FROM profiles WHERE id IN (v_rec_1, v_rec_2, v_rec_3, v_rec_4);
DELETE FROM auth.users WHERE id IN (v_rec_1, v_rec_2, v_rec_3, v_rec_4);

-- Admin metrics cache (force refresh)
DELETE FROM admin_metrics_cache;

-- Admin settings (we'll re-seed)
DELETE FROM admin_settings WHERE key IN ('fixed_costs', 'variable_costs');

RAISE NOTICE 'Admin cleanup complete.';

-- ============================================================
-- 2. ADMIN SETTINGS (costs for CAC/margin calculations)
-- ============================================================
INSERT INTO admin_settings (key, value, updated_at, updated_by) VALUES
  ('fixed_costs', '{"supabase": 2500, "resend": 2500, "claude": 10000, "domain": 108, "vercel": 0, "cloudflare": 0}'::jsonb, NOW(), v_admin_user_id),
  ('variable_costs', '{"sms_per_message": 0.0079, "mms_per_message": 0.02, "email_per_message": 0.00023}'::jsonb, NOW(), v_admin_user_id)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

RAISE NOTICE 'Admin settings seeded.';

-- ============================================================
-- 3. CREATE 25 DEMO ARTISTS
-- ============================================================
-- Each artist is at a different pipeline stage with different milestones
-- This creates a realistic funnel with natural dropoff

FOR v_i IN 1..25 LOOP
  -- auth.users
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
  VALUES (
    v_aa[v_i],
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    LOWER(REPLACE(v_names[v_i], ' ', '.')) || '@demo.crwn',
    crypt('demo-password-123', gen_salt('bf')),
    NOW() - ((90 - v_i * 3) || ' days')::INTERVAL,
    NOW() - ((90 - v_i * 3) || ' days')::INTERVAL,
    NOW(),
    '',
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('display_name', v_names[v_i]),
    false
  ) ON CONFLICT (id) DO NOTHING;

  -- profiles
  INSERT INTO profiles (id, role, display_name, username, avatar_url, last_active_at, created_at, updated_at)
  VALUES (
    v_aa[v_i], 'artist', v_names[v_i], v_slugs[v_i],
    'https://api.dicebear.com/9.x/notionists/png?seed=' || REPLACE(v_names[v_i], ' ', '') || '&backgroundColor=D4AF37&size=256',
    -- More recent artists = more recently active
    CASE
      WHEN v_i <= 5 THEN NOW() - INTERVAL '30 days'  -- older, some inactive
      WHEN v_i <= 15 THEN NOW() - ((v_i * 2) || ' days')::INTERVAL
      ELSE NOW() - ((v_i - 15) || ' days')::INTERVAL  -- newest, most active
    END,
    NOW() - ((90 - v_i * 3) || ' days')::INTERVAL,
    NOW()
  ) ON CONFLICT (id) DO NOTHING;

END LOOP;

-- ============================================================
-- 3b. ARTIST PROFILES with varied pipeline stages & milestones
-- ============================================================

-- FUNNEL DISTRIBUTION (25 artists):
--   Signed Up only (3)        — signed up but never onboarded
--   Onboarding (3)            — started but incomplete
--   Free tier, activated (5)  — onboarded, uploaded tracks, maybe tiers
--   Paid tier (8)             — on Pro/Label, stripe connected, active
--   At Risk (3)               — paid but going quiet
--   Churned (3)               — canceled

-- Artists 1-3: SIGNED UP (just registered, nothing else)
INSERT INTO artist_profiles (id, user_id, slug, pipeline_stage, platform_lead_score, acquisition_source, activation_milestones, created_at, updated_at)
VALUES
  (v_ap[1], v_aa[1], v_slugs[1], 'signed_up', 5, 'organic',
   jsonb_build_object('onboarding_completed', NULL), NOW() - INTERVAL '87 days', NOW()),
  (v_ap[2], v_aa[2], v_slugs[2], 'signed_up', 8, 'recruiter',
   '{}'::jsonb, NOW() - INTERVAL '82 days', NOW()),
  (v_ap[3], v_aa[3], v_slugs[3], 'signed_up', 3, 'organic',
   '{}'::jsonb, NOW() - INTERVAL '75 days', NOW());

-- Artists 4-6: ONBOARDING (started but stalled — missing key milestones)
INSERT INTO artist_profiles (id, user_id, slug, pipeline_stage, platform_lead_score, acquisition_source, activation_milestones, created_at, updated_at)
VALUES
  (v_ap[4], v_aa[4], v_slugs[4], 'onboarding', 15, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '70 days')::text),
   NOW() - INTERVAL '72 days', NOW()),
  (v_ap[5], v_aa[5], v_slugs[5], 'onboarding', 20, 'organic',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '63 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '60 days')::text),
   NOW() - INTERVAL '65 days', NOW()),
  (v_ap[6], v_aa[6], v_slugs[6], 'onboarding', 12, 'partner',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '55 days')::text),
   NOW() - INTERVAL '58 days', NOW());

-- Artists 7-11: FREE TIER (onboarded, have tracks/tiers, haven't paid yet)
INSERT INTO artist_profiles (id, user_id, slug, pipeline_stage, platform_lead_score, acquisition_source, activation_milestones, platform_tier, created_at, updated_at)
VALUES
  (v_ap[7], v_aa[7], v_slugs[7], 'free', 45, 'organic',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '50 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '48 days')::text, 'tiers_created', (NOW() - INTERVAL '45 days')::text),
   'starter', NOW() - INTERVAL '52 days', NOW()),
  (v_ap[8], v_aa[8], v_slugs[8], 'free', 55, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '45 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '42 days')::text, 'tiers_created', (NOW() - INTERVAL '40 days')::text, 'stripe_connected', (NOW() - INTERVAL '38 days')::text),
   'starter', NOW() - INTERVAL '48 days', NOW()),
  (v_ap[9], v_aa[9], v_slugs[9], 'free', 35, 'organic',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '40 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '35 days')::text),
   'starter', NOW() - INTERVAL '42 days', NOW()),
  (v_ap[10], v_aa[10], v_slugs[10], 'free', 50, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '35 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '32 days')::text, 'tiers_created', (NOW() - INTERVAL '30 days')::text, 'stripe_connected', (NOW() - INTERVAL '28 days')::text),
   'starter', NOW() - INTERVAL '38 days', NOW()),
  (v_ap[11], v_aa[11], v_slugs[11], 'free', 40, 'founding',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '30 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '28 days')::text, 'tiers_created', (NOW() - INTERVAL '25 days')::text),
   'starter', NOW() - INTERVAL '32 days', NOW());

-- Artists 12-19: PAID (active, growing — the success stories)
INSERT INTO artist_profiles (id, user_id, slug, pipeline_stage, platform_lead_score, acquisition_source, activation_milestones, platform_tier, stripe_connect_id, platform_subscription_status, created_at, updated_at)
VALUES
  (v_ap[12], v_aa[12], v_slugs[12], 'paid', 120, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '80 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '78 days')::text, 'tiers_created', (NOW() - INTERVAL '75 days')::text, 'stripe_connected', (NOW() - INTERVAL '72 days')::text, 'first_subscriber', (NOW() - INTERVAL '65 days')::text),
   'pro', 'demo_acct_012', 'active', NOW() - INTERVAL '85 days', NOW()),
  (v_ap[13], v_aa[13], v_slugs[13], 'paid', 95, 'organic',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '70 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '68 days')::text, 'tiers_created', (NOW() - INTERVAL '65 days')::text, 'stripe_connected', (NOW() - INTERVAL '62 days')::text, 'first_subscriber', (NOW() - INTERVAL '55 days')::text),
   'pro', 'demo_acct_013', 'active', NOW() - INTERVAL '75 days', NOW()),
  (v_ap[14], v_aa[14], v_slugs[14], 'paid', 180, 'partner',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '60 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '58 days')::text, 'tiers_created', (NOW() - INTERVAL '55 days')::text, 'stripe_connected', (NOW() - INTERVAL '52 days')::text, 'first_subscriber', (NOW() - INTERVAL '45 days')::text),
   'label', 'demo_acct_014', 'active', NOW() - INTERVAL '65 days', NOW()),
  (v_ap[15], v_aa[15], v_slugs[15], 'paid', 85, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '50 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '48 days')::text, 'tiers_created', (NOW() - INTERVAL '45 days')::text, 'stripe_connected', (NOW() - INTERVAL '42 days')::text, 'first_subscriber', (NOW() - INTERVAL '35 days')::text),
   'pro', 'demo_acct_015', 'active', NOW() - INTERVAL '55 days', NOW()),
  (v_ap[16], v_aa[16], v_slugs[16], 'paid', 200, 'founding',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '85 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '83 days')::text, 'tiers_created', (NOW() - INTERVAL '80 days')::text, 'stripe_connected', (NOW() - INTERVAL '78 days')::text, 'first_subscriber', (NOW() - INTERVAL '70 days')::text),
   'label', 'demo_acct_016', 'active', NOW() - INTERVAL '88 days', NOW()),
  (v_ap[17], v_aa[17], v_slugs[17], 'paid', 70, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '40 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '38 days')::text, 'tiers_created', (NOW() - INTERVAL '35 days')::text, 'stripe_connected', (NOW() - INTERVAL '32 days')::text, 'first_subscriber', (NOW() - INTERVAL '25 days')::text),
   'pro', 'demo_acct_017', 'active', NOW() - INTERVAL '42 days', NOW()),
  (v_ap[18], v_aa[18], v_slugs[18], 'paid', 150, 'organic',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '75 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '72 days')::text, 'tiers_created', (NOW() - INTERVAL '68 days')::text, 'stripe_connected', (NOW() - INTERVAL '65 days')::text, 'first_subscriber', (NOW() - INTERVAL '58 days')::text),
   'pro', 'demo_acct_018', 'active', NOW() - INTERVAL '78 days', NOW()),
  (v_ap[19], v_aa[19], v_slugs[19], 'paid', 110, 'partner',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '35 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '33 days')::text, 'tiers_created', (NOW() - INTERVAL '30 days')::text, 'stripe_connected', (NOW() - INTERVAL '28 days')::text, 'first_subscriber', (NOW() - INTERVAL '20 days')::text),
   'pro', 'demo_acct_019', 'active', NOW() - INTERVAL '38 days', NOW());

-- Artists 20-22: AT RISK (paid but going quiet)
INSERT INTO artist_profiles (id, user_id, slug, pipeline_stage, platform_lead_score, acquisition_source, activation_milestones, platform_tier, stripe_connect_id, platform_subscription_status, created_at, updated_at)
VALUES
  (v_ap[20], v_aa[20], v_slugs[20], 'at_risk', 30, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '70 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '68 days')::text, 'tiers_created', (NOW() - INTERVAL '65 days')::text, 'stripe_connected', (NOW() - INTERVAL '60 days')::text),
   'pro', 'demo_acct_020', 'active', NOW() - INTERVAL '75 days', NOW()),
  (v_ap[21], v_aa[21], v_slugs[21], 'at_risk', 25, 'organic',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '55 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '50 days')::text, 'tiers_created', (NOW() - INTERVAL '45 days')::text, 'stripe_connected', (NOW() - INTERVAL '40 days')::text, 'first_subscriber', (NOW() - INTERVAL '30 days')::text),
   'pro', 'demo_acct_021', 'active', NOW() - INTERVAL '60 days', NOW()),
  (v_ap[22], v_aa[22], v_slugs[22], 'at_risk', 20, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '50 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '45 days')::text),
   'starter', NULL, NULL, NOW() - INTERVAL '55 days', NOW());

-- Artists 23-25: CHURNED (canceled)
INSERT INTO artist_profiles (id, user_id, slug, pipeline_stage, platform_lead_score, acquisition_source, activation_milestones, platform_tier, platform_subscription_status, created_at, updated_at)
VALUES
  (v_ap[23], v_aa[23], v_slugs[23], 'churned', 10, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '80 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '75 days')::text, 'tiers_created', (NOW() - INTERVAL '70 days')::text, 'stripe_connected', (NOW() - INTERVAL '65 days')::text),
   'starter', NULL, NOW() - INTERVAL '85 days', NOW()),
  (v_ap[24], v_aa[24], v_slugs[24], 'churned', 8, 'organic',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '60 days')::text),
   'starter', NULL, NOW() - INTERVAL '65 days', NOW()),
  (v_ap[25], v_aa[25], v_slugs[25], 'churned', 5, 'recruiter',
   jsonb_build_object('onboarding_completed', (NOW() - INTERVAL '45 days')::text, 'first_track_uploaded', (NOW() - INTERVAL '40 days')::text),
   'starter', NULL, NOW() - INTERVAL '50 days', NOW());

-- Update last_active for at-risk/churned (they haven't logged in recently)
UPDATE profiles SET last_active_at = NOW() - INTERVAL '25 days' WHERE id = v_aa[20];
UPDATE profiles SET last_active_at = NOW() - INTERVAL '18 days' WHERE id = v_aa[21];
UPDATE profiles SET last_active_at = NOW() - INTERVAL '30 days' WHERE id = v_aa[22];
UPDATE profiles SET last_active_at = NOW() - INTERVAL '40 days' WHERE id = v_aa[23];
UPDATE profiles SET last_active_at = NOW() - INTERVAL '50 days' WHERE id = v_aa[24];
UPDATE profiles SET last_active_at = NOW() - INTERVAL '35 days' WHERE id = v_aa[25];

RAISE NOTICE '25 demo artists created across all pipeline stages.';

-- ============================================================
-- 4. RECRUITERS (4 with varying performance)
-- ============================================================

-- Auth + profiles for recruiters
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
VALUES
  (v_rec_1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tanya.bridges@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Tanya Bridges"}', false),
  (v_rec_2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'derek.osman@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '80 days', NOW() - INTERVAL '80 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Derek Osman"}', false),
  (v_rec_3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'camille.frost@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Camille Frost"}', false),
  (v_rec_4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jaylen.scott@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Jaylen Scott"}', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, role, display_name, username, avatar_url, last_active_at, created_at, updated_at)
VALUES
  (v_rec_1, 'fan', 'Tanya Bridges', 'tanyabridges', 'https://api.dicebear.com/9.x/notionists/png?seed=TanyaBridges&backgroundColor=D4AF37&size=256', NOW() - INTERVAL '2 days', NOW() - INTERVAL '90 days', NOW()),
  (v_rec_2, 'fan', 'Derek Osman', 'derekosman', 'https://api.dicebear.com/9.x/notionists/png?seed=DerekOsman&backgroundColor=D4AF37&size=256', NOW() - INTERVAL '5 days', NOW() - INTERVAL '80 days', NOW()),
  (v_rec_3, 'fan', 'Camille Frost', 'camillefrost', 'https://api.dicebear.com/9.x/notionists/png?seed=CamilleFrost&backgroundColor=D4AF37&size=256', NOW() - INTERVAL '1 day', NOW() - INTERVAL '60 days', NOW()),
  (v_rec_4, 'fan', 'Jaylen Scott', 'jaylenscott', 'https://api.dicebear.com/9.x/notionists/png?seed=JaylenScott&backgroundColor=D4AF37&size=256', NOW() - INTERVAL '8 days', NOW() - INTERVAL '45 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- Recruiter rows
-- Tanya: top performer — 8 referrals, high qual rate, ambassador tier
-- Derek: decent — 5 referrals, moderate qual rate
-- Camille: strong recent — 4 referrals, all qualified (new but effective)
-- Jaylen: underperforming — 6 referrals, low qual rate, negative ROI
INSERT INTO recruiters (id, user_id, referral_code, tier, total_artists_referred, total_earned, is_active, created_at, updated_at)
VALUES
  (v_rec_row_1, v_rec_1, 'DEMO_TANYA', 'ambassador', 8, 62500, true, NOW() - INTERVAL '90 days', NOW()),
  (v_rec_row_2, v_rec_2, 'DEMO_DEREK', 'connector', 5, 25000, true, NOW() - INTERVAL '80 days', NOW()),
  (v_rec_row_3, v_rec_3, 'DEMO_CAMILLE', 'connector', 4, 20000, true, NOW() - INTERVAL '60 days', NOW()),
  (v_rec_row_4, v_rec_4, 'DEMO_JAYLEN', 'starter', 6, 10000, true, NOW() - INTERVAL '45 days', NOW())
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE '4 recruiters created.';

-- ============================================================
-- 5. ARTIST REFERRALS (link recruiters to artists)
-- ============================================================
-- Tanya referred artists 2, 4, 8, 10, 12, 15, 20, 23 (8 total, 5 qualified)
-- Derek referred artists 17, 22, 25 and 2 others (5 total, 2 qualified)
-- Camille referred artists 6, 14, 19 and 1 other (4 total, 3 qualified)
-- Jaylen referred artists 3 (not onboarded) + 5 others barely active (6 total, 1 qualified — bad ROI)

INSERT INTO artist_referrals (id, recruiter_id, artist_id, artist_user_id, status, flat_fee_amount, flat_fee_paid, qualified_at, created_at)
VALUES
  -- Tanya's referrals (high performer)
  (gen_random_uuid(), v_rec_row_1, v_ap[2], v_aa[2], 'pending', 5000, false, NULL, NOW() - INTERVAL '82 days'),
  (gen_random_uuid(), v_rec_row_1, v_ap[4], v_aa[4], 'pending', 5000, false, NULL, NOW() - INTERVAL '72 days'),
  (gen_random_uuid(), v_rec_row_1, v_ap[8], v_aa[8], 'qualified', 5000, true, NOW() - INTERVAL '18 days', NOW() - INTERVAL '48 days'),
  (gen_random_uuid(), v_rec_row_1, v_ap[10], v_aa[10], 'qualified', 5000, true, NOW() - INTERVAL '8 days', NOW() - INTERVAL '38 days'),
  (gen_random_uuid(), v_rec_row_1, v_ap[12], v_aa[12], 'qualified', 7500, true, NOW() - INTERVAL '55 days', NOW() - INTERVAL '85 days'),
  (gen_random_uuid(), v_rec_row_1, v_ap[15], v_aa[15], 'qualified', 5000, true, NOW() - INTERVAL '25 days', NOW() - INTERVAL '55 days'),
  (gen_random_uuid(), v_rec_row_1, v_ap[20], v_aa[20], 'qualified', 5000, true, NOW() - INTERVAL '45 days', NOW() - INTERVAL '75 days'),
  (gen_random_uuid(), v_rec_row_1, v_ap[23], v_aa[23], 'churned', 5000, true, NOW() - INTERVAL '55 days', NOW() - INTERVAL '85 days'),

  -- Derek's referrals
  (gen_random_uuid(), v_rec_row_2, v_ap[17], v_aa[17], 'qualified', 5000, true, NOW() - INTERVAL '12 days', NOW() - INTERVAL '42 days'),
  (gen_random_uuid(), v_rec_row_2, v_ap[22], v_aa[22], 'pending', 5000, false, NULL, NOW() - INTERVAL '55 days'),
  (gen_random_uuid(), v_rec_row_2, v_ap[25], v_aa[25], 'churned', 5000, true, NOW() - INTERVAL '20 days', NOW() - INTERVAL '50 days'),

  -- Camille's referrals (efficient — most qualified)
  (gen_random_uuid(), v_rec_row_3, v_ap[6], v_aa[6], 'pending', 5000, false, NULL, NOW() - INTERVAL '58 days'),
  (gen_random_uuid(), v_rec_row_3, v_ap[14], v_aa[14], 'qualified', 5000, true, NOW() - INTERVAL '35 days', NOW() - INTERVAL '65 days'),
  (gen_random_uuid(), v_rec_row_3, v_ap[19], v_aa[19], 'qualified', 5000, true, NOW() - INTERVAL '8 days', NOW() - INTERVAL '38 days'),

  -- Jaylen's referrals (bad ROI — lots of signups, few qualify)
  (gen_random_uuid(), v_rec_row_4, v_ap[1], v_aa[1], 'pending', 5000, false, NULL, NOW() - INTERVAL '40 days'),
  (gen_random_uuid(), v_rec_row_4, v_ap[3], v_aa[3], 'pending', 5000, false, NULL, NOW() - INTERVAL '35 days'),
  (gen_random_uuid(), v_rec_row_4, v_ap[5], v_aa[5], 'pending', 5000, false, NULL, NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), v_rec_row_4, v_ap[9], v_aa[9], 'pending', 5000, false, NULL, NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), v_rec_row_4, v_ap[21], v_aa[21], 'pending', 5000, false, NULL, NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), v_rec_row_4, v_ap[11], v_aa[11], 'qualified', 5000, true, NOW() - INTERVAL '2 days', NOW() - INTERVAL '32 days');

RAISE NOTICE 'Artist referrals linked.';

-- ============================================================
-- 6. REFERRAL CLICKS (funnel top — link clicks)
-- ============================================================
-- More clicks than signups to show conversion funnel dropoff
INSERT INTO referral_clicks (id, referral_code, visitor_hash, clicked_at, converted, converted_user_id, source_type)
SELECT
  gen_random_uuid(),
  code,
  'demo_' || md5(code || seq_num::text),
  NOW() - ((random() * 85)::int || ' days')::INTERVAL,
  CASE WHEN random() < conv_rate THEN true ELSE false END,
  NULL,
  'recruiter'
FROM (
  SELECT 'DEMO_TANYA' AS code, 0.23 AS conv_rate, generate_series(1, 35) AS seq_num
  UNION ALL
  SELECT 'DEMO_DEREK', 0.20, generate_series(1, 25)
  UNION ALL
  SELECT 'DEMO_CAMILLE', 0.27, generate_series(1, 15)
  UNION ALL
  SELECT 'DEMO_JAYLEN', 0.12, generate_series(1, 50)
) AS clicks;

RAISE NOTICE 'Referral clicks seeded (125 total across 4 recruiters).';

-- ============================================================
-- 7. PLATFORM-LEVEL EARNINGS (artist SaaS subscriptions)
-- ============================================================
-- Pro = $50/mo (5000 cents), Label = $175/mo (17500 cents)
-- 8 paid artists: 6 Pro + 2 Label
-- Generate 2-3 months of platform subscription payments

-- Month 1 payments (oldest paid artists)
INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
VALUES
  (v_admin_artist_id, v_aa[12], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m1_12', '{"platformTier":"pro"}', NOW() - INTERVAL '85 days'),
  (v_admin_artist_id, v_aa[16], 'subscription', 'Label Platform Subscription', 17500, 0, 17500, 'demo_platform_m1_16', '{"platformTier":"label"}', NOW() - INTERVAL '88 days'),
  (v_admin_artist_id, v_aa[18], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m1_18', '{"platformTier":"pro"}', NOW() - INTERVAL '78 days'),
  (v_admin_artist_id, v_aa[13], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m1_13', '{"platformTier":"pro"}', NOW() - INTERVAL '75 days');

-- Month 2 payments (renewals + new)
INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
VALUES
  (v_admin_artist_id, v_aa[12], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m2_12', '{"platformTier":"pro"}', NOW() - INTERVAL '55 days'),
  (v_admin_artist_id, v_aa[16], 'subscription', 'Label Platform Subscription', 17500, 0, 17500, 'demo_platform_m2_16', '{"platformTier":"label"}', NOW() - INTERVAL '58 days'),
  (v_admin_artist_id, v_aa[18], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m2_18', '{"platformTier":"pro"}', NOW() - INTERVAL '48 days'),
  (v_admin_artist_id, v_aa[13], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m2_13', '{"platformTier":"pro"}', NOW() - INTERVAL '45 days'),
  (v_admin_artist_id, v_aa[14], 'subscription', 'Label Platform Subscription', 17500, 0, 17500, 'demo_platform_m2_14', '{"platformTier":"label"}', NOW() - INTERVAL '50 days'),
  (v_admin_artist_id, v_aa[15], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m2_15', '{"platformTier":"pro"}', NOW() - INTERVAL '45 days'),
  (v_admin_artist_id, v_aa[20], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m2_20', '{"platformTier":"pro"}', NOW() - INTERVAL '40 days');

-- Month 3 payments (renewals + more new)
INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
VALUES
  (v_admin_artist_id, v_aa[12], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_12', '{"platformTier":"pro"}', NOW() - INTERVAL '25 days'),
  (v_admin_artist_id, v_aa[16], 'subscription', 'Label Platform Subscription', 17500, 0, 17500, 'demo_platform_m3_16', '{"platformTier":"label"}', NOW() - INTERVAL '28 days'),
  (v_admin_artist_id, v_aa[18], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_18', '{"platformTier":"pro"}', NOW() - INTERVAL '18 days'),
  (v_admin_artist_id, v_aa[13], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_13', '{"platformTier":"pro"}', NOW() - INTERVAL '15 days'),
  (v_admin_artist_id, v_aa[14], 'subscription', 'Label Platform Subscription', 17500, 0, 17500, 'demo_platform_m3_14', '{"platformTier":"label"}', NOW() - INTERVAL '20 days'),
  (v_admin_artist_id, v_aa[15], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_15', '{"platformTier":"pro"}', NOW() - INTERVAL '15 days'),
  (v_admin_artist_id, v_aa[17], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_17', '{"platformTier":"pro"}', NOW() - INTERVAL '12 days'),
  (v_admin_artist_id, v_aa[19], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_19', '{"platformTier":"pro"}', NOW() - INTERVAL '8 days'),
  (v_admin_artist_id, v_aa[20], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_20', '{"platformTier":"pro"}', NOW() - INTERVAL '10 days'),
  (v_admin_artist_id, v_aa[21], 'subscription', 'Pro Platform Subscription', 5000, 0, 5000, 'demo_platform_m3_21', '{"platformTier":"pro"}', NOW() - INTERVAL '5 days');

-- Platform MRR now: 6 Pro ($300) + 2 Label ($350) = $650/mo
-- Total platform earnings seeded: ~$1,650 over 3 months

RAISE NOTICE 'Platform earnings seeded (~$1,650 over 3 months, $650 MRR).';

-- ============================================================
-- 8. SITE VISITS (platform-level, 90 days)
-- ============================================================
FOR v_i IN 0..89 LOOP
  v_day := (CURRENT_DATE - v_i);
  FOR v_j IN 1..GREATEST(5, LEAST(40, (90 - v_i) / 3 + (random() * 12)::int)) LOOP
    INSERT INTO site_visits (id, visit_date, visitor_hash, is_authenticated, created_at)
    VALUES (
      gen_random_uuid(), v_day,
      'demo_site_' || md5(v_day::text || v_j::text),
      random() > 0.7,
      v_day + (random() * INTERVAL '23 hours')
    ) ON CONFLICT (visit_date, visitor_hash) DO NOTHING;
  END LOOP;
END LOOP;

RAISE NOTICE 'Site visits seeded (90 days, ramping).';

-- ============================================================
-- 9. CANCELLATION REASONS (for churned artists + retention data)
-- ============================================================
INSERT INTO cancellation_reasons (id, artist_profile_id, user_id, reasons, freeform, context, created_at)
VALUES
  (gen_random_uuid(), v_ap[23], v_aa[23],
   ARRAY['too_expensive', 'not_enough_features'], 'Needed more marketing tools', 'platform',
   NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), v_ap[24], v_aa[24],
   ARRAY['not_enough_time'], 'Got busy with day job', 'platform',
   NOW() - INTERVAL '25 days'),
  (gen_random_uuid(), v_ap[25], v_aa[25],
   ARRAY['not_enough_fans', 'too_expensive'], NULL, 'platform',
   NOW() - INTERVAL '20 days');

RAISE NOTICE 'Cancellation reasons seeded.';

-- ============================================================
-- 10. PLATFORM SEQUENCE ENROLLMENTS
-- ============================================================
-- Enroll stalled artists in appropriate sequences
-- This gives the AI agent something to work with

-- Find sequence IDs dynamically
INSERT INTO platform_sequence_enrollments (id, sequence_id, artist_user_id, current_step, status, next_send_at, created_at)
SELECT gen_random_uuid(), ps.id, v_aa[1], 0, 'active', NOW() + INTERVAL '1 day', NOW() - INTERVAL '5 days'
FROM platform_sequences ps WHERE ps.trigger_type = 'new_signup' LIMIT 1;

INSERT INTO platform_sequence_enrollments (id, sequence_id, artist_user_id, current_step, status, next_send_at, created_at)
SELECT gen_random_uuid(), ps.id, v_aa[4], 1, 'active', NOW() + INTERVAL '2 days', NOW() - INTERVAL '10 days'
FROM platform_sequences ps WHERE ps.trigger_type = 'onboarding_incomplete' LIMIT 1;

INSERT INTO platform_sequence_enrollments (id, sequence_id, artist_user_id, current_step, status, next_send_at, created_at)
SELECT gen_random_uuid(), ps.id, v_aa[7], 0, 'active', NOW() + INTERVAL '1 day', NOW() - INTERVAL '3 days'
FROM platform_sequences ps WHERE ps.trigger_type = 'starter_upgrade_nudge' LIMIT 1;

INSERT INTO platform_sequence_enrollments (id, sequence_id, artist_user_id, current_step, status, next_send_at, created_at)
SELECT gen_random_uuid(), ps.id, v_aa[20], 0, 'active', NOW() + INTERVAL '1 day', NOW() - INTERVAL '2 days'
FROM platform_sequences ps WHERE ps.trigger_type = 'paid_at_risk' LIMIT 1;

INSERT INTO platform_sequence_enrollments (id, sequence_id, artist_user_id, current_step, status, next_send_at, created_at)
SELECT gen_random_uuid(), ps.id, v_aa[21], 0, 'active', NOW() + INTERVAL '1 day', NOW() - INTERVAL '2 days'
FROM platform_sequences ps WHERE ps.trigger_type = 'paid_at_risk' LIMIT 1;

-- Completed enrollments (for conversion tracking)
INSERT INTO platform_sequence_enrollments (id, sequence_id, artist_user_id, current_step, status, completed_at, created_at)
SELECT gen_random_uuid(), ps.id, v_aa[12], 3, 'completed', NOW() - INTERVAL '60 days', NOW() - INTERVAL '80 days'
FROM platform_sequences ps WHERE ps.trigger_type = 'starter_upgrade_nudge' LIMIT 1;

INSERT INTO platform_sequence_enrollments (id, sequence_id, artist_user_id, current_step, status, completed_at, created_at)
SELECT gen_random_uuid(), ps.id, v_aa[15], 3, 'completed', NOW() - INTERVAL '30 days', NOW() - INTERVAL '50 days'
FROM platform_sequences ps WHERE ps.trigger_type = 'starter_upgrade_nudge' LIMIT 1;

RAISE NOTICE 'Platform sequence enrollments seeded.';

-- ============================================================
-- 11. ARTIST NOTES (admin CRM notes)
-- ============================================================
INSERT INTO artist_notes (id, artist_id, admin_id, body, created_at)
VALUES
  (gen_random_uuid(), v_ap[12], v_admin_user_id, 'Strong engagement, upgraded to Pro within 2 weeks. Good candidate for Label nudge.', NOW() - INTERVAL '40 days'),
  (gen_random_uuid(), v_ap[14], v_admin_user_id, 'Came through Camille''s referral. Already on Label tier. Revenue leader.', NOW() - INTERVAL '30 days'),
  (gen_random_uuid(), v_ap[16], v_admin_user_id, 'Founding artist. Highest lead score. Consistently active.', NOW() - INTERVAL '20 days'),
  (gen_random_uuid(), v_ap[20], v_admin_user_id, 'Hasn''t logged in for 3 weeks. Sent at-risk sequence. May need personal outreach.', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), v_ap[23], v_admin_user_id, 'Churned — cited pricing. Was on Starter, never upgraded. Jaylen referral.', NOW() - INTERVAL '15 days');

RAISE NOTICE 'Artist notes seeded.';

-- ============================================================
-- DONE
-- ============================================================
RAISE NOTICE '';
RAISE NOTICE '=========================================';
RAISE NOTICE '  ADMIN DEMO DATA SEEDED SUCCESSFULLY';
RAISE NOTICE '=========================================';
RAISE NOTICE '';
RAISE NOTICE 'Platform summary:';
RAISE NOTICE '  - 25 demo artists (3 signed up, 3 onboarding, 5 free, 8 paid, 3 at-risk, 3 churned)';
RAISE NOTICE '  - 4 recruiters (1 top performer, 2 decent, 1 underperformer)';
RAISE NOTICE '  - 125 referral clicks across all recruiters';
RAISE NOTICE '  - $650/mo platform MRR (6 Pro + 2 Label)';
RAISE NOTICE '  - ~$1,650 total platform earnings';
RAISE NOTICE '  - 90 days of site visits (ramping traffic)';
RAISE NOTICE '  - 3 cancellation records with reasons';
RAISE NOTICE '  - 7 platform sequence enrollments (5 active, 2 completed)';
RAISE NOTICE '  - 5 admin notes on artists';
RAISE NOTICE '';
RAISE NOTICE 'NEXT STEPS:';
RAISE NOTICE '  1. Visit /admin and check the Dashboard tab';
RAISE NOTICE '  2. Click "Diagnose" on any tab to trigger the AI agent';
RAISE NOTICE '  3. Check the Funnel tab — should show full conversion funnel';
RAISE NOTICE '  4. Check the Pipeline tab — 6 stages with artist cards';
RAISE NOTICE '  5. Check Partners tab — 4 recruiters with stats';
RAISE NOTICE '';

END $$;
