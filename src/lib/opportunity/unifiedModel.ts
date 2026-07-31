// The UNIFIED CRWN opportunity model.
//
// Every other calculator in this repo models ONE opportunity in isolation, and each one is honest
// on its own terms. Summing their headlines is not honest, because they are all modeled off the
// SAME audience and most of them resolve to the SAME dollar. Worked example, 500,000 followers,
// each tool's own published formula:
//
//   Streaming Loss  2,250 payers on a $10/$25/$100 ladder ......... $48,645/mo net
//   Vault           7,500 payers at $10 .......................... $75,000/mo
//   Share-to-Earn   6,000 referred subs at $10 .................... $60,000/mo
//   Clip-to-Earn    2,500 subs at $10 ............................. $25,000/mo
//   Exec Producer   1,500 seats at $200 .......................... $300,000/mo
//   Own Your Fans   3,000 payers at $10 ........................... $30,000/mo
//   Live            750 tickets + tips ............................ $12,190/mo
//   -------------------------------------------------------------------------
//   naive total .................................................. $550,835/mo
//
// That total claims 23,500 paying people out of a 500,000 following, when the same repo's own
// audience model says only 2,250 of them ever pay for anything. The Vault alone claims more payers
// than the whole membership model does. So this file does NOT add tool headlines together. It
// rebuilds one layered model in which:
//
//   - there is ONE normalized audience, and ONE unique paying-supporter count;
//   - the membership LADDER is the only recurring offer, and the Vault is a TIER inside it;
//   - Share-to-Earn and Clip-to-Earn are ACQUISITION systems: they move the supporter count and
//     the attribution mix, and produce no revenue line of their own;
//   - incremental purchases are only ever sold to people who are NOT members, so a member is never
//     also counted as a ticket buyer;
//   - fans may hold several roles (sharer, clipper, both), but a person is counted once.
//
// Every rate here is either lifted from an existing repo model (cited inline) or is a documented
// conservative default. Nothing is invented to make the number bigger. All money is INTEGER CENTS.
//
// Financial language rule: this is a PLANNING ESTIMATE of revenue an artist could build. It is not
// money owed, not current revenue, and not a guarantee. `currentDirectRevenueCents` is the only
// figure in the model that describes money that actually exists today, and it is SUBTRACTED, never
// added.

import { RECOMMENDED_TIER_PRICES } from '@/lib/leadCalculator';
import { TIER_LIMITS } from '@/lib/platformTier';

export const UNIFIED_MODEL_VERSION = 'unifiedOpportunity@1';
export const UNIFIED_ASSUMPTIONS_VERSION = 'unifiedAssumptions@1';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type Scenario = 'conservative' | 'expected' | 'high';

/** Where a session sits in the business, which decides whether it is incremental revenue at all. */
export type SessionStructure = 'none' | 'included' | 'ticketed' | 'hybrid';

/** Where the Vault sits. `tier` is the default and produces NO revenue of its own. */
export type VaultPlacement = 'none' | 'tier' | 'standalone';

export interface UnifiedInputs {
  /** Social following, any platform, the artist's own estimate. */
  socialFollowers: number;
  /** Spotify-style monthly listeners. */
  monthlyListeners: number;
  /** Email + SMS contacts the artist actually owns. Treated as a SUBSET of the following. */
  ownedContacts: number;
  /** Fans already paying this artist directly today, anywhere. */
  currentPayingSupporters: number;
  /** Direct-to-fan revenue the artist already earns per month, in cents. Subtracted, never added. */
  currentDirectRevenueCents: number;

  /** Unreleased songs/demos/voice notes. Gates whether a Vault is recommended at all. */
  unreleasedCount: number;

  /** Do fans already share / would they for a reward? Gates Share-to-Earn. */
  fansPromote: 'already' | 'would' | 'unlikely';
  /** How much video/livestream material exists. Gates Clip-to-Earn. */
  videoOutput: 'lots' | 'some' | 'none';
  /** Does the same fan both share and clip? The overlap answer. */
  promoterOverlap?: 'mostly_same' | 'some_overlap' | 'mostly_different' | 'unknown';

  /** Will the artist actually host live events? Gates live + sessions. */
  liveWilling: 'yes' | 'maybe' | 'no';
  /** How the artist wants to structure a premium producer session. */
  sessionStructure: SessionStructure;
  /** Where the Vault lives. Defaults to `tier` (a benefit inside the ladder). */
  vaultPlacement?: VaultPlacement;

  /** Ongoing capacity. Trims what gets recommended, never inflates the money. */
  timeCapacity: 'low' | 'medium' | 'high';
}

