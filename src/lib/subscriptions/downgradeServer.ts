// downgradeServer.ts: SERVER ONLY. Schedules a tier downgrade IN STRIPE, and releases one.
//
// The construction is downgradeSchedule.ts (pure), proven on a Stripe test clock by
// scripts/verify-downgrade-schedule.mjs: the fan keeps the tier they paid for until the boundary,
// then Stripe bills the lower price, still routed to the artist with the platform fee.
//
// A CRWN downgrade schedule is the ONLY schedule this module will touch. A schedule carrying any
// other intention (a campaign prize) is refused, never appended to or released: two intentions on
// one subscription is how a winner's prize or a fan's paid period gets silently overwritten.

import type Stripe from 'stripe';
import {
  DOWNGRADE_SCHEDULE_TAG,
  downgradeIdempotencyKey,
  downgradeScheduleUpdateParams,
  type ExistingPhase,
} from './downgradeSchedule';

const priceOf = (i: { price: string | { id: string } }) => (typeof i.price === 'string' ? i.price : i.price.id);

function phaseOf(ph: Stripe.SubscriptionSchedule.Phase): ExistingPhase {
  return {
    items: ph.items.map((i) => ({ price: priceOf(i as unknown as { price: string | { id: string } }), quantity: i.quantity ?? 1 })),
    start_date: ph.start_date,
    end_date: ph.end_date,
  };
}

export type ScheduleDowngradeResult =
  | { ok: true; boundary: Date; scheduleId: string }
  | { ok: false; reason: 'foreign_schedule' | 'stripe_failed'; message: string };

export async function scheduleDowngradeInStripe(
  stripe: Stripe,
  input: { stripeSubscriptionId: string; subscriptionRowId: string; newTierId: string; newStripePriceId: string },
): Promise<ScheduleDowngradeResult> {
  try {
    const sub = await stripe.subscriptions.retrieve(input.stripeSubscriptionId);
    const existingId = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;
    let schedule: Stripe.SubscriptionSchedule;
    if (existingId) {
      schedule = await stripe.subscriptionSchedules.retrieve(existingId);
      if (schedule.metadata?.[DOWNGRADE_SCHEDULE_TAG] !== 'true') {
        return { ok: false, reason: 'foreign_schedule', message: 'This membership already has a scheduled change.' };
      }
    } else {
      schedule = await stripe.subscriptionSchedules.create(
        { from_subscription: input.stripeSubscriptionId },
        { idempotencyKey: downgradeIdempotencyKey(input.subscriptionRowId, input.newTierId, 'from-subscription') },
      );
    }
    // Phase 0 is always the CURRENT paid period, whether the schedule is new or a fan is changing
    // which lower tier they want: re-sent unchanged, the new price follows it.
    const current = schedule.phases[0];
    const updated = await stripe.subscriptionSchedules.update(
      schedule.id,
      downgradeScheduleUpdateParams({
        existingPhase: phaseOf(current),
        newStripePriceId: input.newStripePriceId,
        metadata: { [DOWNGRADE_SCHEDULE_TAG]: 'true', crwn_tier_id: input.newTierId, crwn_subscription_id: input.subscriptionRowId },
      }) as Stripe.SubscriptionScheduleUpdateParams,
      { idempotencyKey: downgradeIdempotencyKey(input.subscriptionRowId, input.newTierId, `update-${current.end_date}`) },
    );
    return { ok: true, boundary: new Date(updated.phases[0].end_date * 1000), scheduleId: updated.id };
  } catch (e) {
    return { ok: false, reason: 'stripe_failed', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Undo a pending CRWN downgrade before a different change (an upgrade, a cancel, a pause), so the
 * subscription is an ordinary one again. 'none' when there is nothing to release; 'foreign' when a
 * schedule exists that is NOT a CRWN downgrade (left untouched; the caller decides).
 */
export async function releaseCrwnDowngrade(stripe: Stripe, stripeSubscriptionId: string): Promise<'released' | 'none' | 'foreign'> {
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const id = typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;
  if (!id) return 'none';
  const schedule = await stripe.subscriptionSchedules.retrieve(id);
  if (schedule.metadata?.[DOWNGRADE_SCHEDULE_TAG] !== 'true') return 'foreign';
  await stripe.subscriptionSchedules.release(id);
  return 'released';
}
