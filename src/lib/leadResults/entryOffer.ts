// entryOffer.ts — the bridge from "I came here to build ONE thing" to the four-rung ladder.
//
// Most calculators model the whole ladder, so the wizard's ladder screen already argues for itself:
// each paid rung carries "your calculator put about N fans in range for this tier". Four tools model
// ONE offer instead, and each one lands somewhere specific:
//
//   Vault Revenue Planner        -> a recurring membership offer. It IS a rung (Gold).
//   Live Experience Calculator   -> a ticketed event. NOT a rung; it is a product sold per night.
//   Executive Producer Session   -> a seat-based session. NOT a rung; it is the most expensive
//                                   thing the artist sells.
//   Founder Window Builder       -> a limited opening ON a rung. NOT a rung, and NOT a mechanic
//                                   CRWN runs: no surface enforces its cap or its dates, so the
//                                   copy must never imply one does.
//
// An artist arriving from one of those met four tiers with a "Drop this tier" link on each and
// nothing on the screen arguing back, because the per-rung projection line is empty for them and
// the cold-signup counterweight is suppressed (they DO have a claimed result). This module is the
// missing argument, derived from the tool they actually came through.
//
// The four above get a bespoke bridge because their offer has a specific, true home. They are not
// the whole class: MOST tools model no ladder (a mission, a demand test, a leaderboard, a royalty
// checklist), and every one of their artists hit the same silence. So the fallback is generic and
// automatic, keyed on the ONE deterministic fact that produces the silence: no `ladder` in the
// conversion payload. A ladder that IS modeled but happens to project zero buyers is untouched,
// which is the existing rule (setupLadderOffer.test.ts): that artist keeps their own flow.
//
// Pure; no I/O. Prices and rung names are read from RECOMMENDED_LADDER rather than retyped, so a
// price change in tierTemplate.ts can never leave this copy quoting a number no rung carries.

import { RECOMMENDED_LADDER } from '@/lib/tierTemplate';
import type { LeadMagnetSeed } from './handoffSeed';

export interface EntryOffer {
  toolSlug: string;
  /**
   * The template rung this offer IS, when the offer is a membership rung. Null when the offer is a
   * one-off product (a ticket, a seat): those are built in Live after setup and the ladder does not
   * replace them, which is exactly what the artist needs told.
   */
  rungKey: string | null;
  /**
   * Where the thing they came to build actually landed. Stated first, before anything is asked.
   * Null for the GENERIC bridge: a mission or a demand test has no home on this screen, and
   * inventing one would be a claim the product does not keep.
   */
  anchorLine: string | null;
  /** Loss-framed: what keeping ONLY that one thing costs them. */
  ladderLine: string;
}

/** The rung a single-offer tool maps onto, when it maps onto one at all. */
export const ANCHOR_RUNG: Record<string, string> = {
  'vault-revenue-planner': 'vault',
};

const rung = (key: string) => RECOMMENDED_LADDER.find((r) => r.key === key)!;
const dollars = (key: string) => Math.round(rung(key).priceCents / 100);

/** Did this tool model a membership ladder? The one fact that decides whether the ladder screen
 *  already has an argument of its own (the per-rung "N fans in range" line comes from here). */
export function modelsLadder(seed: LeadMagnetSeed): boolean {
  const l = seed.conversionPayload?.ladder;
  return Array.isArray(l) && l.length > 0;
}

/**
 * The bridge for this entry tool, or null when the tool already models the full ladder (every
 * other calculator) and the existing per-rung projection line does this job.
 */
export function entryOfferFor(seed: LeadMagnetSeed | null): EntryOffer | null {
  if (!seed) return null;
  const free = rung('wave').name;
  const silver = dollars('inner_circle');
  const gold = dollars('vault');
  const top = dollars('throne');
  const platinum = rung('throne').name;

  switch (seed.toolSlug) {
    case 'vault-revenue-planner':
      return {
        toolSlug: seed.toolSlug,
        rungKey: ANCHOR_RUNG['vault-revenue-planner'],
        anchorLine: 'The Vault you planned is this rung. Your name and your price came with you.',
        ladderLine:
          `On its own, a Vault only collects the fans who are already sure about you. ${free} is free, so a stranger has a way in, ` +
          `and most fans who end up paying start at $${silver}, not $${gold}. Drop those and every fan has to go from nothing to $${gold} in one move. Most will not.`,
      };
    case 'live-experience-calculator':
      return {
        toolSlug: seed.toolSlug,
        rungKey: null,
        anchorLine: 'Your ticketed live is a product, not a tier. You build it in Live right after this, and nothing here replaces it.',
        ladderLine:
          'A ticket sells one night. Every buyer who is not a member is a fan you have to find again and re-sell for the next show. ' +
          `These four tiers are the audience that shows up without being bought twice, and the quarterly listening event ${platinum} already promises is a show you were going to run anyway.`,
      };
    case 'executive-producer-session':
      return {
        toolSlug: seed.toolSlug,
        rungKey: null,
        anchorLine: 'Your session sells seats, not memberships. You build it in Live right after this, and nothing here replaces it.',
        ladderLine:
          'A seat in the room is the most expensive thing you sell, and almost nobody buys the most expensive thing first. ' +
          `These four tiers are where a fan proves they will pay you at all: free at ${free}, $${silver}, then $${gold}. Without them, the only people left to sell a seat to are strangers.`,
      };
    case 'founder-window-builder':
      return {
        toolSlug: seed.toolSlug,
        rungKey: null,
        // Deliberately NOT anchored to a rung. A founding window has a cap and dates; a template
        // rung has neither, and no CRWN surface enforces either one (the offer builder this
        // deliverable continues into has no cap or window field). Saying "your founding tier is
        // Silver" would sell a mechanic that does not exist.
        anchorLine:
          'A founding window is a promise you keep, not a mechanic CRWN runs. It opens one of these rungs at a price you honor, and you hold the cap yourself.',
        ladderLine:
          `A window closes. If the founding offer is the only thing you built, the fan who finds you the week after it shuts has nothing to buy. ` +
          `These four rungs are what is still standing then: ${free} free, $${silver}, $${gold}, $${top}.`,
      };
    default:
      // GENERIC. Their tool modeled one piece of the business and no ladder, so neither existing
      // argument renders. A tool that DID model a ladder keeps its own per-rung numbers and gets
      // nothing from here, even when it projected no buyers.
      if (modelsLadder(seed)) return null;
      return {
        toolSlug: seed.toolSlug,
        rungKey: null,
        anchorLine: null,
        ladderLine:
          `Your ${seed.toolName} modeled one piece of your business, not the recurring money underneath it. ` +
          `Keep all three paid rungs to start. A fan who would happily pay you $${silver} has no way to do it if the only options are free or $${top}.`,
      };
  }
}
