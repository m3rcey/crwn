import { describe, it, expect } from 'vitest';
import {
  OPPORTUNITY_FUNNELS,
  getFunnelByToolKey,
  getFunnelByOpportunityKey,
  isSupportedToolKey,
  normalizeKeyword,
  resolveFunnelByKeyword,
  resolveFunnelByAlias,
  selectActive,
  selectPublic,
  sortByPromotion,
  listPublicFunnels,
  toPublicFunnel,
} from './registry';
import type { OpportunityFunnel } from './types';

// A synthetic funnel for the pure selection/order helpers (so lifecycle/promotion states can be
// exercised without depending on the live registry's values).
function makeFunnel(over: Partial<OpportunityFunnel>): OpportunityFunnel {
  return {
    toolKey: 'x',
    opportunityKey: 'x',
    publicTitle: 'X',
    internalTitle: 'x-internal',
    description: 'd',
    category: 'Grow',
    toolType: 'calculator',
    aliases: ['x'],
    dmKeywords: ['x'],
    publicRoute: '/tools/x',
    resultRoute: '/tools/x/result',
    builderRoute: null,
    recommendedFeature: 'X',
    recommendedNextRoute: null,
    inputSchemaRef: 'x',
    resultSchemaRef: 'x',
    toolVersion: '1',
    resultVersion: 'x@1',
    anonymousAvailable: true,
    authBoundary: 'signup_to_save',
    lifecycle: 'active',
    promotion: 'none',
    promotionRank: 100,
    featureFlag: null,
    supported: true,
    unavailableReason: null,
    sourceVideoCompatible: true,
    campaignCompatible: true,
    attributionChannels: ['web', 'instagram'],
    analytics: { toolId: 'x', promotedFeature: 'X', category: 'Grow' },
    requiresEstimateDisclaimer: true,
    requiresLegalDisclaimer: false,
    internalNotes: 'note',
    ...over,
  };
}

describe('registry resolution', () => {
  it('resolves Own Your Fans by tool key with the confirmed config', () => {
    const f = getFunnelByToolKey('own-your-fans-calculator');
    expect(f).not.toBeNull();
    expect(f!.opportunityKey).toBe('own-your-fans');
    expect(f!.publicRoute).toBe('/tools/own-your-fans-calculator');
    expect(f!.recommendedFeature).toBe('Own Your Fans');
    expect(f!.recommendedNextRoute).toBe('/studio/fans');
    expect(f!.builderRoute).toBeNull(); // no dedicated builder exists in the repo
  });

  it('resolves Own Your Fans by opportunity key', () => {
    expect(getFunnelByOpportunityKey('own-your-fans')?.toolKey).toBe('own-your-fans-calculator');
  });

  it('returns null for unsupported / unknown tool keys', () => {
    expect(getFunnelByToolKey('does-not-exist')).toBeNull();
    expect(isSupportedToolKey('does-not-exist')).toBe(false);
    expect(isSupportedToolKey('own-your-fans-calculator')).toBe(true);
  });
});

describe('Own Your Fans aliases + DM keyword normalization', () => {
  it('normalizes keywords the way the orchestrator does', () => {
    expect(normalizeKeyword('OWN')).toBe('own');
    expect(normalizeKeyword('  Worth ')).toBe('worth');
    expect(normalizeKeyword('own your fans')).toBe(''); // multi-word is not a keyword
    expect(normalizeKeyword('a'.repeat(13))).toBe(''); // too long
    expect(normalizeKeyword('')).toBe('');
  });

  it('resolves the OWN keyword (any case/whitespace) to Own Your Fans', () => {
    expect(resolveFunnelByKeyword('own')?.toolKey).toBe('own-your-fans-calculator');
    expect(resolveFunnelByKeyword('OWN ')?.toolKey).toBe('own-your-fans-calculator');
  });

  it('rejects non-keywords and unknown keywords', () => {
    expect(resolveFunnelByKeyword('own your fans')).toBeNull();
    expect(resolveFunnelByKeyword('zzzzz')).toBeNull();
  });

  it('resolves by alias (tool key, opportunity key, or keyword)', () => {
    expect(resolveFunnelByAlias('own-your-fans-calculator')?.toolKey).toBe('own-your-fans-calculator');
    expect(resolveFunnelByAlias('own-your-fans')?.toolKey).toBe('own-your-fans-calculator');
    expect(resolveFunnelByAlias('own')?.toolKey).toBe('own-your-fans-calculator');
  });
});

