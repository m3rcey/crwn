// downgradeSchedule.ts: PURE. The Stripe construction of a tier downgrade at the paid boundary.
//
// THE DEFECT THIS CLOSES (2026-10-02). /api/stripe/subscription-update recorded a downgrade as
// `subscriptions.pending_tier_id` and changed nothing in Stripe. The webhook applies a pending
// tier only when Stripe BILLS that tier's price (pendingTierApply.ts), which never happened: the
// fan kept paying the higher price indefinitely and the lower tier never took effect.
//
// THE CONSTRUCTION, reusing what the prize rail proved in test mode (prizeStripe.ts):
//   - the schedule is created `from_subscription`, which mirrors the live subscription as phase 0
//     and carries its routing (transfer_data + application_fee_percent) onto default_settings,
//   - phase 0 is re-sent UNCHANGED (Stripe requires every phase on update), so the period the fan
//     already paid for is neither shortened nor refunded,
//   - phase 1 is the lower price for one month (`duration`, not `iterations`, on this API version),
//   - `end_behavior: 'release'` hands it back as an ordinary subscription on the lower price.
// No proration: the fan keeps the higher tier until the boundary, then pays the lower price.
// Proven end to end on a Stripe test clock by scripts/verify-downgrade-schedule.mjs, which imports
// THIS file, so the harness and the route cannot construct two different things.

export interface ExistingPhase {
  items: { price: string; quantity: number }[];
  start_date: number;
  end_date: number;
}

export function downgradeScheduleUpdateParams(input: {
  existingPhase: ExistingPhase;
  newStripePriceId: string;
  metadata: Record<string, string>;
}) {
  return {
    end_behavior: 'release' as const,
    phases: [
      {
        items: input.existingPhase.items,
        start_date: input.existingPhase.start_date,
        end_date: input.existingPhase.end_date,
      },
      {
        items: [{ price: input.newStripePriceId, quantity: 1 }],
        duration: { interval: 'month' as const, interval_count: 1 },
      },
    ],
    metadata: input.metadata,
  };
}

/** Marks a schedule as a CRWN downgrade, so a retry reuses it and a foreign schedule is refused. */
export const DOWNGRADE_SCHEDULE_TAG = 'crwn_tier_downgrade';

/** Deterministic Stripe idempotency key: the same (subscription, target tier, step) never creates twice. */
export function downgradeIdempotencyKey(subscriptionId: string, tierId: string, step: string): string {
  return ['crwn-downgrade', subscriptionId, tierId, step].join(':');
}
