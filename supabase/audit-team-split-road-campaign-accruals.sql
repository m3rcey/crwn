-- ============================================================================
-- audit-team-split-road-campaign-accruals.sql
-- READ-ONLY audit. Run in the Supabase SQL Editor. Deletes nothing.
-- ============================================================================
-- WHY: until the allocation.ts fix, `revenue_source_type` of 'road_campaign',
-- 'custom', and 'none' fell through getQualifyingEarnings() with NO narrowing
-- (see the old passthrough at allocation.ts:109). Those deals accrued against
-- EVERY positive earning the artist made in the deal window — subscriptions,
-- product sales, bookings, livestream tickets — not just the campaign's revenue.
--
-- `earnings.source_campaign_id` references `campaigns` (the email-blast table),
-- NOT `road_campaigns`. There has never been an earnings -> road_campaigns link.
--
-- Accruals are written as status='held' and are NOT cashable until the artist
-- calls /api/team-splits/:id/release AND cleared_at passes. So over-accrual is
-- recoverable *if nothing has been released or paid*. Query 1 tells you that.
--
-- Run 1 -> 2 -> 3 in order. Do not skip 1.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. HAVE ANY BAD ROWS ESCAPED THE HOLD? This is the only urgent question.
--    Any row here has been released or paid to a collaborator who may have had
--    no claim to that revenue. Expect ZERO rows. If not, stop and reconcile
--    by hand before touching anything else.
-- ---------------------------------------------------------------------------
SELECT
  tse.id,
  tse.deal_id,
  d.title              AS deal_title,
  d.revenue_source_type,
  tse.status,
  tse.commission_amount,          -- cents
  tse.released_at,
  tse.paid_at
FROM team_split_earnings tse
JOIN team_split_deals d ON d.id = tse.deal_id
WHERE d.revenue_source_type IN ('road_campaign', 'custom', 'none')
  AND tse.commission_amount > 0
  AND (tse.released_at IS NOT NULL OR tse.paid_at IS NOT NULL OR tse.status IN ('released', 'paid'))
ORDER BY tse.paid_at NULLS LAST, tse.released_at NULLS LAST;

-- ---------------------------------------------------------------------------
-- 2. BLAST RADIUS: every affected deal, how much it over-accrued, and whether
--    it would still accrue anything under the new fenced logic.
--    `still_valid_after_fix` = false means the deal is now inert and the artist
--    must re-scope it (or it should be terminated).
-- ---------------------------------------------------------------------------
SELECT
  d.id                                    AS deal_id,
  d.title,
  d.status                                AS deal_status,
  d.revenue_source_type,
  d.collaborator_name,
  d.percentage,
  COUNT(tse.id) FILTER (WHERE tse.commission_amount > 0)          AS accrual_rows,
  COALESCE(SUM(tse.commission_amount) FILTER (WHERE tse.commission_amount > 0), 0) AS accrued_cents,
  COUNT(tse.id) FILTER (WHERE tse.status = 'held')                AS held_rows,
  CASE
    WHEN d.revenue_source_type <> 'road_campaign' THEN false
    WHEN rc.id IS NULL THEN false
    WHEN rc.linked_tier_id IS NULL AND rc.linked_product_id IS NULL THEN false
    ELSE true
  END                                                              AS still_valid_after_fix
FROM team_split_deals d
LEFT JOIN team_split_earnings tse ON tse.deal_id = d.id
LEFT JOIN road_campaigns rc
       ON rc.id = d.revenue_source_id
      AND d.revenue_source_type = 'road_campaign'
WHERE d.revenue_source_type IN ('road_campaign', 'custom', 'none')
GROUP BY d.id, d.title, d.status, d.revenue_source_type, d.collaborator_name,
         d.percentage, rc.id, rc.linked_tier_id, rc.linked_product_id
ORDER BY accrued_cents DESC;

-- ---------------------------------------------------------------------------
-- 3. WHAT THE MONEY WAS ACTUALLY DRAWN FROM. Proves the over-reach: a campaign
--    split should never have accrued against 'subscription' or 'booking' rows
--    unless the campaign's linked tier produced them.
-- ---------------------------------------------------------------------------
SELECT
  d.revenue_source_type,
  e.type                       AS underlying_earning_type,
  COUNT(*)                     AS rows,
  SUM(tse.commission_amount)   AS accrued_cents
FROM team_split_earnings tse
JOIN team_split_deals d ON d.id = tse.deal_id
JOIN earnings e          ON e.id = tse.earning_id
WHERE d.revenue_source_type IN ('road_campaign', 'custom', 'none')
  AND tse.commission_amount > 0
GROUP BY d.revenue_source_type, e.type
ORDER BY accrued_cents DESC;

-- ============================================================================
-- REMEDIATION (do NOT run until 1 returns zero rows and you've read 2 and 3).
-- Unreleased, unpaid, held accruals on unfenceable deals were never owed. The
-- next cron run will re-accrue only what the new fence allows, because the
-- uniq_tse_deal_earning index is keyed on (deal_id, earning_id) and deleting
-- these rows makes them eligible again.
--
--   DELETE FROM team_split_earnings tse
--   USING team_split_deals d
--   WHERE d.id = tse.deal_id
--     AND d.revenue_source_type IN ('road_campaign', 'custom', 'none')
--     AND tse.status = 'held'
--     AND tse.released_at IS NULL
--     AND tse.paid_at IS NULL;
--
-- Deals where query 2 shows still_valid_after_fix = false will accrue nothing
-- going forward. Terminate them or have the artist re-scope to a tier/product.
-- ============================================================================
