// Deterministic platform-plan recommendation (pricing strategy 2026-07-31).
// Every artist account technically begins on Launch (free). CRWN separately stores the
// RECOMMENDED operating plan and personalizes onboarding around it. The recommendation is
// pure math over declared facts, never an AI guess: the same inputs always produce the
// same plan, and every savings claim can show its arithmetic.
//
// Plan ladder: Launch $0 / 12% -> Pro $49 / 8% -> Scale $199 / 5%. A true multi-artist
// Label tier is custom-priced and does not exist until org accounts ship.

import { EMAIL_LIMITS, TIER_LIMITS, TIER_PRICING } from './platformTier';

/**
 * Contact-list size above which one email campaign a month stops being enough.
 * A cadence judgment, NOT a member cap: CRWN does not cap members on any plan.
 */
const LIST_SIZE_NEEDING_MORE_SENDS = 250;

export type PlatformPlan = 'starter' | 'pro' | 'scale';

export interface PlanRecommendationInput {
  /** Projected monthly direct-to-fan GMV in CENTS (from the calculator). */
  projectedMonthlyGmvCents?: number | null;
  /** Total released tracks the artist intends to bring. */
  catalogTracks?: number | null;
  /** Fans/contacts the artist intends to import. */
  contacts?: number | null;
  /** People working the account besides the artist. */
  teamSize?: number | null;
  /** Emails the artist wants to send per month. */
  monthlyEmailVolume?: number | null;
  wantsLiveExperiences?: boolean;
  wantsScheduling?: boolean;
  wantsDMs?: boolean;
  wantsBundles?: boolean;
  wantsDiscountCodes?: boolean;
  wantsAutomatedSequences?: boolean;
  wantsClipper?: boolean;
  wantsShareToEarn?: boolean;
  wantsAdvancedAnalytics?: boolean;
  /** Wants CRWN to move fans/catalog over for them. */
  wantsAssistedMigration?: boolean;
  /** Coming from Patreon, Shopify, Gumroad, or a similar established system. */
  migratingFromEstablishedPlatform?: boolean;
  needsAdvancedPermissions?: boolean;
}

export interface PlanRecommendation {
  plan: PlatformPlan;
  /** Machine key for the strongest reason (stored as recommendation_reason). */
  reason: string;
  /** Artist-readable reasons, strongest first. */
  reasons: string[];
  /** Monthly GMV in cents above which the next plan up costs less. */
  breakEven: { proMonthlyGmvCents: number; scaleMonthlyGmvCents: number };
}

const LAUNCH = TIER_LIMITS.starter;

/** GMV (cents) where Pro's fee savings equal its subscription: $49 / (12% - 8%). */
export function proBreakEvenGmvCents(): number {
  const feeDelta = (LAUNCH.platformFeePercent - TIER_LIMITS.pro.platformFeePercent) / 100;
  return Math.round(TIER_PRICING.pro.monthly / feeDelta);
}

/** GMV (cents) where Scale beats Pro: ($199 - $49) / (8% - 5%). */
export function scaleBreakEvenGmvCents(): number {
  const feeDelta = (TIER_LIMITS.pro.platformFeePercent - TIER_LIMITS.scale.platformFeePercent) / 100;
  return Math.round((TIER_PRICING.scale.monthly - TIER_PRICING.pro.monthly) / feeDelta);
}

/**
 * Estimated monthly CRWN cost (cents) on a plan at a given GMV: subscription + platform fee.
 * This is the number every savings claim must be derived from, with the math visible.
 */
export function monthlyPlanCostCents(plan: PlatformPlan, gmvCents: number): number {
  const sub = plan === 'pro' ? TIER_PRICING.pro.monthly : plan === 'scale' ? TIER_PRICING.scale.monthly : 0;
  const feePct = TIER_LIMITS[plan].platformFeePercent;
  return sub + Math.round(gmvCents * (feePct / 100));
}

