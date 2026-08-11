// eligibility.ts — may CRWN offer this artist a campaign at all?
//
// PURE. No database, no network, no AI. It takes a ConstraintResult that `readConstraint` already
// produced and returns a verdict. It NEVER diagnoses anything itself.
//
// THIS IS A READER, NOT A RECOMMENDER (Z4 / Z5)
// ---------------------------------------------
// `src/lib/constraint/readership.ts` states the contract: one fact, one owner, many readers. A
// reader may re-word the canonical priority, and may never re-rank it, manufacture one when the
// engine declined, or issue a Z3 recommendation record. This module obeys all three:
//
//   - It cannot rank. It only asks whether the constraint the engine ALREADY chose is one this
//     archetype is a legitimate execution of.
//   - `insufficient_evidence` returns NOT eligible. CRWN staying silent is not permission to sell
//     an artist a campaign.
//   - Nothing here writes. Z3 issuance stays single-writer at `/api/artist/constraint`, so a
//     campaign created off a diagnosis references that ONE logical recommendation by its existing
//     `actionKey` rather than minting a second recommendation identity.
//
// AND VIRALITY IS NOT A CONSTRAINT
// --------------------------------
// There is no `VIRALITY` constraint type and there must never be one. Virality is a MECHANISM. The
// problem is always insufficient reach, or an audience that has never been asked to pay. Adding
// `VIRALITY` to `CONSTRAINT_TYPES` would put the solution in the list of problems and destroy the
// causal clarity the whole engine exists for.

import { protectsEarnedRevenue } from '@/lib/constraint/readership';
import { isDiagnosed, type ConstraintResult, type ConstraintType } from '@/lib/constraint/types';
import { CAMPAIGN_ARCHETYPES, capabilitiesSupported, type CampaignArchetype } from './archetypes';

/**
 * The admission gate, derived from the archetype registry rather than restated here. A constraint
 * is campaign-shaped only if some SHIPPABLE archetype declares it serves that constraint.
 *
 * As of V1 that resolves to REACH and FIRST_PAID (Fan Recruitment). Notably absent:
 *
 *   FULFILLMENT / RETENTION  - never. Recruiting into a system that is failing the fans already
 *                              inside it makes the leak bigger, which is the exact reason the
 *                              engine evaluates those two first.
 *   FREE_CAPTURE             - not served by any V1 archetype. Its diagnosis is that visitors
 *                              ARRIVE AND DO NOT JOIN, so sending more visitors is treating the
 *                              symptom upstream of the fault. The canonical architecture calls this
 *                              one "partly" campaign-shaped; no archetype CRWN can ship today
 *                              honestly serves it, so it is left out rather than covered for the
 *                              sake of coverage.
 *   PAID_TIER_INTEREST /
 *   CHECKOUT_COMPLETION /
 *   DEPTH                    - offer, friction and benefit problems. Traffic does not move them.
 */
export function campaignShapedConstraints(): ConstraintType[] {
  const out = new Set<ConstraintType>();
  for (const archetype of Object.values(CAMPAIGN_ARCHETYPES)) {
    if (!capabilitiesSupported(archetype)) continue;
    for (const c of archetype.servesConstraints) {
      // Belt and braces: an archetype may not declare its way past the two constraints that
      // protect money the artist has already been paid.
      if (protectsEarnedRevenue(c)) continue;
      out.add(c);
    }
  }
  return [...out];
}

export interface CampaignOffer {
  eligible: boolean;
  /** The archetype CRWN would run, or null. Deterministic, never a model's pick. */
  archetype: CampaignArchetype | null;
  /** The constraint the engine diagnosed, when it diagnosed one. */
  constraint: ConstraintType | null;
  /** One plain sentence. Shown to the artist whether the answer is yes or no. */
  reason: string;
  /**
   * When a campaign is refused because something outranks it, the canonical action the engine
   * ALREADY gave, restated verbatim. The campaign surface points at the real priority instead of
   * leaving the artist on a dead end, and it does so by repeating the engine rather than by
   * inventing advice.
   */
  canonicalAction: { label: string; href: string } | null;
}

/**
 * The one entry point. Give it whatever `/api/artist/constraint` returned.
 *
 * A `null` result (the route failed, or the artist has no diagnosis) is NOT eligible. Failing open
 * here would mean a dropped request became permission to run a growth campaign during a
 * fulfillment crisis.
 */
export function campaignOfferFor(result: ConstraintResult | null | undefined): CampaignOffer {
  if (!result || !isDiagnosed(result)) {
    return {
      eligible: false,
      archetype: null,
      constraint: null,
      reason:
        'CRWN has not diagnosed what is limiting you yet, so it will not tell you to run a drive. Advice without evidence is guessing.',
      canonicalAction: null,
    };
  }

  const constraint = result.constraint;
  const canonicalAction = { label: result.action.label, href: result.action.href };

  if (protectsEarnedRevenue(constraint)) {
    return {
      eligible: false,
      archetype: null,
      constraint,
      reason:
        constraint === 'FULFILLMENT'
          ? 'You owe something to fans who have already paid. Winning more fans this week costs you the ones you have.'
          : 'Paying members are leaving faster than usual. Every member a drive won would land in a bucket with a hole in it.',
      canonicalAction,
    };
  }

  const archetype =
    Object.values(CAMPAIGN_ARCHETYPES).find(
      (a) => capabilitiesSupported(a) && a.servesConstraints.includes(constraint),
    ) ?? null;

  if (!archetype) {
    return {
      eligible: false,
      archetype: null,
      constraint,
      reason:
        'What is limiting you right now is not something more traffic fixes, so CRWN has no drive to offer for it.',
      canonicalAction,
    };
  }

  return {
    eligible: true,
    archetype,
    constraint,
    reason:
      constraint === 'REACH'
        ? 'Almost nobody is seeing your page, and the people most able to change that already listen to you.'
        : 'You have an audience that has never been asked to pay, and the people they trust are already on your list.',
    canonicalAction,
  };
}
