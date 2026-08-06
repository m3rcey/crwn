import { describe, it, expect } from 'vitest';
import {
  REVENUE_MODELS,
  REVENUE_MODEL_VERSION,
  getRevenueModel,
  isRevenueModelKey,
  recommendRevenueModel,
  scoreRevenueModels,
} from './revenueModels';

describe('revenue model taxonomy', () => {
  it('carries exactly the four founder-approved models in precedence order', () => {
    expect(REVENUE_MODELS.map((m) => m.key)).toEqual([
      'membership_consolidation',
      'between_tour_revenue',
      'live_community_monetization',
      'independent_empire_expansion',
    ]);
  });

  it('every model prescribes real routes and a real ladder rung', () => {
    const rungs = ['wave', 'inner_circle', 'vault', 'throne'];
    for (const m of REVENUE_MODELS) {
      expect(rungs).toContain(m.leadRung);
      expect(m.firstMoves.length).toBeGreaterThanOrEqual(3);
      for (const move of m.firstMoves) expect(move.route.startsWith('/')).toBe(true);
    }
  });

  it('no em dashes anywhere in artist-facing copy', () => {
    const text = JSON.stringify(REVENUE_MODELS);
    expect(text).not.toContain('—');
    expect(text).not.toContain('–');
  });

  it('key helpers agree with the registry', () => {
    expect(isRevenueModelKey('between_tour_revenue')).toBe(true);
    expect(isRevenueModelKey('touring_access_seller')).toBe(false);
    expect(getRevenueModel('live_community_monetization')?.label).toBe('Live Community Monetization');
    expect(getRevenueModel(null)).toBeNull();
  });
});

describe('recommendRevenueModel', () => {
  it('falls back to the ICP baseline below the evidence floor, marked as default', () => {
    const r = recommendRevenueModel({});
    expect(r.model).toBe('membership_consolidation');
    expect(r.isDefault).toBe(true);
    expect(r.confidence).toBe('low');
    expect(r.secondary).toBeNull();
  });

  it('a fragmented stack prescribes Membership Consolidation with evidence', () => {
    const r = recommendRevenueModel({
      platformsUsed: ['patreon', 'shopify', 'discord'],
      monetizationStatus: 'direct_some',
    });
    expect(r.model).toBe('membership_consolidation');
    expect(r.isDefault).toBe(false);
    expect(r.confidence).toBe('medium');
    expect(r.evidence[0]).toContain('3 platforms');
  });

  it('touring evidence prescribes Between-Tour Revenue, and NEVER without it', () => {
    const touring = recommendRevenueModel({}, { showsPerYear: 12, vipBuyersPerYear: 40 });
    expect(touring.model).toBe('between_tour_revenue');
    expect(touring.confidence).toBe('high');

    // The shared calculator never asks about shows: no touring answers, no
    // touring prescription, no matter what else is true.
    const noTouring = recommendRevenueModel({ platformsUsed: ['patreon', 'shopify'] });
    expect(noTouring.model).not.toBe('between_tour_revenue');
  });

  it('hosted live sessions outweigh declared willingness', () => {
    const r = recommendRevenueModel({ liveSessionsHosted: 3, liveWilling: 'yes' });
    expect(r.model).toBe('live_community_monetization');
    expect(r.confidence).toBe('high');
    expect(r.evidence[0]).toContain('hosted 3 live sessions');
  });

  it('an established multi-product seller prescribes Independent Empire Expansion', () => {
    const r = recommendRevenueModel(
      { monetizationStatus: 'direct_established', currentSupporters: 120, audience: 400_000 },
      { productsListed: 3 },
    );
    expect(r.model).toBe('independent_empire_expansion');
    expect(r.confidence).toBe('high');
  });

  it('ties break by precedence toward consolidation, and a strong runner-up is reported', () => {
    // 3 points each for consolidation (platforms) and live (hosted sessions).
    const r = recommendRevenueModel({
      platformsUsed: ['patreon', 'discord'],
      liveSessionsHosted: 1,
    });
    expect(r.model).toBe('membership_consolidation');
    expect(r.secondary).toBe('live_community_monetization');
  });

  it('is deterministic and versioned', () => {
    const e = { platformsUsed: ['patreon', 'shopify'], liveWilling: 'yes' as const };
    const a = recommendRevenueModel(e);
    const b = recommendRevenueModel(e);
    expect(a).toEqual(b);
    expect(a.version).toBe(REVENUE_MODEL_VERSION);
  });

  it('every score line names its model and carries a readable evidence line', () => {
    const lines = scoreRevenueModels(
      { platformsUsed: ['patreon', 'shopify'], liveSessionsHosted: 2, monetizationStatus: 'direct_established' },
      { showsPerYear: 8, productsListed: 2 },
    );
    for (const l of lines) {
      expect(isRevenueModelKey(l.model)).toBe(true);
      expect(l.points).toBeGreaterThan(0);
      expect(l.line.length).toBeGreaterThan(10);
    }
  });
});
