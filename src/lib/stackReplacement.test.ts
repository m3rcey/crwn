import { describe, it, expect } from 'vitest';
import { TIER_LIMITS, TIER_PRICING } from './platformTier';
import {
  CRWN_REPLACES,
  buildStackReplacementReport,
  renderStackReplacementReport,
  type StackReplacementInput,
} from './stackReplacement';

// A realistic ICP stack: Patreon + Shopify + Mailchimp + Discord + ticketing.
const STACK: StackReplacementInput = {
  tools: [
    { category: 'membership', name: 'Patreon', monthlyCents: 0, feePercent: 8, monthlyGmvCents: 150_000 },
    { category: 'storefront', name: 'Shopify', monthlyCents: 3_900, feePercent: 2.9, monthlyGmvCents: 100_000 },
    { category: 'email', name: 'Mailchimp', monthlyCents: 4_500 },
    { category: 'community', name: 'Discord (boosted)', monthlyCents: 1_000 },
    { category: 'ticketing', name: 'Eventbrite', monthlyCents: 0, feePercent: 6.6, monthlyGmvCents: 50_000 },
  ],
  monthlyDirectGmvCents: 300_000,
  adminHoursPerMonth: 6,
};

describe('buildStackReplacementReport', () => {
  it('sums subscriptions and per-tool fees on the GMV each tool processes', () => {
    const r = buildStackReplacementReport(STACK);
    expect(r.toolCostCents).toBe(3_900 + 4_500 + 1_000);
    // 8% of $1500 + 2.9% of $1000 + 6.6% of $500 = 12000 + 2900 + 3300
    expect(r.currentFeeCents).toBe(12_000 + 2_900 + 3_300);
    expect(r.systemCount).toBe(5);
  });

  it('only claims replaceable tools as consolidation savings; the rest is listed', () => {
    const r = buildStackReplacementReport(STACK);
    // Ticketing is NOT replaced, and it happens to cost $0 fixed here.
    expect(r.replaceableCount).toBe(4);
    expect(r.replaceableToolCostCents).toBe(3_900 + 4_500 + 1_000);
    expect(r.staysInStack).toEqual(['Eventbrite']);
    expect(CRWN_REPLACES.ticketing).toBe(false);
    expect(CRWN_REPLACES.scheduling).toBe(false);
  });

  it('plan costs come from TIER_PRICING and TIER_LIMITS, never hardcoded', () => {
    const r = buildStackReplacementReport(STACK);
    const pro = r.planCosts.find((p) => p.plan === 'pro')!;
    expect(pro.subscriptionCents).toBe(TIER_PRICING.pro.monthly);
    expect(pro.feePercent).toBe(TIER_LIMITS.pro.platformFeePercent);
    expect(pro.totalCents).toBe(
      TIER_PRICING.pro.monthly + Math.round(300_000 * (TIER_LIMITS.pro.platformFeePercent / 100)),
    );
    const starter = r.planCosts.find((p) => p.plan === 'starter')!;
    expect(starter.subscriptionCents).toBe(0);
  });

  it('picks the cheapest plan at the given volume and reports the swing', () => {
    const r = buildStackReplacementReport(STACK);
    const cheapest = [...r.planCosts].sort((a, b) => a.totalCents - b.totalCents)[0];
    expect(r.cheapestPlan.plan).toBe(cheapest.plan);
    expect(r.monthlySwingCents).toBe(r.replaceableToolCostCents + r.currentFeeCents - cheapest.totalCents);
  });

  it('handles an empty stack and zero GMV without dividing or claiming anything', () => {
    const r = buildStackReplacementReport({ tools: [], monthlyDirectGmvCents: 0 });
    expect(r.toolCostCents).toBe(0);
    expect(r.currentFeeCents).toBe(0);
    expect(r.cheapestPlan.plan).toBe('starter');
    expect(r.monthlySwingCents).toBeLessThanOrEqual(0);
  });
});

describe('renderStackReplacementReport', () => {
  it('renders the loss first, the plan comparison, and what CRWN does not replace', () => {
    const text = renderStackReplacementReport(STACK, 'M3rcey');
    expect(text).toContain('Stack Replacement Report for M3rcey');
    expect(text.indexOf('What your current stack costs')).toBeLessThan(text.indexOf('on the CRWN app'));
    expect(text).toContain('does not replace these');
    expect(text).toContain('Eventbrite');
    expect(text).toContain('6 hours a month');
  });

  it('never uses an em dash or an en dash', () => {
    const text = renderStackReplacementReport(STACK);
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');
  });

  it('does not print the fragmented-costs-more line when the stack is cheap', () => {
    const text = renderStackReplacementReport({
      tools: [{ category: 'email', name: 'Mailchimp', monthlyCents: 1_000 }],
      monthlyDirectGmvCents: 500_000,
    });
    expect(text).toContain('the raw costs are close');
    expect(text).not.toContain('costs you about');
  });
});
