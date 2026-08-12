import { describe, it, expect } from 'vitest';
import type { LeadMagnetSeed } from './handoffSeed';
import { buildStarterOffer, pickPrimarySeed, type StarterOfferInput } from './starterOffer';

function seed(slug: string, over: Partial<LeadMagnetSeed> = {}): LeadMagnetSeed {
  return {
    resultId: `r-${slug}`,
    toolSlug: slug,
    toolName: `Tool ${slug}`,
    headline: 'headline',
    heroValue: null,
    heroSuffix: null,
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    conversionPayload: {},
    convertHref: '/tools',
    createdAt: '2026-01-01T00:00:00Z',
    // rowToSeed always emits inputData (`row.input_data ?? {}`), so a fixture without it was
    // describing a seed production never builds.
    inputData: {},
    ...over,
  };
}

function input(over: Partial<StarterOfferInput> = {}): StarterOfferInput {
  return {
    seeds: [],
    platformTier: 'starter',
    paidTierCount: 0,
    hasFreeTier: true,
    hasTrack: true,
    productCount: 0,
    stripeConnected: true,
    artistSlug: 'm3rcey',
    ...over,
  };
}

const worthSeed = seed('worth', {
  estimatedMonthlyCents: 389200,
  conversionPayload: {
    netMrrCents: 389200,
    payers: 412,
    ladder: [
      { name: 'Silver', priceCents: 1000, projectedSubs: 288 },
      { name: 'Gold', priceCents: 2500, projectedSubs: 90 },
      { name: 'Platinum', priceCents: 10000, projectedSubs: 33 },
    ],
  },
});

