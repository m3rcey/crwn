// Sequence conversion goals: "stop selling when the fan reaches this membership outcome."
//
// THE DEFECT THIS ENDS. An enrollment could only leave a sequence four ways: steps ran
// out, the sequence was switched off, the fan unsubscribed, or their address bounced.
// Buying the thing the sequence was selling was not one of them, so a fan who converted
// mid-sequence kept receiving the emails asking them to convert. That is the failure a
// fan actually notices, and it applied to every artist on the platform.
//
// THE MODEL. A sequence may optionally name ONE of its artist's paid tiers as its
// conversion goal (sequences.goal_tier_id). A fan has reached the goal when they hold an
// ACTIVE subscription to that tier or any tier RANKED AT OR ABOVE it in the artist's own
// ladder. Rank comes from src/lib/tierLadder.ts, the same price-order authority the
// release waterfall staggers on and cumulative access expands with, so a renamed ladder
// never changes who counts as converted and the literal words Gold or Platinum decide
// nothing anywhere.
//
// Sequences without a goal behave exactly as before: these functions answer "no goal, so
// never converted by goal", and every caller treats that as the legacy path.

import { expandFromTier, type LadderTier } from '@/lib/tierLadder';

export interface GoalCheckInput {
  /** sequences.goal_tier_id. Null or undefined = legacy sequence, no goal semantics. */
  goalTierId: string | null | undefined;
  /** The artist's ACTIVE tiers (id, name, price). Rank is derived here, never stored. */
  artistTiers: LadderTier[];
  /** The fan's current ACTIVE subscription tier with THIS artist, or null. */
  fanTierId: string | null;
}

/**
 * Has this fan reached the sequence's conversion goal?
 *
 * False when there is no goal (legacy), no fan tier (free or none can never satisfy a
 * paid goal by construction, since goals are paid tiers), or when the goal tier id has
 * gone stale (expandFromTier answers [] for an unknown id, and an empty set matches
 * nobody rather than everybody, the same fail-closed shape the allow-list expansion has).
 */
export function goalReached(input: GoalCheckInput): boolean {
  if (!input.goalTierId) return false;
  if (!input.fanTierId) return false;
  const qualifying = expandFromTier(input.artistTiers, input.goalTierId);
  return qualifying.includes(input.fanTierId);
}

/**
 * Which of these sequences has this fan converted out of?
 * Used by the exit path to close every matching enrollment in one pass.
 */
export function convertedSequenceIds(
  sequences: Array<{ id: string; goal_tier_id: string | null }>,
  artistTiers: LadderTier[],
  fanTierId: string | null,
): string[] {
  return sequences
    .filter((s) => goalReached({ goalTierId: s.goal_tier_id, artistTiers, fanTierId }))
    .map((s) => s.id);
}
