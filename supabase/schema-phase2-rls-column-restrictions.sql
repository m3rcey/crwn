-- =============================================================================
-- RLS Column Restrictions: Prevent users from modifying sensitive fields
-- APPLIED 2026-03-22
-- =============================================================================

-- ─── PROFILES TABLE ─────────────────────────────────────────────────────────
-- Protects: is_active, stripe_connect_id, role

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

CREATE POLICY "Users can update own profile safe fields"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    is_active IS NOT DISTINCT FROM (SELECT is_active FROM profiles WHERE id = auth.uid())
    AND
    stripe_connect_id IS NOT DISTINCT FROM (SELECT stripe_connect_id FROM profiles WHERE id = auth.uid())
    AND
    role IS NOT DISTINCT FROM (SELECT role FROM profiles WHERE id = auth.uid())
  );

-- ─── ARTIST_PROFILES TABLE ──────────────────────────────────────────────────
-- Protects: platform_tier, stripe_connect_id, platform_subscription_status,
-- platform_stripe_subscription_id, platform_stripe_customer_id,
-- is_founding_artist, founding_artist_number, referral_commission_rate

DROP POLICY IF EXISTS "Artists can update own profile" ON artist_profiles;

CREATE POLICY "Artists can update own profile safe fields"
  ON artist_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    platform_tier IS NOT DISTINCT FROM (SELECT platform_tier FROM artist_profiles WHERE user_id = auth.uid())
    AND
    stripe_connect_id IS NOT DISTINCT FROM (SELECT stripe_connect_id FROM artist_profiles WHERE user_id = auth.uid())
    AND
    platform_subscription_status IS NOT DISTINCT FROM (SELECT platform_subscription_status FROM artist_profiles WHERE user_id = auth.uid())
    AND
    platform_stripe_subscription_id IS NOT DISTINCT FROM (SELECT platform_stripe_subscription_id FROM artist_profiles WHERE user_id = auth.uid())
    AND
    platform_stripe_customer_id IS NOT DISTINCT FROM (SELECT platform_stripe_customer_id FROM artist_profiles WHERE user_id = auth.uid())
    AND
    is_founding_artist IS NOT DISTINCT FROM (SELECT is_founding_artist FROM artist_profiles WHERE user_id = auth.uid())
    AND
    founding_artist_number IS NOT DISTINCT FROM (SELECT founding_artist_number FROM artist_profiles WHERE user_id = auth.uid())
    AND
    referral_commission_rate IS NOT DISTINCT FROM (SELECT referral_commission_rate FROM artist_profiles WHERE user_id = auth.uid())
  );

-- ─── SUBSCRIPTIONS TABLE ────────────────────────────────────────────────────
-- Remove overly permissive FOR ALL policy. Webhooks use admin client (bypasses RLS).

DROP POLICY IF EXISTS "System can manage subscriptions" ON subscriptions;
