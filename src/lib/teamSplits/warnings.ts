// Team Splits — deal risk analysis. Pure functions so the wizard (live preview),
// the API (stored risk_flags + is_high_risk), the AI Manager, and admin all read
// the SAME logic. No I/O here.

import type { DealWarning, PayoutBasis } from './types';
import { RISK, IP_SENSITIVE_ROLES, dealTypeMeta } from './constants';
import type { DealType, RevenueSourceType } from './types';

export interface DealTermsForRisk {
  dealType: DealType;
  role: string;
  sourceType: RevenueSourceType;
  percentage: number | null;
  payoutBasis: PayoutBasis;
  capAmount: number | null; // cents, null = uncapped
  durationDays: number | null;
  hasDeliverables: boolean;
  /** Sum of OTHER active split percentages already on this same source. */
  existingSourceSplitPct?: number;
  /** Artist platform fee % (12 starter / 8 pro / 5 founding). */
  artistFeePct?: number;
}

export function analyzeDeal(t: DealTermsForRisk): DealWarning[] {
  const w: DealWarning[] = [];
  const meta = dealTypeMeta(t.dealType);
  const pct = t.percentage ?? 0;

  // Uncapped (Pitfall 4)
  if (t.capAmount == null && meta.requiresPercentage) {
    w.push({
      code: 'no_cap',
      level: 'warning',
      message: 'This deal has no payout cap. Add a cap to limit your long-term obligation.',
    });
  }

  // High percentage (Pitfall 3/16)
  if (pct >= RISK.highPercentage) {
    w.push({
      code: 'high_percentage',
      level: 'high',
      message: `${pct}% is a high share for one collaborator. Double-check this is intended.`,
    });
  }

  // Total stacked splits on the same source (Pitfall 16)
  const totalOnSource = pct + (t.existingSourceSplitPct ?? 0);
  if ((t.existingSourceSplitPct ?? 0) > 0 && totalOnSource >= RISK.totalSourceSplitCap) {
    w.push({
      code: 'source_overcommitted',
      level: 'high',
      message: `Total Team Splits on this source would reach ${totalOnSource}%. You may keep very little.`,
    });
  }

  // Projected artist net after platform fee + this split (+ other splits) (Pitfall 3)
  if (meta.requiresPercentage && t.artistFeePct != null && t.payoutBasis === 'net_artist_revenue') {
    const afterFee = 100 - t.artistFeePct;
    const netAfterSplits = afterFee * (1 - totalOnSource / 100);
    if (netAfterSplits < RISK.lowNetWarning) {
      w.push({
        code: 'low_net',
        level: 'high',
        message: `After platform fees and Team Splits, your estimated net is about ${Math.round(netAfterSplits)}% of revenue. Consider a lower split, a cap, or a shorter duration.`,
      });
    }
  }

  // Gross basis (Pitfall 9)
  if (t.payoutBasis === 'gross_revenue') {
    w.push({
      code: 'gross_basis',
      level: 'warning',
      message: 'Gross revenue splits can make you owe money even after fees, refunds, or chargebacks reduce your actual payout. Net artist revenue is safer.',
    });
  }

  // Broad all-earnings (Pitfall 5)
  if (t.sourceType === 'all_earnings') {
    w.push({
      code: 'all_earnings',
      level: 'high',
      message: 'This shares a percentage of ALL your CRWN earnings, not one source. This is advanced and high-risk. Keep it small and short.',
    });
  }

  // Long duration (Pitfall 4)
  if (t.durationDays != null && t.durationDays > RISK.longDurationDays) {
    w.push({
      code: 'long_duration',
      level: 'warning',
      message: 'This deal runs longer than a year. Long durations increase long-term obligation.',
    });
  }

  // Missing deliverables on a service deal (Pitfall 6)
  if (!t.hasDeliverables && meta.requiresPercentage && t.dealType !== 'artist_earnings_share') {
    w.push({
      code: 'no_deliverables',
      level: 'warning',
      message: 'No deliverables defined. Add deliverables and require approval so payouts only start after work is delivered.',
    });
  }

  // IP / publishing sensitivity (Pitfalls 18-21)
  if (IP_SENSITIVE_ROLES.has(t.role)) {
    w.push({
      code: 'ip_sensitive',
      level: 'info',
      message: 'This role may involve IP, publishing, master, or usage rights that a CRWN revenue share does not cover. Handle those in a separate agreement.',
    });
  }

  return w;
}

export function isHighRisk(warnings: DealWarning[]): boolean {
  return warnings.some((x) => x.level === 'high');
}