export const DEFAULT_INPUTS: UnifiedInputs = {
  socialFollowers: 0,
  monthlyListeners: 0,
  ownedContacts: 0,
  currentPayingSupporters: 0,
  currentDirectRevenueCents: 0,
  unreleasedCount: 0,
  fansPromote: 'would',
  videoOutput: 'none',
  promoterOverlap: 'unknown',
  liveWilling: 'maybe',
  sessionStructure: 'none',
  vaultPlacement: 'tier',
  timeCapacity: 'medium',
};

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

export interface UnifiedAssumptions {
  /** Fraction of a following that is realistically reachable. leadCalculator conservative = 0.15. */
  reachRate: number;
  /** Fraction of the ADDRESSABLE audience that ever pays. leadCalculator conservative = 0.03. */
  superfanRate: number;
  /** Hard ceiling on paying share of the addressable audience, after every acquisition lift. */
  maxConversion: number;

  /** Ladder prices. Identical to RECOMMENDED_TIER_PRICES so the money matches the tiers we build. */
  tier1PriceCents: number;
  tier2PriceCents: number;
  tier3PriceCents: number;
  /** Whale curve. Same 70/22/8 split leadCalculator uses. */
  tier1Share: number;
  tier2Share: number;
  tier3Share: number;
  /** Member one-off spend per member per month. This is the ONLY member spend outside the ladder. */
  memberAlacarteCents: number;

  /** Share-to-Earn: fraction of addressable fans who actively share for a reward. */
  shareRate: number;
  /** New people one sharer puts the artist in front of per month. */
  reachPerSharer: number;
  /** Fraction of that warm referred reach that subscribes. */
  referredConversion: number;
  /** Commission the artist pays a referrer, as a fraction of the referred gross. */
  referralCommissionRate: number;

  /** Clip-to-Earn: fraction of addressable fans who actually clip. */
  clipRate: number;
  /** Relative lift clips apply to the base conversion rate on the EXISTING audience. */
  clipConversionLift: number;
  /** Commission on clip-attributed gross. */
  clipperCommissionRate: number;

  /** Fraction of the SMALLER promoter group that also does the other job. */
  promoterDualRate: number;

  /** Live: fraction of NON-member addressable fans who buy a ticket to one event a month. */
  ticketRate: number;
  ticketPriceCents: number;
  /** Fraction of non-member attendees who tip. */
  tipRate: number;
  tipCents: number;

  /** Producer sessions: fraction of NON-member addressable fans who buy a seat, per month. */
  seatRate: number;
  /** Extra ticketed seats a hybrid session sells beyond the included top-tier members. */
  hybridSeatShare: number;

  /** CRWN platform fee on the recommended plan. Pro = 8. Sourced from platformTier semantics. */
  platformFeePercent: number;
}

/** Seat price bands, lifted verbatim from the Executive Producer Session adapter. */
export function seatPriceForAudience(audience: number): number {
  if (audience >= 1_000_000) return 30000;
  if (audience >= 250_000) return 20000;
  if (audience >= 50_000) return 10000;
  if (audience >= 5_000) return 5000;
  return 2500;
}

// Only the three "feel" knobs move between scenarios, exactly as leadCalculator does it, so the
// conservative / expected / high columns stay internally consistent across every layer instead of
// each layer picking its own aggressiveness.
const SCENARIO_KNOBS: Record<Scenario, Pick<UnifiedAssumptions, 'reachRate' | 'superfanRate' | 'referredConversion'>> = {
  conservative: { reachRate: 0.10, superfanRate: 0.02, referredConversion: 0.015 },
  expected: { reachRate: 0.15, superfanRate: 0.03, referredConversion: 0.02 },
  high: { reachRate: 0.20, superfanRate: 0.05, referredConversion: 0.03 },
};

