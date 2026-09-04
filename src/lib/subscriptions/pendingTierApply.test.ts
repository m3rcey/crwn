import { describe, it, expect } from 'vitest';
import { decidePendingApply, shouldClearPassedPrizeBoundary } from './pendingTierApply';

/**
 * When a pending tier change takes effect. The regression that matters most is the first
 * one: the inline version compared the live price against the CURRENT tier's price, which is
 * always equal before the change, so every scheduled change applied on the next event.
 */

describe('decidePendingApply', () => {
  it('REGRESSION: the live price still equal to the CURRENT tier must NOT apply the pending tier', () => {
    // Silver winner, Platinum scheduled. Stripe still bills Silver. Nothing has happened yet.
    const d = decidePendingApply({ liveStripePriceId: 'price_silver', pendingTierStripePriceId: 'price_platinum', isPrize: true });
    expect(d.apply).toBe(false);
  });

  it('applies exactly when Stripe is billing the PENDING tier price', () => {
    const d = decidePendingApply({ liveStripePriceId: 'price_platinum', pendingTierStripePriceId: 'price_platinum', isPrize: true });
    expect(d).toEqual({ apply: true, source: 'campaign_prize', enrollUpgradeNurture: false });
  });

  it('a scheduled DOWNGRADE is recorded as one and still enrols the upgrade nurture', () => {
    const d = decidePendingApply({ liveStripePriceId: 'price_silver', pendingTierStripePriceId: 'price_silver', isPrize: false });
    expect(d).toEqual({ apply: true, source: 'scheduled_downgrade', enrollUpgradeNurture: true });
  });

  it('a prize is never recorded as a downgrade and never sells the winner an upgrade', () => {
    const d = decidePendingApply({ liveStripePriceId: 'p', pendingTierStripePriceId: 'p', isPrize: true });
    expect(d.apply && d.source).toBe('campaign_prize');
    expect(d.apply && d.enrollUpgradeNurture).toBe(false);
  });

  it('never applies on an unresolvable price, in either direction', () => {
    expect(decidePendingApply({ liveStripePriceId: 'p', pendingTierStripePriceId: null, isPrize: false }).apply).toBe(false);
    expect(decidePendingApply({ liveStripePriceId: 'p', pendingTierStripePriceId: undefined, isPrize: true }).apply).toBe(false);
    expect(decidePendingApply({ liveStripePriceId: undefined, pendingTierStripePriceId: 'p', isPrize: true }).apply).toBe(false);
    expect(decidePendingApply({ liveStripePriceId: '', pendingTierStripePriceId: '', isPrize: false }).apply).toBe(false);
  });
});

describe('shouldClearPassedPrizeBoundary (the Platinum-winner tidy)', () => {
  const NOW = new Date('2026-10-05T00:00:00Z');

  it('clears a passed boundary on a prize with no tier change', () => {
    expect(shouldClearPassedPrizeBoundary({ prize_campaign_id: 'c', pending_tier_id: null, pending_change_date: '2026-10-04T00:00:00Z' }, NOW)).toBe(true);
  });

  it('leaves a FUTURE boundary alone: the prize has not started', () => {
    expect(shouldClearPassedPrizeBoundary({ prize_campaign_id: 'c', pending_tier_id: null, pending_change_date: '2026-11-04T00:00:00Z' }, NOW)).toBe(false);
  });

  it('never touches a row with a pending TIER: that is the apply branch\'s job', () => {
    expect(shouldClearPassedPrizeBoundary({ prize_campaign_id: 'c', pending_tier_id: 'plat', pending_change_date: '2026-10-04T00:00:00Z' }, NOW)).toBe(false);
  });

  it('never touches a non-prize row, so a scheduled downgrade keeps its date', () => {
    expect(shouldClearPassedPrizeBoundary({ prize_campaign_id: null, pending_tier_id: null, pending_change_date: '2026-10-04T00:00:00Z' }, NOW)).toBe(false);
  });

  it('nothing to clear on a row with no date', () => {
    expect(shouldClearPassedPrizeBoundary({ prize_campaign_id: 'c', pending_change_date: null }, NOW)).toBe(false);
  });
});
