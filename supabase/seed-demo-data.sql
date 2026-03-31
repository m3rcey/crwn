-- ============================================================
-- CRWN Demo Data Seed
-- Purpose: Populate m3rcey's account with realistic demo data
--          for pitch competition video recording
--
-- HOW TO USE: Paste this entire file into the Supabase SQL Editor and run it.
-- SAFE TO RE-RUN: Cleanup section at top removes previous demo data.
-- DOES NOT TOUCH: Stripe, real users, or m3rcey's existing tracks/tiers.
--
-- NOTE: Shop products are NOT seeded here — create them through the
--       app UI so they have real cover images for the demo video.
-- ============================================================

DO $$
DECLARE
  -- m3rcey's real IDs
  v_artist_user_id UUID := '612fa313-8d4f-4748-8148-7804fada0d0c';
  v_artist_profile_id UUID := '0cfd2ad9-c37c-4b68-863e-6db0aa939893';

  -- Tier IDs (looked up dynamically)
  v_tier_wave UUID;
  v_tier_inner UUID;
  v_tier_throne UUID;

  -- Demo fan UUIDs — fans 1-12 (8 active subscribers + 4 non-subscribers)
  v_fan_1 UUID := 'dd000001-de00-4000-a000-000000000001';
  v_fan_2 UUID := 'dd000001-de00-4000-a000-000000000002';
  v_fan_3 UUID := 'dd000001-de00-4000-a000-000000000003';
  v_fan_4 UUID := 'dd000001-de00-4000-a000-000000000004';
  v_fan_5 UUID := 'dd000001-de00-4000-a000-000000000005';
  v_fan_6 UUID := 'dd000001-de00-4000-a000-000000000006';
  v_fan_7 UUID := 'dd000001-de00-4000-a000-000000000007';
  v_fan_8 UUID := 'dd000001-de00-4000-a000-000000000008';
  v_fan_9 UUID := 'dd000001-de00-4000-a000-000000000009';
  v_fan_10 UUID := 'dd000001-de00-4000-a000-000000000010';
  v_fan_11 UUID := 'dd000001-de00-4000-a000-000000000011';
  v_fan_12 UUID := 'dd000001-de00-4000-a000-000000000012';

  -- Demo fan UUIDs — fans 13-20 (CHURNED subscribers for cohort heatmap)
  v_fan_13 UUID := 'dd000001-de00-4000-a000-000000000013';
  v_fan_14 UUID := 'dd000001-de00-4000-a000-000000000014';
  v_fan_15 UUID := 'dd000001-de00-4000-a000-000000000015';
  v_fan_16 UUID := 'dd000001-de00-4000-a000-000000000016';
  v_fan_17 UUID := 'dd000001-de00-4000-a000-000000000017';
  v_fan_18 UUID := 'dd000001-de00-4000-a000-000000000018';
  v_fan_19 UUID := 'dd000001-de00-4000-a000-000000000019';
  v_fan_20 UUID := 'dd000001-de00-4000-a000-000000000020';

  -- All fan IDs for cleanup
  v_all_fans UUID[] := ARRAY[
    'dd000001-de00-4000-a000-000000000001'::UUID,
    'dd000001-de00-4000-a000-000000000002'::UUID,
    'dd000001-de00-4000-a000-000000000003'::UUID,
    'dd000001-de00-4000-a000-000000000004'::UUID,
    'dd000001-de00-4000-a000-000000000005'::UUID,
    'dd000001-de00-4000-a000-000000000006'::UUID,
    'dd000001-de00-4000-a000-000000000007'::UUID,
    'dd000001-de00-4000-a000-000000000008'::UUID,
    'dd000001-de00-4000-a000-000000000009'::UUID,
    'dd000001-de00-4000-a000-000000000010'::UUID,
    'dd000001-de00-4000-a000-000000000011'::UUID,
    'dd000001-de00-4000-a000-000000000012'::UUID,
    'dd000001-de00-4000-a000-000000000013'::UUID,
    'dd000001-de00-4000-a000-000000000014'::UUID,
    'dd000001-de00-4000-a000-000000000015'::UUID,
    'dd000001-de00-4000-a000-000000000016'::UUID,
    'dd000001-de00-4000-a000-000000000017'::UUID,
    'dd000001-de00-4000-a000-000000000018'::UUID,
    'dd000001-de00-4000-a000-000000000019'::UUID,
    'dd000001-de00-4000-a000-000000000020'::UUID
  ];

  -- Demo post UUIDs
  v_post_1 UUID := 'dd000003-de00-4000-a000-000000000001';
  v_post_2 UUID := 'dd000003-de00-4000-a000-000000000002';
  v_post_3 UUID := 'dd000003-de00-4000-a000-000000000003';
  v_post_4 UUID := 'dd000003-de00-4000-a000-000000000004';
  v_post_5 UUID := 'dd000003-de00-4000-a000-000000000005';

  -- Demo campaign UUID
  v_campaign_1 UUID := 'dd000004-de00-4000-a000-000000000001';

  -- Loop counters
  v_i INTEGER;
  v_day DATE;

BEGIN

-- ============================================================
-- 1. CLEANUP previous demo data (safe to re-run)
-- ============================================================
DELETE FROM campaign_sends WHERE campaign_id = v_campaign_1;
DELETE FROM campaigns WHERE id = v_campaign_1;

DELETE FROM ai_insights WHERE artist_id = v_artist_profile_id
  AND title LIKE '%[demo]%';

DELETE FROM likes WHERE user_id = ANY(v_all_fans);
DELETE FROM likes WHERE likeable_type = 'post' AND likeable_id IN (v_post_1,v_post_2,v_post_3,v_post_4,v_post_5);
DELETE FROM comments WHERE author_id = ANY(v_all_fans);
DELETE FROM posts WHERE id IN (v_post_1,v_post_2,v_post_3,v_post_4,v_post_5);

