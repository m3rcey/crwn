import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  immediatePrizeScheduleParams,
  prizeCouponId,
  prizeCouponParams,
  prizeDefaultSettings,
  prizeIdempotencyKey,
  prizePhase,
  scheduledPrizeUpdateParams,
} from './prizeStripe';

/**
 * The Stripe construction, pinned to what TEST MODE PROVED on 2026-09-04 (35 checks, 0
 * failures). Three of the original assumptions were wrong, so these assert the corrected
 * shapes by name: a future reader who "tidies" `discounts` back to `coupon`, or `duration`
 * back to `iterations`, breaks the prize on the first real winner and this test first.
 */

const PHASE = prizePhase({ stripePriceId: 'price_plat', couponId: 'crwn-prize-c1', months: 12, metadata: { crwn_prize_campaign_id: 'c1' } });

describe('the coupon', () => {
  it('is 100% off, REPEATING for exactly the prize months, with a deterministic id', () => {
    const p = prizeCouponParams('c1', 12, 'Prize');
    expect(p.percent_off).toBe(100);
    expect(p.duration).toBe('repeating');
    expect(p.duration_in_months).toBe(12);
    expect(p.id).toBe(prizeCouponId('c1'));
    expect(prizeCouponId('c1')).toBe(prizeCouponId('c1'));
    expect(prizeCouponId('c1')).not.toBe(prizeCouponId('c2'));
  });

  it('is never forever and never once', () => {
    // forever would outlive the prize; once would leave months 2..12 payable.
    const p = prizeCouponParams('c1', 12, 'Prize') as { duration: string };
    expect(p.duration).not.toBe('forever');
    expect(p.duration).not.toBe('once');
  });
});

describe('the prize phase', () => {
  it('attaches the discount as discounts:[{coupon}], never as a phase-level coupon', () => {
    expect(PHASE.discounts).toEqual([{ coupon: 'crwn-prize-c1' }]);
    expect('coupon' in PHASE).toBe(false);
  });

  it('states its length as duration (months), never as iterations', () => {
    expect(PHASE.duration).toEqual({ interval: 'month', interval_count: 12 });
    expect('iterations' in PHASE).toBe(false);
    expect('end_date' in PHASE).toBe(false);
  });

  it('bills exactly the tier price it was given, quantity one', () => {
    expect(PHASE.items).toEqual([{ price: 'price_plat', quantity: 1 }]);
  });
});

describe('immediate schedule (Bronze / no paid period)', () => {
  const params = immediatePrizeScheduleParams({
    customerId: 'cus_1', phase: PHASE, defaultSettings: prizeDefaultSettings('acct_1', 8), metadata: { crwn_prize_campaign_id: 'c1' },
  });

  it("starts at 'now': a future start leaves the schedule not_started with no subscription", () => {
    expect(params.start_date).toBe('now');
  });

  it('is one phase that ends by cancelling, so there is no thirteenth month', () => {
    expect(params.phases).toHaveLength(1);
    expect(params.end_behavior).toBe('cancel');
  });

  it('routes money the way a paid subscription would, if any ever appeared', () => {
    expect(params.default_settings).toEqual({ transfer_data: { destination: 'acct_1' }, application_fee_percent: 8 });
  });

  it('omits routing entirely for an artist with no Connect account rather than sending a null', () => {
    const p = immediatePrizeScheduleParams({ customerId: 'cus_1', phase: PHASE, defaultSettings: prizeDefaultSettings(null, 8), metadata: {} });
    expect('default_settings' in p).toBe(false);
  });
});

describe('scheduled update (paid winner)', () => {
  const existing = { items: [{ price: 'price_silver', quantity: 1 }], start_date: 1_000, end_date: 2_000 };
  const params = scheduledPrizeUpdateParams({ existingPhase: existing, phase: PHASE, metadata: {} });

  it('re-sends the paid phase UNCHANGED, with its original end date', () => {
    expect(params.phases[0]).toEqual({ items: existing.items, start_date: 1_000, end_date: 2_000 });
  });

  it('appends the prize as the FINAL phase and cancels after it', () => {
    expect(params.phases).toHaveLength(2);
    expect(params.phases[1]).toBe(PHASE);
    expect(params.end_behavior).toBe('cancel');
  });

  it('puts no discount on the paid phase: the fan pays their own tier until the boundary', () => {
    expect('discounts' in params.phases[0]).toBe(false);
  });
});

describe('idempotency keys', () => {
  it('are deterministic per (campaign, fan, step) and distinct across each', () => {
    expect(prizeIdempotencyKey('c1', 'f1', 'immediate')).toBe(prizeIdempotencyKey('c1', 'f1', 'immediate'));
    expect(prizeIdempotencyKey('c1', 'f1', 'immediate')).not.toBe(prizeIdempotencyKey('c1', 'f2', 'immediate'));
    expect(prizeIdempotencyKey('c1', 'f1', 'immediate')).not.toBe(prizeIdempotencyKey('c2', 'f1', 'immediate'));
    expect(prizeIdempotencyKey('c1', 'f1', 'immediate')).not.toBe(prizeIdempotencyKey('c1', 'f1', 'append-prize'));
  });
});

describe('the test harness carries the SAME construction, so proof and production cannot drift', () => {
  const harness = readFileSync(new URL('../../../scripts/verify-prize-lifecycle.mjs', import.meta.url), 'utf8');

  it.each([
    ['phase discount shape', "discounts = [{ coupon: coupon.id }]"],
    ['phase duration shape', "duration = { interval: 'month', interval_count: PRIZE_MONTHS }"],
    ['coupon duration', "duration: 'repeating', duration_in_months: PRIZE_MONTHS"],
    ['immediate start', "start_date: 'now'"],
    ['hard stop', "end_behavior: 'cancel'"],
    ['from_subscription for paid winners', 'from_subscription: paid.id'],
  ])('%s', (_label, literal) => {
    expect(harness).toContain(literal);
  });

  it('never imports the app Stripe client or the production executor', () => {
    expect(harness).not.toMatch(/lib\/stripe\/client/);
    expect(harness).not.toMatch(/prizeExecutor/);
    expect(harness).toMatch(/requireTestModeStripe/);
  });
});
