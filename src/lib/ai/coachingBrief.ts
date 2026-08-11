// coachingBrief.ts — the ONE canonical context a coaching surface is handed before it reasons.
//
// WHY THIS EXISTS
// ---------------
// Z4 gave the Manager the canonical diagnosis, but it wired exactly one of the Manager's two model
// calls: `generateActions`. The other one, `generateInsights`, is what fills the biggest block on
// the Manager screen, and it never saw the brief. It carried its own priority policy in prose
// ("fix retention before anything else", "consider a price increase", "acquisition problem") and
// emitted those as `urgent`. So an artist the engine had diagnosed as FULFILLMENT could open
// Manager and be told, in gold, to raise a tier price. That is two managers disagreeing in front
// of the artist, which is the exact failure Z4/Z5 exist to prevent.
//
// Both call sites now build their context here, so there is one answer to "what does a coaching
// surface know" and adding a third surface cannot quietly reintroduce an ungoverned one.
//
// WHAT THIS IS NOT
// ----------------
//  - Not a second Constraint Engine. It calls `readConstraint` and re-words nothing.
//  - Not an issuer. It never touches `recordIssuedRecommendation`; only /api/artist/constraint
//    issues, so a diagnosis rendered on five surfaces is still ONE Z3 recommendation.
//  - Not cross-artist. `activeObservedRates` takes a single artist's evidence and has no database
//    client, so this cannot widen its own cohort even by accident (Z9/Z10).
//
// FAIL-SOFT, ON PURPOSE. A broken evidence read returns null and the caller reasons exactly as it
// did before, rather than the whole cron dying over context it can technically run without. Null
// must never be turned into generic advice: silence is a real answer.

import type { SupabaseClient } from '@supabase/supabase-js';
import { assembleConstraintEvidence } from '@/lib/constraint/assembler';
import { readConstraint } from '@/lib/constraint/engine';
import { canonicalPriorityBrief, observedRatesBrief } from '@/lib/constraint/readership';
import { activeObservedRates } from '@/lib/constraint/artistObserved';

/**
 * Build the canonical priority brief (Z4) plus this artist's own measured rates (Z9) for an
 * artist-facing coaching surface.
 *
 * Returns null when the engine declined to diagnose AND the artist has no eligible measured rate,
 * which is the same string the callers used to pass before this existed.
 */
export async function buildCoachingBrief(
  admin: SupabaseClient,
  artistId: string,
  userId: string,
): Promise<string | null> {
  try {
    // ONE evidence read serves both halves. Z9 adds no query of its own by design.
    const evidence = await assembleConstraintEvidence(admin, { artistId, userId });

    let brief = canonicalPriorityBrief(readConstraint(evidence));

    // Only rates that cleared their canonical sample floor. The manager may QUOTE these; the
    // brief tells it in words that it may not compute one and has no data about anyone else.
    const rates = observedRatesBrief(activeObservedRates(evidence));
    if (rates) brief = brief ? `${brief}\n\n${rates}` : rates;

    return brief;
  } catch (err) {
    console.error('coachingBrief: canonical constraint read failed for', artistId, err);
    return null;
  }
}
