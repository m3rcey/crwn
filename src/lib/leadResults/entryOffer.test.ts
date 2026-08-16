// The bridge from a single-offer entry tool to the four-rung ladder.
//
// Each assertion names the regression it prevents. The wizard's ladder screen is pinned by reading
// its source (this repo's vitest is node-only), the same technique setupLadderOffer.test.ts uses.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { entryOfferFor, modelsLadder, ANCHOR_RUNG } from './entryOffer';
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

const SINGLE_OFFER_TOOLS = [
  'vault-revenue-planner',
  'live-experience-calculator',
  'executive-producer-session',
  'founder-window-builder',
];

/** A payload from a tool that DID model a ladder (what the per-rung buyer line reads). */
const modelled = { ladder: [{ name: 'Silver', priceCents: 1000, projectedSubs: 12 }] };

describe('entryOfferFor', () => {
  it('is null for the tools that already model the whole ladder', () => {
    // Those calculators argue for each rung with their own buyer counts. A second
    // argument on top would be noise, and would contradict their numbers.
    expect(entryOfferFor(null)).toBeNull();
    for (const slug of ['opportunity-calculator', 'worth', 'fan-stack-calculator', 'between-tour-calculator']) {
      expect(entryOfferFor(seed({ toolSlug: slug, conversionPayload: modelled }))).toBeNull();
    }
  });

  it('leaves a modeled ladder alone even when it projected NO buyers', () => {
    // The ratified rule (setupLadderOffer.test.ts): a calculator artist whose result
    // modeled no buyers keeps their own flow, not a generic line. The trigger is a
    // MISSING ladder, never a zero one.
    const zero = { ladder: [{ name: 'Silver', priceCents: 1000, projectedSubs: 0 }] };
    expect(modelsLadder(seed({ conversionPayload: zero }))).toBe(true);
    expect(entryOfferFor(seed({ toolSlug: 'opportunity-calculator', conversionPayload: zero }))).toBeNull();
  });

  it('gives EVERY other no-ladder tool the generic argument, with no invented anchor', () => {
    // The four bespoke tools are not the whole class. A mission, a demand test, a
    // leaderboard and a royalty checklist all model no ladder, so both existing
    // arguments are silent for them too. They get the counterweight and nothing
    // more: claiming their mission "lands" on a rung would be a lie.
    for (const slug of ['fan-mission-generator', 'proof-of-demand-test-builder', 'royalty-readiness-check', 'top-fan-leaderboard-builder']) {
      const o = entryOfferFor(seed({ toolSlug: slug, toolName: 'Fan Mission Generator' }))!;
      expect(o).toBeTruthy();
      expect(o.anchorLine).toBeNull();
      expect(o.rungKey).toBeNull();
      expect(o.ladderLine).toContain('Keep all three paid rungs');
    }
  });

  it.each(SINGLE_OFFER_TOOLS)('%s carries both an anchor and a loss-framed argument', (slug) => {
    const o = entryOfferFor(seed({ toolSlug: slug }))!;
    expect(o).toBeTruthy();
    expect(o.anchorLine!.length).toBeGreaterThan(20);
    expect(o.ladderLine.length).toBeGreaterThan(40);
  });

  it('anchors the Vault on the Gold rung, and nothing else on a rung', () => {
    // The Vault is a RECURRING membership offer, so it is a rung (CLAUDE.md: the
    // vault lives in the Gold tier). A ticket, a seat and a founding window are
    // not; claiming any of them is a tier would be a lie the artist finds out later.
    expect(entryOfferFor(seed({ toolSlug: 'vault-revenue-planner' }))!.rungKey).toBe('vault');
    for (const slug of ['live-experience-calculator', 'executive-producer-session', 'founder-window-builder']) {
      expect(entryOfferFor(seed({ toolSlug: slug }))!.rungKey).toBeNull();
    }
  });

  it('never promises that CRWN runs the founding window', () => {
    // The offer builder this deliverable continues into has NO cap and NO date
    // field, and no other surface enforces one. The copy says the artist holds
    // the cap, which is the true statement.
    const o = entryOfferFor(seed({ toolSlug: 'founder-window-builder' }))!;
    expect(o.anchorLine).toContain('you hold the cap yourself');
    expect(o.anchorLine).not.toMatch(/CRWN (will|closes|enforces|holds)/i);
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

  it.each([...SINGLE_OFFER_TOOLS, 'fan-mission-generator'])('%s copy carries no em dash or en dash', (slug) => {
    const o = entryOfferFor(seed({ toolSlug: slug }))!;
    for (const line of [o.anchorLine ?? '', o.ladderLine]) {
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
    expect(wizard).toContain('{!entryOffer.rungKey && entryOffer.anchorLine && (');
  });

  it('renders no anchor at all for the generic bridge', () => {
    // A null anchorLine must not render an empty gold line above the rungs, and the
    // intro must not print "Where yours lands:" with nothing after it.
    expect(wizard).toContain('{plan.entryOffer?.anchorLine && (');
  });

  it('states it before the ladder screen too, on the restored-plan intro', () => {
    expect(wizard).toContain('Where yours lands:');
  });

  it('honors the drop cadence the Vault artist already chose', () => {
    // The promise-review screen asks for exactly the cadence the Vault planner
    // asked for. Seeded into `draft`, NOT rendered as a display-only default: the
    // create path reads `draft` too, so a rendering-only override would show one
    // cadence and schedule another.
    expect(wizard).toContain('vaultPlan={vaultPlan}');
    expect(wizard).toContain('vaultCadenceSeeded');
    expect(wizard).toContain('recurrence: vaultPlan.cadence!');
    // Never clobbers an artist edit: only writes when that promise has no entry.
    expect(wizard).toContain('d[p.key] ? d :');
  });

  it('matches the Vault unlock promise structurally, not by a string key', () => {
    expect(wizard).toContain("const VAULT_UNLOCK = { tierKey: 'vault', benefitType: 'exclusive_posts' }");
    // The pair must be a real planned promise on the template's Gold rung.
    const gold = RECOMMENDED_LADDER.find((r) => r.key === 'vault')!;
    expect(gold.benefits.some((b) => b.structured?.benefit_type === 'exclusive_posts')).toBe(true);
  });

  it('shows the 30-day drop plan where the artist commits to the cadence', () => {
    expect(wizard).toContain('Your first 30 days, from your Vault plan');
  });

  it('leaves the cold-signup counterweight and the projection line alone', () => {
    // Additive only. Both existing arguments are pinned by setupLadderOffer.test.ts;
    // this repeats the gate so a refactor cannot merge the three into one.
    expect(wizard).toContain('{!hasPlan && (');
    expect(wizard).toContain('fans in range for this tier');
  });
});
