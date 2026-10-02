// stillApplies.ts: PURE. Does an artist-to-fan sequence still describe this fan's situation?
//
// Re-decided before EVERY step by the fan sequences cron, because an enrollment is a snapshot of
// one moment and the fan keeps moving. Audited 2026-10-02:
//   • A free member who LEFT kept receiving the free-member nurture ("as a member you get...").
//   • A fan who abandoned one checkout and then paid on another still got "You left something
//     behind": the seeded cart sequence has no goal tier, so the goal exit never closed it.
//   • A churned fan who came back kept getting the win-back.
// The conversion-goal exit (goalExit.ts) only covers sequences that carry a goal tier; this
// covers the membership facts every trigger implies, goal or no goal.

export interface FanMembershipFacts {
  /** The fan holds an ACTIVE membership (free or paid) with this artist. */
  activeMember: boolean;
  /** That active membership is on a priced tier. */
  paidMember: boolean;
}

export type StillAppliesDecision = 'send' | 'complete' | 'cancel';

/** Triggers that address a CURRENT member. Without a membership they no longer apply. */
const MEMBER_TRIGGERS = new Set(['free_join', 'new_subscription', 'tier_upgrade', 'inactive_subscriber', 'loyalty_survey']);

/**
 * Days to wait between one step and the next. A step's `delay_days` is "day N after the fan
 * entered the sequence": the builder labels it "day N", new steps default to the last day + 3, and
 * every stored sequence is strictly increasing (production, 2026-10-02). So the wait is the GAP.
 * A non-increasing pair (never stored today) waits one day, so a typo can never send two steps at
 * once and never stalls a fan for the whole delay again.
 */
export function stepGapDays(currentDelay: number | null | undefined, nextDelay: number | null | undefined): number {
  const cur = Number(currentDelay) || 0;
  const next = Number(nextDelay) || 0;
  return next > cur ? next - cur : 1;
}

export function sequenceStillApplies(triggerType: string | null | undefined, f: FanMembershipFacts): StillAppliesDecision {
  const t = triggerType ?? '';
  if (MEMBER_TRIGGERS.has(t)) {
    if (!f.activeMember) return 'cancel';
    // A free-member nurture exists to bring them to a paid rung; once they are on one it is done.
    if (t === 'free_join' && f.paidMember) return 'complete';
    return 'send';
  }
  // They bought (or came back): the reason for the email is gone.
  if (t === 'abandoned_cart' || t === 'win_back') return f.paidMember ? 'complete' : 'send';
  // new_purchase, post_purchase_upsell and anything unknown: membership is not their premise.
  return 'send';
}