describe('buildStarterOffer', () => {
  it('is deterministic: identical inputs produce identical output', () => {
    const a = buildStarterOffer(input({ seeds: [worthSeed] }));
    const b = buildStarterOffer(input({ seeds: [worthSeed] }));
    expect(a).toEqual(b);
  });

  it('recommends the smallest testable membership when no calculator was claimed', () => {
    const offer = buildStarterOffer(input());
    expect(offer.kind).toBe('membership');
    expect(offer.confidence).toBe('low');
    expect(offer.priceCents).toBe(1000);
    expect(offer.offerName).toBe('Silver');
    expect(offer.builderHref).toContain('/offers/new');
    expect(offer.builderHref).toContain('returnTo=%2Fprofile%2Fartist');
    expect(offer.toolSlug).toBeNull();
  });

  it('builds a high-confidence membership from a worth seed, priced by the artist ladder', () => {
    const offer = buildStarterOffer(input({ seeds: [worthSeed] }));
    expect(offer.kind).toBe('membership');
    expect(offer.confidence).toBe('high');
    expect(offer.priceCents).toBe(1000);
    expect(Number.isInteger(offer.priceCents)).toBe(true);
    expect(offer.monthlyCents).toBe(389200);
    expect(offer.monthlyLabel).toBe('$3,892/mo');
    expect(offer.why).toContain('$3,892/mo');
    expect(offer.why).toContain('412');
    expect(offer.builderHref).toContain('lm_prefill=1');
    expect(offer.builderHref).toContain('lm_result=r-worth');
  });

  it('never sums monthly figures across tools: picks the single biggest mapped seed', () => {
    const share = seed('share-to-earn-planner', { estimatedMonthlyCents: 50000 });
    const offer = buildStarterOffer(input({ seeds: [share, worthSeed] }));
    expect(offer.toolSlug).toBe('worth');
    expect(offer.monthlyCents).toBe(389200);
  });

  it('recommends the Vault tier from a vault seed, using the modeled price', () => {
    const s = seed('vault-revenue-planner', {
      estimatedMonthlyCents: 42000,
      conversionPayload: { tierName: 'Gold', priceCents: 1000 },
    });
    const offer = buildStarterOffer(input({ seeds: [s] }));
    expect(offer.kind).toBe('vault_tier');
    expect(offer.priceCents).toBe(1000);
    expect(offer.offerName).toBe('Gold');
    expect(offer.overlapNote).toMatch(/not count it twice/i);
  });

  it('falls back to the template Vault price when the payload has none', () => {
    const s = seed('vault-revenue-planner');
    const offer = buildStarterOffer(input({ seeds: [s] }));
    expect(offer.priceCents).toBe(2500);
    expect(offer.confidence).toBe('medium');
  });

  it('keeps Share-to-Earn as acquisition for one membership, never a second income', () => {
    const s = seed('share-to-earn-planner', { estimatedMonthlyCents: 50000 });
    const offer = buildStarterOffer(input({ seeds: [s] }));
    expect(offer.kind).toBe('membership_share');
    expect(offer.overlapNote).toMatch(/one income stream/i);
  });

  it('recommends a producer session on Pro, priced from the modeled seat', () => {
    const s = seed('executive-producer-session', {
      conversionPayload: { ticketPriceCents: 5000, acceptsSubmissions: true },
    });
    const offer = buildStarterOffer(input({ seeds: [s], platformTier: 'pro' }));
    expect(offer.kind).toBe('producer_session');
    expect(offer.priceCents).toBe(5000);
    expect(offer.cadence).toBe('one_time');
    expect(offer.builderHref).toContain('/studio/live');
  });

  it('falls back to membership on Free when the seed needs Pro live tools', () => {
    const s = seed('executive-producer-session', {
      conversionPayload: { ticketPriceCents: 5000 },
    });
    const offer = buildStarterOffer(input({ seeds: [s], platformTier: 'starter' }));
    expect(offer.kind).toBe('membership');
    expect(offer.constraintNote).toMatch(/Pro/);
    expect(offer.builderHref).toContain('/offers/new');
  });

  it('falls back to membership on Free for a live-experience seed', () => {
    const s = seed('live-experience-calculator', { conversionPayload: { ticketPriceCents: 1500 } });
    const offer = buildStarterOffer(input({ seeds: [s], platformTier: 'starter' }));
    expect(offer.kind).toBe('membership');
    expect(offer.constraintNote).toMatch(/Pro/);
  });

  it('recommends the fan capture page for an own-your-fans seed', () => {
    const s = seed('own-your-fans-calculator');
    const offer = buildStarterOffer(input({ seeds: [s] }));
    expect(offer.kind).toBe('fan_capture');
    expect(offer.priceCents).toBe(0);
    expect(offer.builderHref).toContain('/own-your-fans/plan');
  });

  it('switches to grow mode when a paid offer already exists', () => {
    const offer = buildStarterOffer(input({ seeds: [worthSeed], paidTierCount: 1 }));
    expect(offer.alreadyLaunched).toBe(true);
    expect(offer.nextActions[0].label).toMatch(/invite/i);
  });

  it('lists what the account is still missing', () => {
    const offer = buildStarterOffer(
      input({ hasTrack: false, stripeConnected: false, hasFreeTier: false }),
    );
    expect(offer.missing).toHaveLength(3);
    expect(offer.missing.join(' ')).toMatch(/Stripe/);
  });

  it('always returns exactly three next actions', () => {
    for (const seeds of [[], [worthSeed], [seed('own-your-fans-calculator')]]) {
      expect(buildStarterOffer(input({ seeds })).nextActions).toHaveLength(3);
    }
  });
});

describe('pickPrimarySeed', () => {
  it('returns null for no seeds', () => {
    expect(pickPrimarySeed([])).toBeNull();
  });

  it('prefers a builder-mapped seed over a newer unmapped one', () => {
    const unmapped = seed('royalty-readiness-check', { createdAt: '2026-02-01T00:00:00Z' });
    const picked = pickPrimarySeed([unmapped, worthSeed]);
    expect(picked?.toolSlug).toBe('worth');
  });

  it('keeps the newest seed on equal monthly figures', () => {
    const older = seed('worth', { resultId: 'r-old' });
    const newer = seed('worth', { resultId: 'r-new' });
    expect(pickPrimarySeed([newer, older])?.resultId).toBe('r-new');
  });
});
