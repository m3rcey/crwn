// Tests for the post-onboarding builder routing.
//
// This is the map that decides where an artist lands the instant setup finishes. A wrong route
// drops them on the wrong builder; a wrong param means the "we already filled this out" banner
// shows over empty fields. Both are silent, so both earn a test.

import { describe, expect, it } from 'vitest';

import { postSetupDestination, destinationToUrl } from './postSetupDestination';
import type { LeadMagnetSeed } from './handoffSeed';

function seed(overrides: Partial<LeadMagnetSeed>): LeadMagnetSeed {
  return {
    resultId: 'r1',
    toolSlug: 'worth',
    toolName: 'Streaming Loss Calculator',
    headline: '',
    heroValue: null,
    heroSuffix: null,
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    conversionPayload: {},
    convertHref: '/studio',
    createdAt: '2026-07-25T00:00:00Z',
    ...overrides,
  };
}

describe('postSetupDestination maps each calculator to its builder', () => {
  it('Streaming Loss (worth) -> Membership builder, price = implied ARPU', () => {
    const dest = postSetupDestination(
      seed({ toolSlug: 'worth', conversionPayload: { netMrrCents: 120_000, payers: 40 } }),
    );
    expect(dest?.path).toBe('/offers/new');
    expect(dest?.params.lm_goal).toBe('grow-supporters');
    // 120000 / 40 = 3000 cents = $30
    expect(dest?.params.lm_price).toBe('30');
    expect(dest?.params.lm_prefill).toBe('1');
    expect(dest?.params.lm_result).toBe('r1');
  });

  it('worth with no payer data omits the price rather than dividing by zero', () => {
    const dest = postSetupDestination(seed({ toolSlug: 'worth', conversionPayload: {} }));
    expect(dest?.path).toBe('/offers/new');
    expect(dest?.params.lm_price).toBeUndefined();
  });

  it('Vault -> Membership builder with the Vault goal, name + price from payload', () => {
    const dest = postSetupDestination(
      seed({
        toolSlug: 'vault-revenue-planner',
        conversionPayload: { tierName: 'The Vault', priceCents: 500 },
      }),
    );
    expect(dest?.path).toBe('/offers/new');
    expect(dest?.params.lm_goal).toBe('vault-access');
    expect(dest?.params.lm_tier_name).toBe('The Vault');
    expect(dest?.params.lm_price).toBe('5');
  });

  it('Share-to-Earn -> Referral (share step on inside a subscription offer)', () => {
    const dest = postSetupDestination(seed({ toolSlug: 'share-to-earn-planner' }));
    expect(dest?.path).toBe('/offers/new');
    expect(dest?.params.lm_goal).toBe('grow-supporters');
    expect(dest?.params.lm_share_on).toBe('1');
    expect(dest?.params.lm_share_percent).toBe('20');
  });

  it('Live Experience -> live builder with the $15 ticket', () => {
    const dest = postSetupDestination(
      seed({ toolSlug: 'live-experience-calculator', conversionPayload: { ticketPriceCents: 1500 } }),
    );
    expect(dest?.path).toBe('/studio/live');
    expect(dest?.params.lm_ticket_price).toBe('15');
    expect(dest?.params.lm_submissions).toBeUndefined();
  });

  it('Executive Producer -> live builder, submissions on, seat price banded to audience', () => {
    const dest = postSetupDestination(
      seed({
        toolSlug: 'executive-producer-session',
        conversionPayload: { ticketPriceCents: 10000, acceptsSubmissions: true },
      }),
    );
    expect(dest?.path).toBe('/studio/live');
    expect(dest?.params.lm_submissions).toBe('1');
    expect(dest?.params.lm_ticket_price).toBe('100');
  });

  it('an unmapped calculator returns null so the caller falls back to the dashboard', () => {
    expect(postSetupDestination(seed({ toolSlug: 'movement-page-blueprint' }))).toBeNull();
    expect(postSetupDestination(seed({ toolSlug: 'anything-new' }))).toBeNull();
  });
});

describe('destinationToUrl', () => {
  it('serializes path + params and always carries the banner flag', () => {
    const url = destinationToUrl({ path: '/offers/new', params: { lm_prefill: '1', lm_goal: 'vault-access' } });
    expect(url.startsWith('/offers/new?')).toBe(true);
    expect(url).toContain('lm_prefill=1');
    expect(url).toContain('lm_goal=vault-access');
  });
});