export function recommendPlan(input: PlanRecommendationInput): PlanRecommendation {
  const gmv = input.projectedMonthlyGmvCents || 0;
  const proBreakEven = proBreakEvenGmvCents();
  const scaleBreakEven = scaleBreakEvenGmvCents();

  const scaleReasons: Array<[string, string]> = [];
  if (gmv >= scaleBreakEven) {
    const saved = monthlyPlanCostCents('pro', gmv) - monthlyPlanCostCents('scale', gmv);
    scaleReasons.push([
      'gmv_above_scale_break_even',
      `At your projected $${Math.round(gmv / 100).toLocaleString()}/month, Scale's 5% fee costs about $${Math.round(saved / 100).toLocaleString()}/month less than Pro`,
    ]);
  }
  if (input.wantsAssistedMigration) {
    scaleReasons.push(['assisted_migration', 'You asked CRWN to migrate your fans and catalog for you']);
  }
  if (input.migratingFromEstablishedPlatform) {
    scaleReasons.push(['established_migration', 'You are moving an established membership or store, and assisted migration protects that revenue']);
  }
  if ((input.teamSize || 0) >= 2 || input.needsAdvancedPermissions) {
    scaleReasons.push(['team_operations', 'Your team needs roles, permissions, and approval workflows']);
  }
  if ((input.monthlyEmailVolume || 0) > 20) {
    scaleReasons.push(['email_volume', 'Your email volume is above Pro limits']);
  }

  const proReasons: Array<[string, string]> = [];
  if (gmv >= proBreakEven) {
    const saved = monthlyPlanCostCents('starter', gmv) - monthlyPlanCostCents('pro', gmv);
    proReasons.push([
      'gmv_above_pro_break_even',
      `At your projected $${Math.round(gmv / 100).toLocaleString()}/month, Pro's 8% fee costs about $${Math.round(saved / 100).toLocaleString()}/month less than staying on Launch`,
    ]);
  }
  if ((input.catalogTracks || 0) > LAUNCH.maxTracks) {
    proReasons.push(['catalog_over_launch_limit', `Your ${input.catalogTracks} tracks are more than the ${LAUNCH.maxTracks} the Launch plan holds`]);
  }
  // A big list still points at Pro, but for the HONEST reason. Members are
  // unlimited on every plan (2026-08-01), so "your contacts exceed the cap" was a
  // claim with nothing behind it. What a large list really runs into is Launch's
  // ONE email campaign per month, which is the single limit CRWN actually
  // enforces. The threshold is a judgment call about cadence, not a cap: below it
  // a monthly send is a reasonable rhythm, above it the artist will want to
  // segment and send more often than Launch allows.
  if ((input.contacts || 0) >= LIST_SIZE_NEEDING_MORE_SENDS) {
    proReasons.push([
      'contacts_need_more_sends',
      `Launch includes ${EMAIL_LIMITS.starter} email campaign a month, and a list of ${(input.contacts || 0).toLocaleString()} needs to hear from you more often than that`,
    ]);
  }
  if (input.wantsLiveExperiences) proReasons.push(['live_experiences', 'Live experiences and Executive Producer sessions are Pro features']);
  if (input.wantsScheduling) proReasons.push(['scheduling', 'Content and offer scheduling is a Pro feature']);
  if (input.wantsDMs) proReasons.push(['dms', 'Direct messaging with fans is a Pro feature']);
  if (input.wantsBundles) proReasons.push(['bundles', 'Bundles are a Pro feature']);
  if (input.wantsDiscountCodes) proReasons.push(['discount_codes', 'Discount codes are a Pro feature']);
  if (input.wantsAutomatedSequences) proReasons.push(['sequences', 'Automated email sequences are a Pro feature']);
  if (input.wantsClipper) proReasons.push(['clipper', 'Clipper campaigns are a Pro feature']);
  if (input.wantsShareToEarn) proReasons.push(['share_to_earn', 'Share-to-Earn is a Pro feature']);
  if (input.wantsAdvancedAnalytics) proReasons.push(['advanced_analytics', 'Advanced analytics is a Pro feature']);
  if ((input.monthlyEmailVolume || 0) > 1 && (input.monthlyEmailVolume || 0) <= 20) {
    proReasons.push(['email_volume', 'You plan to send more than the 1 email campaign per month Launch includes']);
  }

  const breakEven = { proMonthlyGmvCents: proBreakEven, scaleMonthlyGmvCents: scaleBreakEven };

  if (scaleReasons.length > 0) {
    return {
      plan: 'scale',
      reason: scaleReasons[0][0],
      reasons: scaleReasons.map(([, r]) => r).concat(proReasons.map(([, r]) => r)),
      breakEven,
    };
  }
  if (proReasons.length > 0) {
    return { plan: 'pro', reason: proReasons[0][0], reasons: proReasons.map(([, r]) => r), breakEven };
  }
  return {
    plan: 'starter',
    reason: 'prove_first_offer',
    reasons: ['Launch covers everything you need to prove your first direct-to-fan offer, free'],
    breakEven,
  };
}