describe('lifecycle filtering + promotion behavior (pure)', () => {
  const fixtures = [
    makeFunnel({ toolKey: 'active-primary', promotion: 'primary', promotionRank: 0 }),
    makeFunnel({ toolKey: 'active-none', promotion: 'none', promotionRank: 100 }),
    makeFunnel({ toolKey: 'draft', lifecycle: 'draft' }),
    makeFunnel({ toolKey: 'internal', lifecycle: 'internal' }),
    makeFunnel({ toolKey: 'paused', lifecycle: 'paused' }),
    makeFunnel({ toolKey: 'archived', lifecycle: 'archived' }),
    makeFunnel({ toolKey: 'unsupported', supported: false }),
    makeFunnel({ toolKey: 'authed-only', anonymousAvailable: false }),
  ];

  it('selectActive keeps only active + supported', () => {
    const keys = selectActive(fixtures).map((f) => f.toolKey).sort();
    expect(keys).toEqual(['active-none', 'active-primary', 'authed-only']);
  });

  it('selectPublic additionally requires anonymous availability', () => {
    const keys = selectPublic(fixtures).map((f) => f.toolKey).sort();
    expect(keys).toEqual(['active-none', 'active-primary']);
  });

  it('sortByPromotion orders by rank (primary leads)', () => {
    const ordered = sortByPromotion(selectActive(fixtures)).map((f) => f.toolKey);
    expect(ordered[0]).toBe('active-primary');
  });
});

describe('live registry integrity', () => {
  it('every registered funnel is active + supported (nothing hidden by accident)', () => {
    for (const f of OPPORTUNITY_FUNNELS) {
      expect(f.supported).toBe(true);
      expect(f.lifecycle).toBe('active');
    }
  });

  it('Own Your Fans is the primary funnel and leads the public list', () => {
    const own = getFunnelByToolKey('own-your-fans-calculator')!;
    expect(own.promotion).toBe('primary');
    expect(listPublicFunnels()[0].toolKey).toBe('own-your-fans-calculator');
  });

  it('preserves Streaming Loss / Worth as a supported funnel on its own route', () => {
    const worth = getFunnelByToolKey('worth');
    expect(worth).not.toBeNull();
    expect(worth!.publicRoute).toBe('/worth'); // backward-compatible URL, unchanged
    expect(worth!.dmKeywords).toEqual(['worth']);
    expect(worth!.opportunityKey).toBe('streaming-loss');
    expect(worth!.lifecycle).toBe('active');
    expect(worth!.supported).toBe(true);
  });

  it('preserves published result versions on migration', () => {
    expect(getFunnelByToolKey('own-your-fans-calculator')!.resultVersion).toBe('lossResult@1');
    expect(getFunnelByToolKey('worth')!.resultVersion).toBe('leadCalculator@1');
  });
});

describe('public projection', () => {
  it('toPublicFunnel strips internal-only fields', () => {
    const pub = toPublicFunnel(getFunnelByToolKey('own-your-fans-calculator')!) as Record<string, unknown>;
    expect(pub.internalTitle).toBeUndefined();
    expect(pub.internalNotes).toBeUndefined();
    expect(pub.unavailableReason).toBeUndefined();
    expect(pub.featureFlag).toBeUndefined();
    expect(pub.analytics).toBeUndefined();
    expect(pub.dmKeywords).toBeUndefined();
    // ...but keeps what a browser legitimately needs
    expect(pub.publicRoute).toBe('/tools/own-your-fans-calculator');
    expect(pub.promotion).toBe('primary');
  });
});
