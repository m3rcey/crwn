import { describe, it, expect } from 'vitest';
import { buildLadderPrefill } from './ladderPrefill';
import type { LeadMagnetSeed } from './handoffSeed';

function seed(over: Partial<LeadMagnetSeed> = {}): LeadMagnetSeed {
  return {
    resultId: 'r1',
    toolSlug: 'opportunity-calculator',
    toolName: 'Opportunity Calculator',
    headline: '',
    heroValue: null,
    heroSuffix: null,
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    conversionPayload: {},
    draftValues: null,
    convertHref: '/x',
    createdAt: '2026-07-31T00:00:00Z',
    ...over,
  } as LeadMagnetSeed;
}

describe('buildLadderPrefill', () => {
  it('returns null when the seed carries no edits (stock draft stays)', () => {
    expect(buildLadderPrefill(null)).toBeNull();
    expect(buildLadderPrefill(seed())).toBeNull();
    expect(buildLadderPrefill(seed({ draftValues: {} }))).toBeNull();
  });

  it('applies the artist deliverable-draft names and prices, template filling gaps', () => {
    const rungs = buildLadderPrefill(
      seed({
        draftValues: { t0Name: 'The Block', t1Name: 'Day Ones', t1Price: '12', t3Price: 150 },
      }),
    )!;
    expect(rungs.map((r) => r.key)).toEqual(['wave', 'inner_circle', 'vault', 'throne']);
    expect(rungs[0]).toMatchObject({ name: 'The Block', priceCents: 0 });
    expect(rungs[1]).toMatchObject({ name: 'Day Ones', priceCents: 1200 });
    // Untouched rung falls back to the template entirely.
    expect(rungs[2]).toMatchObject({ name: 'Gold', priceCents: 2500 });
    expect(rungs[3]).toMatchObject({ name: 'Platinum', priceCents: 15000 });
  });

  it('falls back to conversionPayload.ladder for calculator-modeled prices', () => {
    const rungs = buildLadderPrefill(
      seed({
        conversionPayload: {
          ladder: [
            { name: 'Supporter', priceCents: 800 },
            { name: 'Vault Access', priceCents: 2500 },
            { name: 'Inner Circle', priceCents: 7500 },
          ],
        },
      }),
    )!;
    expect(rungs[0].priceCents).toBe(0); // free front door always free
    expect(rungs[1]).toMatchObject({ name: 'Supporter', priceCents: 800 });
    expect(rungs[2]).toMatchObject({ name: 'Vault Access', priceCents: 2500 });
    expect(rungs[3]).toMatchObject({ name: 'Inner Circle', priceCents: 7500 });
  });

  it('draft edits win over the conversion payload', () => {
    const rungs = buildLadderPrefill(
      seed({
        draftValues: { t1Name: 'Day Ones' },
        conversionPayload: { ladder: [{ name: 'Supporter', priceCents: 800 }] },
      }),
    )!;
    expect(rungs[1].name).toBe('Day Ones');
    expect(rungs[1].priceCents).toBe(1000); // template price, not the cp price
  });

  it('junk-only edits mean no prefill (the stock draft stays)', () => {
    expect(buildLadderPrefill(seed({ draftValues: { t1Price: 'free??', t2Price: '0' } }))).toBeNull();
  });

  it('junk prices next to real edits fall back to the template price', () => {
    const rungs = buildLadderPrefill(seed({ draftValues: { t1Name: 'Day Ones', t1Price: 'free??' } }))!;
    expect(rungs[1]).toMatchObject({ name: 'Day Ones', priceCents: 1000 });
    expect(rungs[2].priceCents).toBe(2500);
  });
});
