// Tests for the post-onboarding builder routing AND the auto-generated draft configuration.
//
// A wrong route drops the artist on the wrong builder; a wrong prefill means the "we already
// filled this out" banner shows over empty fields; a fabricated suggestion promises a feature that
// does not exist. All three are silent, so all three earn a test. These also lock in the honest
// boundary from the builder audit: only real fields are drafted, the rest are suggestions.

import { describe, expect, it } from 'vitest';

import {
  buildDraftConfig,
  postSetupDestination,
  destinationToUrl,
  decodeLadder,
} from './postSetupDestination';
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
    // rowToSeed always emits inputData (`row.input_data ?? {}`), so a fixture without it was
    // describing a seed production never builds.
    inputData: {},
    ...overrides,
  };
}

const WORTH_LADDER = [
  { name: 'Silver', priceCents: 1000, projectedSubs: 120 },
  { name: 'Gold', priceCents: 2500, projectedSubs: 38 },
  { name: 'Platinum', priceCents: 10000, projectedSubs: 14 },
];

describe('buildDraftConfig drafts only real fields and suggests the rest', () => {
  it('Streaming Loss -> Membership: drafts the ENTRY tier, suggests the full ladder', () => {
    const cfg = buildDraftConfig(seed({ toolSlug: 'worth', conversionPayload: { ladder: WORTH_LADDER } }));
    expect(cfg?.path).toBe('/offers/new');
    // Entry tier only (plan caps Free at 1 live tier) — priced from ladder tier 1, not an average.
    expect(cfg?.prefill.lm_goal).toBe('grow-supporters');
    expect(cfg?.prefill.lm_tier_name).toBe('Silver');
    expect(cfg?.prefill.lm_price).toBe('10');
    // The rest of the ladder is a suggestion, never a hidden draft.
    expect(cfg?.suggest.lm_suggest_ladder).toBe('Silver:10:120|Gold:25:38|Platinum:100:14');
  });

  it('worth with no ladder data still routes, with no fabricated price or ladder', () => {
    const cfg = buildDraftConfig(seed({ toolSlug: 'worth', conversionPayload: {} }));
    expect(cfg?.path).toBe('/offers/new');
    expect(cfg?.prefill.lm_price).toBeUndefined();
    expect(cfg?.suggest.lm_suggest_ladder).toBeUndefined();
  });

  it('Vault -> the Vault tier, with a cadence SUGGESTION (no scheduler is drafted)', () => {
    const cfg = buildDraftConfig(
      seed({ toolSlug: 'vault-revenue-planner', conversionPayload: { tierName: 'Gold', priceCents: 500 } }),
    );
    expect(cfg?.path).toBe('/offers/new');
    expect(cfg?.prefill.lm_goal).toBe('vault-access');
    expect(cfg?.prefill.lm_tier_name).toBe('Gold');
    expect(cfg?.prefill.lm_price).toBe('5');
    expect(cfg?.suggest.lm_suggest_cadence).toBe('1');
  });

  it('Share-to-Earn -> referral share step, on, default rate', () => {
    const cfg = buildDraftConfig(seed({ toolSlug: 'share-to-earn-planner' }));
    expect(cfg?.path).toBe('/offers/new');
    expect(cfg?.prefill.lm_share_on).toBe('1');
    expect(cfg?.prefill.lm_share_percent).toBe('20');
  });

  it('Live Experience -> ticketed live; tip goal + replay are SUGGESTIONS not drafts', () => {
    const cfg = buildDraftConfig(
      seed({
        toolSlug: 'live-experience-calculator',
        conversionPayload: { ticketPriceCents: 1500, suggestedTipGoalCents: 4000 },
      }),
    );
    expect(cfg?.path).toBe('/studio/live');
    expect(cfg?.prefill.lm_ticket_price).toBe('15');
    expect(cfg?.prefill.lm_max_slots).toBeUndefined(); // open event, no fabricated capacity
    expect(cfg?.suggest.lm_suggest_tip_goal).toBe('40');
    expect(cfg?.suggest.lm_suggest_replay).toBe('1');
  });

  it('Executive Producer -> limited room: ticket + submissions + audience cap drafted', () => {
    const cfg = buildDraftConfig(
      seed({
        toolSlug: 'executive-producer-session',
        conversionPayload: { ticketPriceCents: 10000, acceptsSubmissions: true },
      }),
    );
    expect(cfg?.path).toBe('/studio/live');
    expect(cfg?.prefill.lm_ticket_price).toBe('100');
    expect(cfg?.prefill.lm_submissions).toBe('1');
    expect(cfg?.prefill.lm_max_slots).toBe('20');
    expect(cfg?.suggest.lm_suggest_replay).toBe('1');
  });

  it('an unmapped calculator returns null so the caller falls back to the dashboard', () => {
    expect(buildDraftConfig(seed({ toolSlug: 'movement-page-blueprint' }))).toBeNull();
    expect(buildDraftConfig(seed({ toolSlug: 'anything-new' }))).toBeNull();
  });
});

describe('postSetupDestination + URL serialization', () => {
  it('merges base + prefill + suggestions and always carries the banner flag', () => {
    const dest = postSetupDestination(seed({ toolSlug: 'worth', conversionPayload: { ladder: WORTH_LADDER } }));
    expect(dest?.path).toBe('/offers/new');
    expect(dest?.params.lm_prefill).toBe('1');
    expect(dest?.params.lm_result).toBe('r1');
    expect(dest?.params.lm_tier_name).toBe('Silver');
    expect(dest?.params.lm_suggest_ladder).toContain('Gold:25:38');
  });

  it('serializes to a relative URL', () => {
    const url = destinationToUrl({ path: '/offers/new', params: { lm_prefill: '1', lm_goal: 'vault-access' } });
    expect(url.startsWith('/offers/new?')).toBe(true);
    expect(url).toContain('lm_prefill=1');
  });
});

describe('decodeLadder round-trips what the config encodes', () => {
  it('parses name:price:subs segments and tolerates junk', () => {
    const parsed = decodeLadder('Silver:10:120|Gold:25:38');
    expect(parsed).toEqual([
      { name: 'Silver', price: 10, subs: 120 },
      { name: 'Gold', price: 25, subs: 38 },
    ]);
    expect(decodeLadder('')).toEqual([]);
    expect(decodeLadder(null)).toEqual([]);
  });
});
