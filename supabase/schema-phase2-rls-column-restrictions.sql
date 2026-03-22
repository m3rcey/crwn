-- =============================================================================
-- RLS Column Restrictions: Prevent users from modifying sensitive fields
-- =============================================================================
-- PROBLEM: Current UPDATE policies on profiles and artist_profiles allow users
-- to modify ANY column on their own row, including platform_tier, is_active,
-- and stripe_connect_id. A malicious user could upgrade themselves to 'empire'
-- tier (4% fee) without paying, or manipulate their account status.
--
-- FIX: Replace broad UPDATE policies with column-restricted ones using
-- WITH CHECK constraints that verify sensitive fields haven't changed.
-- =============================================================================

-- ─── PROFILES TABLE ─────────────────────────────────────────────────────────

-- Drop the old unrestricted policy
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- New policy: users can only update safe profile fields
-- Sensitive fields (platform_tier, is_active) must remain unchanged
CREATE POLICY "Users can update own profile safe fields"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    -- platform_tier must not change (only server/webhook can change this)
    platform_tier IS NOT DISTINCT FROM (SELECT platform_tier FROM profiles WHERE id = auth.uid())
    AND
    -- is_active must not change (only server can change this)
    is_active IS NOT DISTINCT FROM (SELECT is_active FROM profiles WHERE id = auth.uid())
  );

-- ─── ARTIST_PROFILES TABLE ──────────────────────────────────────────────────

-- Drop the old unrestricted policy
DROP POLICY IF EXISTS "Artists can update own profile" ON artist_profiles;

-- New policy: artists can only update safe artist profile fields
-- Sensitive fields (platform_tier, is_active, stripe_connect_id) must remain unchanged
CREATE POLICY "Artists can update own profile safe fields"
  ON artist_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    -- platform_tier must not change
    platform_tier IS NOT DISTINCT FROM (SELECT platform_tier FROM artist_profiles WHERE user_id = auth.uid())
    AND
    -- is_active must not change
    is_active IS NOT DISTINCT FROM (SELECT is_active FROM artist_profiles WHERE user_id = auth.uid())
    AND
    -- stripe_connect_id must not change (only Connect onboarding webhook sets this)
    stripe_connect_id IS NOT DISTINCT FROM (SELECT stripe_connect_id FROM artist_profiles WHERE user_id = auth.uid())
  );

-- ─── SUBSCRIPTIONS TABLE ────────────────────────────────────────────────────
-- The current "System can manage subscriptions" policy with FOR ALL / USING (true)
-- is overly permissive. Replace with explicit policies:

DROP POLICY IF EXISTS "System can manage subscriptions" ON subscriptions;

-- Users can only SELECT their own subscriptions (already exists but re-ensure)
-- INSERT/UPDATE/DELETE only via service role (webhooks use admin client)
-- No INSERT/UPDATE/DELETE policy for authenticated users = they can't modify subscriptions
