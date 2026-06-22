-- Artist control over annual fan-tier billing
-- Adds a per-tier toggle for offering annual billing and a custom discount %.
-- Defaults preserve current behavior (annual offered, 25% off) for existing tiers.

ALTER TABLE subscription_tiers
  ADD COLUMN IF NOT EXISTS offers_annual BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS annual_discount_percent INTEGER NOT NULL DEFAULT 25
    CHECK (annual_discount_percent >= 0 AND annual_discount_percent <= 50);
