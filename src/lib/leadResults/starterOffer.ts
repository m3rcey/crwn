// The starter-offer recommendation: one explainable answer to "what should I launch,
// what should I charge, and what do I do next?"
//
// Deterministic rules over data the artist already gave us (their claimed calculator
// result) plus what their account already has (tiers, tracks, products, plan). No LLM,
// no new tables, no writes: derived on read, exactly like leadMagnetMissions. The seed's
// conversionPayload supplies prices where the calculator modeled them; the recommended
// ladder template supplies defaults, so there is no third copy of the tier prices.
//
// Overlap rules honored (docs/crwn-brain 07-BUSINESS-RULES §14):
//  - One monthly figure per recommendation, from monthlyCentsOf (never a sum of tools).
//  - Share-to-Earn and missions are ACQUISITION for the same membership, never a second
//    income stream stacked on top. The overlap note says so in plain language.
//  - When confidence is low, recommend the smallest testable offer, not a menu.
//
// Plan rules honored: every plan allows the full 3-paid-tier ladder, so a membership is
// always a valid recommendation. Ticketed lives and producer sessions need Pro
// (allowsLive); on Free the recommendation falls back to the membership and explains the
// constraint instead of making the upgrade the first outcome.

import type { LeadMagnetSeed } from './handoffSeed';
import { monthlyCentsOf } from './leadMagnetMissions';
import { buildDraftConfig, postSetupDestination } from './postSetupDestination';
import { RECOMMENDED_LADDER, TIER_TEMPLATE_MAP, benefitLabels } from '@/lib/tierTemplate';
import { getTierLimits } from '@/lib/platformTier';

const RISE_ROUTE = '/profile/artist';

export type StarterOfferKind =
  | 'membership'
  | 'vault_tier'
  | 'membership_share'
  | 'producer_session'
  | 'live_experience'
  | 'fan_capture'
  | 'demand_test';

export type StarterOfferConfidence = 'high' | 'medium' | 'low';

export interface StarterOfferAction {
  label: string;
  href?: string;
}

export interface StarterOfferInput {
  /** Claimed results, newest first (getClaimedResults order). Empty for no-context artists. */
  seeds: LeadMagnetSeed[];
  /** artist_profiles.platform_tier. */
  platformTier: string | null;
  /** Active tiers with price > 0 (the canonical Option-2 paid count). */
  paidTierCount: number;
  /** Active tier at price 0 exists (the free Bronze front door). */
  hasFreeTier: boolean;
  hasTrack: boolean;
  productCount: number;
  /** null = unknown (never block on Stripe status). */
  stripeConnected: boolean | null;
  /** Public slug for preview links. */
  artistSlug?: string | null;
}

export interface StarterOffer {
  kind: StarterOfferKind;
  /** The CRWN feature this maps to, e.g. "Membership". */
  featureLabel: string;
  /** Draft offer name, e.g. "Silver". */
  offerName: string;
  /** Integer cents. 0 for the free fan-capture front door. */
  priceCents: number;
  priceLabel: string;
  cadence: 'monthly' | 'one_time';
  audience: string;
  benefits: string[];
  fulfillment: 'low' | 'moderate' | 'high_touch';
  fulfillmentNote: string;
  why: string;
  /** The single revealed monthly figure from the artist's own calculator. Never summed. */
  monthlyCents: number | null;
  monthlyLabel: string | null;
  overlapNote: string | null;
  constraintNote: string | null;
  missing: string[];
  /** Exactly three, in order. */
  nextActions: StarterOfferAction[];
  /** Prefilled builder deep link; finishing there returns to Rise Mode. */
  builderHref: string;
  toolSlug: string | null;
  toolName: string | null;
  resultId: string | null;
  confidence: StarterOfferConfidence;
  /** The artist already has a live paid offer; the card renders grow mode. */
  alreadyLaunched: boolean;
}

function fmtDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function fmtMonthly(cents: number): string {
  return `${fmtDollars(cents)}/mo`;
}

