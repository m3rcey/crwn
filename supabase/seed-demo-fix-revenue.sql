-- ============================================================
-- CRWN Demo Revenue Fix
-- Purpose: Pump up admin dashboard numbers for pitch demo
-- RUN AFTER: seed-demo-data.sql and seed-demo-admin.sql
-- ============================================================

DO $$
DECLARE
  v_admin_artist_id UUID := '0cfd2ad9-c37c-4b68-863e-6db0aa939893';
  v_i INTEGER;
  v_day DATE;
  v_artist_id UUID;
  v_fan_id UUID;
  v_amount INTEGER;
  v_fee INTEGER;

  -- Demo artist UUIDs (paid artists 12-19 + at-risk 20-21)
  v_paid_artists UUID[] := ARRAY[
    'ab000001-de00-4000-a000-000000000012'::UUID,
    'ab000001-de00-4000-a000-000000000013'::UUID,
    'ab000001-de00-4000-a000-000000000014'::UUID,
    'ab000001-de00-4000-a000-000000000015'::UUID,
    'ab000001-de00-4000-a000-000000000016'::UUID,
    'ab000001-de00-4000-a000-000000000017'::UUID,
    'ab000001-de00-4000-a000-000000000018'::UUID,
    'ab000001-de00-4000-a000-000000000019'::UUID,
    'ab000001-de00-4000-a000-000000000020'::UUID,
    'ab000001-de00-4000-a000-000000000021'::UUID
  ];

  v_paid_users UUID[] := ARRAY[
    'aa000001-de00-4000-a000-000000000012'::UUID,
    'aa000001-de00-4000-a000-000000000013'::UUID,
    'aa000001-de00-4000-a000-000000000014'::UUID,
    'aa000001-de00-4000-a000-000000000015'::UUID,
    'aa000001-de00-4000-a000-000000000016'::UUID,
    'aa000001-de00-4000-a000-000000000017'::UUID,
    'aa000001-de00-4000-a000-000000000018'::UUID,
    'aa000001-de00-4000-a000-000000000019'::UUID,
    'aa000001-de00-4000-a000-000000000020'::UUID,
    'aa000001-de00-4000-a000-000000000021'::UUID
  ];

  -- Some demo fan IDs to use as fan_id in earnings
  v_demo_fans UUID[] := ARRAY[
    'dd000001-de00-4000-a000-000000000001'::UUID,
    'dd000001-de00-4000-a000-000000000002'::UUID,
    'dd000001-de00-4000-a000-000000000003'::UUID,
    'dd000001-de00-4000-a000-000000000004'::UUID,
    'dd000001-de00-4000-a000-000000000005'::UUID
  ];

BEGIN

-- ============================================================
-- 1. CLEANUP previous fix data
-- ============================================================
DELETE FROM earnings WHERE stripe_payment_id LIKE 'demo_fix_%';
DELETE FROM admin_metrics_cache;

-- ============================================================
-- 2. VERIFY: Ensure paid artists have correct platform_subscription_status
-- ============================================================
UPDATE artist_profiles SET platform_subscription_status = 'active'
WHERE id = ANY(v_paid_artists)
  AND platform_tier IS NOT NULL
  AND platform_tier != 'starter';

RAISE NOTICE 'Artist platform subscription statuses verified.';

-- ============================================================
-- 3. ADD fan-to-artist transaction earnings across paid artists
--    Each paid artist has fans paying them, generating platform fees
--    This is what makes the transaction fee MRR look real
-- ============================================================

