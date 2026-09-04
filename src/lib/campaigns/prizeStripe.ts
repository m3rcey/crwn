// The Stripe CONSTRUCTION of a membership prize, as PROVEN in test mode on 2026-09-04. Pure.
//
// Every shape here was read back from a real Stripe test object rather than assumed, and three
// of the original assumptions were wrong (see docs/crwn-brain/10-INTEGRATIONS.md, the sandbox
// section). The load-bearing facts:
//
//   - a phase discount is `discounts: [{ coupon }]`; `coupon` on a phase is REJECTED under
//     billing_mode flexible, which is what this API version uses on schedules
//   - a phase length is `duration: { interval: 'month', interval_count }`; `iterations` is an
//     unknown parameter
//   - an immediate schedule must start at 'now'; a start even seconds in the future leaves it
//     `not_started` with no subscription behind it
//   - the hard stop is `end_behavior: 'cancel'` with the prize as the final phase
//   - the coupon is `percent_off: 100, duration: 'repeating', duration_in_months: N`; `forever`
//     would outlive the prize and `once` would leave months 2..N payable
//
// The executor uses these; the test harness in scripts/verify-prize-lifecycle.mjs carries the
// same literals and `prizeStripe.test.ts` scans it for them, so the two cannot drift apart.

export const PRIZE_COUPON_PREFIX = 'crwn-prize-';

/** One coupon per campaign, with a DETERMINISTIC id so a retry finds it instead of minting another. */
export function prizeCouponId(campaignId: string): string {
  return PRIZE_COUPON_PREFIX + campaignId;
}

export function prizeCouponParams(campaignId: string, months: number, label: string) {
  return {
    id: prizeCouponId(campaignId),
    percent_off: 100,
    duration: 'repeating' as const,
    duration_in_months: months,
    name: label,
    metadata: { crwn_prize_campaign_id: campaignId },
  };
}

export interface PrizePhaseInput {
  stripePriceId: string;
  couponId: string;
  months: number;
  metadata: Record<string, string>;
}

/** The prize phase itself, shaped exactly as Stripe accepted it. */
export function prizePhase(input: PrizePhaseInput) {
  return {
    items: [{ price: input.stripePriceId, quantity: 1 }],
    discounts: [{ coupon: input.couponId }],
    duration: { interval: 'month' as const, interval_count: input.months },
    metadata: input.metadata,
  };
}

/**
 * Money routing for the prize subscription. Mirrors CRWN's normal fan-subscription topology
 * (platform account, transfer to the artist, platform fee) so that if a prize invoice ever
 * carried an amount, it would flow exactly where a paid one does. On a $0 invoice test mode
 * showed zero charges, zero transfers and no fee, so this is a safety rail, not a revenue path.
 */
export function prizeDefaultSettings(connectAccountId: string | null, feePercent: number) {
  if (!connectAccountId) return undefined;
  return {
    transfer_data: { destination: connectAccountId },
    application_fee_percent: feePercent,
  };
}

/** Immediate prize: a fan with nothing paid to protect. Starts NOW, one phase, then cancels. */
export function immediatePrizeScheduleParams(input: {
  customerId: string;
  phase: ReturnType<typeof prizePhase>;
  defaultSettings: ReturnType<typeof prizeDefaultSettings>;
  metadata: Record<string, string>;
}) {
  return {
    customer: input.customerId,
    start_date: 'now' as const,
    end_behavior: 'cancel' as const,
    phases: [input.phase],
    ...(input.defaultSettings ? { default_settings: input.defaultSettings } : {}),
    metadata: input.metadata,
  };
}

/**
 * Scheduled prize: the fan's current paid phase is re-sent UNCHANGED (Stripe requires every
 * phase on update), and the prize phase is appended after it. Phase 0's `end_date` is the
 * boundary the fan already paid through; test mode confirmed it comes back identical.
 */
export function scheduledPrizeUpdateParams(input: {
  existingPhase: { items: { price: string; quantity: number }[]; start_date: number; end_date: number };
  phase: ReturnType<typeof prizePhase>;
  metadata: Record<string, string>;
}) {
  return {
    end_behavior: 'cancel' as const,
    phases: [
      {
        items: input.existingPhase.items,
        start_date: input.existingPhase.start_date,
        end_date: input.existingPhase.end_date,
      },
      input.phase,
    ],
    metadata: input.metadata,
  };
}

/** Deterministic Stripe idempotency keys: the same (campaign, fan, step) can never create twice. */
export function prizeIdempotencyKey(campaignId: string, fanId: string, step: string): string {
  return ['crwn-prize', campaignId, fanId, step].join(':');
}
