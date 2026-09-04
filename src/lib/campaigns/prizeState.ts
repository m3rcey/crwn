// Prize membership STATE, derived from existing subscription fields. Pure.
//
// THE ACCOUNTING EDGE THIS EXISTS FOR. A paying Gold member wins the prize. Their prize is
// SCHEDULED for their next renewal, but today they are still genuinely paying $25/month, and
// that $25 is real revenue until the boundary. The first prize-aware rule excluded every row
// carrying `prize_campaign_id`, which would have erased that member's real MRR months before
// the prize began. So "has a prize" and "prize is active" are different facts, and only the
// second one changes the money.
//
// HOW THE TWO STATES ARE DISTINGUISHED, WITH NO NEW SCHEMA. The executor writes
// `pending_change_date` = the renewal boundary on every SCHEDULED prize (it is the same
// column a scheduled downgrade already uses for exactly this meaning: "the date the pending
// change takes effect"). An IMMEDIATE prize writes it null. So:
//
//   prize_campaign_id set, pending_change_date null or past   -> ACTIVE   (member, not payer)
//   prize_campaign_id set, pending_change_date in the future  -> SCHEDULED (still a payer)
//
// The webhook clears pending_change_date when it applies a scheduled tier change, so a
// Silver/Gold winner converges on "null = active" the moment Stripe confirms the switch. A
// Platinum winner's tier never changes, so nothing clears the date for them; the comparison
// against `now` is what turns them active at the boundary, and the handler tidies the column
// afterwards. Both paths therefore answer correctly whether or not a webhook is late.

export interface PrizeAwareSubscription {
  status: string | null;
  prize_campaign_id?: string | null;
  pending_change_date?: string | null;
}

/**
 * Is this membership's prize in force RIGHT NOW?
 *
 * An unparseable date on a prize row is treated as active. That is the conservative direction
 * for money: the failure it accepts is under-reporting revenue on a malformed row, and the one
 * it refuses is reporting revenue nobody pays.
 */
export function isPrizeActive(s: PrizeAwareSubscription, now: Date): boolean {
  if (!s.prize_campaign_id) return false;
  if (!s.pending_change_date) return true;
  const t = Date.parse(s.pending_change_date);
  if (!Number.isFinite(t)) return true;
  return t <= now.getTime();
}

/** A prize that has been granted but has not started: the fan is still paying their own tier. */
export function isPrizeScheduled(s: PrizeAwareSubscription, now: Date): boolean {
  return !!s.prize_campaign_id && !isPrizeActive(s, now);
}

/**
 * THE ONE RULE for "does this membership count as paying". Every MRR and paying-member
 * derivation reads it (constraint assembler, roadmap, analytics), so the three cannot drift.
 *
 * A member counts as paying when the row is active, the tier has a price, and no prize is
 * currently covering that price. Entitlement is deliberately not in here: a prize member is a
 * full member for access, and access never reads price.
 */
export function countsAsPaying(s: PrizeAwareSubscription, tierPriceCents: number, now: Date): boolean {
  if (s.status !== 'active') return false;
  if (tierPriceCents <= 0) return false;
  return !isPrizeActive(s, now);
}

/**
 * The prize tier a campaign is configured to deliver, or null.
 *
 * Lives in the campaign toolkit beside the other prize facts (`prize`, `prize_value`,
 * `official_rules_url`), which is draft-time configuration and frozen at launch. It is a
 * POINTER: the executor confirms the tier belongs to the campaign's artist before it is ever
 * used, and readiness only checks that it is well-formed.
 */
export function prizeTierIdOf(toolkit: Record<string, unknown> | null | undefined): string | null {
  const v = toolkit?.prize_tier_id;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

/**
 * Can CRWN, as a product, actually deliver a membership prize today?
 *
 * This is the capability half of `prizeFulfillable`. The delivery rail (executor, Stripe
 * construction, webhook transitions, accounting) is built and tested. What is NOT built is any
 * surface that can invoke it in production: `fan_campaign_participants` has no column that can
 * record "this participant was selected as the winner", and the ratified rule on its `role`
 * column is that it never authorizes anything. Without a durable selection there is nothing for
 * an endpoint to check, so there is no endpoint, so a fan must not yet be shown a prize.
 *
 * Flip to true in the same change that ships the selection field and the endpoint that reads
 * it. Not before, and never as a constant edit on its own: `prizeState.test.ts` pins the reason.
 */
export const PRIZE_RAIL = {
  ready: false as const,
  blocker: 'No surface can award the prize yet: campaign participants cannot record a selected winner.',
};
