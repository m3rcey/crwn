// funnelReadiness.ts: "is this artist's fan funnel whole?", answered from canonical rows.
//
// PURE. The ONE definition of funnel readiness, consumed by four places that used to have none
// or would otherwise each grow their own: the Rise Mode roadmap's First revenue stage, the Quest
// Engine's funnel DomainChecks, the "Test it" guided flow, and the Promise to Delivery panel's
// welcome_unlock resolver. Facts arrive as rows the caller already loaded for ONE artist
// (src/lib/funnelReadinessFacts.ts does that with the service role, scoped by artist id); this
// module turns them into named checks with a state and one plain sentence each.
//
// Nothing here reads a table, writes a table, or grants anything. Readiness is a report on the
// funnel's configuration, never a second gate: the drop page, the claim route, the checkout and
// the sequence enroller keep their own authority and their own server-side validation.
//
// THE FUNNEL OBJECT IS fan_automations. One row is one funnel: magnet, primary paid offer
// (gold_tier_id), optional downsell (silver_tier_id), nurture pointer, public drop link. Rise Mode
// orchestrates that row; it never keeps a copy of it.
//
// Requirement classes, ratified 2026-09-03 (the "no optional optimization as a fake blocker" rule):
//   launch       the funnel cannot technically work without it
//   truth        the funnel works, but the sale is not honest without it (the sales experience)
//   recommended  strongly ordered before traffic, never a blocker (follow-up)
//   optional     a choice, never a defect when absent (a downsell)

import { benefitDelivery } from '@/lib/benefitRegistry';
import { resolveFunnelOffers, type OfferTierRow } from '@/lib/fanAutomations/offerTiers';
import { FREE_JOIN_TRIGGER } from '@/lib/sequences/triggers';

export type FunnelCheckKey =
  | 'offer'
  | 'magnet'
  | 'free_door'
  | 'primary_offer'
  | 'downsell'
  | 'sales_experience'
  | 'followup'
  | 'checkout'
  | 'funnel_live';

export type FunnelCheckState = 'pass' | 'fail' | 'skip';
export type FunnelRequirement = 'launch' | 'truth' | 'recommended' | 'optional';

/** The guided flow that owns the fix for a failing check. Keys match src/lib/guidedSetup/flows.ts. */
export type FunnelFlowKey = 'offer' | 'magnet' | 'experience' | 'followup' | 'stripe' | 'funnel';

export interface FunnelCheck {
  key: FunnelCheckKey;
  label: string;
  state: FunnelCheckState;
  requirement: FunnelRequirement;
  /** One plain sentence. Counts and names only; never an id, a key, a URL or a fan. */
  fact: string;
  flow: FunnelFlowKey;
}

export interface FunnelAutomationFacts {
  id: string;
  status: string;
  magnet_kind: string | null;
  magnet_file_key: string | null;
  magnet_track_id: string | null;
  gold_tier_id: string | null;
  silver_tier_id: string | null;
  nurture_sequence_id: string | null;
  public_token: string | null;
  updated_at?: string | null;
  activated_at?: string | null;
}

export interface FunnelTierFacts extends OfferTierRow {
  stripe_price_id: string | null;
}

export interface FunnelSequenceFacts {
  id: string;
  is_active: boolean | null;
  trigger_type: string | null;
  goal_tier_id: string | null;
  stepCount: number;
}

export interface FunnelExperienceFacts {
  tier_id: string;
  is_active: boolean | null;
  /** True when the stored config survives normalizeOfferExperience for its tier. */
  valid: boolean;
}

/** Everything the checks may know. All rows belong to ONE artist; the loader guarantees it. */
export interface FunnelFacts {
  /** Every non-archived funnel row. pickFunnel decides which one the checks read. */
  automations: FunnelAutomationFacts[];
  tiers: FunnelTierFacts[];
  tracks: { id: string; is_active: boolean | null }[];
  benefits: { tier_id: string; benefit_type: string }[];
  stripeConnected: boolean;
  experiences: FunnelExperienceFacts[];
  sequences: FunnelSequenceFacts[];
}

export const EMPTY_FUNNEL_FACTS: FunnelFacts = {
  automations: [],
  tiers: [],
  tracks: [],
  benefits: [],
  stripeConnected: false,
  experiences: [],
  sequences: [],
};

const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);

/**
 * Which row IS the funnel when an artist has several. The live one wins (the most recently
 * activated if more than one), else the most recently touched draft or paused row. Archived rows
 * are never candidates; the loader does not pass them.
 */
