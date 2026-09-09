import { describe, it, expect } from 'vitest';
import {
  chargesMilestonePresent,
  stripeChargesReady,
  resolvedPriceId,
  tierPurchaseBlocker,
  PURCHASE_BLOCKER_MESSAGE,
} from './paymentReadiness';

// The defect this file pins (Astra activation audit, 2026-09-08): /api/stripe/checkout guarded
// on `stripe_connect_id` alone, but the connect route saves that id BEFORE Stripe onboarding, so
// every artist who abandoned onboarding showed fans a live Subscribe button that ended in
// "Failed to create checkout session".

const PRICED = { stripe_price_id: 'price_monthly', stripe_annual_price_id: 'price_annual' };

describe('chargesMilestonePresent', () => {
  it('is false without the milestone', () => {
    expect(chargesMilestonePresent({ activation_milestones: {} })).toBe(false);
    expect(chargesMilestonePresent({ activation_milestones: { tiers_created: 'x' } })).toBe(false);
  });

  it('is true once Stripe confirmed charges', () => {
    expect(chargesMilestonePresent({ activation_milestones: { stripe_connected: '2026-09-08' } })).toBe(true);
  });

  it('never throws on a missing, null or malformed row', () => {
    expect(chargesMilestonePresent(null)).toBe(false);
    expect(chargesMilestonePresent(undefined)).toBe(false);
    expect(chargesMilestonePresent({})).toBe(false);
    expect(chargesMilestonePresent({ activation_milestones: 'not-an-object' })).toBe(false);
  });
});

describe('stripeChargesReady', () => {
  it('REFUSES an account id with no charges milestone (the audit defect)', () => {
    // Exactly the state of an artist who clicked Connect Stripe and stopped at the phone screen.
    expect(stripeChargesReady({ stripe_connect_id: 'acct_started', activation_milestones: {} })).toBe(false);
  });

  it('refuses a charges milestone with no account id', () => {
    expect(stripeChargesReady({ stripe_connect_id: null, activation_milestones: { stripe_connected: 'x' } })).toBe(false);
  });

  it('accepts only both facts together', () => {
    expect(stripeChargesReady({ stripe_connect_id: 'acct_1', activation_milestones: { stripe_connected: 'x' } })).toBe(true);
  });

  it('is the milestone predicate plus the id, never a separate rule', () => {
    const row = { stripe_connect_id: 'acct_1', activation_milestones: { stripe_connected: 'x' } };
    expect(stripeChargesReady(row)).toBe(!!row.stripe_connect_id && chargesMilestonePresent(row));
  });
});

describe('resolvedPriceId', () => {
  it('picks monthly for a monthly purchase', () => {
    expect(resolvedPriceId(PRICED, 'month')).toBe('price_monthly');
  });

  it('picks annual for a yearly purchase', () => {
    expect(resolvedPriceId(PRICED, 'year')).toBe('price_annual');
  });

  it('falls back to monthly for a yearly purchase on a tier with no annual price', () => {
    // Matches the checkout route's own line item, so readiness and the purchase agree.
    expect(resolvedPriceId({ stripe_price_id: 'price_monthly', stripe_annual_price_id: null }, 'year')).toBe('price_monthly');
  });

  it('is null when the tier carries no price at all', () => {
    expect(resolvedPriceId({ stripe_price_id: null, stripe_annual_price_id: null }, 'month')).toBeNull();
    expect(resolvedPriceId({ stripe_price_id: null, stripe_annual_price_id: null }, 'year')).toBeNull();
  });
});

describe('tierPurchaseBlocker', () => {
  it('never blocks a free rung, connected or not', () => {
    // The free join writes a row directly and never reaches Stripe, so it must survive an
    // artist who has not set up payments at all.
    expect(tierPurchaseBlocker({ price: 0, chargesReady: false })).toBeNull();
    expect(tierPurchaseBlocker({ price: 0, chargesReady: true })).toBeNull();
    expect(tierPurchaseBlocker({ price: null, chargesReady: false })).toBeNull();
  });

  it('blocks a paid tier when the artist has no Stripe account', () => {
    expect(tierPurchaseBlocker({ price: 1000, chargesReady: false, ...PRICED })).toBe('artist_payments_unavailable');
  });

  it('blocks a paid tier when onboarding was started but never finished', () => {
    const chargesReady = stripeChargesReady({ stripe_connect_id: 'acct_started', activation_milestones: {} });
    expect(tierPurchaseBlocker({ price: 1000, chargesReady, ...PRICED })).toBe('artist_payments_unavailable');
  });

  it('blocks a paid tier that carries no Stripe price even when charges are on', () => {
    // A wizard-created tier before backfillTierPrices has run.
    expect(tierPurchaseBlocker({
      price: 2500, chargesReady: true, stripe_price_id: null, stripe_annual_price_id: null,
    })).toBe('tier_price_missing');
  });

  it('allows a fully ready paid tier', () => {
    expect(tierPurchaseBlocker({ price: 2500, chargesReady: true, ...PRICED, interval: 'month' })).toBeNull();
    expect(tierPurchaseBlocker({ price: 2500, chargesReady: true, ...PRICED, interval: 'year' })).toBeNull();
  });

  it('blocks a yearly purchase only when neither price exists', () => {
    expect(tierPurchaseBlocker({
      price: 2500, chargesReady: true, stripe_price_id: 'price_monthly', stripe_annual_price_id: null, interval: 'year',
    })).toBeNull();
  });

  it('every blocker has fan-facing copy that blames nobody and offers the free tier', () => {
    for (const [key, message] of Object.entries(PURCHASE_BLOCKER_MESSAGE)) {
      expect(message.length).toBeGreaterThan(20);
      expect(message).toContain('free');
      expect(message).not.toMatch(/—|–/); // house rule: no em or en dashes in user-facing copy
      expect(message.toLowerCase()).not.toContain('stripe'); // never leak the artist's plumbing
      expect(message.toLowerCase()).not.toContain('error');
      expect(key).toBeTruthy();
    }
  });
});
