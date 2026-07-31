// rampReconcile.ts — SERVER ONLY. Complete revenue-ramp steps the artist has
// ALREADY done, derived from live data, never stored guesses.
//
// The ramp is seeded as dated one-off promises ("Build your four-tier ladder",
// "Connect Stripe", ...) the moment setup completes. Since the Launch Wizard
// builds the ladder, connects Stripe, and schedules promises ITSELF, several
// steps are born already-satisfied, and for an artist who does a step through
// the real feature the ramp row never knew. This reconciler marks those events
// completed by evaluating the SAME Quest Engine DomainChecks the roadmap uses
// (one source of completion truth, no parallel queries), plus one Promise
// Calendar fact the evaluator lacks. Best-effort: it must never break the
// calendar it cleans.

import { evaluateCondition } from '@/lib/quests/evaluator';
import type { QuestInstance, DomainCheck } from '@/lib/quests/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/**
 * Ramp step key -> the authoritative DomainCheck that proves it happened.
 * Conservative on purpose: coaching steps with no authoritative signal
 * ("DM your top fans") stay manual and are absent here.
 */
const RAMP_STEP_CHECKS: Record<string, DomainCheck> = {
  connect_stripe: 'artist_stripe_connected',
  build_ladder: 'artist_ladder_complete',
  first_product: 'artist_has_product',
  point_links: 'artist_has_smart_link',
  announce_launch: 'artist_sent_campaign',
  turn_on_referrals: 'artist_referrals_on',
  first_mission: 'artist_has_mission',
  demand_test: 'artist_has_proof_of_demand',
  welcome_sequence: 'artist_has_active_sequence',
  road_campaign: 'artist_has_campaign',
  squads: 'artist_has_squad',
  first_live: 'artist_went_live',
  team_splits: 'artist_has_team_split',
};

/** set_promises has no DomainCheck: satisfied by any active NON-ramp obligation. */
async function promisesSet(db: Db, artistId: string): Promise<boolean> {
  const { count } = await db
    .from('fulfillment_obligations')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('status', 'active')
    .neq('benefit_type', 'ramp_step');
  return (count ?? 0) > 0;
}

/**
 * Complete every PENDING ramp event whose underlying fact is already true.
 * Returns how many were completed. Never throws.
 */
export async function reconcileRampSteps(
  db: Db,
  args: { artistId: string; userId: string },
): Promise<number> {
  try {
    const { data: events } = await db
      .from('fulfillment_events')
      .select('id, metadata')
      .eq('artist_id', args.artistId)
      .eq('status', 'pending')
      .not('metadata->>ramp_step_key', 'is', null)
      .limit(200);
    if (!events?.length) return 0;

    // Evaluate each distinct check once, not once per event.
    const verdicts = new Map<string, boolean>();
    const isDone = async (stepKey: string): Promise<boolean> => {
      if (verdicts.has(stepKey)) return verdicts.get(stepKey)!;
      let done = false;
      if (stepKey === 'set_promises') {
        done = await promisesSet(db, args.artistId);
      } else {
        const check = RAMP_STEP_CHECKS[stepKey];
        if (check) {
          const instance = {
            id: `ramp:${stepKey}`,
            user_id: args.userId,
            artist_id: args.artistId,
            status: 'active',
            progress_percent: 0,
            completion_condition: { kind: 'domain', check },
          } as unknown as QuestInstance;
          const res = await evaluateCondition(db, instance);
          done = res.done;
        }
      }
      verdicts.set(stepKey, done);
      return done;
    };

    let completed = 0;
    const nowIso = new Date().toISOString();
    for (const e of events) {
      const key = (e.metadata as Record<string, unknown> | null)?.ramp_step_key;
      if (typeof key !== 'string') continue;
      if (!(await isDone(key))) continue;
      const { error } = await db
        .from('fulfillment_events')
        .update({
          status: 'completed',
          completed_at: nowIso,
          completion_source_type: 'auto_derived',
          updated_at: nowIso,
        })
        .eq('id', e.id)
        .eq('status', 'pending');
      if (!error) completed += 1;
    }
    return completed;
  } catch {
    return 0;
  }
}
