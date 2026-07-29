import { describe, it, expect } from 'vitest';
import {
  OPPORTUNITY_EVENTS,
  OPPORTUNITY_EVENT_NAMES,
  sanitizeOpportunityMeta,
} from './analytics';

describe('opportunity event names', () => {
  it('defines exactly the shared funnel events, including the three multi-opportunity ones', () => {
    expect(OPPORTUNITY_EVENT_NAMES).toHaveLength(10);
    expect(OPPORTUNITY_EVENT_NAMES).toEqual([
      'opportunity_funnel_viewed',
      'opportunity_funnel_started',
      'opportunity_funnel_completed',
      'opportunity_result_viewed',
      'opportunity_recommendation_viewed',
      'opportunity_cta_clicked',
      'opportunity_builder_started',
      // Added for the all-in-one calculator, which has to disclose its overlap handling and
      // re-derive its own headline when the artist edits the plan.
      'opportunity_overlap_explained',
      'opportunity_recommendation_edited',
      'opportunity_estimate_recalculated',
    ]);
    expect(OPPORTUNITY_EVENTS.funnelViewed).toBe('opportunity_funnel_viewed');
  });

  it('lets the entry context travel as a dimension, but never raw URL text', () => {
    const out = sanitizeOpportunityMeta({ entryContext: 'vault-revenue-planner', evil: '<script>' });
    expect(out.entryContext).toBe('vault-revenue-planner');
    expect(out).not.toHaveProperty('evil');
  });
});

describe('sanitizeOpportunityMeta', () => {
  it('keeps allowlisted non-sensitive dimensions', () => {
    const out = sanitizeOpportunityMeta({
      opportunityKey: 'own-your-fans',
      toolKey: 'own-your-fans-calculator',
      toolVersion: '1',
      resultVersion: 'lossResult@1',
      utmSource: 'ig',
      utmContent: 'reel-42',
      campaignId: 'summer',
      sourceVideoId: 'post_123',
      keyword: 'own',
      variant: 'a',
      experienceId: 'exp-1',
      context: 'public',
      authed: false,
    });
    expect(out.opportunityKey).toBe('own-your-fans');
    expect(out.toolKey).toBe('own-your-fans-calculator');
    expect(out.utmContent).toBe('reel-42');
    expect(out.campaignId).toBe('summer');
    expect(out.sourceVideoId).toBe('post_123');
    expect(out.variant).toBe('a');
    expect(out.context).toBe('public');
    expect(out.authed).toBe(false);
  });

  it('drops unknown / sensitive keys entirely', () => {
    const out = sanitizeOpportunityMeta({
      toolKey: 'own-your-fans-calculator',
      email: 'fan@example.com',
      phone: '5551234567',
      claimToken: 'abc.def',
      publicToken: 'zzz',
      token: 'qqq',
      answers: { social_followers: 90000 },
      inputs: { a: 1 },
      result: { headline: 'secret' },
      resultData: { sections: [] },
      amountCents: 500000,
      estimatedMonthlyCents: 12000,
    } as Record<string, unknown>);
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('example.com');
    expect(serialized).not.toContain('claimToken');
    expect(serialized).not.toContain('answers');
    expect(serialized).not.toContain('amountCents');
    expect(serialized).not.toContain('500000');
    expect(out.toolKey).toBe('own-your-fans-calculator');
  });

  it('drops an allowlisted key whose VALUE looks like PII', () => {
    const out = sanitizeOpportunityMeta({
      referralSource: 'fan@example.com', // allowed key, but an email value
      keyword: '555-123-4567', // allowed key, but a phone value
      utmSource: 'instagram',
    });
    expect(out.referralSource).toBeUndefined();
    expect(out.keyword).toBeUndefined();
    expect(out.utmSource).toBe('instagram');
  });

  it('rejects an invalid context and non-boolean authed', () => {
    const out = sanitizeOpportunityMeta({ context: 'admin', authed: 'yes' } as unknown as Record<string, unknown>);
    expect(out.context).toBeUndefined();
    expect(out.authed).toBeUndefined();
  });
});