export function pickFunnel(automations: FunnelAutomationFacts[]): FunnelAutomationFacts | null {
  const live = automations.filter((a) => a.status === 'active');
  if (live.length) return [...live].sort((a, b) => ts(b.activated_at) - ts(a.activated_at))[0];
  const rest = automations.filter((a) => a.status !== 'archived');
  if (!rest.length) return null;
  return [...rest].sort((a, b) => ts(b.updated_at) - ts(a.updated_at))[0];
}

const activeTiers = (tiers: FunnelTierFacts[]) => tiers.filter((t) => t.is_active !== false);

/**
 * The paid tier the funnel leads with. The row's pointer wins, derivation fills silence: exactly
 * resolveFunnelOffers, which is what the drop page renders, so readiness can never disagree with
 * the page. Null when the artist has no paid tier.
 */
export function primaryTier(facts: FunnelFacts, funnel: FunnelAutomationFacts | null): FunnelTierFacts | null {
  const offers = resolveFunnelOffers(activeTiers(facts.tiers), {
    gold_tier_id: funnel?.gold_tier_id ?? null,
    silver_tier_id: funnel?.silver_tier_id ?? null,
  });
  if (!offers.primary) return null;
  return facts.tiers.find((t) => t.id === offers.primary!.id) ?? null;
}

/** A non-retired registry benefit on this tier. Retired keys still render for old rows but deliver nothing. */
function supportedBenefits(facts: FunnelFacts, tierId: string) {
  return facts.benefits
    .filter((b) => b.tier_id === tierId)
    .map((b) => benefitDelivery(b.benefit_type))
    .filter((d): d is NonNullable<typeof d> => !!d && d.support !== 'retired');
}

// ---------------------------------------------------------------------------
// The narrow predicates. The Quest Engine's DomainChecks call these directly with narrow reads
// so the hot path stays light; assessFunnel composes the same functions. One definition each.
// ---------------------------------------------------------------------------

/** A magnet exists AND its asset still exists: an uploaded file key, or one of the artist's active tracks. */
export function magnetIsValid(
  funnel: FunnelAutomationFacts | null,
  tracks: { id: string; is_active: boolean | null }[],
): boolean {
  if (!funnel || !funnel.magnet_kind) return false;
  if (funnel.magnet_kind === 'upload') return !!funnel.magnet_file_key;
  if (funnel.magnet_kind === 'track') {
    return !!funnel.magnet_track_id && tracks.some((t) => t.id === funnel.magnet_track_id && t.is_active !== false);
  }
  return false;
}

/** The primary tier can actually be bought: Stripe is connected and the tier carries a live price. */
export function checkoutIsReady(primary: FunnelTierFacts | null, stripeConnected: boolean): boolean {
  return !!primary && stripeConnected && !!primary.stripe_price_id;
}

/** The funnel is switched on with a purchasable primary offer behind it. */
export function funnelIsLive(facts: FunnelFacts, funnel: FunnelAutomationFacts | null): boolean {
  if (!funnel || funnel.status !== 'active') return false;
  const primary = primaryTier(facts, funnel);
  return !!primary && !!primary.stripe_price_id;
}

/** A published, valid Tier Offer Experience exists for the primary tier. */
export function experienceIsLive(primaryTierId: string | null, experiences: FunnelExperienceFacts[]): boolean {
  if (!primaryTierId) return false;
  return experiences.some((e) => e.tier_id === primaryTierId && e.is_active !== false && e.valid);
}

/**
 * Which sequence will greet a free member from this funnel. The row's nurture pointer wins when
 * it resolves to an active sequence of the artist's; otherwise the enroller falls back to the
 * artist's active free_join sequence, exactly as src/lib/sequences/enroll.ts does.
 */
export function followupSequence(
  funnel: FunnelAutomationFacts | null,
  sequences: FunnelSequenceFacts[],
): FunnelSequenceFacts | null {
  const active = sequences.filter((s) => s.is_active !== false);
  if (funnel?.nurture_sequence_id) {
    const pointed = active.find((s) => s.id === funnel.nurture_sequence_id);
    if (pointed) return pointed;
  }
  return active.find((s) => s.trigger_type === FREE_JOIN_TRIGGER) ?? null;
}

/**
 * Follow-up is ACTIVE when the funnel's sequence exists, is switched on, has at least one
 * message, and names a conversion goal. The goal is part of the definition because a nurture
 * with no goal keeps emailing fans who already bought, the defect conversionGoal.ts exists to end.
 */
