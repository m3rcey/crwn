import { describe, it, expect } from 'vitest';
import { planPrizeFulfillment, prizeValueLabel, PRIZE_MONTHS, type CurrentSubscription } from './prizeFulfillment';

const CAMPAIGN = 'camp-1';
const PLATINUM = 'tier-platinum';
const PERIOD_END = '2026-10-01T00:00:00Z';

const sub = (over: Partial<CurrentSubscription> = {}): CurrentSubscription => ({
  id: 's1',
  tier_id: 'tier-gold',
  status: 'active',
  stripe_subscription_id: 'sub_live_123',
  current_period_end: PERIOD_END,
  ...over,
});

const plan = (current: CurrentSubscription | null, priceCents: number) =>
  planPrizeFulfillment({ prizeTierId: PLATINUM, campaignId: CAMPAIGN, current, currentTierPriceCents: priceCents });

describe('winner has no paid period: the prize starts now', () => {
  it('a fan with NO subscription starts immediately', () => {
    expect(plan(null, 0)).toEqual({ action: 'create_now', tierId: PLATINUM, months: 12 });
  });

  it('a BRONZE (free) member starts immediately: there is no paid time to protect', () => {
    const p = plan(sub({ tier_id: 'tier-bronze', stripe_subscription_id: 'free_abc_def' }), 0);
    expect(p.action).toBe('create_now');
  });

  it('a CANCELLED paid subscription starts immediately', () => {
    expect(plan(sub({ status: 'canceled' }), 2500).action).toBe('create_now');
  });
});

describe('winner is already paying: their paid period finishes first', () => {
  it.each([
    ['SILVER', 'tier-silver', 1000],
    ['GOLD', 'tier-gold', 2500],
    ['PLATINUM', 'tier-platinum', 5000],
  ])('%s waits for the renewal boundary, losing no paid time', (_label, tierId, price) => {
    const p = plan(sub({ tier_id: tierId }), price);
    expect(p).toEqual({
      action: 'schedule_at_period_end',
      tierId: PLATINUM,
      months: 12,
      fromStripeSubscriptionId: 'sub_live_123',
      startsAt: PERIOD_END,
    });
  });

  it('an existing PLATINUM keeps paying to their boundary, then twelve free months', () => {
    // No refund, no duplicate subscription, no lost time: the schedule just continues.
    const p = plan(sub({ tier_id: 'tier-platinum' }), 5000);
    expect(p.action).toBe('schedule_at_period_end');
    if (p.action === 'schedule_at_period_end') expect(p.startsAt).toBe(PERIOD_END);
  });

  it('REFUSES when the period end is unknown rather than guessing at someone\'s money', () => {
    const p = plan(sub({ current_period_end: null }), 2500);
    expect(p.action).toBe('refuse');
  });
});

describe('idempotency: the subscription itself is the fulfilled record', () => {
  it('a retry finds the existing prize and does nothing', () => {
    const p = plan(sub({ prize_campaign_id: CAMPAIGN }), 5000);
    expect(p.action).toBe('already_fulfilled');
  });

  it('twelve months can never become twenty-four', () => {
    // The second call cannot reach any create/schedule branch at all.
    const first = plan(null, 0);
    expect(first.action).toBe('create_now');
    const second = plan(sub({ tier_id: PLATINUM, prize_campaign_id: CAMPAIGN }), 5000);
    expect(second.action).toBe('already_fulfilled');
  });

  it('a prize from ANOTHER campaign is refused, never silently overwritten', () => {
    const p = plan(sub({ prize_campaign_id: 'other-campaign' }), 5000);
    expect(p.action).toBe('refuse');
  });
});

describe('configuration is refused, never improvised', () => {
  it('no prize tier configured', () => {
    expect(planPrizeFulfillment({ prizeTierId: '', campaignId: CAMPAIGN, current: null, currentTierPriceCents: 0 }).action).toBe('refuse');
  });
  it('no campaign', () => {
    expect(planPrizeFulfillment({ prizeTierId: PLATINUM, campaignId: '', current: null, currentTierPriceCents: 0 }).action).toBe('refuse');
  });
  it('an implausible duration is refused, so no request can mint years of free membership', () => {
    for (const months of [0, -1, 25, 1200]) {
      expect(planPrizeFulfillment({ prizeTierId: PLATINUM, campaignId: CAMPAIGN, current: null, currentTierPriceCents: 0, months }).action).toBe('refuse');
    }
  });
  it('the default duration is exactly twelve monthly periods', () => {
    expect(PRIZE_MONTHS).toBe(12);
    const p = plan(null, 0);
    if (p.action === 'create_now') expect(p.months).toBe(12);
  });
});

describe('prize value stays tied to the real price', () => {
  it('derives $600 from $50/month', () => {
    expect(prizeValueLabel(5000)).toBe('$600 value at $50/month');
  });
  it('follows a price change instead of outliving it', () => {
    expect(prizeValueLabel(2500)).toBe('$300 value at $25/month');
  });
  it('states nothing when the price is unknown', () => {
    expect(prizeValueLabel(null)).toBeNull();
    expect(prizeValueLabel(0)).toBeNull();
  });
});
