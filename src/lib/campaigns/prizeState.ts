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
 * Can CRWN, as a product, actually deliver a membership prize?
 *
 * This is the capability half of `prizeFulfillable`, and it is a statement about the PRODUCT,
 * never a founder preference. READY as of 2026-09-04, when the last dependency landed:
 *
 *   - winner state          `fan_campaign_participants.selected_winner_at`, one per campaign by
 *                           partial unique index, frozen against clients and append-only even
 *                           for the application (migration below, APPLIED and probe-verified)
 *   - recording             `recordCampaignWinner`, which writes down a result decided outside
 *                           the product and never chooses anything
 *   - two routes            `/api/fan-campaigns/[id]/winner` and `/fulfill-prize`, both
 *                           session-authorized; the second reads NOTHING from the request
 *   - delivery              `fulfillCampaignPrize` over the Stripe construction proven in test
 *                           mode (38 checks), plus the webhook transition and prize accounting
 *
 * `ready` is deliberately tied to the migration rather than asserted on its own:
 * `prizeState.test.ts` requires `EXPECTED_MIGRATION_STATE` to agree in BOTH directions, so this
 * cannot read true while the registry still calls that schema pending, or the reverse.
 *
 * READY IS NOT LIVE. This says CRWN can honour a membership prize. Whether any particular
 * campaign may show one is `campaignReadiness`, which still demands Official Rules, eligibility,
 * a free-entry path and dates. Founding A&R Week remains DRAFT and blocked on all four.
 */
export const PRIZE_RAIL = {
  ready: true as const,
  /** The schema this capability depends on. The test ties `ready` to the registry's view of it. */
  migration: 'schema-phase3-campaign-winner-selection.sql',
};