/** Positive finite number or null. */
function positive(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

interface LadderTier {
  name: string;
  priceCents: number;
  projectedSubs?: number;
}

function ladderOf(seed: LeadMagnetSeed | null): LadderTier[] {
  const raw = seed?.conversionPayload?.ladder;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is LadderTier => !!t && typeof t === 'object' && typeof (t as LadderTier).name === 'string',
  );
}

/**
 * The one seed the recommendation is built from: the builder-mapped result with the
 * biggest modeled monthly, newest on ties. Falls back to the newest unmapped result so a
 * score-only tool still personalizes the copy. Null when nothing was claimed.
 */
export function pickPrimarySeed(seeds: LeadMagnetSeed[]): LeadMagnetSeed | null {
  if (!seeds.length) return null;
  const mapped = seeds.filter((s) => buildDraftConfig(s) !== null);
  const pool = mapped.length ? mapped : seeds;
  // Input is newest-first; a stable sort keeps the newest on equal monthly figures.
  return [...pool].sort((a, b) => (monthlyCentsOf(b) ?? 0) - (monthlyCentsOf(a) ?? 0))[0];
}

/** Prefilled builder URL for a seed (or the plain offer builder), returning to Rise Mode. */
function builderHrefFor(seed: LeadMagnetSeed | null): string {
  if (seed) {
    const dest = postSetupDestination(seed);
    if (dest) {
      const qs = new URLSearchParams({ ...dest.params, returnTo: RISE_ROUTE }).toString();
      return `${dest.path}?${qs}`;
    }
  }
  return `/offers/new?returnTo=${encodeURIComponent(RISE_ROUTE)}`;
}

/** Membership builder URL prefilled from the template entry tier, keeping the seed's banner. */
function membershipHrefFor(seed: LeadMagnetSeed | null): string {
  const entry = TIER_TEMPLATE_MAP.inner_circle;
  const params: Record<string, string> = {
    lm_prefill: '1',
    lm_goal: 'grow-supporters',
    lm_tier_name: entry.name,
    lm_price: String(Math.round(entry.priceCents / 100)),
    returnTo: RISE_ROUTE,
  };
  if (seed) {
    params.lm_tool = seed.toolSlug;
    params.lm_tool_name = seed.toolName;
    params.lm_result = seed.resultId;
  }
  return `/offers/new?${new URLSearchParams(params).toString()}`;
}

function trimEverything(labels: string[]): string[] {
  return labels.filter((l) => !/^everything in /i.test(l)).slice(0, 5);
}

/** What the account still needs before the offer can earn. */
function missingOf(input: StarterOfferInput): string[] {
  const out: string[] = [];
  if (!input.hasTrack) out.push('Upload one track so your page has something to hear');
  if (input.stripeConnected === false) out.push('Connect Stripe so fans can actually pay you');
  if (!input.hasFreeTier) out.push('Create your free front door so new fans can join for $0');
  return out;
}

function nextActionsOf(input: StarterOfferInput, builderHref: string, launched: boolean): StarterOfferAction[] {
  const slug = input.artistSlug ? `/${input.artistSlug}` : null;
  if (launched) {
    return [
      { label: 'Invite your first 10 fans with your page link', ...(slug ? { href: slug } : {}) },
      { label: 'Add the next tier of your ladder', href: '/account/tiers' },
      { label: 'Review your offer draft', href: builderHref },
    ];
  }
  const second: StarterOfferAction =
    input.stripeConnected === false
      ? { label: 'Connect Stripe to get paid' }
      : { label: 'Preview your page as a fan', ...(slug ? { href: slug } : {}) };
  return [
    { label: 'Finish the offer draft', href: builderHref },
    second,
    { label: 'Invite your first 10 fans with your page link', ...(slug ? { href: slug } : {}) },
  ];
}

/**
 * Build the one starter-offer recommendation for this artist. Pure and deterministic:
 * the same inputs always produce the same offer, price, and copy.
 */