DELETE FROM cancellation_reasons WHERE user_id = ANY(v_all_fans);
DELETE FROM earnings WHERE artist_id = v_artist_profile_id
  AND stripe_payment_id LIKE 'demo_%';

DELETE FROM subscriptions WHERE fan_id = ANY(v_all_fans);

DELETE FROM artist_page_visits WHERE artist_id = v_artist_profile_id
  AND visitor_hash LIKE 'demo_%';

DELETE FROM play_history WHERE user_id = ANY(v_all_fans);

DELETE FROM profiles WHERE id = ANY(v_all_fans);
DELETE FROM auth.users WHERE id = ANY(v_all_fans);

RAISE NOTICE 'Cleanup complete.';

-- ============================================================
-- 2. LOOK UP TIER IDs (from your existing tiers)
-- ============================================================
SELECT id INTO v_tier_wave FROM subscription_tiers
  WHERE artist_id = v_artist_profile_id AND name ILIKE '%wave%' AND is_active = true LIMIT 1;
SELECT id INTO v_tier_inner FROM subscription_tiers
  WHERE artist_id = v_artist_profile_id AND name ILIKE '%inner%' AND is_active = true LIMIT 1;
SELECT id INTO v_tier_throne FROM subscription_tiers
  WHERE artist_id = v_artist_profile_id AND name ILIKE '%throne%' AND is_active = true LIMIT 1;

IF v_tier_wave IS NULL OR v_tier_inner IS NULL OR v_tier_throne IS NULL THEN
  RAISE EXCEPTION 'Could not find all 3 tiers for m3rcey. Found wave=%, inner=%, throne=%', v_tier_wave, v_tier_inner, v_tier_throne;
END IF;

RAISE NOTICE 'Tiers found: wave=%, inner=%, throne=%', v_tier_wave, v_tier_inner, v_tier_throne;

