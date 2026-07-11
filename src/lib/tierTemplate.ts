// Recommended four-tier membership ladder (Rise Mode Level 3).
//
// This is DATA the Tier Manager consumes to offer a one-tap recommended ladder.
// It never bypasses plan limits: the free "Community" tier does not count against
// the paid-tier cap (see platformTier.ts Option-2 counting), and the paid tiers
// are applied only up to the artist's plan allowance.
//
// Benefit copy is fan-facing. Rules honored:
//  - No em dashes anywhere.
//  - Messaging is "at the artist's discretion" (never a guaranteed reply).
//  - Executive Supporter recognition is recognition ONLY (no ownership/royalties).
//  - No monthly 1-on-1 calls, custom songs, guaranteed responses, ownership,
//    royalties, publishing, master rights, approval rights, or Team Split by default.
//
// Individually fulfilled (high-touch) benefits carry a workload class + a
// fulfillment note so the artist confirms capacity before publishing. This is a
// lightweight safeguard, not a fulfillment-management platform.

import type { BenefitType } from './benefitCatalog';

export type BenefitWorkload = 'low' | 'moderate' | 'high_touch';

export interface TemplateBenefit {
  /** Fan-facing benefit line (rendered on the public tier card via access_config.benefits). */
  label: string;
  /** How much ongoing artist effort this benefit costs to fulfill. */
  workload: BenefitWorkload;
  /** Optional structured benefit also written to tier_benefits (config-driven perks). */
  structured?: { benefit_type: BenefitType; config?: Record<string, unknown> };
  /** Present for individually/periodically fulfilled perks: the safeguard metadata. */
  fulfillment?: {
    frequency?: 'monthly' | 'quarterly' | 'ongoing';
    /** Plain explanation of what the artist commits to. Shown before publishing. */
    note: string;
    /** True when the artist should cap membership or plan capacity for this perk. */
    capacityRecommended?: boolean;
  };
}

export interface TierTemplateDef {
  key: 'community' | 'backstage' | 'inner_circle' | 'executive';
  name: string;
  /** Monthly price in integer cents (0 for the free front door). */
  priceCents: number;
  description: string;
  benefits: TemplateBenefit[];
  /** Executive: membership is intentionally capacity-limited. */
  capacityLimited?: boolean;
}

// Disclaimers surfaced next to the relevant benefits in the apply flow.
export const MESSAGING_DISCLAIMER =
  'Messaging access lets supporters write to you. Replies are at your discretion and are not guaranteed.';

export const EXECUTIVE_RECOGNITION_DISCLAIMER =
  'Executive Supporter recognition is recognition only. It grants no master ownership, publishing ownership, songwriting credit, producer credit, royalties, revenue participation, approval rights, creative control, or Team Split participation.';