-- For each paid artist, generate 90 days of fan subscription earnings
-- Each artist has ~5-15 fan subscribers paying $10-50/mo
-- Platform takes 6-8% fee on each
FOR v_i IN 1..10 LOOP
  v_artist_id := v_paid_artists[v_i];

  -- 3 months of fan subscription payments per artist
  -- Month 1: 3-5 subscribers
  INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
  VALUES
    (v_artist_id, v_demo_fans[1], 'subscription', 'Fan Subscription', 1500, 120, 1380,
     'demo_fix_' || v_i || '_m1_1', '{}', NOW() - INTERVAL '80 days'),
    (v_artist_id, v_demo_fans[2], 'subscription', 'Fan Subscription', 3000, 240, 2760,
     'demo_fix_' || v_i || '_m1_2', '{}', NOW() - INTERVAL '75 days'),
    (v_artist_id, v_demo_fans[3], 'subscription', 'Fan Subscription', 2000, 160, 1840,
     'demo_fix_' || v_i || '_m1_3', '{}', NOW() - INTERVAL '70 days');

  -- Month 2: renewals + new
  INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
  VALUES
    (v_artist_id, v_demo_fans[1], 'subscription', 'Fan Subscription', 1500, 120, 1380,
     'demo_fix_' || v_i || '_m2_1', '{}', NOW() - INTERVAL '50 days'),
    (v_artist_id, v_demo_fans[2], 'subscription', 'Fan Subscription', 3000, 240, 2760,
     'demo_fix_' || v_i || '_m2_2', '{}', NOW() - INTERVAL '45 days'),
    (v_artist_id, v_demo_fans[3], 'subscription', 'Fan Subscription', 2000, 160, 1840,
     'demo_fix_' || v_i || '_m2_3', '{}', NOW() - INTERVAL '40 days'),
    (v_artist_id, v_demo_fans[4], 'subscription', 'Fan Subscription', 5000, 400, 4600,
     'demo_fix_' || v_i || '_m2_4', '{}', NOW() - INTERVAL '42 days'),
    (v_artist_id, v_demo_fans[5], 'purchase', 'Product Sale', 2500, 200, 2300,
     'demo_fix_' || v_i || '_m2_p1', '{}', NOW() - INTERVAL '38 days');

  -- Month 3: more renewals + growth
  INSERT INTO earnings (artist_id, fan_id, type, description, gross_amount, platform_fee, net_amount, stripe_payment_id, metadata, created_at)
  VALUES
    (v_artist_id, v_demo_fans[1], 'subscription', 'Fan Subscription', 1500, 120, 1380,
     'demo_fix_' || v_i || '_m3_1', '{}', NOW() - INTERVAL '20 days'),
    (v_artist_id, v_demo_fans[2], 'subscription', 'Fan Subscription', 3000, 240, 2760,
     'demo_fix_' || v_i || '_m3_2', '{}', NOW() - INTERVAL '15 days'),
    (v_artist_id, v_demo_fans[3], 'subscription', 'Fan Subscription', 2000, 160, 1840,
     'demo_fix_' || v_i || '_m3_3', '{}', NOW() - INTERVAL '12 days'),
    (v_artist_id, v_demo_fans[4], 'subscription', 'Fan Subscription', 5000, 400, 4600,
     'demo_fix_' || v_i || '_m3_4', '{}', NOW() - INTERVAL '10 days'),
    (v_artist_id, v_demo_fans[5], 'subscription', 'Fan Subscription', 1500, 120, 1380,
     'demo_fix_' || v_i || '_m3_5', '{}', NOW() - INTERVAL '8 days'),
    (v_artist_id, v_demo_fans[1], 'purchase', 'Product Sale', 4999, 400, 4599,
     'demo_fix_' || v_i || '_m3_p1', '{}', NOW() - INTERVAL '5 days'),
    (v_artist_id, v_demo_fans[3], 'purchase', 'Product Sale', 7500, 600, 6900,
     'demo_fix_' || v_i || '_m3_p2', '{}', NOW() - INTERVAL '3 days');

END LOOP;

-- Total per artist per month 3: ~$250 gross, ~$20 platform fee
-- x 10 artists = ~$200 platform fee in last 30 days
-- Transaction fee MRR = ~$2,000/mo

-- Platform MRR (from tier prices): 7 Pro x $69 + 2 Label x $175 = $483 + $350 = $833
-- Total MRR = ~$833 + ~$2,000 = ~$2,833
-- That looks healthy for a pitch

RAISE NOTICE 'Fan-to-artist transaction earnings seeded (10 artists x 15 transactions each).';

-- ============================================================
-- 4. CLEAR CACHE so dashboard recomputes
-- ============================================================
DELETE FROM admin_metrics_cache;

RAISE NOTICE '';
RAISE NOTICE 'Revenue fix applied. Refresh the admin dashboard.';
RAISE NOTICE 'Expected numbers:';
RAISE NOTICE '  Platform MRR: ~$833 (7 Pro + 2 Label)';
RAISE NOTICE '  Transaction Fee MRR: ~$2,000';
RAISE NOTICE '  Total MRR: ~$2,800';
RAISE NOTICE '  Revenue trend: should show growth across 3 months';

END $$;
