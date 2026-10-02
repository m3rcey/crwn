import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stepDownOffer } from './stepDown';
import { downgradeScheduleUpdateParams } from './downgradeSchedule';

// Founder decision 2026-10-02: a cancelling fan is offered a cheaper tier first. The offer is only
// honest because the downgrade it triggers is now scheduled IN STRIPE (it used to change only a
// database column, so the fan kept paying the higher price forever).

const tiers = [
  { id: 'bronze', name: 'Bronze', price: 0, stripe_price_id: null },
  { id: 'silver', name: 'Silver', price: 1000, stripe_price_id: 'price_s' },
  { id: 'gold', name: 'Gold', price: 2500, stripe_price_id: 'price_g' },
  { id: 'plat', name: 'Platinum', price: 10000, stripe_price_id: 'price_p' },
];

describe('stepDownOffer', () => {
  it('offers the NEXT cheaper paid rung, not the cheapest', () => {
    expect(stepDownOffer(tiers, 'plat')).toEqual({ tierId: 'gold', name: 'Gold', priceCents: 2500 });
    expect(stepDownOffer(tiers, 'gold')?.tierId).toBe('silver');
  });
  it('never offers the free tier (that is a cancel plus a free join, not a downgrade)', () => {
    expect(stepDownOffer(tiers, 'silver')).toBeNull();
  });
  it('never offers a tier that cannot bill', () => {
    expect(stepDownOffer([...tiers.slice(0, 1), { ...tiers[1], stripe_price_id: null }, tiers[2]], 'gold')).toBeNull();
  });
  it('nothing for a free member or an unknown tier', () => {
    expect(stepDownOffer(tiers, 'bronze')).toBeNull();
    expect(stepDownOffer(tiers, 'nope')).toBeNull();
  });
  it('skips an inactive rung', () => {
    expect(stepDownOffer([...tiers.slice(0, 2), { ...tiers[2], is_active: false }, tiers[3]], 'plat')?.tierId).toBe('silver');
  });
});

describe('downgradeScheduleUpdateParams (proven by scripts/verify-downgrade-schedule.mjs)', () => {
  const p = downgradeScheduleUpdateParams({
    existingPhase: { items: [{ price: 'price_g', quantity: 1 }], start_date: 100, end_date: 200 },
    newStripePriceId: 'price_s',
    metadata: { k: 'v' },
  });
  it('re-sends the paid period unchanged, so it is neither shortened nor refunded', () => {
    expect(p.phases[0]).toEqual({ items: [{ price: 'price_g', quantity: 1 }], start_date: 100, end_date: 200 });
  });
  it('then bills the lower price, and releases to an ordinary subscription', () => {
    expect(p.phases[1].items).toEqual([{ price: 'price_s', quantity: 1 }]);
    expect(p.phases[1].duration).toEqual({ interval: 'month', interval_count: 1 });
    expect(p.end_behavior).toBe('release');
  });
});

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const ROUTE = strip(readFileSync('src/app/api/stripe/subscription-update/route.ts', 'utf8'));
const CANCEL = strip(readFileSync('src/app/api/subscriptions/cancel/route.ts', 'utf8'));
const HARNESS = readFileSync('scripts/verify-downgrade-schedule.mjs', 'utf8');

describe('wiring', () => {
  it('REGRESSION: a downgrade is scheduled in Stripe BEFORE the pending row is written', () => {
    const stripeAt = ROUTE.indexOf('scheduleDowngradeInStripe(');
    const rowAt = ROUTE.indexOf('pending_tier_id: newTierId');
    expect(stripeAt).toBeGreaterThan(-1);
    expect(rowAt).toBeGreaterThan(stripeAt);
  });
  it('upgrade and cancel release a pending step-down first', () => {
    expect(ROUTE).toContain('releaseCrwnDowngrade(');
    expect(CANCEL.indexOf('releaseCrwnDowngrade(')).toBeGreaterThan(-1);
    expect(CANCEL.indexOf('releaseCrwnDowngrade(')).toBeLessThan(CANCEL.indexOf('cancel_at_period_end: true'));
  });
  it('the Stripe harness proves the SAME construction the route sends', () => {
    expect(HARNESS).toContain("from '../src/lib/subscriptions/downgradeSchedule.ts'");
    expect(HARNESS).toContain('downgradeScheduleUpdateParams(');
  });
});
