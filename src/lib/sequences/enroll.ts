// The ONE writer that puts a fan into an artist's nurture sequence.
//
// Extracted verbatim from webhookHandlers.ts, which held it privately, so the FREE-join
// path can reuse it instead of growing a second enrolment routine. Every property the
// Stripe path relied on is preserved: one active sequence per trigger per artist, no
// re-enrolment for a fan already active or completed on it, the first step's delay
// deciding the first send, and total fault tolerance (a nurture failure must never break
// the join or the payment that triggered it).
//
// Trigger types in use: new_subscription, new_purchase, tier_upgrade,
// post_purchase_upsell, win_back, inactive_subscriber, abandoned_cart, loyalty_survey,
// and free_join (schema-phase2-free-join-sequence-trigger.sql).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { goalReached } from './conversionGoal';
import type { LadderTier } from '@/lib/tierLadder';

export interface EnrollOptions {
  /**
   * Enroll into THIS sequence instead of the trigger lookup. This is how a funnel points
   * its fans at a specific nurture (fan_automations.nurture_sequence_id): a boxing funnel
   * enrolls into the boxing sequence while another funnel uses the artist's default. The
   * id is re-validated here against artist_id and is_active, so a stale or cross-artist
   * pointer enrolls nobody rather than enrolling into someone else's emails.
   */
  sequenceId?: string | null;
}

export async function enrollInSequence(
  supabaseAdmin: any,
  artistId: string,
  fanId: string,
  triggerType: string,
  opts?: EnrollOptions,
): Promise<void> {
  try {
    // One ACTIVE sequence per trigger per artist, unless the caller names a specific one.
    // An artist with none configured for this trigger enrols nobody, which is what keeps
    // free-join nurture opt-in: no sequence anywhere carries free_join until an artist
    // deliberately builds one.
    let query = supabaseAdmin
      .from('sequences')
      .select('id, goal_tier_id')
      .eq('artist_id', artistId)
      .eq('is_active', true);
    query = opts?.sequenceId
      ? query.eq('id', opts.sequenceId)
      : query.eq('trigger_type', triggerType);
    let { data: sequence, error: seqError } = await query.limit(1).maybeSingle();

    // Pre-migration (goal_tier_id absent) the select 42703s. Retry without the column so
    // enrollment keeps working exactly as before the goal feature existed.
    if (seqError) {
      let retry = supabaseAdmin
        .from('sequences')
        .select('id')
        .eq('artist_id', artistId)
        .eq('is_active', true);
      retry = opts?.sequenceId
        ? retry.eq('id', opts.sequenceId)
        : retry.eq('trigger_type', triggerType);
      const { data: fallback } = await retry.limit(1).maybeSingle();
      sequence = fallback;
    }

    if (!sequence) return;

    // A fan who has ALREADY reached this sequence's conversion goal is never enrolled:
    // a Platinum member claiming a lead magnet must not enter the become-Gold nurture.
    const goalTierId = (sequence as { goal_tier_id?: string | null }).goal_tier_id ?? null;
    if (goalTierId) {
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
      if (goalReached({
        goalTierId,
        artistTiers: (tiers || []) as LadderTier[],
        fanTierId: sub?.tier_id ?? null,
      })) return;
    }

    // Already active or completed on this sequence: do nothing. This is what makes a
    // re-join, a resubscribe, or a double-tap idempotent rather than a second inbox.
    const { data: existing } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('id')
      .eq('sequence_id', sequence.id)
      .eq('fan_id', fanId)
      .in('status', ['active', 'completed'])
      .maybeSingle();

    if (existing) return;

    const { data: firstStep } = await supabaseAdmin
      .from('sequence_steps')
      .select('delay_days')
      .eq('sequence_id', sequence.id)
      .eq('step_number', 1)
      .single();

    if (firstStep) {
      const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('sequence_enrollments').insert({
        sequence_id: sequence.id,
        fan_id: fanId,
        artist_id: artistId,
        current_step: 0,
        status: 'active',
        next_send_at: nextSendAt,
      });
      console.log(`Enrolled fan ${fanId} in ${triggerType} sequence ${sequence.id}`);
    }
  } catch (err) {
    // Never throw. A nurture failure must not fail the join or the payment behind it.
    console.error(`Sequence enrollment (${triggerType}) failed:`, err);
  }
}

/** The trigger a FREE tier join fires. Opt-in: an artist must build a sequence for it. */
export { FREE_JOIN_TRIGGER } from './triggers';
