// When does a PENDING tier change actually take effect? Pure.
//
// `subscriptions.pending_tier_id` is a stated intention ("move this fan to that tier at the
// boundary"). It becomes the truth only when Stripe confirms the subscription is now BILLING
// that tier, which the webhook sees as the live item price equalling the pending tier's
// Stripe price. Until then the fan keeps the tier they are paying for.
//
// WHY THIS IS A SEPARATE MODULE. The decision used to live inline in handleSubscriptionUpdated
// and compared the live price against the CURRENT tier's price (the embed joined
// subscriptions_tier_id_fkey, then the value was used as if it were the pending tier's). Those
// are always equal before the change, so any subscription.updated event applied the pending
// tier immediately. For a scheduled downgrade that meant CRWN showed the lower tier while
// Stripe kept billing the higher one; for a scheduled prize it would have granted Platinum the
// instant the schedule attached, months before the prize began. Pulling the comparison out
// makes it testable without the webhook's forty imports, and makes the bug impossible to
// reintroduce by accident.

export interface PendingApplyInput {
  /** The price Stripe reports the subscription is billing right now. */
  liveStripePriceId: string | null | undefined;
  /** The Stripe price of the tier waiting in pending_tier_id. Null when it cannot be resolved. */
  pendingTierStripePriceId: string | null | undefined;
  /** True when this membership is a campaign prize. */
  isPrize: boolean;
}

export type PendingApplyDecision =
  | { apply: false }
  | {
      apply: true;
      /** What to record the movement as. A prize is granted, not bought, and never a downgrade. */
      source: 'scheduled_downgrade' | 'campaign_prize';
      /**
       * Whether to enrol the fan in the tier_upgrade nurture. A prize winner did not upgrade,
       * they won, and selling them an upgrade they were just handed is the wrong email.
       */
      enrollUpgradeNurture: boolean;
    };

export function decidePendingApply(input: PendingApplyInput): PendingApplyDecision {
  // Unresolvable pending price: never apply on a guess. The pending intention stays queued
  // and the next event with a resolvable price decides.
  if (!input.pendingTierStripePriceId || !input.liveStripePriceId) return { apply: false };
  if (input.liveStripePriceId !== input.pendingTierStripePriceId) return { apply: false };
  return {
    apply: true,
    source: input.isPrize ? 'campaign_prize' : 'scheduled_downgrade',
    enrollUpgradeNurture: !input.isPrize,
  };
}

/**
 * A scheduled prize on a member whose tier does NOT change (an existing Platinum winner)
 * carries `pending_change_date` with no `pending_tier_id`, so the apply branch above never
 * runs for them. The prize turns active by the date alone (see prizeState.ts). This says when
 * the handler may tidy that column so the row converges on the same "null = active" shape a
 * Silver/Gold winner reaches through the apply branch.
 */
export function shouldClearPassedPrizeBoundary(
  row: { prize_campaign_id?: string | null; pending_tier_id?: string | null; pending_change_date?: string | null },
  now: Date,
): boolean {
  if (!row.prize_campaign_id) return false;
  if (row.pending_tier_id) return false;
  if (!row.pending_change_date) return false;
  const t = Date.parse(row.pending_change_date);
  return Number.isFinite(t) && t <= now.getTime();
}
