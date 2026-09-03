/**
 * GB The G1ft's founder-approved tier card content, as a checked-in SNAPSHOT.
 *
 * This is a mirror for verification, NOT a writer. Nothing imports it to seed production;
 * the live values are `subscription_tiers.access_config.benefits` on GB's four tiers, and
 * `scripts/probe-gb-benefits.mjs` prints what production actually holds.
 *
 * It exists because on 2026-09-03 GB's public cards were showing generic ladder defaults
 * from `tier_benefits` ("7-day early access to new music", "Exclusive Albums", '"JR"
 * community badge', "20% shop discount", "Name on Supporter Wall") ABOVE this approved
 * offer. Those 23 rows were deleted (`scripts/clean-gb-tier-benefits.mjs`). The test beside
 * this file pins the promises GB's ladder is allowed to make, so a future template apply or
 * copy edit that reintroduces one fails `npm test`.
 *
 * The one deliberate absence is a FIXED early-access day count. GB's Silver promises
 * "Finished songs before they go public" with no number attached, because no number was
 * approved and `tier_benefits.config.days_early` is what the release waterfall would
 * actually execute. A number here would schedule a promise nobody made.
 */

export const GB_TIER_PROMISES: Record<string, string> = {
  Bronze: 'Be early.',
  Silver: 'Go backstage.',
  Gold: "Help shape GB's music before the public hears it.",
  Platinum: 'Put your own ideas in the room while GB is creating.',
};

export const GB_TIER_PRICES_CENTS: Record<string, number> = {
  Bronze: 0,
  Silver: 1000,
  Gold: 2500,
  Platinum: 5000,
};

export const GB_APPROVED_BENEFITS: Record<string, string[]> = {
  Bronze: [
    'Go Bad, yours the moment you join',
    'First word on every new drop',
    'Day One recognition',
    'Story continuations and drops as GB releases them',
  ],
  Silver: [
    'Everything in Bronze',
    'Finished songs before they go public',
    'Private behind the scenes',
    'Alternate versions and members only music',
    'Extended stories and the fuller context',
    'Song and video commentary',
    'Stems',
  ],
  Gold: [
    'Everything in Silver',
    'Vote on the songs before anyone hears them',
    'The Vault, unreleased music as GB adds it',
    'Watch Executive Producer Sessions',
    'A say in selected creative decisions',
    'Priority on the polls and projects GB opens',
  ],
  Platinum: [
    'Everything in Gold',
    'Send beats for consideration',
    'Send vocals and hooks for consideration',
    'Send ideas and references for consideration',
    'Platinum only and final round decisions when GB uses them',
    'Platinum recognition',
    'Group Q and A when GB opens one',
    'Selected Executive Producer submission opportunities',
    'Submission windows as GB opens them',
  ],
};

/**
 * Promises GB's ladder must never make again. Each was on a live card and none was approved:
 * the day counts were ladder-template defaults, the badges and the wall render nothing
 * anywhere in CRWN, and GB sells no products for a shop discount to apply to.
 */
export const GB_FORBIDDEN_BENEFIT_PHRASES = [
  '7-day early access',
  '14-day early access',
  '21-day early access',
  'day early access',
  'Exclusive Albums',
  'Exclusive Tracks',
  'Exclusive Community Posts',
  'shop discount',
  'Name on Supporter Wall',
  'community badge',
  '1-on-1',
  'unlimited DM',
  'royalt',
  'ownership',
] as const;
