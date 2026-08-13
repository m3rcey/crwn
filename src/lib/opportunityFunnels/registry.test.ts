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
  it('every registered funnel is SUPPORTED (nothing broken by accident)', () => {
    // `supported` and `anonymousAvailable` are the fields that actually gate behaviour, and they
    // must stay true for every tool: an old link has to keep returning a truthful result.
    //
    // `lifecycle` used to be asserted 'active' here too. It no longer is: the 2026-08-13 pre-PMF
    // surface reduction pauses every tool outside the promoted six, which removes them from the
    // /tools directory and NOTHING else. Which tools are active is asserted in promotion.test.ts,
    // against the promoted set, so this file cannot drift into re-promoting all twenty.
    for (const f of OPPORTUNITY_FUNNELS) {
      expect(f.supported).toBe(true);
      expect(f.anonymousAvailable).toBe(true);
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
    // Royalty is score-only (its own adapter), NOT the loss engine, so it must carry readiness@1.
    expect(getFunnelByToolKey('royalty-readiness-check')!.resultVersion).toBe('readiness@1');
  });
});

describe('public projection', () => {
  it('toPublicFunnel strips internal-only fields', () => {
    const pub = toPublicFunnel(getFunnelByToolKey('own-your-fans-calculator')!);
    // Assert the KEY is absent, not merely that its value reads undefined: a projection that
    // copied `featureFlag: undefined` would still leak the field name over the wire.
    const keys = Object.keys(pub);
    expect(keys).not.toContain('internalTitle');
    expect(keys).not.toContain('internalNotes');
    expect(keys).not.toContain('unavailableReason');
    expect(keys).not.toContain('featureFlag');
    expect(keys).not.toContain('analytics');
    expect(keys).not.toContain('dmKeywords');
    // ...but keeps what a browser legitimately needs
    expect(pub.publicRoute).toBe('/tools/own-your-fans-calculator');
    expect(pub.promotion).toBe('primary');
  });
});
