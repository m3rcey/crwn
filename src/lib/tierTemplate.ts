// Recommended four-tier membership ladder (Rise Mode Level 3).
//
// The Wave / Inner Circle / The Vault / Throne, the SAME four tiers the Streaming
// Loss calculator ("/worth") shows, so the money the calculator promises is the
// money the ladder actually builds. Prices match: Free / $10 / $25 / $100.
//
// This is DATA the Tier Manager consumes to offer a one-tap recommended ladder.
// It never bypasses plan limits: the free "The Wave" tier does not count against
// the paid-tier cap (see platformTier.ts Option-2 counting), and the paid tiers
// are applied only up to the artist's plan allowance.
//
// The recurring commitments are deliberately light: the paid tiers are built from
// content the artist already has. The Vault sells a MONTHLY VAULT UNLOCK from the
// existing backlog (schedule old demos, snippets, notes; not "make something new"),
// and Throne sells a QUARTERLY private group listening event that serves every
// member at once (no one-on-one calls). Those two are the only scheduled promises,
// and each auto-populates the Promise Calendar on apply (see tierObligations.ts).
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
  key: 'wave' | 'inner_circle' | 'vault' | 'throne';
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
    key: 'wave',
    name: 'The Wave',
    priceCents: 0,
    description: 'Your free front door. The easiest way for new fans to join and stay close.',
    benefits: [
      { label: 'Free tracks and public posts', workload: 'low' },
      { label: 'Join the community', workload: 'low' },
      { label: 'New music after the paid early-access windows', workload: 'low' },
      { label: 'Public livestream access', workload: 'low' },
      { label: 'Join public fan missions', workload: 'low' },
    ],
  },
  {
    key: 'inner_circle',
    name: 'Inner Circle',
    priceCents: 1000,
    description: 'For fans who want in. Exclusives, early access, and a real say.',
    benefits: [
      { label: 'Everything in The Wave', workload: 'low' },
      { label: 'Exclusive tracks and demos', workload: 'moderate' },
      {
        label: '7-day early access to new music',
        workload: 'low',
        structured: { benefit_type: 'early_access', config: { days_early: 7 } },
      },
      { label: 'Private community posts', workload: 'low' },
      { label: 'Member-only livestream replays', workload: 'low' },
      { label: 'Vote on cover art, snippets, and future drops', workload: 'low' },
      {
        label: '10% shop discount',
        workload: 'low',
        structured: { benefit_type: 'shop_discount', config: { discount_percent: 10 } },
      },
    ],
  },
  {
    key: 'vault',
    name: 'The Vault',
    priceCents: 2500,
    description: 'For your closest supporters. Your private archive, unlocked a little at a time.',
    benefits: [
      { label: 'Everything in Inner Circle', workload: 'low' },
      { label: 'Unreleased songs and alternate versions', workload: 'moderate' },
      {
        label: '14-day early access to new music',
        workload: 'low',
        structured: { benefit_type: 'early_access', config: { days_early: 14 } },
      },
      { label: 'Full archive of private music and content', workload: 'low' },
      {
        // The defining scheduled promise. Maps to a monthly Promise Calendar
        // obligation titled "Monthly Vault unlock" via the config below.
        label: 'Monthly Vault unlock from your backlog',
        workload: 'moderate',
        structured: {
          benefit_type: 'exclusive_posts',
          config: { frequency: 'monthly', obligation_title: 'Monthly Vault unlock' },
        },
        fulfillment: {
          frequency: 'monthly',
          note: 'You schedule one unlock a month from your existing backlog: an old demo, a snippet, a photo, a note. Not something new every month.',
        },
      },
      { label: 'Private listening-party replays', workload: 'low' },
      { label: 'Priority voting on releases, artwork, and merch', workload: 'low' },
      { label: 'Early access to tickets, merch, and limited drops', workload: 'moderate' },
      {
        label: '15% shop discount',
        workload: 'low',
        structured: { benefit_type: 'shop_discount', config: { discount_percent: 15 } },
      },
    ],
  },
  {
    key: 'throne',
    name: 'Throne',
    priceCents: 10000,
    description: 'Your top supporters. Status, scarcity, and a seat at the table.',
    capacityLimited: true,
    benefits: [
      { label: 'Everything in The Vault', workload: 'low' },
      { label: 'Day-0 or private first listen', workload: 'moderate' },
      { label: 'Limited number of memberships', workload: 'low' },
      {
        label: 'Name in supporter or executive producer credits',
        workload: 'low',
        structured: { benefit_type: 'credits_on_releases', config: { role_label: 'Executive Supporter' } },
      },
      { label: 'Permanent Throne badge in your community', workload: 'low' },
      { label: 'Highest priority for ticket and merch drops', workload: 'moderate' },
      {
        // The one Throne-specific scheduled promise. A quarterly group event
        // serves every Throne member at once, so it replaces one-on-one calls.
        label: 'Private group listening events',
        workload: 'high_touch',
        structured: {
          benefit_type: 'group_live_qa',
          config: { frequency: 'quarterly', obligation_title: 'Private group listening event' },
        },
        fulfillment: {
          frequency: 'quarterly',
          note: 'You host one private group listening event each quarter. You serve every Throne member at once, so it replaces one-on-one calls. Cap membership so the room stays small.',
          capacityRecommended: true,
        },
      },
      { label: 'Vote on which songs, videos, or products get released', workload: 'low' },
      { label: 'Private artist roadmap and progress updates', workload: 'low' },
      {
        label: '20% shop discount',
        workload: 'low',
        structured: { benefit_type: 'shop_discount', config: { discount_percent: 20 } },
      },
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
  if (
    tier.benefits.some(
      (b) =>
        b.structured?.benefit_type === 'credits_on_releases' ||
        /executive supporter recognition|supporter or executive producer credits/i.test(b.label),
    )
  ) {
    out.push(EXECUTIVE_RECOGNITION_DISCLAIMER);
  }
  return out;
}
