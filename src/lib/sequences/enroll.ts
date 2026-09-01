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

export async function enrollInSequence(
  supabaseAdmin: any,
  artistId: string,
  fanId: string,
  triggerType: string,
): Promise<void> {
  try {
    // One ACTIVE sequence per trigger per artist. An artist with none configured for this
    // trigger enrols nobody, which is what keeps free-join nurture opt-in: no sequence
    // anywhere carries free_join until an artist deliberately builds one.
    const { data: sequence } = await supabaseAdmin
      .from('sequences')
      .select('id')
      .eq('artist_id', artistId)
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!sequence) return;

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
export const FREE_JOIN_TRIGGER = 'free_join';