-- ============================================================
-- 3. CREATE 20 DEMO FAN ACCOUNTS
-- ============================================================
-- Fans 1-12: Active community members (8 currently subscribed)
-- Fans 13-20: Churned subscribers (for cohort heatmap depth)
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
VALUES
  (v_fan_1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jordan.rivers@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '85 days', NOW() - INTERVAL '85 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Jordan Rivers"}', false),
  (v_fan_2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'maya.chen@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '72 days', NOW() - INTERVAL '72 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Maya Chen"}', false),
  (v_fan_3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dex.thompson@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '65 days', NOW() - INTERVAL '65 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Dex Thompson"}', false),
  (v_fan_4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aaliyah.james@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '58 days', NOW() - INTERVAL '58 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Aaliyah James"}', false),
  (v_fan_5, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marcus.lee@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Marcus Lee"}', false),
  (v_fan_6, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sienna.wright@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Sienna Wright"}', false),
  (v_fan_7, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kai.morgan@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Kai Morgan"}', false),
  (v_fan_8, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nina.ross@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Nina Ross"}', false),
  (v_fan_9, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tyler.brooks@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '22 days', NOW() - INTERVAL '22 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Tyler Brooks"}', false),
  (v_fan_10, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zara.mitchell@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Zara Mitchell"}', false),
  (v_fan_11, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'elijah.grant@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Elijah Grant"}', false),
  (v_fan_12, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'luna.vasquez@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Luna Vasquez"}', false),
  -- Churned fans (for cohort heatmap — subscribed then canceled)
  (v_fan_13, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'devon.clark@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '88 days', NOW() - INTERVAL '88 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Devon Clark"}', false),
  (v_fan_14, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'priya.sharma@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '80 days', NOW() - INTERVAL '80 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Priya Sharma"}', false),
  (v_fan_15, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cole.martinez@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '75 days', NOW() - INTERVAL '75 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Cole Martinez"}', false),
  (v_fan_16, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'imani.foster@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '68 days', NOW() - INTERVAL '68 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Imani Foster"}', false),
  (v_fan_17, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jace.nguyen@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '62 days', NOW() - INTERVAL '62 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Jace Nguyen"}', false),
  (v_fan_18, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stella.banks@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Stella Banks"}', false),
  (v_fan_19, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'remy.oconnor@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '48 days', NOW() - INTERVAL '48 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Remy O''Connor"}', false),
  (v_fan_20, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'willow.hayes@demo.crwn', crypt('demo-password-123', gen_salt('bf')), NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days', NOW(), '', '{"provider":"email","providers":["email"]}', '{"display_name":"Willow Hayes"}', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, role, display_name, username, created_at, updated_at)
VALUES
  (v_fan_1, 'fan', 'Jordan Rivers', 'jordanrivers', NOW() - INTERVAL '85 days', NOW()),
  (v_fan_2, 'fan', 'Maya Chen', 'mayachen', NOW() - INTERVAL '72 days', NOW()),
  (v_fan_3, 'fan', 'Dex Thompson', 'dexthompson', NOW() - INTERVAL '65 days', NOW()),
  (v_fan_4, 'fan', 'Aaliyah James', 'aaliyahjames', NOW() - INTERVAL '58 days', NOW()),
  (v_fan_5, 'fan', 'Marcus Lee', 'marcuslee', NOW() - INTERVAL '50 days', NOW()),
  (v_fan_6, 'fan', 'Sienna Wright', 'siennawright', NOW() - INTERVAL '45 days', NOW()),
  (v_fan_7, 'fan', 'Kai Morgan', 'kaimorgan', NOW() - INTERVAL '38 days', NOW()),
  (v_fan_8, 'fan', 'Nina Ross', 'ninaross', NOW() - INTERVAL '30 days', NOW()),
  (v_fan_9, 'fan', 'Tyler Brooks', 'tylerbrooks', NOW() - INTERVAL '22 days', NOW()),
  (v_fan_10, 'fan', 'Zara Mitchell', 'zaramitchell', NOW() - INTERVAL '18 days', NOW()),
  (v_fan_11, 'fan', 'Elijah Grant', 'elijahgrant', NOW() - INTERVAL '12 days', NOW()),
  (v_fan_12, 'fan', 'Luna Vasquez', 'lunavasquez', NOW() - INTERVAL '7 days', NOW()),
  -- Churned fans
  (v_fan_13, 'fan', 'Devon Clark', 'devonclark', NOW() - INTERVAL '88 days', NOW()),
  (v_fan_14, 'fan', 'Priya Sharma', 'priyasharma', NOW() - INTERVAL '80 days', NOW()),
  (v_fan_15, 'fan', 'Cole Martinez', 'colemartinez', NOW() - INTERVAL '75 days', NOW()),
  (v_fan_16, 'fan', 'Imani Foster', 'imanifoster', NOW() - INTERVAL '68 days', NOW()),
  (v_fan_17, 'fan', 'Jace Nguyen', 'jacenguyen', NOW() - INTERVAL '62 days', NOW()),
  (v_fan_18, 'fan', 'Stella Banks', 'stellabanks', NOW() - INTERVAL '55 days', NOW()),
  (v_fan_19, 'fan', 'Remy O''Connor', 'remyoconnor', NOW() - INTERVAL '48 days', NOW()),
  (v_fan_20, 'fan', 'Willow Hayes', 'willowhayes', NOW() - INTERVAL '40 days', NOW())
ON CONFLICT (id) DO NOTHING;

RAISE NOTICE '20 demo fans created (12 active + 8 churned).';

-- ============================================================
-- 4. SUBSCRIPTIONS
-- 8 ACTIVE (matches script: $220 MRR from 8 fans)
-- 8 CANCELED (fills cohort heatmap with retention/churn data)
-- ============================================================

-- Active subscriptions: 4 Wave ($15), 2 Inner Circle ($30), 2 Throne ($50) = $220 MRR
INSERT INTO subscriptions (id, fan_id, artist_id, tier_id, stripe_subscription_id, stripe_customer_id, status, started_at, current_period_start, current_period_end, created_at, updated_at)
VALUES
  -- Wave (4 active)
  (gen_random_uuid(), v_fan_1, v_artist_profile_id, v_tier_wave, 'demo_sub_001', 'demo_cus_001', 'active', NOW() - INTERVAL '82 days', NOW() - INTERVAL '2 days', NOW() + INTERVAL '28 days', NOW() - INTERVAL '82 days', NOW()),
  (gen_random_uuid(), v_fan_3, v_artist_profile_id, v_tier_wave, 'demo_sub_003', 'demo_cus_003', 'active', NOW() - INTERVAL '60 days', NOW() - INTERVAL '0 days', NOW() + INTERVAL '30 days', NOW() - INTERVAL '60 days', NOW()),
  (gen_random_uuid(), v_fan_7, v_artist_profile_id, v_tier_wave, 'demo_sub_007', 'demo_cus_007', 'active', NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days', NOW() - INTERVAL '35 days', NOW()),
  (gen_random_uuid(), v_fan_10, v_artist_profile_id, v_tier_wave, 'demo_sub_010', 'demo_cus_010', 'active', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days', NOW() - INTERVAL '15 days', NOW()),
  -- Inner Circle (2 active)
  (gen_random_uuid(), v_fan_2, v_artist_profile_id, v_tier_inner, 'demo_sub_002', 'demo_cus_002', 'active', NOW() - INTERVAL '70 days', NOW() - INTERVAL '10 days', NOW() + INTERVAL '20 days', NOW() - INTERVAL '70 days', NOW()),
  (gen_random_uuid(), v_fan_5, v_artist_profile_id, v_tier_inner, 'demo_sub_005', 'demo_cus_005', 'active', NOW() - INTERVAL '48 days', NOW() - INTERVAL '18 days', NOW() + INTERVAL '12 days', NOW() - INTERVAL '48 days', NOW()),
  -- Throne (2 active)
  (gen_random_uuid(), v_fan_4, v_artist_profile_id, v_tier_throne, 'demo_sub_004', 'demo_cus_004', 'active', NOW() - INTERVAL '55 days', NOW() - INTERVAL '25 days', NOW() + INTERVAL '5 days', NOW() - INTERVAL '55 days', NOW()),
  (gen_random_uuid(), v_fan_9, v_artist_profile_id, v_tier_throne, 'demo_sub_009', 'demo_cus_009', 'active', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NOW() + INTERVAL '10 days', NOW() - INTERVAL '20 days', NOW()),

  -- CANCELED subscriptions (for cohort retention heatmap)
  -- Month 1 cohort: 5 signed up, 3 churned → 60% retention month 1
  (gen_random_uuid(), v_fan_13, v_artist_profile_id, v_tier_wave, 'demo_sub_013', 'demo_cus_013', 'canceled', NOW() - INTERVAL '85 days', NOW() - INTERVAL '85 days', NOW() - INTERVAL '55 days', NOW() - INTERVAL '85 days', NOW()),
  (gen_random_uuid(), v_fan_14, v_artist_profile_id, v_tier_wave, 'demo_sub_014', 'demo_cus_014', 'canceled', NOW() - INTERVAL '78 days', NOW() - INTERVAL '78 days', NOW() - INTERVAL '48 days', NOW() - INTERVAL '78 days', NOW()),
  (gen_random_uuid(), v_fan_15, v_artist_profile_id, v_tier_inner, 'demo_sub_015', 'demo_cus_015', 'canceled', NOW() - INTERVAL '72 days', NOW() - INTERVAL '72 days', NOW() - INTERVAL '42 days', NOW() - INTERVAL '72 days', NOW()),

  -- Month 2 cohort: 5 signed up, 3 churned → some stayed, some left
  (gen_random_uuid(), v_fan_16, v_artist_profile_id, v_tier_wave, 'demo_sub_016', 'demo_cus_016', 'canceled', NOW() - INTERVAL '65 days', NOW() - INTERVAL '65 days', NOW() - INTERVAL '35 days', NOW() - INTERVAL '65 days', NOW()),
  (gen_random_uuid(), v_fan_17, v_artist_profile_id, v_tier_wave, 'demo_sub_017', 'demo_cus_017', 'canceled', NOW() - INTERVAL '58 days', NOW() - INTERVAL '58 days', NOW() - INTERVAL '28 days', NOW() - INTERVAL '58 days', NOW()),
  (gen_random_uuid(), v_fan_18, v_artist_profile_id, v_tier_inner, 'demo_sub_018', 'demo_cus_018', 'canceled', NOW() - INTERVAL '52 days', NOW() - INTERVAL '52 days', NOW() - INTERVAL '22 days', NOW() - INTERVAL '52 days', NOW()),

  -- Month 3 cohort: 2 more churned recently
  (gen_random_uuid(), v_fan_19, v_artist_profile_id, v_tier_wave, 'demo_sub_019', 'demo_cus_019', 'canceled', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '45 days', NOW()),
  (gen_random_uuid(), v_fan_20, v_artist_profile_id, v_tier_throne, 'demo_sub_020', 'demo_cus_020', 'canceled', NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '38 days', NOW())
ON CONFLICT (fan_id, artist_id) DO NOTHING;

-- Set canceled_at for churned subscriptions
UPDATE subscriptions SET canceled_at = current_period_end WHERE stripe_subscription_id IN ('demo_sub_013','demo_sub_014','demo_sub_015','demo_sub_016','demo_sub_017','demo_sub_018','demo_sub_019','demo_sub_020');

RAISE NOTICE '16 subscriptions created (8 active = $220 MRR, 8 canceled for cohort data).';

-- ============================================================
-- 5. CANCELLATION REASONS (for churned fans — retention analytics)
-- ============================================================
INSERT INTO cancellation_reasons (id, subscription_id, artist_profile_id, user_id, reasons, freeform, context, created_at)
SELECT gen_random_uuid(), s.id, v_artist_profile_id, s.fan_id, reasons, freeform, 'fan', s.canceled_at
FROM subscriptions s
JOIN (VALUES
  ('demo_sub_013', ARRAY['too_expensive'], 'Just cant afford it right now'),
  ('demo_sub_014', ARRAY['not_enough_content'], NULL),
  ('demo_sub_015', ARRAY['not_enough_content', 'too_expensive'], 'Wish there were more exclusive tracks'),
  ('demo_sub_016', ARRAY['lost_interest'], NULL),
  ('demo_sub_017', ARRAY['too_expensive'], 'Might come back when I have more budget'),
  ('demo_sub_018', ARRAY['not_enough_content'], 'Expected more frequent drops'),
  ('demo_sub_019', ARRAY['lost_interest', 'found_alternative'], NULL),
  ('demo_sub_020', ARRAY['too_expensive'], 'Throne was too much for me')
) AS r(sub_id, reasons, freeform) ON s.stripe_subscription_id = r.sub_id;

RAISE NOTICE 'Cancellation reasons seeded.';

-- ============================================================
-- 6. EARNINGS — 90 days of revenue (active + churned subs + purchases)
-- ============================================================

-- Month 1 (90-60 days ago): Early traction — active + churned subs
INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
VALUES
  -- Active fans first payments
  (v_artist_profile_id, v_fan_1, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m1_01', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Jordan Rivers"}', NOW() - INTERVAL '82 days'),
  (v_artist_profile_id, v_fan_2, 'subscription', 'Inner Circle - Monthly', 3000, 240, 2760, 'demo_pi_m1_02', '{"tierName":"Inner Circle","tierPrice":3000,"fanDisplayName":"Maya Chen"}', NOW() - INTERVAL '70 days'),
  (v_artist_profile_id, v_fan_3, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m1_03', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Dex Thompson"}', NOW() - INTERVAL '60 days'),
  -- Churned fans (they paid at least once)
  (v_artist_profile_id, v_fan_13, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m1_13', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Devon Clark"}', NOW() - INTERVAL '85 days'),
  (v_artist_profile_id, v_fan_14, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m1_14', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Priya Sharma"}', NOW() - INTERVAL '78 days'),
  (v_artist_profile_id, v_fan_15, 'subscription', 'Inner Circle - Monthly', 3000, 240, 2760, 'demo_pi_m1_15', '{"tierName":"Inner Circle","tierPrice":3000,"fanDisplayName":"Cole Martinez"}', NOW() - INTERVAL '72 days'),
  (v_artist_profile_id, v_fan_16, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m1_16', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Imani Foster"}', NOW() - INTERVAL '65 days'),
  (v_artist_profile_id, v_fan_17, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m1_17', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Jace Nguyen"}', NOW() - INTERVAL '58 days');

-- Month 2 (60-30 days ago): Growth — renewals + new subs + purchases
INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
VALUES
  -- Active fan renewals
  (v_artist_profile_id, v_fan_1, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m2_01', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Jordan Rivers"}', NOW() - INTERVAL '52 days'),
  (v_artist_profile_id, v_fan_2, 'subscription', 'Inner Circle - Monthly', 3000, 240, 2760, 'demo_pi_m2_02', '{"tierName":"Inner Circle","tierPrice":3000,"fanDisplayName":"Maya Chen"}', NOW() - INTERVAL '40 days'),
  -- New active subscribers
  (v_artist_profile_id, v_fan_4, 'subscription', 'Throne - Monthly', 5000, 400, 4600, 'demo_pi_m2_03', '{"tierName":"Throne","tierPrice":5000,"fanDisplayName":"Aaliyah James"}', NOW() - INTERVAL '55 days'),
  (v_artist_profile_id, v_fan_5, 'subscription', 'Inner Circle - Monthly', 3000, 240, 2760, 'demo_pi_m2_04', '{"tierName":"Inner Circle","tierPrice":3000,"fanDisplayName":"Marcus Lee"}', NOW() - INTERVAL '48 days'),
  (v_artist_profile_id, v_fan_7, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m2_05', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Kai Morgan"}', NOW() - INTERVAL '35 days'),
  -- More churned fan payments (they paid month 2 before canceling)
  (v_artist_profile_id, v_fan_18, 'subscription', 'Inner Circle - Monthly', 3000, 240, 2760, 'demo_pi_m2_18', '{"tierName":"Inner Circle","tierPrice":3000,"fanDisplayName":"Stella Banks"}', NOW() - INTERVAL '52 days'),
  (v_artist_profile_id, v_fan_19, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m2_19', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Remy O''Connor"}', NOW() - INTERVAL '45 days'),
  (v_artist_profile_id, v_fan_20, 'subscription', 'Throne - Monthly', 5000, 400, 4600, 'demo_pi_m2_20', '{"tierName":"Throne","tierPrice":5000,"fanDisplayName":"Willow Hayes"}', NOW() - INTERVAL '38 days'),
  -- Product purchases (no FK to products table — standalone earnings)
  (v_artist_profile_id, v_fan_3, 'purchase', 'Stem Pack - "Midnight"', 2500, 200, 2300, 'demo_pi_m2_p1', '{"productTitle":"Stem Pack - Midnight"}', NOW() - INTERVAL '45 days'),
  (v_artist_profile_id, v_fan_1, 'purchase', '1-on-1 Production Session', 7500, 600, 6900, 'demo_pi_m2_p2', '{"productTitle":"1-on-1 Production Session"}', NOW() - INTERVAL '38 days');

-- Month 3 (last 30 days): Acceleration — renewals + new fans + more purchases
INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
VALUES
  -- Active fan renewals
  (v_artist_profile_id, v_fan_1, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m3_01', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Jordan Rivers"}', NOW() - INTERVAL '22 days'),
  (v_artist_profile_id, v_fan_3, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m3_02', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Dex Thompson"}', NOW() - INTERVAL '30 days'),
  (v_artist_profile_id, v_fan_4, 'subscription', 'Throne - Monthly', 5000, 400, 4600, 'demo_pi_m3_03', '{"tierName":"Throne","tierPrice":5000,"fanDisplayName":"Aaliyah James"}', NOW() - INTERVAL '25 days'),
  (v_artist_profile_id, v_fan_5, 'subscription', 'Inner Circle - Monthly', 3000, 240, 2760, 'demo_pi_m3_04', '{"tierName":"Inner Circle","tierPrice":3000,"fanDisplayName":"Marcus Lee"}', NOW() - INTERVAL '18 days'),
  (v_artist_profile_id, v_fan_7, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m3_05', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Kai Morgan"}', NOW() - INTERVAL '5 days'),
  -- New active subscribers this month
  (v_artist_profile_id, v_fan_9, 'subscription', 'Throne - Monthly', 5000, 400, 4600, 'demo_pi_m3_06', '{"tierName":"Throne","tierPrice":5000,"fanDisplayName":"Tyler Brooks"}', NOW() - INTERVAL '20 days'),
  (v_artist_profile_id, v_fan_10, 'subscription', 'The Wave - Monthly', 1500, 120, 1380, 'demo_pi_m3_07', '{"tierName":"The Wave","tierPrice":1500,"fanDisplayName":"Zara Mitchell"}', NOW() - INTERVAL '15 days'),
  -- Product purchases
  (v_artist_profile_id, v_fan_2, 'purchase', 'Exclusive Sample Pack', 1999, 160, 1839, 'demo_pi_m3_p1', '{"productTitle":"Exclusive Sample Pack"}', NOW() - INTERVAL '12 days'),
  (v_artist_profile_id, v_fan_4, 'purchase', '1-on-1 Production Session', 7500, 600, 6900, 'demo_pi_m3_p2', '{"productTitle":"1-on-1 Production Session"}', NOW() - INTERVAL '8 days'),
  (v_artist_profile_id, v_fan_9, 'purchase', 'Stem Pack - "Midnight"', 2500, 200, 2300, 'demo_pi_m3_p3', '{"productTitle":"Stem Pack - Midnight"}', NOW() - INTERVAL '3 days');

RAISE NOTICE 'Earnings seeded (90 days, ~$980 total including churned fan revenue).';

-- ============================================================
-- 7. COMMUNITY POSTS (5 posts from the artist)
-- ============================================================
INSERT INTO posts (id, artist_community_id, author_id, content, access_level, created_at, updated_at)
VALUES
  (v_post_1, v_artist_profile_id, v_artist_user_id,
   'Just dropped 3 new tracks. The Wave members get early access — everyone else, they unlock Friday. Let me know which one hits different 🎧',
   'free', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days'),

  (v_post_2, v_artist_profile_id, v_artist_user_id,
   'Studio session was insane today. Working on something special for Inner Circle and Throne members — exclusive stems dropping next week. Stay tuned.',
   'free', NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days'),

  (v_post_3, v_artist_profile_id, v_artist_user_id,
   'Thank you to everyone who grabbed a 1-on-1 session. 4 booked so far. If you want one, there''s 6 slots left — link in the shop.',
   'free', NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days'),

  (v_post_4, v_artist_profile_id, v_artist_user_id,
   'New sample pack just went live — 30 loops and one-shots, all original. Royalty-free. Priced at $19.99 because I want y''all to actually use them.',
   'free', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'),

  (v_post_5, v_artist_profile_id, v_artist_user_id,
   'We just crossed $700 in total revenue on CRWN in under 3 months. No label. No playlist placement. Just 8 real fans. This is what direct support looks like 🏆',
   'free', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- Comments on posts (comments table: id, post_id, author_id, content, parent_comment_id, created_at, updated_at)
INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at)
VALUES
  (gen_random_uuid(), v_post_1, v_fan_1, 'Track 2 is on repeat. That bassline is insane', NOW() - INTERVAL '59 days', NOW()),
  (gen_random_uuid(), v_post_1, v_fan_2, 'Already got early access — worth it', NOW() - INTERVAL '59 days', NOW()),
  (gen_random_uuid(), v_post_1, v_fan_3, 'Friday cant come soon enough', NOW() - INTERVAL '58 days', NOW()),
  (gen_random_uuid(), v_post_1, v_fan_4, 'The production quality keeps getting better', NOW() - INTERVAL '58 days', NOW()),

  (gen_random_uuid(), v_post_2, v_fan_4, 'Throne member here — ready for those stems', NOW() - INTERVAL '39 days', NOW()),
  (gen_random_uuid(), v_post_2, v_fan_2, 'Inner Circle checking in. Can''t wait', NOW() - INTERVAL '39 days', NOW()),
  (gen_random_uuid(), v_post_2, v_fan_5, 'This is why I upgraded my tier', NOW() - INTERVAL '38 days', NOW()),
  (gen_random_uuid(), v_post_2, v_fan_1, 'Studio content is always the best content', NOW() - INTERVAL '38 days', NOW()),
  (gen_random_uuid(), v_post_2, v_fan_7, 'Need that wave access at minimum', NOW() - INTERVAL '37 days', NOW()),
  (gen_random_uuid(), v_post_2, v_fan_3, 'Lets goooo', NOW() - INTERVAL '37 days', NOW()),

  (gen_random_uuid(), v_post_3, v_fan_1, 'My session was incredible. Learned more in 45 min than a semester', NOW() - INTERVAL '24 days', NOW()),
  (gen_random_uuid(), v_post_3, v_fan_4, 'Booking mine this week', NOW() - INTERVAL '24 days', NOW()),
  (gen_random_uuid(), v_post_3, v_fan_9, 'Just booked. Can''t wait', NOW() - INTERVAL '23 days', NOW()),

  (gen_random_uuid(), v_post_4, v_fan_2, 'Purchased immediately. The lo-fi loops are crazy', NOW() - INTERVAL '11 days', NOW()),
  (gen_random_uuid(), v_post_4, v_fan_5, 'Already flipped 3 of these into beats. Quality is top tier', NOW() - INTERVAL '11 days', NOW()),
  (gen_random_uuid(), v_post_4, v_fan_7, 'Royalty free?? Take my money', NOW() - INTERVAL '10 days', NOW()),
  (gen_random_uuid(), v_post_4, v_fan_3, 'Trap section goes hard', NOW() - INTERVAL '10 days', NOW()),
  (gen_random_uuid(), v_post_4, v_fan_10, 'Best sample pack Ive heard in a while fr', NOW() - INTERVAL '9 days', NOW()),

  (gen_random_uuid(), v_post_5, v_fan_1, 'Day one supporter. This is just the beginning', NOW() - INTERVAL '1 day', NOW()),
  (gen_random_uuid(), v_post_5, v_fan_4, 'Proud to be part of this. Real artist, real community', NOW() - INTERVAL '1 day', NOW()),
  (gen_random_uuid(), v_post_5, v_fan_2, 'This is exactly how the music industry should work', NOW() - INTERVAL '1 day', NOW()),
  (gen_random_uuid(), v_post_5, v_fan_9, 'Just joined 2 weeks ago and already feel like family', NOW() - INTERVAL '1 day', NOW()),
  (gen_random_uuid(), v_post_5, v_fan_5, 'No algorithm needed when the music speaks for itself', NOW() - INTERVAL '1 day', NOW()),
  (gen_random_uuid(), v_post_5, v_fan_7, '8 fans $700. Spotify could never', NOW() - INTERVAL '1 day', NOW()),
  (gen_random_uuid(), v_post_5, v_fan_3, 'Shared your page with 3 producer friends btw', NOW() - INTERVAL '23 hours', NOW()),
  (gen_random_uuid(), v_post_5, v_fan_10, 'The future of music is direct. Period.', NOW() - INTERVAL '20 hours', NOW());

-- Likes on posts (likes table: id, user_id, likeable_type, likeable_id, created_at)
INSERT INTO likes (id, user_id, likeable_type, likeable_id, created_at)
VALUES
  (gen_random_uuid(), v_fan_1, 'post', v_post_1, NOW() - INTERVAL '59 days'),
  (gen_random_uuid(), v_fan_2, 'post', v_post_1, NOW() - INTERVAL '59 days'),
  (gen_random_uuid(), v_fan_3, 'post', v_post_1, NOW() - INTERVAL '58 days'),
  (gen_random_uuid(), v_fan_4, 'post', v_post_1, NOW() - INTERVAL '58 days'),
  (gen_random_uuid(), v_fan_5, 'post', v_post_1, NOW() - INTERVAL '57 days'),
  (gen_random_uuid(), v_fan_7, 'post', v_post_1, NOW() - INTERVAL '57 days'),
  (gen_random_uuid(), v_fan_9, 'post', v_post_1, NOW() - INTERVAL '56 days'),
  (gen_random_uuid(), v_fan_10, 'post', v_post_1, NOW() - INTERVAL '55 days'),
  (gen_random_uuid(), v_fan_1, 'post', v_post_2, NOW() - INTERVAL '39 days'),
  (gen_random_uuid(), v_fan_2, 'post', v_post_2, NOW() - INTERVAL '39 days'),
  (gen_random_uuid(), v_fan_3, 'post', v_post_2, NOW() - INTERVAL '39 days'),
  (gen_random_uuid(), v_fan_4, 'post', v_post_2, NOW() - INTERVAL '38 days'),
  (gen_random_uuid(), v_fan_5, 'post', v_post_2, NOW() - INTERVAL '38 days'),
  (gen_random_uuid(), v_fan_6, 'post', v_post_2, NOW() - INTERVAL '38 days'),
  (gen_random_uuid(), v_fan_7, 'post', v_post_2, NOW() - INTERVAL '37 days'),
  (gen_random_uuid(), v_fan_8, 'post', v_post_2, NOW() - INTERVAL '37 days'),
  (gen_random_uuid(), v_fan_9, 'post', v_post_2, NOW() - INTERVAL '37 days'),
  (gen_random_uuid(), v_fan_10, 'post', v_post_2, NOW() - INTERVAL '36 days'),
  (gen_random_uuid(), v_fan_11, 'post', v_post_2, NOW() - INTERVAL '36 days'),
  (gen_random_uuid(), v_fan_12, 'post', v_post_2, NOW() - INTERVAL '35 days'),
  (gen_random_uuid(), v_fan_1, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_2, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_3, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_4, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_5, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_6, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_7, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_8, 'post', v_post_5, NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), v_fan_9, 'post', v_post_5, NOW() - INTERVAL '23 hours'),
  (gen_random_uuid(), v_fan_10, 'post', v_post_5, NOW() - INTERVAL '20 hours'),
  (gen_random_uuid(), v_fan_11, 'post', v_post_5, NOW() - INTERVAL '18 hours'),
  (gen_random_uuid(), v_fan_12, 'post', v_post_5, NOW() - INTERVAL '15 hours');

RAISE NOTICE 'Community posts, comments, and likes seeded.';

-- ============================================================
-- 8. ARTIST PAGE VISITS (90 days, ramping up)
-- ============================================================
FOR v_i IN 0..89 LOOP
  v_day := (CURRENT_DATE - v_i);
  FOR v_i IN 1..GREATEST(3, LEAST(25, (90 - v_i) / 5 + (random() * 8)::int)) LOOP
    INSERT INTO artist_page_visits (id, artist_id, visit_date, visitor_hash, created_at)
    VALUES (gen_random_uuid(), v_artist_profile_id, v_day, 'demo_' || md5(v_day::text || v_i::text), v_day + (random() * INTERVAL '23 hours'));
  END LOOP;
END LOOP;

RAISE NOTICE 'Page visits seeded (90 days).';

-- ============================================================
-- 9. AI MANAGER INSIGHTS (5 active insights)
-- ============================================================
INSERT INTO ai_insights (id, artist_id, type, priority, title, body, data, action_type, action_url, is_read, is_dismissed, expires_at, created_at)
VALUES
  (gen_random_uuid(), v_artist_profile_id, 'revenue', 'high',
   'Revenue up 39% this month [demo]',
   'Your net revenue grew from $280 last month to $390 this month. Subscription renewals are strong — 100% of Month 1 subscribers renewed. Consider raising your Wave tier price or launching a limited product to capture the momentum.',
   '{"currentRevenue": 39000, "previousRevenue": 28000, "growthPercent": 39}',
   'link', '/profile/artist?tab=analytics', false, false, NOW() + INTERVAL '14 days', NOW() - INTERVAL '1 day'),

  (gen_random_uuid(), v_artist_profile_id, 'vip_fan', 'normal',
   'Aaliyah James is your top supporter [demo]',
   'Aaliyah has spent $125 total (Throne tier + 1-on-1 session). She''s commented on 3 posts and been active for 55 days. Consider a personal thank-you or exclusive early access to your next drop.',
   '{"fanName": "Aaliyah James", "totalSpent": 12500, "daysSinceJoin": 55}',
   'link', '/profile/artist?tab=audience', false, false, NOW() + INTERVAL '14 days', NOW() - INTERVAL '1 day'),

  (gen_random_uuid(), v_artist_profile_id, 'content_nudge', 'normal',
   'Your sample pack is your best-selling product [demo]',
   'The Exclusive Sample Pack has a 100% purchase-to-comment ratio — buyers are engaging. Consider creating a Vol. 2 or bundling it with stems at a higher price point.',
   '{"productTitle": "Exclusive Sample Pack", "salesCount": 2}',
   'link', '/profile/artist?tab=shop', false, false, NOW() + INTERVAL '14 days', NOW() - INTERVAL '12 hours'),

  (gen_random_uuid(), v_artist_profile_id, 'weekly_digest', 'low',
   'Weekly summary: 8 subscribers, $390 revenue [demo]',
   'This week: 2 new subscribers (Tyler Brooks on Throne, Zara Mitchell on Wave), 3 product sales ($120 net), 22 likes on your milestone post. Community engagement is at an all-time high.',
   '{"newSubscribers": 2, "weeklyRevenue": 12000, "totalLikes": 22}',
   NULL, NULL, false, false, NOW() + INTERVAL '7 days', NOW() - INTERVAL '6 hours'),

  (gen_random_uuid(), v_artist_profile_id, 'revenue', 'urgent',
   '1-on-1 sessions are 40% of product revenue [demo]',
   'You''ve sold 4 sessions at $75 each ($300 gross). Only 6 slots remain. At this rate they''ll sell out in 3 weeks. Consider raising the price to $100 or opening more slots.',
   '{"productTitle": "1-on-1 Production Session", "salesCount": 4, "remainingSlots": 6}',
   'link', '/profile/artist?tab=shop', false, false, NOW() + INTERVAL '14 days', NOW() - INTERVAL '3 hours');

RAISE NOTICE 'AI insights seeded.';

-- ============================================================
-- 10. TRACK PLAY COUNTS + HISTORY
-- ============================================================
UPDATE tracks
SET play_count = play_count + (50 + (random() * 200)::int)
WHERE artist_id = v_artist_profile_id AND is_active = true;

INSERT INTO play_history (id, user_id, track_id, played_at, duration_played, completed)
SELECT
  gen_random_uuid(),
  fan_ids.id,
  t.id,
  NOW() - (random() * INTERVAL '60 days'),
  LEAST(t.duration, (30 + (random() * t.duration)::int)),
  random() > 0.3
FROM
  (VALUES (v_fan_1),(v_fan_2),(v_fan_3),(v_fan_4),(v_fan_5),(v_fan_7),(v_fan_9),(v_fan_10)) AS fan_ids(id),
  tracks t
WHERE t.artist_id = v_artist_profile_id AND t.is_active = true
  AND random() > 0.25;

RAISE NOTICE 'Play counts and history seeded.';

-- ============================================================
-- 11. EMAIL CAMPAIGN (1 sent campaign with stats)
-- ============================================================
INSERT INTO campaigns (id, artist_id, name, subject, body, status, sent_at, filters, stats, created_at, updated_at)
VALUES
  (v_campaign_1, v_artist_profile_id, 'New Drops + Sample Pack Launch',
   'New music is live — plus an exclusive sample pack 🎹',
   '<p>Hey {first_name},</p><p>Just dropped 3 new tracks and launched my first sample pack — 30 original loops and one-shots for $19.99.</p><p>Subscribers get early access to the tracks. The sample pack is available to everyone.</p><p>Listen now on my page.</p><p>— M3rcey</p>',
   'sent', NOW() - INTERVAL '12 days',
   '{"tiers": "all"}',
   '{"total": 8, "sent": 8, "opened": 6, "clicked": 4, "bounced": 0}',
   NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO campaign_sends (id, campaign_id, fan_id, email, status, sent_at, opened_at, clicked_at, created_at)
VALUES
  (gen_random_uuid(), v_campaign_1, v_fan_1, 'jordan.rivers@demo.crwn', 'clicked', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '2 hours', NOW() - INTERVAL '12 days' + INTERVAL '2.5 hours', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), v_campaign_1, v_fan_2, 'maya.chen@demo.crwn', 'clicked', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '1 hour', NOW() - INTERVAL '12 days' + INTERVAL '1.5 hours', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), v_campaign_1, v_fan_3, 'dex.thompson@demo.crwn', 'opened', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '4 hours', NULL, NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), v_campaign_1, v_fan_4, 'aaliyah.james@demo.crwn', 'clicked', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '30 minutes', NOW() - INTERVAL '12 days' + INTERVAL '35 minutes', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), v_campaign_1, v_fan_5, 'marcus.lee@demo.crwn', 'clicked', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '3 hours', NOW() - INTERVAL '12 days' + INTERVAL '3.2 hours', NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), v_campaign_1, v_fan_7, 'kai.morgan@demo.crwn', 'opened', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days' + INTERVAL '6 hours', NULL, NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), v_campaign_1, v_fan_9, 'tyler.brooks@demo.crwn', 'sent', NOW() - INTERVAL '12 days', NULL, NULL, NOW() - INTERVAL '12 days'),
  (gen_random_uuid(), v_campaign_1, v_fan_10, 'zara.mitchell@demo.crwn', 'sent', NOW() - INTERVAL '12 days', NULL, NULL, NOW() - INTERVAL '12 days');

RAISE NOTICE 'Email campaign seeded (75%% open rate, 50%% click rate).';

-- ============================================================
-- 12. UPDATE LAST ACTIVE for realism
-- ============================================================
UPDATE profiles SET last_active_at = NOW() - INTERVAL '1 day' WHERE id = v_fan_1;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '2 days' WHERE id = v_fan_2;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '1 day' WHERE id = v_fan_3;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '3 hours' WHERE id = v_fan_4;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '4 days' WHERE id = v_fan_5;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '8 days' WHERE id = v_fan_6;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '2 days' WHERE id = v_fan_7;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '12 days' WHERE id = v_fan_8;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '1 day' WHERE id = v_fan_9;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '3 days' WHERE id = v_fan_10;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '5 days' WHERE id = v_fan_11;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '6 hours' WHERE id = v_fan_12;
-- Churned fans — haven't been active in a while
UPDATE profiles SET last_active_at = NOW() - INTERVAL '50 days' WHERE id = v_fan_13;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '45 days' WHERE id = v_fan_14;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '40 days' WHERE id = v_fan_15;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '32 days' WHERE id = v_fan_16;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '25 days' WHERE id = v_fan_17;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '20 days' WHERE id = v_fan_18;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '14 days' WHERE id = v_fan_19;
UPDATE profiles SET last_active_at = NOW() - INTERVAL '7 days' WHERE id = v_fan_20;

RAISE NOTICE '';
RAISE NOTICE '=========================================';
RAISE NOTICE '  DEMO DATA SEEDED SUCCESSFULLY';
RAISE NOTICE '=========================================';
RAISE NOTICE '';
RAISE NOTICE 'Summary:';
RAISE NOTICE '  - 20 demo fan accounts (12 active + 8 churned)';
RAISE NOTICE '  - 8 active subscriptions = $220 MRR (4 Wave, 2 Inner Circle, 2 Throne)';
RAISE NOTICE '  - 8 canceled subscriptions (for cohort retention heatmap)';
RAISE NOTICE '  - 8 cancellation reasons with real feedback';
RAISE NOTICE '  - ~$980 in earnings over 90 days (growth curve)';
RAISE NOTICE '  - 5 community posts with 26 comments and likes';
RAISE NOTICE '  - 90 days of page visits (ramping up)';
RAISE NOTICE '  - 5 AI Manager insights';
RAISE NOTICE '  - Play counts + history on all tracks';
RAISE NOTICE '  - 1 sent email campaign with open/click stats';
RAISE NOTICE '';
RAISE NOTICE 'IMPORTANT: Create shop products through the app UI (not SQL)';
RAISE NOTICE '  so they have real cover images for the demo video.';
RAISE NOTICE '';
RAISE NOTICE 'To clean up: re-run this script (cleanup is at the top).';

END $$;
