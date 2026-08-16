// The bridge from a single-offer entry tool to the four-rung ladder.
//
// Each assertion names the regression it prevents. The wizard's ladder screen is pinned by reading
// its source (this repo's vitest is node-only), the same technique setupLadderOffer.test.ts uses.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { entryOfferFor, ANCHOR_RUNG } from './entryOffer';
import { buildLadderPrefill } from './ladderPrefill';
import { RECOMMENDED_LADDER } from '@/lib/tierTemplate';
import { getDeliverableSpec } from '@/lib/opportunityDrafts/deliverableSpecs';
import type { LeadMagnetSeed } from './handoffSeed';

const wizard = readFileSync(join(process.cwd(), 'src/app/setup/page.tsx'), 'utf8');

function seed(over: Partial<LeadMagnetSeed> = {}): LeadMagnetSeed {
  return {
    resultId: 'r1',
    toolSlug: 'vault-revenue-planner',
    toolName: 'Vault Revenue Planner',
    headline: '',
    heroValue: null,
    heroSuffix: null,
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    conversionPayload: {},
    draftValues: null,
    convertHref: '/x',
    createdAt: '2026-08-16T00:00:00Z',
    ...over,
  } as LeadMagnetSeed;
}

const SINGLE_OFFER_TOOLS = ['vault-revenue-planner', 'live-experience-calculator', 'executive-producer-session'];

describe('entryOfferFor', () => {
  it('is null for the tools that already model the whole ladder', () => {
    // Those calculators argue for each rung with their own buyer counts. A second
    // argument on top would be noise, and would contradict their numbers.
    expect(entryOfferFor(null)).toBeNull();
    for (const slug of ['opportunity-calculator', 'worth', 'fan-stack-calculator', 'between-tour-calculator']) {
      expect(entryOfferFor(seed({ toolSlug: slug }))).toBeNull();
    }
  });

  it.each(SINGLE_OFFER_TOOLS)('%s carries both an anchor and a loss-framed argument', (slug) => {
    const o = entryOfferFor(seed({ toolSlug: slug }))!;
    expect(o).toBeTruthy();
    expect(o.anchorLine.length).toBeGreaterThan(20);
    expect(o.ladderLine.length).toBeGreaterThan(40);
  });

  it('anchors the Vault on the Gold rung, and nothing else on a rung', () => {
    // The Vault is a RECURRING membership offer, so it is a rung (CLAUDE.md: the
    // vault lives in the Gold tier). A ticket and a seat are products sold once;
    // claiming either is a tier would be a lie the artist finds out later.
    expect(entryOfferFor(seed({ toolSlug: 'vault-revenue-planner' }))!.rungKey).toBe('vault');
    expect(entryOfferFor(seed({ toolSlug: 'live-experience-calculator' }))!.rungKey).toBeNull();
    expect(entryOfferFor(seed({ toolSlug: 'executive-producer-session' }))!.rungKey).toBeNull();
  });

  it('every anchored rung key is a real template rung', () => {
    for (const key of Object.values(ANCHOR_RUNG)) {
      expect(RECOMMENDED_LADDER.some((r) => r.key === key)).toBe(true);
    }
  });

  it('quotes prices from the template instead of retyping them', () => {
    // A price change in tierTemplate.ts must not leave this copy quoting a number
    // no rung carries.
    const o = entryOfferFor(seed({ toolSlug: 'vault-revenue-planner' }))!;
    const silver = Math.round(RECOMMENDED_LADDER.find((r) => r.key === 'inner_circle')!.priceCents / 100);
    const gold = Math.round(RECOMMENDED_LADDER.find((r) => r.key === 'vault')!.priceCents / 100);
    expect(o.ladderLine).toContain(`$${silver}`);
    expect(o.ladderLine).toContain(`$${gold}`);
  });

  it.each(SINGLE_OFFER_TOOLS)('%s copy carries no em dash or en dash', (slug) => {
    const o = entryOfferFor(seed({ toolSlug: slug }))!;
    for (const line of [o.anchorLine, o.ladderLine]) {
      expect(line).not.toContain('—');
      expect(line).not.toContain('–');
    }
  });

  it('only covers tools that really have a pre-signup deliverable to carry in', () => {
    // If one of these lost its builder, the copy would promise the artist their
    // offer came with them when nothing did.
    for (const slug of SINGLE_OFFER_TOOLS) {
      expect(getDeliverableSpec(slug)).toBeTruthy();
    }
  });
});

describe('the Vault the artist planned reaches the ladder screen', () => {
  it('puts their own name and price on the Gold rung', () => {
    // Before this, the vault draft field names (tierName/price) matched no ladder
    // slot, so an artist who named and priced their Vault confirmed a stock Gold
    // and their work was silently dropped.
    const rungs = buildLadderPrefill(
      seed({ draftValues: { tierName: 'The Basement', price: '30' } }),
    )!;
    expect(rungs.find((r) => r.key === 'vault')).toMatchObject({ name: 'The Basement', priceCents: 3000 });
    // Every other rung stays stock.
    expect(rungs.find((r) => r.key === 'inner_circle')).toMatchObject({ name: 'Silver', priceCents: 1000 });
  });

  it('falls back to the planner modeled price when they never opened the builder', () => {
    const rungs = buildLadderPrefill(
      seed({ conversionPayload: { tierName: 'Gold', priceCents: 4000 } }),
    )!;
    expect(rungs.find((r) => r.key === 'vault')!.priceCents).toBe(4000);
  });

  it('refuses an anchor price that would sit below the rung beneath it', () => {
    // The planner models ONE offer with no ladder around it, so it can return $8
    // while Silver is $10. The artist may still type any price on the screen;
    // this only stops CRWN from building an inverted ladder for them, which is
    // what the release waterfall staggers on.
    const rungs = buildLadderPrefill(seed({ draftValues: { tierName: 'The Basement', price: '8' } }))!;
    expect(rungs.find((r) => r.key === 'vault')).toMatchObject({ name: 'The Basement', priceCents: 2500 });
  });

  it('leaves a ladder-modelling calculator completely untouched', () => {
    const rungs = buildLadderPrefill(
      seed({ toolSlug: 'opportunity-calculator', draftValues: { t1Name: 'Day Ones', t1Price: '12' } }),
    )!;
    expect(rungs.find((r) => r.key === 'inner_circle')).toMatchObject({ name: 'Day Ones', priceCents: 1200 });
    expect(rungs.find((r) => r.key === 'vault')).toMatchObject({ name: 'Gold', priceCents: 2500 });
  });
});

describe('the wizard actually renders the bridge', () => {
  it('renders it on the ladder screen, where the confirm decision is made', () => {
    expect(wizard).toContain('entryOffer={entryOffer}');
    expect(wizard).toContain('{entryOffer && (');
    expect(wizard).toContain('{entryOffer.ladderLine}');
  });

  it('anchors a rung-shaped offer ON its rung and a product-shaped offer above the rungs', () => {
    expect(wizard).toContain('entryOffer?.rungKey === rung.key');
    expect(wizard).toContain('{!entryOffer.rungKey && <p');
  });

  it('states it before the ladder screen too, on the restored-plan intro', () => {
    expect(wizard).toContain('Where yours lands:');
  });

  it('leaves the cold-signup counterweight and the projection line alone', () => {
    // Additive only. Both existing arguments are pinned by setupLadderOffer.test.ts;
    // this repeats the gate so a refactor cannot merge the three into one.
    expect(wizard).toContain('{!hasPlan && (');
    expect(wizard).toContain('fans in range for this tier');
  });
});
