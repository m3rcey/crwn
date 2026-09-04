// Campaign prize fulfilment: the PLAN, decided in pure code.
//
// The founder rule this encodes: nobody loses time they already paid for, and nobody is
// ever charged because they won. So a winner's current paid period always finishes first,
// and the prize begins at their next renewal boundary. A fan with no paid subscription
// starts immediately, because there is no period to protect.
//
// WHY A PLANNER SEPARATE FROM THE EXECUTOR. Every rule worth getting right here is a
// branch (four winner states, each with a different Stripe construction), and branches are
// where money bugs live. Deciding in pure code means the rules are tested without Stripe,
// and the executor becomes a thin translation with nothing to reason about.
//
// NOTHING HERE COMES FROM A BROWSER. The plan is computed from the campaign row and the
// fan's current subscription, both read server-side. A caller supplies a campaign id and a
// fan id and nothing else: not the tier, not the duration, not the discount.
//
// ── TWO CONSTRAINTS THE EXECUTOR MUST SATISFY (found 2026-09-04, no Stripe needed) ──
//
// These are properties of CRWN's existing webhook path, not of Stripe, so they were provable
// by reading the code and they bind whatever the Stripe sandbox eventually reports.
//
// 1. `schedule_at_period_end` MUST also set `subscriptions.pending_tier_id` to the prize tier.
//    handleSubscriptionUpdated (src/lib/webhookHandlers.ts) only ever moves `tier_id` when a
//    `pending_tier_id` is already set AND the incoming Stripe price matches that tier's price.
//    With no pending tier it takes the "normal update" branch, which writes status and period
//    dates and LEAVES tier_id ALONE. So a Silver winner whose schedule flips to Platinum at
//    the boundary would pay nothing (correct) and still hold SILVER entitlement: the prize
//    would silently under-deliver the thing it promised. Setting pending_tier_id makes the
//    existing, ratified path apply the change at exactly the moment Stripe confirms the new
//    price is in force, which is also the only moment it is true. Do NOT add a second writer
//    of tier_id. Two details ride along: that path records the transition with
//    `source: 'scheduled_downgrade'`, which mislabels a prize, and it enrolls the fan in the
//    `tier_upgrade` nurture sequence, which would sell an upgrade to someone who just won one.
//
// 2. `create_now` MUST UPDATE the existing membership row, never INSERT a second one.
//    `subscriptions` is uniquely constrained on (fan_id, artist_id), and a Bronze winner
//    already holds a row with a synthetic `free_...` id. The prize swaps that row's tier_id
//    and stripe_subscription_id; an insert would simply violate the constraint.

/** Twelve MONTHLY billing periods, which is what "1 year of Platinum" is sold as. */
export const PRIZE_MONTHS = 12;

export interface CurrentSubscription {
  id: string;
  tier_id: string | null;
  status: string | null;
  stripe_subscription_id: string | null;
  /** Unix seconds. The boundary a paid winner's prize must wait for. */
  current_period_end: string | null;
  prize_campaign_id?: string | null;
}

export type PrizePlan =
  /** Already fulfilled. The only safe response to a retry, a double click or a redelivery. */
  | { action: 'already_fulfilled'; reason: string }
  /** No paid period to protect: create the prize subscription now. */
  | { action: 'create_now'; tierId: string; months: number }
  /**
   * A paid subscription exists. Its current period must finish, then the prize starts at
   * that boundary. Expressed as a schedule so Stripe owns the transition rather than a
   * cron waking up and hoping.
   */
  | { action: 'schedule_at_period_end'; tierId: string; months: number; fromStripeSubscriptionId: string; startsAt: string }
  /** Something is wrong and no money-shaped action is safe. */
  | { action: 'refuse'; reason: string };

export interface PlanInput {
  /** The prize tier, read from the CAMPAIGN, never from the request. */
  prizeTierId: string;
  /** The campaign whose prize this is. Also the idempotency identity. */
  campaignId: string;
  /** The winner's current subscription with this artist, or null. */
  current: CurrentSubscription | null;
  /** Price of the fan's current tier, in cents. 0 means a free rung. */
  currentTierPriceCents: number;
  months?: number;
}

/**
 * Decide what fulfilling this prize should do. Pure and total: every input produces a
 * plan, and anything uncertain produces `refuse` rather than a guess at somebody's money.
 */
export function planPrizeFulfillment(input: PlanInput): PrizePlan {
  const months = input.months ?? PRIZE_MONTHS;
  if (!input.prizeTierId) return { action: 'refuse', reason: 'The campaign has no prize tier configured.' };
  if (!input.campaignId) return { action: 'refuse', reason: 'No campaign.' };
  if (months <= 0 || months > 24) {
    // A duration outside the plausible range is a configuration error, not a prize.
    return { action: 'refuse', reason: 'The prize duration is not a supported length.' };
  }

  const cur = input.current;

  // IDEMPOTENCY. The fulfilled state is not a flag someone remembered to set: it is the
  // subscription itself carrying this campaign's id. A retry finds it and stops.
  if (cur?.prize_campaign_id === input.campaignId) {
    return { action: 'already_fulfilled', reason: 'This fan already holds this campaign prize.' };
  }
  // A prize from a DIFFERENT campaign is not something to silently overwrite.
  if (cur?.prize_campaign_id && cur.prize_campaign_id !== input.campaignId) {
    return { action: 'refuse', reason: 'This fan already holds a prize membership from another campaign.' };
  }

  // No membership at all, or a free one: nothing is being paid for, so nothing is lost by
  // starting now. The free row is replaced by the prize subscription on the same
  // (fan, artist) pair, which the unique constraint already guarantees is one row.
  const noPaidPeriod =
    !cur ||
    cur.status !== 'active' ||
    input.currentTierPriceCents <= 0 ||
    !cur.stripe_subscription_id ||
    cur.stripe_subscription_id.startsWith('free_');

  if (noPaidPeriod) {
    return { action: 'create_now', tierId: input.prizeTierId, months };
  }

  // A real paid subscription. Their period finishes first, always: they paid for it, and
  // winning must never cost someone the time they bought.
  // noPaidPeriod above already proved both of these are set; re-checking keeps the types
  // honest rather than asserting, and a surprise null refuses instead of scheduling blind.
  if (!cur.current_period_end || !cur.stripe_subscription_id) {
    return { action: 'refuse', reason: 'The current billing period end is unknown, so the prize cannot be scheduled safely.' };
  }
  return {
    action: 'schedule_at_period_end',
    tierId: input.prizeTierId,
    months,
    fromStripeSubscriptionId: cur.stripe_subscription_id,
    startsAt: cur.current_period_end,
  };
}

/**
 * The prize's stated value, derived from the LIVE tier price so it can never outlive it.
 * Returns null rather than a number when the price is unknown: an unstated value is
 * honest, an invented one is not.
 */
export function prizeValueLabel(tierPriceCents: number | null | undefined, months = PRIZE_MONTHS): string | null {
  if (!tierPriceCents || tierPriceCents <= 0) return null;
  const total = (tierPriceCents / 100) * months;
  return `$${total} value at $${tierPriceCents / 100}/month`;
}