export const RECOMMENDED_LADDER: TierTemplateDef[] = [
  {
    key: 'community',
    name: 'Community',
    priceCents: 0,
    description: 'Your free front door. The easiest way for new fans to join and stay close.',
    benefits: [
      { label: 'Selected free tracks', workload: 'low' },
      { label: 'Community access', workload: 'low' },
      { label: 'Community posts', workload: 'low' },
      { label: 'Release announcements', workload: 'low' },
      { label: 'New music after paid early-access windows', workload: 'low' },
      { label: 'Public polls', workload: 'low' },
      { label: 'Selected behind-the-scenes content', workload: 'low' },
    ],
  },
  {
    key: 'backstage',
    name: 'Backstage',
    priceCents: 1000,
    description: 'For fans who want in. Exclusives, early access, and a real line to you.',
    benefits: [
      { label: 'Everything in Community', workload: 'low' },
      { label: 'Exclusive tracks, demos, and alternate versions', workload: 'moderate' },
      {
        label: '7-day early access to new music',
        workload: 'low',
        structured: { benefit_type: 'early_access', config: { days_early: 7 } },
      },
      { label: 'Members-only community posts', workload: 'low' },
      { label: 'Members-only polls', workload: 'low' },
      {
        label: 'Monthly studio update or behind-the-scenes post',
        workload: 'moderate',
        fulfillment: { frequency: 'monthly', note: 'You commit to one behind-the-scenes post each month.' },
      },
      {
        label: '10% shop discount',
        workload: 'low',
        structured: { benefit_type: 'shop_discount', config: { discount_percent: 10 } },
      },
      {
        label: 'Artist messaging access, replies at your discretion',
        workload: 'moderate',
        structured: { benefit_type: 'direct_messaging' },
        fulfillment: {
          frequency: 'ongoing',
          note: 'Supporters can message you. You reply when you can. Replies are not guaranteed.',
        },
      },
    ],
  },
  {
    key: 'inner_circle',
    name: 'Inner Circle',
    priceCents: 2500,
    description: 'For your closest supporters. Deeper access, live moments, and a real say.',
    benefits: [
      { label: 'Everything in Backstage', workload: 'low' },
      {
        label: '14-day early access to new music',
        workload: 'low',
        structured: { benefit_type: 'early_access', config: { days_early: 14 } },
      },
      { label: 'Selected stems, instrumentals, or multitracks', workload: 'moderate' },
      {
        label: 'Monthly group livestream, listening party, or Q&A',
        workload: 'high_touch',
        structured: { benefit_type: 'group_live_qa', config: { frequency: 'monthly' } },
        fulfillment: {
          frequency: 'monthly',
          note: 'You commit to hosting one group live session each month. Plan for the time.',
          capacityRecommended: false,
        },
      },
      { label: 'Replay archive', workload: 'low' },
      {
        label: 'Monthly unreleased demo, acoustic version, remix, or alternate version',
        workload: 'moderate',
        fulfillment: { frequency: 'monthly', note: 'You commit to one exclusive audio drop each month.' },
      },
      { label: 'Digital liner notes or song breakdowns', workload: 'moderate' },
      { label: 'Priority voting', workload: 'low' },
      { label: 'Priority consideration for artist replies', workload: 'low' },
      {
        label: '15% shop discount',
        workload: 'low',
        structured: { benefit_type: 'shop_discount', config: { discount_percent: 15 } },
      },
    ],
  },
  {
    key: 'executive',
    name: 'Executive Circle',
    priceCents: 10000,
    description: 'Your top supporters. The deepest access, live face time, and recognition.',
    capacityLimited: true,
    benefits: [
      { label: 'Everything in Inner Circle', workload: 'low' },
      { label: 'Day-zero access to selected unreleased music', workload: 'moderate' },
      { label: 'Work-in-progress access', workload: 'moderate' },
      {
        label: 'Quarterly small-group video call',
        workload: 'high_touch',
        structured: { benefit_type: 'group_live_qa', config: { frequency: 'quarterly' } },
        fulfillment: {
          frequency: 'quarterly',
          note: 'You commit to one small-group video call per quarter. Cap membership so the group stays small.',
          capacityRecommended: true,
        },
      },
      {
        label: 'Quarterly executive listening session',
        workload: 'high_touch',
        fulfillment: {
          frequency: 'quarterly',
          note: 'You commit to one executive listening session per quarter.',
          capacityRecommended: true,
        },
      },
      {
        label: 'Executive Supporter recognition on eligible releases',
        workload: 'low',
        structured: { benefit_type: 'credits_on_releases', config: { role_label: 'Executive Supporter' } },
      },
      {
        label: 'Quarterly exclusive digital bundle',
        workload: 'moderate',
        fulfillment: { frequency: 'quarterly', note: 'You commit to one exclusive digital bundle per quarter.' },
      },
      { label: 'Priority access to limited merch, tickets, drops, and experiences', workload: 'moderate' },
      { label: 'Private creative polls', workload: 'low' },
      {
        label: '20% shop discount',
        workload: 'low',
        structured: { benefit_type: 'shop_discount', config: { discount_percent: 20 } },
      },
      { label: 'Limited membership capacity', workload: 'low' },
    ],
  },
];

export const TIER_TEMPLATE_MAP: Record<string, TierTemplateDef> = Object.fromEntries(
  RECOMMENDED_LADDER.map((t) => [t.key, t]),
);

/** The plain-string benefit list written to subscription_tiers.access_config.benefits. */
export function benefitLabels(tier: TierTemplateDef): string[] {
  return tier.benefits.map((b) => b.label);
}

/** Structured benefits to write to the tier_benefits table (config-driven perks only). */
export function structuredBenefits(
  tier: TierTemplateDef,
): { benefit_type: BenefitType; config: Record<string, unknown> }[] {
  return tier.benefits
    .filter((b) => b.structured)
    .map((b) => ({ benefit_type: b.structured!.benefit_type, config: b.structured!.config ?? {} }));
}

/** High-touch (individually fulfilled) benefits, for the pre-publish workload warning. */
export function highTouchBenefits(tier: TierTemplateDef): TemplateBenefit[] {
  return tier.benefits.filter((b) => b.workload === 'high_touch');
}

/** True when applying this tier should ask the artist to confirm they can fulfill it. */
export function needsFulfillmentConfirm(tier: TierTemplateDef): boolean {
  return tier.benefits.some((b) => b.workload === 'high_touch' || b.fulfillment?.capacityRecommended);
}

/** Which disclaimers apply to a given tier (surfaced in the apply flow). */
export function disclaimersFor(tier: TierTemplateDef): string[] {
  const out: string[] = [];
  if (tier.benefits.some((b) => b.structured?.benefit_type === 'direct_messaging' || /messaging/i.test(b.label))) {
    out.push(MESSAGING_DISCLAIMER);
  }
  if (tier.benefits.some((b) => /executive supporter recognition/i.test(b.label))) {
    out.push(EXECUTIVE_RECOGNITION_DISCLAIMER);
  }
  return out;
}