export function followupIsActive(funnel: FunnelAutomationFacts | null, sequences: FunnelSequenceFacts[]): boolean {
  const seq = followupSequence(funnel, sequences);
  return !!seq && seq.stepCount > 0 && !!seq.goal_tier_id;
}

// ---------------------------------------------------------------------------
// The assessment
// ---------------------------------------------------------------------------

export interface FunnelAssessment {
  funnel: FunnelAutomationFacts | null;
  primaryTierId: string | null;
  checks: FunnelCheck[];
  /** Failing launch checks other than the switch itself. Empty means "Turn it on" may proceed. */
  activationBlockers: FunnelCheck[];
  /** True when every launch AND truth check passes. Recommended and optional never gate this. */
  readyForTraffic: boolean;
  /** The first flow with a failing launch or truth check, for "fix it" links. */
  nextFlow: FunnelFlowKey | null;
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function assessFunnel(facts: FunnelFacts): FunnelAssessment {
  const funnel = pickFunnel(facts.automations);
  const tiers = activeTiers(facts.tiers);
  const primary = primaryTier(facts, funnel);
  const offers = resolveFunnelOffers(tiers, {
    gold_tier_id: funnel?.gold_tier_id ?? null,
    silver_tier_id: funnel?.silver_tier_id ?? null,
  });
  const checks: FunnelCheck[] = [];

  // 1. The offer: a paid tier with a delivery path behind every promise.
  if (!primary) {
    checks.push({ key: 'offer', label: 'A paid offer', state: 'fail', requirement: 'launch', flow: 'offer', fact: 'No paid tier exists yet, so there is nothing to sell.' });
  } else {
    const supported = supportedBenefits(facts, primary.id);
    const crwn = supported.filter((d) => d.support !== 'manual').length;
    const mine = supported.length - crwn;
    checks.push(
      supported.length > 0
        ? { key: 'offer', label: 'A paid offer', state: 'pass', requirement: 'launch', flow: 'offer', fact: `${primary.name} at ${money(primary.price)} promises ${plural(supported.length, 'thing')}: CRWN delivers ${crwn}, you deliver ${mine}.` }
        : { key: 'offer', label: 'A paid offer', state: 'fail', requirement: 'launch', flow: 'offer', fact: `${primary.name} has a price but promises nothing yet. Fans need a reason.` },
    );
  }

  // 2. The magnet: something a fan gets the moment they join.
  const magnetOk = magnetIsValid(funnel, facts.tracks);
  checks.push(
    magnetOk
      ? { key: 'magnet', label: 'Something worth joining for', state: 'pass', requirement: 'launch', flow: 'magnet', fact: funnel?.magnet_kind === 'track' ? 'A track is delivered the moment a fan joins.' : 'A file is delivered the moment a fan joins.' }
      : funnel?.magnet_kind
        ? { key: 'magnet', label: 'Something worth joining for', state: 'fail', requirement: 'launch', flow: 'magnet', fact: 'The thing fans were promised no longer exists. Pick or upload it again.' }
        : { key: 'magnet', label: 'Something worth joining for', state: 'fail', requirement: 'launch', flow: 'magnet', fact: 'Nothing is offered for joining free yet.' },
  );

  // 3. The free door: the rung the magnet unlocks into.
  const freeTiers = tiers.filter((t) => t.price === 0);
  checks.push(
    freeTiers.length > 0
      ? { key: 'free_door', label: 'A free way in', state: 'pass', requirement: 'launch', flow: 'offer', fact: `${freeTiers[0].name} is the free tier fans join first.` }
      : { key: 'free_door', label: 'A free way in', state: 'fail', requirement: 'launch', flow: 'offer', fact: 'No free tier exists, so a fan has nowhere to land before paying.' },
  );

  // 4. The primary paid offer the funnel leads with.
  checks.push(
    primary
      ? { key: 'primary_offer', label: 'The paid offer fans see first', state: 'pass', requirement: 'launch', flow: 'funnel', fact: `${primary.name} at ${money(primary.price)} is offered right after the join.` }
      : { key: 'primary_offer', label: 'The paid offer fans see first', state: 'fail', requirement: 'launch', flow: 'offer', fact: 'No paid tier can be offered after the join.' },
  );

  // 5. Optional downsell. Absent is a choice; present must be strictly cheaper (the resolver drops
  //    anything else, so a stored pointer that resolves to nothing is the failure signal).
  if (!funnel?.silver_tier_id) {
    checks.push({ key: 'downsell', label: 'A cheaper option', state: 'skip', requirement: 'optional', flow: 'funnel', fact: 'No cheaper option is offered when a fan says no. That is allowed.' });
  } else if (offers.downsell) {
    checks.push({ key: 'downsell', label: 'A cheaper option', state: 'pass', requirement: 'optional', flow: 'funnel', fact: `${offers.downsell.name} at ${money(offers.downsell.price)} is offered when a fan declines.` });
  } else {
    checks.push({ key: 'downsell', label: 'A cheaper option', state: 'fail', requirement: 'optional', flow: 'funnel', fact: 'The cheaper option no longer exists or is not below the main offer, so it is not shown.' });
  }

  // 6. The sales experience: truth, not plumbing. The drop page renders a compact card without it.
  const expLive = experienceIsLive(primary?.id ?? null, facts.experiences);
  checks.push(
    expLive
      ? { key: 'sales_experience', label: 'Why the paid tier is worth it', state: 'pass', requirement: 'truth', flow: 'experience', fact: `Fans see a full sales page for ${primary!.name}.` }
      : { key: 'sales_experience', label: 'Why the paid tier is worth it', state: 'fail', requirement: 'truth', flow: 'experience', fact: primary ? `Fans see only a compact card for ${primary.name}. It sells less than a page that shows what they get.` : 'There is no paid tier to present yet.' },
  );

  // 7. Follow-up: recommended, ordered before traffic, never a blocker.
  const seq = followupSequence(funnel, facts.sequences);
  if (followupIsActive(funnel, facts.sequences)) {
    checks.push({ key: 'followup', label: 'Follow-up for fans who do not buy yet', state: 'pass', requirement: 'recommended', flow: 'followup', fact: `${plural(seq!.stepCount, 'message')} go out to new free members and stop the moment they buy.` });
  } else if (seq && seq.stepCount > 0 && !seq.goal_tier_id) {
    checks.push({ key: 'followup', label: 'Follow-up for fans who do not buy yet', state: 'fail', requirement: 'recommended', flow: 'followup', fact: 'Your follow-up never stops, so fans who buy keep getting asked to buy.' });
  } else if (seq) {
    checks.push({ key: 'followup', label: 'Follow-up for fans who do not buy yet', state: 'fail', requirement: 'recommended', flow: 'followup', fact: 'Your follow-up is switched on but has no messages in it.' });
  } else {
    checks.push({ key: 'followup', label: 'Follow-up for fans who do not buy yet', state: 'fail', requirement: 'recommended', flow: 'followup', fact: 'A fan who joins free and does not buy never hears from you again.' });
  }

  // 8. Checkout: Stripe connected and a live price on the primary tier.
  checks.push(
    checkoutIsReady(primary, facts.stripeConnected)
      ? { key: 'checkout', label: 'Checkout that pays you', state: 'pass', requirement: 'launch', flow: 'stripe', fact: 'Stripe is connected and the offer has a live price.' }
      : !facts.stripeConnected
        ? { key: 'checkout', label: 'Checkout that pays you', state: 'fail', requirement: 'launch', flow: 'stripe', fact: 'Stripe is not connected, so a fan who says yes cannot pay.' }
        : { key: 'checkout', label: 'Checkout that pays you', state: 'fail', requirement: 'launch', flow: 'stripe', fact: 'The offer has no live price yet. CRWN creates it once Stripe can take charges.' },
  );

  // 9. The switch.
  checks.push(
    funnelIsLive(facts, funnel)
      ? { key: 'funnel_live', label: 'The funnel is on', state: 'pass', requirement: 'launch', flow: 'funnel', fact: 'Your link is live and delivering.' }
      : funnel
        ? { key: 'funnel_live', label: 'The funnel is on', state: 'fail', requirement: 'launch', flow: 'funnel', fact: 'Your funnel exists but is not switched on, so the link does nothing yet.' }
        : { key: 'funnel_live', label: 'The funnel is on', state: 'fail', requirement: 'launch', flow: 'magnet', fact: 'No funnel exists yet.' },
  );

  const activationBlockers = checks.filter((c) => c.requirement === 'launch' && c.state === 'fail' && c.key !== 'funnel_live');
  const readyForTraffic = checks.every((c) => (c.requirement === 'launch' || c.requirement === 'truth' ? c.state === 'pass' : true));
  const nextFlow = checks.find((c) => (c.requirement === 'launch' || c.requirement === 'truth') && c.state === 'fail')?.flow ?? null;

  return { funnel, primaryTierId: primary?.id ?? null, checks, activationBlockers, readyForTraffic, nextFlow };
}