export function buildStarterOffer(input: StarterOfferInput): StarterOffer {
  const seed = pickPrimarySeed(input.seeds);
  const cp = (seed?.conversionPayload ?? {}) as Record<string, unknown>;
  const monthlyCents = seed ? monthlyCentsOf(seed) : null;
  const monthlyLabel = monthlyCents ? fmtMonthly(monthlyCents) : null;
  const launched = input.paidTierCount > 0;
  const allowsLive = getTierLimits(input.platformTier).allowsLive;
  const entry = TIER_TEMPLATE_MAP.inner_circle;
  const vault = TIER_TEMPLATE_MAP.vault;

  const base = {
    monthlyCents,
    monthlyLabel,
    toolSlug: seed?.toolSlug ?? null,
    toolName: seed?.toolName ?? null,
    resultId: seed?.resultId ?? null,
    missing: missingOf(input),
    alreadyLaunched: launched,
    constraintNote: null as string | null,
    overlapNote: null as string | null,
  };

  const finish = (
    core: Omit<
      StarterOffer,
      | 'monthlyCents'
      | 'monthlyLabel'
      | 'toolSlug'
      | 'toolName'
      | 'resultId'
      | 'missing'
      | 'alreadyLaunched'
      | 'nextActions'
      | 'priceLabel'
    > & { priceLabel?: string },
  ): StarterOffer => ({
    ...base,
    ...core,
    priceLabel:
      core.priceLabel ??
      (core.cadence === 'monthly' ? `${fmtDollars(core.priceCents)}/mo` : `${fmtDollars(core.priceCents)} each`),
    nextActions: nextActionsOf(input, core.builderHref, launched),
  });

  // The default: an entry paid membership, priced by the artist's own ladder when the
  // calculator modeled one, otherwise by the recommended ladder template.
  const membership = (over: Partial<Parameters<typeof finish>[0]> = {}): StarterOffer => {
    const ladder = ladderOf(seed);
    const first = ladder[0];
    const priceCents = positive(first?.priceCents) ?? entry.priceCents;
    const payers = positive(cp.payers);
    const why = monthlyLabel
      ? `Your ${seed?.toolName ?? 'calculator'} numbers put ${
          payers ? `about ${Math.round(payers).toLocaleString('en-US')} fans` : 'your most engaged fans'
        } in range to pay you directly. Until this membership exists, the ${monthlyLabel} you saw stays a screenshot, not income.`
      : 'This is the smallest offer that proves fans will pay you directly. One entry tier, built from content you already have. Every week without it, that support goes nowhere.';
    return finish({
      kind: 'membership',
      featureLabel: 'Membership',
      offerName: first?.name || entry.name,
      priceCents,
      cadence: 'monthly',
      audience: 'Your most engaged fans: the ones already liking, commenting, and asking for more',
      benefits: trimEverything(benefitLabels(entry)),
      fulfillment: 'low',
      fulfillmentNote: 'Built from content you already have. No new weekly obligations.',
      why,
      builderHref: builderHrefFor(seed),
      confidence: seed ? (first || monthlyCents ? 'high' : 'medium') : 'low',
      constraintNote: base.constraintNote,
      overlapNote: base.overlapNote,
      ...over,
    });
  };

  switch (seed?.toolSlug) {
    case 'worth':
    case 'opportunity-calculator':
      return membership();

    // Membership Stack Consolidator: the consolidated ladder IS the membership, with the
    // avatar-specific framing (recreate what members already pay for, invite them personally).
    case 'fan-stack-calculator':
      return membership({
        featureLabel: 'Consolidated membership',
        audience: 'Your existing paid members first, then the fans not yet paying anywhere',
        fulfillmentNote:
          'Rebuilt from benefits your members already get today. Nothing migrates automatically, and their current subscriptions are untouched until they choose to move.',
        why: monthlyLabel
          ? `Your stack numbers put about ${monthlyLabel} a month in consolidated support on the table. Until the one-place membership exists, every fan you already converted stays split across tools that cannot see each other.`
          : 'Your members already pay you in pieces across separate tools. One consolidated ladder is the offer they move to, and it is built from benefits you already deliver.',
        overlapNote:
          'The consolidated ladder replaces your scattered memberships; it never stacks on top of them. Members who move are the same members, counted once.',
      });

    // Touring Access Seller: one recurring VIP tier built from access the artist already controls.
    case 'between-tour-calculator': {
      const vipPrice = positive(cp.priceCents) ?? vault.priceCents;
      return finish({
        kind: 'membership',
        featureLabel: 'VIP membership',
        offerName: typeof cp.tierName === 'string' && cp.tierName ? cp.tierName : vault.name,
        priceCents: vipPrice,
        cadence: 'monthly',
        audience: 'Your VIP buyers and show audiences: fans who already paid for access once',
        benefits: [
          'Early ticket access and member presales',
          'Member-only tour updates first',
          'Backstage and soundcheck content',
          'A member livestream in the off months',
        ],
        fulfillment: 'moderate',
        fulfillmentNote: 'One member stream a month and presale access. Promises a touring schedule can keep.',
        why: monthlyLabel
          ? `Your show numbers put about ${monthlyLabel} a month in between-tour membership on the table. Every off-month without the tier is a month your proven VIP buyers have nothing to pay for.`
          : 'Your VIP buyers proved they pay for access. The recurring tier is the year-round version of what they already bought once.',
        overlapNote:
          'Members get the off-month streams inside the tier. One-off tickets are only ever sold to fans who are not members, so nobody pays twice.',
        builderHref: builderHrefFor(seed),
        confidence: positive(cp.priceCents) || monthlyCents ? 'high' : 'medium',
        constraintNote: null,
      });
    }

    case 'vault-revenue-planner': {
      const priceCents = positive(cp.priceCents) ?? vault.priceCents;
      return finish({
        kind: 'vault_tier',
        featureLabel: 'Vault membership',
        offerName: typeof cp.tierName === 'string' && cp.tierName ? cp.tierName : vault.name,
        priceCents,
        cadence: 'monthly',
        audience: 'Day-one fans who want everything you have not released',
        benefits: trimEverything(benefitLabels(vault)),
        fulfillment: 'moderate',
        fulfillmentNote: 'One Vault unlock a month from your existing backlog. Not something new every month.',
        why: monthlyLabel
          ? `Your unreleased catalog is already worth ${monthlyLabel} a month to your closest fans. Every month it sits on your drive, that money stays uncollected.`
          : 'Your unreleased catalog is the offer. Fans pay for access to what already exists, so there is nothing new to produce.',
        overlapNote:
          'Your vault can later become one benefit inside a bigger membership ladder. Start it as its own tier; do not count it twice.',
        builderHref: builderHrefFor(seed),
        confidence: positive(cp.priceCents) || monthlyCents ? 'high' : 'medium',
        constraintNote: null,
      });
    }

    case 'share-to-earn-planner':
      return membership({
        kind: 'membership_share',
        featureLabel: 'Membership with Share-to-Earn',
        overlapNote:
          'Share-to-Earn grows this membership. Referred fans become the same members counted above, so this is one income stream with a growth engine attached, not two incomes.',
        why: monthlyLabel
          ? `Your fans are ready to recruit for you, but they need a membership to send people into. Until it exists, the ${monthlyLabel} you saw in referred support has nowhere to land.`
          : 'Your fans are ready to recruit for you, but they need a membership to send people into. Build the entry tier first, then turn on the share program.',
      });

    case 'executive-producer-session': {
      if (!allowsLive) {
        return membership({
          constraintNote:
            'Ticketed sessions need Pro live tools. Start with the membership so money can move now; the Executive Producer Session becomes your first move after upgrading.',
          confidence: 'medium',
          builderHref: membershipHrefFor(seed),
        });
      }
      const priceCents = positive(cp.ticketPriceCents) ?? 5000;
      return finish({
        kind: 'producer_session',
        featureLabel: 'Executive Producer Session',
        offerName: 'Executive Producer Session',
        priceCents,
        priceLabel: `${fmtDollars(priceCents)} a seat`,
        cadence: 'one_time',
        audience: 'Superfans who want a seat in the room while you work',
        benefits: [
          'A limited seat in a private working session',
          'Fans hear the record before the world does',
          ...(cp.acceptsSubmissions ? ['Fan submissions reviewed live'] : []),
          'Session replay for ticket holders',
        ],
        fulfillment: 'high_touch',
        fulfillmentNote: 'One scheduled session. Cap the room at 20 so it stays manageable.',
        why: monthlyLabel
          ? `A small room of superfans at ${fmtDollars(priceCents)} a seat is ${monthlyLabel} you modeled and have not offered. Every session you do not schedule is a room that stays empty.`
          : `A small room of superfans at ${fmtDollars(priceCents)} a seat, built on studio time you were spending anyway.`,
        builderHref: builderHrefFor(seed),
        confidence: positive(cp.ticketPriceCents) ? 'high' : 'medium',
        constraintNote: null,
        overlapNote: null,
      });
    }

    case 'live-experience-calculator': {
      if (!allowsLive) {
        return membership({
          constraintNote:
            'Ticketed lives need Pro live tools. Start with the membership so money can move now; your first ticketed live becomes the next move after upgrading.',
          confidence: 'medium',
          builderHref: membershipHrefFor(seed),
        });
      }
      const priceCents = positive(cp.ticketPriceCents) ?? 1500;
      return finish({
        kind: 'live_experience',
        featureLabel: 'Ticketed live experience',
        offerName: 'Live Experience',
        priceCents,
        priceLabel: `${fmtDollars(priceCents)} a ticket`,
        cadence: 'one_time',
        audience: 'Fans who show up when you go live',
        benefits: ['A ticketed live only buyers can enter', 'Live chat with you during the show', 'Priority for the next one'],
        fulfillment: 'moderate',
        fulfillmentNote: 'One scheduled live. You already perform; this one has a door charge.',
        why: monthlyLabel
          ? `You already go live for free. Ticketing it is ${monthlyLabel} you modeled and are currently giving away.`
          : 'You already go live for free. Ticketing one show is the fastest test of what your audience will pay.',
        builderHref: builderHrefFor(seed),
        confidence: positive(cp.ticketPriceCents) ? 'high' : 'medium',
        constraintNote: null,
        overlapNote: null,
      });
    }

    case 'own-your-fans-calculator':
      return finish({
        kind: 'fan_capture',
        featureLabel: 'Fan capture page',
        offerName: 'Your fan capture page',
        priceCents: 0,
        priceLabel: 'Free to join',
        cadence: 'monthly',
        audience: 'Every fan you currently reach only on rented platforms',
        benefits: ['A page you own', 'Direct line to every fan who joins', 'The list no algorithm can take away'],
        fulfillment: 'low',
        fulfillmentNote: 'Set it up once. It collects fans while you keep posting where you already post.',
        why: 'Every fan you reach today lives on platforms you do not control. The capture page turns borrowed reach into a list you own, and it is the foundation every paid offer stands on.',
        builderHref: builderHrefFor(seed),
        confidence: 'high',
        constraintNote: null,
        overlapNote: null,
      });

    case 'proof-of-demand-test-builder':
      return finish({
        kind: 'demand_test',
        featureLabel: 'Proof of Demand test',
        offerName: 'Your demand test',
        priceCents: 0,
        priceLabel: 'Free to run',
        cadence: 'one_time',
        audience: 'Fans whose interest you want proven before you build',
        benefits: ['Fans commit before you create', 'A real signal instead of a guess', 'The winning idea becomes your first offer'],
        fulfillment: 'low',
        fulfillmentNote: 'Post the test, share it once, read the results.',
        why: 'You planned a demand test. Running it costs nothing and tells you exactly which offer your fans will actually pay for, so the first thing you build is the thing that sells.',
        builderHref: builderHrefFor(seed),
        confidence: 'medium',
        constraintNote: null,
        overlapNote: 'A demand test finds buyers for your future membership. Same fans, sequenced, never double counted.',
      });

    case 'fan-mission-generator':
      return membership({
        overlapNote:
          'Your fan mission is the growth engine, not the income. It sends fans toward this membership; the mission and the membership are one funnel, not two revenue streams.',
        confidence: 'medium',
      });

    default:
      // No claimed calculator, an unmapped tool, or a score-only result: the smallest
      // testable offer, not a menu.
      return membership({ builderHref: seed ? membershipHrefFor(seed) : builderHrefFor(null) });
  }
}
