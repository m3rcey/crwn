// The conversion exit: close every goal-met enrollment for one fan with one artist.
//
// TWO CALLERS, ONE RULE. The Stripe webhook calls this the moment a subscription lands
// (immediate exit), and the daily sequence cron calls the same check per enrollment
// before sending a step (self-heal for anything the webhook missed). Both derive the
// answer from src/lib/sequences/conversionGoal.ts, so a renamed or re-priced ladder is
// always answered from current truth and nothing here reads a tier's name.
//
// WHY 'completed', NOT 'canceled'. Reaching the goal is the sequence SUCCEEDING, and the
// existing conversion-attribution cron reads completed enrollments to credit purchases.
// Marking a conversion as canceled would count every win as an unsubscribe. Only
// status='active' rows are touched, which is what makes repeated webhook deliveries
// idempotent: the second event finds nothing to close. A completed enrollment is never
// re-activated, and enrollInSequence refuses to re-enroll a completed fan, so a later
// DOWNGRADE does not resurrect an old acquisition sequence.
//
// FAIL SOFT EVERYWHERE. Pre-migration (goal_tier_id absent) the sequences select errors,
// and this function returns having done nothing: legacy behavior, exactly.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { convertedSequenceIds } from './conversionGoal';
import type { LadderTier } from '@/lib/tierLadder';

export async function exitConvertedEnrollments(
  supabaseAdmin: any,
  artistId: string,
  fanId: string,
): Promise<number> {
  try {
    // Sequences of this artist that carry a goal at all. Errors here (42703 before the
    // migration) mean no goal semantics exist yet: do nothing.
    const { data: goalSeqs, error } = await supabaseAdmin
      .from('sequences')
      .select('id, goal_tier_id')
      .eq('artist_id', artistId)
      .not('goal_tier_id', 'is', null);
    if (error || !goalSeqs?.length) return 0;

    const [{ data: sub }, { data: tiers }] = await Promise.all([
      supabaseAdmin
        .from('subscriptions')
        .select('tier_id')
        .eq('fan_id', fanId)
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .maybeSingle(),
      supabaseAdmin
        .from('subscription_tiers')
        .select('id, name, price')
        .eq('artist_id', artistId)
        .eq('is_active', true),
    ]);

    const converted = convertedSequenceIds(
      goalSeqs,
      (tiers || []) as LadderTier[],
      sub?.tier_id ?? null,
    );
    if (!converted.length) return 0;

    const { data: closed } = await supabaseAdmin
      .from('sequence_enrollments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('fan_id', fanId)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .in('sequence_id', converted)
      .select('id');

    return closed?.length ?? 0;
  } catch (err) {
    // A lifecycle exit must never break the payment or the cron behind it.
    console.error('exitConvertedEnrollments failed:', err);
    return 0;
  }
}