export function getUnifiedAssumptions(scenario: Scenario = 'expected'): UnifiedAssumptions {
  return {
    ...SCENARIO_KNOBS[scenario],
    maxConversion: 0.10,
    tier1PriceCents: RECOMMENDED_TIER_PRICES.tier1PriceCents,
    tier2PriceCents: RECOMMENDED_TIER_PRICES.tier2PriceCents,
    tier3PriceCents: RECOMMENDED_TIER_PRICES.tier3PriceCents,
    tier1Share: 0.70,
    tier2Share: 0.22,
    tier3Share: 0.08,
    memberAlacarteCents: 300,
    shareRate: 0.03,
    reachPerSharer: 20,
    referralCommissionRate: 0.10,
    clipRate: 0.02,
    clipConversionLift: 0.25,
    clipperCommissionRate: 0.10,
    promoterDualRate: 0.5,
    ticketRate: 0.01,
    ticketPriceCents: 1500,
    tipRate: 0.25,
    tipCents: 500,
    seatRate: 0.003,
    hybridSeatShare: 0.4,
    platformFeePercent: TIER_LIMITS.pro.platformFeePercent,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface AudienceLayer {
  /** The one audience number everything is built on. NOT a sum of platforms. */
  primaryReach: number;
  /** Which input won, so the UI can say so instead of implying a deduplicated total. */
  primaryReachSource: 'followers' | 'listeners' | 'owned' | 'none';
  /** Contacts the artist owns, clamped to primaryReach because they came FROM the following. */
  ownedContacts: number;
  /** Owned contacts (fully reachable) plus a reachRate slice of everyone else. Never exceeds reach. */
  addressable: number;
  /** True when we had two platform numbers and could not dedupe them. Drives the honesty note. */
  crossPlatformOverlapUnknown: boolean;
}

export interface FanSegments {
  /** THE unique paying supporter count. Every recurring dollar in the model comes from this. */
  payingSupporters: number;
  /** Supporters the artist already has. Included in payingSupporters, never added to it. */
  existingSupporters: number;
  /** New supporters this build would add. payingSupporters - existingSupporters, floored at 0. */
  netNewSupporters: number;
  /** Fans who share referral links. */
  sharers: number;
  /** Fans who cut clips. */
  clippers: number;
  /** Fans who do BOTH. Subtracted out of the unique count. */
  dualPromoters: number;
  /** sharers + clippers - dualPromoters. A person, not a role. */
  uniquePromoters: number;
  /** Addressable fans who never become members. The only pool incremental purchases sell to. */
  nonMemberAddressable: number;
  /** New people the sharers put the artist in front of, from OUTSIDE the existing audience. */
  referredReach: number;
}

export interface CoreOffer {
  tiers: { key: string; name: string; priceCents: number; supporters: number; monthlyCents: number }[];
  /** Recurring subscription revenue, gross. */
  subscriptionGrossCents: number;
  /** Member one-off spend. Inside the core layer because it is spend BY MEMBERS. */
  memberAlacarteGrossCents: number;
  grossCents: number;
}

export interface IncrementalItem {
  key: string;
  label: string;
  /** People buying. Always drawn from nonMemberAddressable, never from members. */
  buyers: number;
  unitPriceCents: number;
  grossCents: number;
  /** Why this is genuinely additional, in one line, for the UI. */
  basis: string;
  /** True when the same offer ALSO exists as a member benefit and therefore earns nothing here. */
  includedForMembers: boolean;
}

export interface AcquisitionAttribution {
  organicSupporters: number;
  clipAttributedSupporters: number;
  shareAttributedSupporters: number;
  /** Gross recurring revenue attributed to each channel. A SPLIT of core revenue, never an addition. */
  clipAttributedGrossCents: number;
  shareAttributedGrossCents: number;
  /** Artist-funded commissions on the attributed portion only. */
  clipCommissionCents: number;
  shareCommissionCents: number;
  totalCommissionCents: number;
}

export interface StrategicItem {
  key: string;
  label: string;
  why: string;
}

export type Placement =
  | 'build_now'
  | 'add_next'
  | 'growth_engine'
  | 'inside_membership'
  | 'sell_separately'
  | 'not_yet';

export interface Recommendation {
  key: string;
  label: string;
  placement: Placement;
  /** Does this produce revenue directly, support acquisition, or neither? */
  role: 'revenue' | 'acquisition' | 'validation' | 'retention';
  reason: string;
  /** Monthly gross this recommendation is responsible for, in cents. 0 for non-revenue items. */
  monthlyGrossCents: number;
}

export interface LaunchPhase {
  phase: number;
  title: string;
  detail: string;
  keys: string[];
}

export interface UnifiedResult {
  calculationVersion: string;
  assumptionsVersion: string;
  scenario: Scenario;
  inputs: UnifiedInputs;
  assumptions: UnifiedAssumptions;

  audience: AudienceLayer;
  segments: FanSegments;
  core: CoreOffer;
  incremental: IncrementalItem[];
  incrementalGrossCents: number;
  attribution: AcquisitionAttribution;

  /** Recurring monthly gross (core). Kept separate from one-time on purpose. */
  recurringGrossCents: number;
  /** One-time / per-event monthly gross (incremental). Never merged into the recurring line. */
  oneTimeGrossCents: number;
  totalGrossCents: number;
  platformFeeCents: number;
  contributorCommissionCents: number;
  /** Modeled monthly net to the artist, after platform fee and contributor commissions. */
  netMonthlyCents: number;
  /** Net minus what the artist already earns directly. THE headline. Never negative. */
  netNewMonthlyCents: number;
  netNewAnnualCents: number;

  recommendations: Recommendation[];
  notInTheTotal: StrategicItem[];
  launchSequence: LaunchPhase[];
  /** Plain-language sentences explaining what was deliberately NOT added twice. */
  overlapNotes: string[];
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
const round = Math.round;

function dualRateFor(answer: UnifiedInputs['promoterOverlap'], fallback: number): number {
  switch (answer) {
    case 'mostly_same':
      return 0.8;
    case 'some_overlap':
      return 0.5;
    case 'mostly_different':
      return 0.2;
    default:
      return fallback;
  }
}

/** Layer 1. One audience base. Platform counts are never summed. */
export function normalizeAudience(inputs: UnifiedInputs, a: UnifiedAssumptions): AudienceLayer {
  const followers = num(inputs.socialFollowers);
  const listeners = num(inputs.monthlyListeners);
  const ownedRaw = num(inputs.ownedContacts);

  // A follower on Instagram and a monthly listener on Spotify are very often the same person, and
  // nothing in this repo can tell us how often. Adding them would invent an audience the artist
  // does not have, so we take the LARGER as the one base and say plainly that the overlap between
  // platforms is unknown.
  const primaryReach = Math.max(followers, listeners, ownedRaw);
  const primaryReachSource: AudienceLayer['primaryReachSource'] =
    primaryReach === 0
      ? 'none'
      : primaryReach === followers && followers >= listeners && followers >= ownedRaw
        ? 'followers'
        : primaryReach === listeners && listeners >= ownedRaw
          ? 'listeners'
          : 'owned';

  // Owned contacts came out of that same following, so they are a subset, not an addition.
  const ownedContacts = Math.min(ownedRaw, primaryReach);

  // Inclusion-exclusion: a contact you own is reachable by definition; everyone else is reachable
  // at reachRate. This can never exceed primaryReach, which a sum of the two would.
  const addressable = ownedContacts + (primaryReach - ownedContacts) * a.reachRate;

  return {
    primaryReach,
    primaryReachSource,
    ownedContacts,
    addressable,
    crossPlatformOverlapUnknown: followers > 0 && listeners > 0,
  };
}

/** Is this opportunity even relevant to this artist? Nothing ineligible reaches the total. */
export interface Eligibility {
  vault: boolean;
  shareToEarn: boolean;
  clipToEarn: boolean;
  live: boolean;
  producerSessions: boolean;
  proofOfDemand: boolean;
}

export function evaluateEligibility(inputs: UnifiedInputs): Eligibility {
  const vaultWanted = (inputs.vaultPlacement ?? 'tier') !== 'none';
  return {
    // A Vault with nothing in it is a promise the artist cannot keep, so five pieces is the floor.
    vault: vaultWanted && num(inputs.unreleasedCount) >= 5,
    shareToEarn: inputs.fansPromote !== 'unlikely',
    clipToEarn: inputs.videoOutput !== 'none',
    live: inputs.liveWilling !== 'no',
    producerSessions: inputs.liveWilling !== 'no' && inputs.sessionStructure !== 'none',
    proofOfDemand: true,
  };
}

/** Layer 2. Fan segments. Roles may overlap; PEOPLE are counted once. */
export function buildSegments(
  audience: AudienceLayer,
  inputs: UnifiedInputs,
  a: UnifiedAssumptions,
  eligible: Eligibility,
): FanSegments {
  const addressable = audience.addressable;

  // Promoter pools. A fan can share, clip, or do both, so the union is inclusion-exclusion, not a
  // sum. Without an artist answer we assume half the smaller group does both: real promoters are
  // the same small set of superfans, so treating the groups as independent would overstate how
  // many distinct people are helping.
  const sharers = eligible.shareToEarn ? addressable * a.shareRate : 0;
  const clippers = eligible.clipToEarn ? addressable * a.clipRate : 0;
  const dualRate = dualRateFor(inputs.promoterOverlap, a.promoterDualRate);
  const dualPromoters = Math.min(sharers, clippers) * dualRate;
  const uniquePromoters = sharers + clippers - dualPromoters;

  // Clip-to-Earn does NOT create its own subscribers. Its published formula draws them from the
  // artist's own audience, which is the same pool the membership model already converts. So here it
  // is a LIFT on the conversion rate of that one pool, capped, and it produces no revenue line.
  const clipLift = eligible.clipToEarn ? a.clipConversionLift : 0;
  const liftedRate = Math.min(a.superfanRate * (1 + clipLift), a.maxConversion);
  const organicAndClipPayers = addressable * liftedRate;

  // Share-to-Earn is the one mechanism that reaches people who are NOT already in the audience, so
  // its subscribers are genuinely additional heads. They still join the SAME ladder and are priced
  // by it; there is no separate referral revenue line.
  const referredReach = eligible.shareToEarn ? sharers * a.reachPerSharer : 0;
  const referredPayers = referredReach * a.referredConversion;

  const payingSupporters = organicAndClipPayers + referredPayers;
  const existingSupporters = Math.min(num(inputs.currentPayingSupporters), payingSupporters);

  // Everyone addressable who does not become a member. The ONLY pool incremental offers sell to,
  // which is what stops a member being counted again as a ticket buyer. Referred payers came from
  // OUTSIDE the addressable audience, so they are not subtracted from it.
  const membersFromAddressable = Math.min(addressable, organicAndClipPayers);
  const nonMemberAddressable = Math.max(0, addressable - membersFromAddressable);

  return {
    payingSupporters,
    existingSupporters,
    netNewSupporters: Math.max(0, payingSupporters - existingSupporters),
    sharers,
    clippers,
    dualPromoters,
    uniquePromoters,
    nonMemberAddressable,
    referredReach,
  };
}

/** Layer 3 + 4. ONE membership ladder. The vault is the Gold tier inside it, not a second membership. */
export function buildCoreOffer(
  segments: FanSegments,
  inputs: UnifiedInputs,
  a: UnifiedAssumptions,
  eligible: Eligibility,
): CoreOffer {
  const payers = segments.payingSupporters;
  const placement = inputs.vaultPlacement ?? 'tier';

  // The vault is Gold, tier 2 of the recommended ladder. When the artist has nothing to put in it, that
  // tier does not disappear, its supporters redistribute onto the tiers that do exist, so we never
  // pretend a Vault that cannot be filled is still earning.
  const vaultIsTier = eligible.vault && placement !== 'standalone';
  const shares = vaultIsTier
    ? { t1: a.tier1Share, t2: a.tier2Share, t3: a.tier3Share }
    : { t1: a.tier1Share + a.tier2Share, t2: 0, t3: a.tier3Share };

  const tiers = [
    { key: 'inner_circle', name: 'Silver', priceCents: a.tier1PriceCents, supporters: payers * shares.t1 },
    { key: 'vault', name: 'Gold', priceCents: a.tier2PriceCents, supporters: payers * shares.t2 },
    { key: 'throne', name: 'Platinum', priceCents: a.tier3PriceCents, supporters: payers * shares.t3 },
  ]
    .filter((t) => t.supporters > 0)
    .map((t) => ({ ...t, monthlyCents: round(t.supporters * t.priceCents) }));

  const subscriptionGrossCents = tiers.reduce((sum, t) => sum + t.monthlyCents, 0);
  // A member's occasional extra spend (a stem pack, a signed item, a tip) lives HERE and nowhere
  // else. Incremental offers below sell only to non-members, so no member is charged twice.
  const memberAlacarteGrossCents = round(payers * a.memberAlacarteCents);

  return {
    tiers,
    subscriptionGrossCents,
    memberAlacarteGrossCents,
    grossCents: subscriptionGrossCents + memberAlacarteGrossCents,
  };
}

/** Layer 5. Genuinely incremental purchases. Sold ONLY to people who are not members. */
export function buildIncremental(
  audience: AudienceLayer,
  segments: FanSegments,
  inputs: UnifiedInputs,
  a: UnifiedAssumptions,
  eligible: Eligibility,
): IncrementalItem[] {
  const items: IncrementalItem[] = [];
  const pool = segments.nonMemberAddressable;

  if (eligible.live) {
    const buyers = pool * a.ticketRate;
    items.push({
      key: 'live_tickets',
      label: 'Live event tickets',
      buyers,
      unitPriceCents: a.ticketPriceCents,
      grossCents: round(buyers * a.ticketPriceCents),
      basis: 'Sold only to fans who are not members. Members already have the live in their tier.',
      includedForMembers: true,
    });
    const tippers = buyers * a.tipRate;
    items.push({
      key: 'live_tips',
      label: 'Tips from the room',
      buyers: tippers,
      unitPriceCents: a.tipCents,
      grossCents: round(tippers * a.tipCents),
      basis: 'Voluntary, from the non-member ticket holders in the room. Member tipping already sits in member spend.',
      includedForMembers: false,
    });
  }

  if (eligible.producerSessions) {
    const seatPrice = seatPriceForAudience(audience.primaryReach);
    if (inputs.sessionStructure === 'included') {
      // A session that is a top-tier benefit earns nothing of its own. It is the reason the top
      // tier is worth $100, and that $100 is already counted once in the ladder above.
      items.push({
        key: 'producer_sessions',
        label: 'Executive Producer Sessions',
        buyers: 0,
        unitPriceCents: seatPrice,
        grossCents: 0,
        basis: 'Included in your top tier, so it earns no separate revenue. It is what makes that tier worth its price.',
        includedForMembers: true,
      });
    } else {
      const share = inputs.sessionStructure === 'hybrid' ? a.hybridSeatShare : 1;
      const buyers = pool * a.seatRate * share;
      items.push({
        key: 'producer_sessions',
        label:
          inputs.sessionStructure === 'hybrid'
            ? 'Executive Producer Sessions (extra seats)'
            : 'Executive Producer Session seats',
        buyers,
        unitPriceCents: seatPrice,
        grossCents: round(buyers * seatPrice),
        basis:
          inputs.sessionStructure === 'hybrid'
            ? 'Top-tier members are already in the room for free. Only the extra seats sold to non-members count here.'
            : 'Ticketed seats sold to fans who are not members.',
        includedForMembers: inputs.sessionStructure === 'hybrid',
      });
    }
  }

  return items;
}

/** Layer 6. Who brought the supporters. A SPLIT of core revenue, never an addition to it. */
export function buildAttribution(
  segments: FanSegments,
  core: CoreOffer,
  a: UnifiedAssumptions,
  eligible: Eligibility,
): AcquisitionAttribution {
  const total = segments.payingSupporters;
  const shareAttributed = eligible.shareToEarn ? Math.min(segments.referredReach * a.referredConversion, total) : 0;

  // Clip-attributed heads are the portion of the pool the conversion lift is responsible for. With
  // no lift there are none; the arithmetic below is the lift's share of the lifted rate.
  const lift = eligible.clipToEarn ? a.clipConversionLift : 0;
  const organicAndClip = Math.max(0, total - shareAttributed);
  const clipAttributed = lift > 0 ? organicAndClip * (lift / (1 + lift)) : 0;
  const organic = Math.max(0, organicAndClip - clipAttributed);

  // Revenue per supporter is the blended ladder ARPU. Attribution slices the SAME gross, so the
  // three attributed grosses sum to core gross and never exceed it.
  const arpu = total > 0 ? core.grossCents / total : 0;
  const shareGross = round(shareAttributed * arpu);
  const clipGross = round(clipAttributed * arpu);

  const shareCommission = round(shareGross * a.referralCommissionRate);
  const clipCommission = round(clipGross * a.clipperCommissionRate);

  return {
    organicSupporters: organic,
    clipAttributedSupporters: clipAttributed,
    shareAttributedSupporters: shareAttributed,
    clipAttributedGrossCents: clipGross,
    shareAttributedGrossCents: shareGross,
    clipCommissionCents: clipCommission,
    shareCommissionCents: shareCommission,
    totalCommissionCents: clipCommission + shareCommission,
  };
}

function buildRecommendations(
  inputs: UnifiedInputs,
  eligible: Eligibility,
  core: CoreOffer,
  incremental: IncrementalItem[],
  segments: FanSegments,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const lowCapacity = inputs.timeCapacity === 'low';
  const placement = inputs.vaultPlacement ?? 'tier';

  recs.push({
    key: 'membership_ladder',
    label: 'Your membership ladder',
    placement: 'build_now',
    role: 'revenue',
    reason: 'One coordinated ladder is the whole recurring business. Everything else hangs off it.',
    monthlyGrossCents: core.grossCents,
  });

  if (eligible.vault) {
    recs.push({
      key: 'vault',
      label: 'The Vault',
      placement: placement === 'standalone' ? 'sell_separately' : 'inside_membership',
      role: 'revenue',
      reason:
        placement === 'standalone'
          ? 'You chose to sell the Vault on its own, so it replaces a rung of the ladder rather than sitting inside one.'
          : `Your ${inputs.unreleasedCount} unreleased pieces are what makes the middle tier worth paying for. It is a benefit inside that tier, not a second membership.`,
      monthlyGrossCents: 0,
    });
  } else if ((inputs.vaultPlacement ?? 'tier') !== 'none') {
    recs.push({
      key: 'vault',
      label: 'The Vault',
      placement: 'not_yet',
      role: 'revenue',
      reason: 'A Vault needs material to unlock. Come back to it once you have at least five unreleased pieces.',
      monthlyGrossCents: 0,
    });
  }

  recs.push({
    key: 'share_to_earn',
    label: 'Share-to-Earn',
    placement: eligible.shareToEarn ? 'growth_engine' : 'not_yet',
    role: 'acquisition',
    reason: eligible.shareToEarn
      ? 'It brings new people to the ladder you already built. Its revenue is inside the membership number, not on top of it.'
      : 'Your fans are not sharing yet. Build the offer first, then give them a reason.',
    monthlyGrossCents: 0,
  });

  recs.push({
    key: 'clip_to_earn',
    label: 'Clip-to-Earn',
    placement: eligible.clipToEarn ? (lowCapacity ? 'add_next' : 'growth_engine') : 'not_yet',
    role: 'acquisition',
    reason: eligible.clipToEarn
      ? 'Clips convert fans you already reach. It raises how many of them pay, it does not create a separate income stream.'
      : 'You do not have enough video or livestream material for fans to clip yet.',
    monthlyGrossCents: 0,
  });

  const sessions = incremental.find((i) => i.key === 'producer_sessions');
  if (eligible.producerSessions && sessions) {
    recs.push({
      key: 'producer_sessions',
      label: 'Executive Producer Sessions',
      placement: inputs.sessionStructure === 'included' ? 'inside_membership' : 'sell_separately',
      role: 'revenue',
      reason: sessions.basis,
      monthlyGrossCents: sessions.grossCents,
    });
  } else {
    recs.push({
      key: 'producer_sessions',
      label: 'Executive Producer Sessions',
      placement: 'not_yet',
      role: 'revenue',
      reason: 'These need you in the room on a schedule. Not worth promising until you want to host.',
      monthlyGrossCents: 0,
    });
  }

  const tickets = incremental.find((i) => i.key === 'live_tickets');
  recs.push({
    key: 'live',
    label: 'Ticketed live events',
    placement: eligible.live ? (lowCapacity ? 'add_next' : 'sell_separately') : 'not_yet',
    role: 'revenue',
    reason: eligible.live
      ? 'Only the fans who are not members buy a ticket. Members already have it in their tier, so they are not counted twice.'
      : 'You said live is not for you right now, so nothing here assumes you will host one.',
    monthlyGrossCents: tickets ? tickets.grossCents + (incremental.find((i) => i.key === 'live_tips')?.grossCents ?? 0) : 0,
  });

  recs.push({
    key: 'proof_of_demand',
    label: 'Proof of Demand',
    placement: 'add_next',
    role: 'validation',
    reason: 'Test an idea with a free RSVP before you build it. It makes no money by design, so it is not in the total.',
    monthlyGrossCents: 0,
  });

  if (segments.uniquePromoters > 0) {
    recs.push({
      key: 'fan_missions',
      label: 'Fan missions',
      placement: 'add_next',
      role: 'retention',
      reason: 'Gives your promoters something specific to do. It supports the acquisition systems rather than earning on its own.',
      monthlyGrossCents: 0,
    });
  }

  return recs;
}

function buildLaunchSequence(eligible: Eligibility, inputs: UnifiedInputs): LaunchPhase[] {
  const phases: LaunchPhase[] = [
    {
      phase: 1,
      title: 'Launch the membership',
      detail: 'Publish the ladder with your free front door and your paid tiers. Nothing else works until fans have somewhere to pay.',
      keys: ['membership_ladder', ...(eligible.vault ? ['vault'] : [])],
    },
  ];
  let n = 2;
  if (eligible.shareToEarn) {
    phases.push({
      phase: n++,
      title: 'Turn your fans into promoters',
      detail: 'Switch on Share-to-Earn so every fan has a link and a reason to use it. This feeds the ladder you just built.',
      keys: ['share_to_earn'],
    });
  }
  if (eligible.clipToEarn) {
    phases.push({
      phase: n++,
      title: 'Put your content to work',
      detail: 'Open Clip-to-Earn so your streams and releases become a clip library. It raises how many of the fans you already reach convert.',
      keys: ['clip_to_earn'],
    });
  }
  if (eligible.live || eligible.producerSessions) {
    phases.push({
      phase: n++,
      title: 'Add the premium experience',
      detail:
        inputs.sessionStructure === 'included'
          ? 'Run the session as the top-tier benefit it is. It sells the tier rather than a ticket.'
          : 'Schedule one ticketed night a month and sell the seats your members do not already have.',
      keys: ['live', 'producer_sessions'],
    });
  }
  phases.push({
    phase: n,
    title: 'Validate before you build again',
    detail: 'Run a Proof of Demand test before funding the next project, so the next thing you make is already spoken for.',
    keys: ['proof_of_demand'],
  });
  return phases;
}

function buildNotInTheTotal(eligible: Eligibility, segments: FanSegments): StrategicItem[] {
  const items: StrategicItem[] = [
    {
      key: 'proof_of_demand',
      label: 'Proof of Demand',
      why: 'It is a free RSVP test. It takes no money by design, so putting a dollar on it would be inventing one.',
    },
    {
      key: 'retention',
      label: 'Keeping the members you get',
      why: 'Retention decides whether this number holds past month three, but the model has no churn figure from you, so it is not priced in.',
    },
  ];
  if (segments.uniquePromoters > 0) {
    items.push({
      key: 'fan_missions',
      label: 'Fan missions and squads',
      why: 'They make your promoters more effective. That effect is already inside the acquisition numbers, so counting missions again would be counting it twice.',
    });
  }
  items.push({
    key: 'royalties',
    label: 'Royalties you may not be collecting',
    why: 'That is money already earned somewhere else, not money this build creates. It belongs to the Royalty Readiness Check, not to this total.',
  });
  if (!eligible.live) {
    items.push({
      key: 'live',
      label: 'Live events',
      why: 'You said live is not for you right now, so nothing here assumes ticket income you have not agreed to earn.',
    });
  }
  items.push({
    key: 'sponsorship',
    label: 'Brand and sponsor money',
    why: 'CRWN does not run sponsorships, and we have no inputs that would make a sponsor figure honest.',
  });
  return items;
}

function buildOverlapNotes(segments: FanSegments, eligible: Eligibility, inputs: UnifiedInputs, audience: AudienceLayer): string[] {
  const notes: string[] = [];
  if (audience.crossPlatformOverlapUnknown) {
    notes.push(
      'Your followers and your monthly listeners are probably many of the same people, and there is no way to tell how many. We used the larger number as one audience instead of adding them together.',
    );
  }
  if (segments.dualPromoters >= 1) {
    notes.push(
      `About ${Math.round(segments.dualPromoters).toLocaleString('en-US')} of your fans would both share your links and cut clips. They count once as people, even though they can help in two ways.`,
    );
  }
  if (eligible.shareToEarn || eligible.clipToEarn) {
    notes.push(
      'Share-to-Earn and Clip-to-Earn are how supporters arrive, not a second place they pay. Their revenue is already inside your membership number, so it is not added again.',
    );
  }
  if (eligible.vault && (inputs.vaultPlacement ?? 'tier') !== 'standalone') {
    notes.push('Your Vault is a tier inside the membership, so it is not counted as a separate subscription on top of it.');
  }
  if (eligible.live || eligible.producerSessions) {
    notes.push(
      'Tickets and seats are only counted for fans who are not members. Members already have access through their tier, so no member is counted again as a buyer.',
    );
  }
  notes.push('Recurring monthly revenue and one-off event revenue are kept apart, and every figure is gross until the fee and commission lines.');
  return notes;
}

/** Run the whole layered model. This is the only entry point callers should use. */
export function calculateUnifiedOpportunity(
  raw: Partial<UnifiedInputs>,
  scenario: Scenario = 'expected',
): UnifiedResult {
  const inputs: UnifiedInputs = { ...DEFAULT_INPUTS, ...raw };
  const a = getUnifiedAssumptions(scenario);

  const eligible = evaluateEligibility(inputs);
  const audience = normalizeAudience(inputs, a);
  const segments = buildSegments(audience, inputs, a, eligible);
  const core = buildCoreOffer(segments, inputs, a, eligible);
  const incremental = buildIncremental(audience, segments, inputs, a, eligible);
  const attribution = buildAttribution(segments, core, a, eligible);

  const recurringGrossCents = core.grossCents;
  const oneTimeGrossCents = incremental.reduce((sum, i) => sum + i.grossCents, 0);
  const totalGrossCents = recurringGrossCents + oneTimeGrossCents;

  // Fee once, on the whole gross. Commission is artist-funded on top of the fee and only on the
  // attributed slice, matching how checkout actually charges an attributedCut.
  const platformFeeCents = round(totalGrossCents * (a.platformFeePercent / 100));
  const contributorCommissionCents = Math.min(
    attribution.totalCommissionCents,
    Math.max(0, totalGrossCents - platformFeeCents),
  );
  const netMonthlyCents = totalGrossCents - platformFeeCents - contributorCommissionCents;
  const netNewMonthlyCents = Math.max(0, netMonthlyCents - num(inputs.currentDirectRevenueCents));

  return {
    calculationVersion: UNIFIED_MODEL_VERSION,
    assumptionsVersion: UNIFIED_ASSUMPTIONS_VERSION,
    scenario,
    inputs,
    assumptions: a,
    audience,
    segments,
    core,
    incremental,
    incrementalGrossCents: oneTimeGrossCents,
    attribution,
    recurringGrossCents,
    oneTimeGrossCents,
    totalGrossCents,
    platformFeeCents,
    contributorCommissionCents,
    netMonthlyCents,
    netNewMonthlyCents,
    netNewAnnualCents: netNewMonthlyCents * 12,
    recommendations: buildRecommendations(inputs, eligible, core, incremental, segments),
    notInTheTotal: buildNotInTheTotal(eligible, segments),
    launchSequence: buildLaunchSequence(eligible, inputs),
    overlapNotes: buildOverlapNotes(segments, eligible, inputs, audience),
  };
}

/** The three columns, run off one set of inputs so they stay internally consistent. */
export function calculateScenarioBand(raw: Partial<UnifiedInputs>): Record<Scenario, UnifiedResult> {
  return {
    conservative: calculateUnifiedOpportunity(raw, 'conservative'),
    expected: calculateUnifiedOpportunity(raw, 'expected'),
    high: calculateUnifiedOpportunity(raw, 'high'),
  };
}
