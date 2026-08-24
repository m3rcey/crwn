// The narrow-result -> flagship bridge: after a single-opportunity calculator has delivered its
// COMPLETE result, offer the whole-business view as a secondary continuation.
//
// Approved acquisition architecture (founder decision, 2026-08-24, from the carousel CTA audit):
// angle carousel -> angle keyword -> angle calculator -> full narrow result -> THIS bridge ->
// opportunity calculator with the originating context preserved. The narrow tool earns the click;
// the flagship earns the account. The bridge is therefore SECONDARY by design: it never replaces
// the builder, never gates the result, and never navigates to signup.
//
// ELIGIBILITY IS DERIVED, never listed twice. A tool is bridgeable exactly when the flagship
// declares an `entryContexts` entry for its slug: that entry is what makes the arrival honest
// (the wizard reorders around the angle and acknowledges why they came). A tool WITHOUT a
// declared context gets no bridge, because sending someone to a generic questionnaire that
// ignores what they just computed is the failure mode entryContext exists to prevent.
//
// Royalty Readiness is deliberately not bridged: docs/POSITIONING.md section 18 records that it
// recovers money already earned elsewhere and the fan-economy continuation does not apply to it.
// That is expressed here the same way as everything else, by the absence of an entry context.

import { getLeadMagnet } from './registry';

export const FLAGSHIP_SLUG = 'opportunity-calculator';

export interface FlagshipBridge {
  /** The flagship route carrying the originating tool as `?from=`, which the flagship's
   *  entryContext machinery already consumes (reorder + acknowledgement note). */
  href: string;
  label: string;
  body: string;
}

/**
 * The bridge for a narrow tool's result surface, or null when no honest transition exists.
 * Null for the flagship itself, for any slug without a declared flagship entry context
 * (Royalty Readiness among them), and for unknown slugs.
 */
export function flagshipBridgeFor(slug: string): FlagshipBridge | null {
  if (!slug || slug === FLAGSHIP_SLUG) return null;
  const flagship = getLeadMagnet(FLAGSHIP_SLUG);
  if (!flagship?.entryContexts || !Object.prototype.hasOwnProperty.call(flagship.entryContexts, slug)) return null;
  return {
    href: `/tools/${FLAGSHIP_SLUG}?from=${encodeURIComponent(slug)}`,
    // Copy discipline: the category word is "fan economy" (docs/POSITIONING.md sections 3 and 24),
    // and every doorway states that a single tool's finding is one lens on one fan economy
    // (section 24, "one story, six doors"). No revenue promise, no beginner framing, no em dashes.
    label: 'See how this fits your whole fan economy',
    body: 'This number is one lens on one fan economy. The full calculator models every part of your fan business together, starting from what brought you here.',
  };
}
