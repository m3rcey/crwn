// tierTransitionStore.ts — the ONLY writer of tier_transitions.
//
// SERVICE ROLE ONLY. The table has no client write policy, so every insert lands here. Centralized
// deliberately: there are three real mutation seams (checkout webhook, in-app upgrade, scheduled
// downgrade applied at period end) and instrumenting them separately is how two of them drift.
//
// FAILS SOFT, STAYS OBSERVABLE. History must never break a payment path: a fan whose Stripe
// subscription upgraded successfully must not see an error because a bookkeeping insert failed. But
// silent permanent loss of history is its own bug, so expected collisions stay quiet and everything
// else is logged (the Z3 lesson: supabase-js RETURNS an {error}, it does not throw).

import type { SupabaseClient } from '@supabase/supabase-js';
import { isRealMovement, transitionKey, type TransitionEvidence, type TransitionSource } from './tierTransitions';

const TABLE = 'tier_transitions';

/** 23505 = the unique index caught a retry, which is the guarantee working. 42P01 = pre-migration. */
function isExpected(error: { code?: string | null }): boolean {
  return error.code === '23505' || error.code === '42P01';
}

export interface RecordTransitionInput {
  artistId: string;
  fanId: string;
  subscriptionId?: string | null;
  fromTierId: string | null;
  toTierId: string | null;
  /** When the state ACTUALLY changed. Defaults to now only when the caller has nothing better. */
  occurredAt?: string;
  source: TransitionSource;
  evidence?: TransitionEvidence;
  /** Stripe's event id where one exists. This is what makes a redelivery a no-op. */
  stripeEventId?: string | null;
}

/**
 * Record one membership movement, at most once.
 *
 * Refuses a same-tier write outright: an artist repricing a tier, or a webhook re-firing with the
 * artist's current tier, is not a fan moving. Recording it would manufacture depth movement out of
 * an admin edit, which is the exact dishonesty this table exists to avoid. The database enforces
 * the same rule, so a future caller that forgets cannot get around it.
 */
export async function recordTierTransition(
  db: SupabaseClient,
  input: RecordTransitionInput,
): Promise<void> {
  const evidence = input.evidence ?? 'observed';
  if (evidence === 'observed' && !isRealMovement(input.fromTierId, input.toTierId)) return;

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const eventKey = transitionKey({
    stripeEventId: input.stripeEventId,
    subscriptionId: input.subscriptionId,
    fanId: input.fanId,
    artistId: input.artistId,
    toTierId: input.toTierId,
    occurredAt,
  });

  try {
    const { error } = await db.from(TABLE).insert({
      artist_id: input.artistId,
      fan_id: input.fanId,
      subscription_id: input.subscriptionId ?? null,
      from_tier_id: input.fromTierId,
      to_tier_id: input.toTierId,
      occurred_at: occurredAt,
      source: input.source,
      evidence,
      event_key: eventKey,
    });
    if (error && !isExpected(error)) {
      console.error('tier transition not recorded:', error.code, error.message);
    }
  } catch (err) {
    console.error('tier transition insert threw:', err);
  }
}

/**
 * The fan's CURRENT tier, read before a mutation overwrites it.
 *
 * Every seam needs this, because `subscriptions.tier_id` is updated in place and the previous value
 * is gone the instant the write lands. Returns null when there is no existing membership, which is
 * the honest answer for a first paid subscription: `fromTierId` null means "came from nothing", not
 * "came from a tier we failed to look up".
 */
export async function currentTierId(
  db: SupabaseClient,
  artistId: string,
  fanId: string,
): Promise<{ tierId: string | null; subscriptionId: string | null }> {
  try {
    const { data, error } = await db
      .from('subscriptions')
      .select('id, tier_id')
      .eq('artist_id', artistId)
      .eq('fan_id', fanId)
      .maybeSingle();
    if (error || !data) return { tierId: null, subscriptionId: null };
    return { tierId: (data.tier_id as string) ?? null, subscriptionId: (data.id as string) ?? null };
  } catch {
    return { tierId: null, subscriptionId: null };
  }
}
