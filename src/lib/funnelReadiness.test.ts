import { describe, it, expect } from 'vitest';
import {
  assessFunnel,
  checkoutIsReady,
  experienceIsLive,
  followupIsActive,
  funnelIsLive,
  magnetIsValid,
  pickFunnel,
  primaryTier,
  EMPTY_FUNNEL_FACTS,
  type FunnelAutomationFacts,
  type FunnelFacts,
} from './funnelReadiness';

// ONE definition of "is the funnel whole". These tests pin the requirement classes the founder
// ratified on 2026-09-03: launch checks gate, truth checks gate traffic readiness, recommended
// and optional never block anything.

const FREE = { id: 'free', name: 'Bronze', price: 0, is_active: true, stripe_price_id: null };
const SILVER = { id: 'silver', name: 'Silver', price: 1000, is_active: true, stripe_price_id: 'price_s' };
const GOLD = { id: 'gold', name: 'Gold', price: 2500, is_active: true, stripe_price_id: 'price_g' };

function funnel(over: Partial<FunnelAutomationFacts> = {}): FunnelAutomationFacts {
  return {
    id: 'f1',
    status: 'active',
    magnet_kind: 'track',
    magnet_file_key: null,
    magnet_track_id: 't1',
    gold_tier_id: 'gold',
    silver_tier_id: 'silver',
    nurture_sequence_id: 'seq',
    public_token: 'tok',
    updated_at: '2026-09-01T00:00:00Z',
    activated_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function whole(over: Partial<FunnelFacts> = {}): FunnelFacts {
  return {
    automations: [funnel()],
    tiers: [FREE, SILVER, GOLD],
    tracks: [{ id: 't1', is_active: true }],
    benefits: [
      { tier_id: 'gold', benefit_type: 'exclusive_tracks' },
      { tier_id: 'gold', benefit_type: 'one_on_one_call' },
    ],
    stripeConnected: true,
    experiences: [{ tier_id: 'gold', is_active: true, valid: true }],
    sequences: [{ id: 'seq', is_active: true, trigger_type: 'free_join', goal_tier_id: 'gold', stepCount: 5 }],
    ...over,
  };
}

describe('pickFunnel', () => {
  it('prefers the live row, then the most recently touched draft', () => {
    const live = funnel({ id: 'live', status: 'active' });
    const draft = funnel({ id: 'draft', status: 'draft', updated_at: '2026-09-02T00:00:00Z' });
    expect(pickFunnel([draft, live])?.id).toBe('live');
    expect(pickFunnel([funnel({ id: 'old', status: 'draft', updated_at: '2026-08-01T00:00:00Z' }), draft])?.id).toBe('draft');
    expect(pickFunnel([])).toBeNull();
  });
});

describe('the narrow predicates', () => {
  it('a magnet is valid only while its asset still exists', () => {
    expect(magnetIsValid(funnel(), [{ id: 't1', is_active: true }])).toBe(true);
    expect(magnetIsValid(funnel(), [{ id: 't1', is_active: false }])).toBe(false);
    expect(magnetIsValid(funnel(), [])).toBe(false);
    expect(magnetIsValid(funnel({ magnet_kind: 'upload', magnet_file_key: 'gb/magnet/x.zip' }), [])).toBe(true);
    expect(magnetIsValid(funnel({ magnet_kind: 'upload', magnet_file_key: null }), [])).toBe(false);
    expect(magnetIsValid(funnel({ magnet_kind: null }), [])).toBe(false);
    expect(magnetIsValid(null, [])).toBe(false);
  });

  it('checkout needs Stripe AND a live price on the primary tier', () => {
    expect(checkoutIsReady(GOLD, true)).toBe(true);
    expect(checkoutIsReady(GOLD, false)).toBe(false);
    expect(checkoutIsReady({ ...GOLD, stripe_price_id: null }, true)).toBe(false);
    expect(checkoutIsReady(null, true)).toBe(false);
  });

  it('the primary tier follows the pointer, derives when silent, and is never the free rung', () => {
    const facts = whole();
    expect(primaryTier(facts, funnel())?.id).toBe('gold');
    expect(primaryTier(facts, funnel({ gold_tier_id: 'silver' }))?.id).toBe('silver');
    expect(primaryTier(facts, funnel({ gold_tier_id: 'free' }))?.id).toBe('gold');
    expect(primaryTier(facts, funnel({ gold_tier_id: 'someone-elses' }))?.id).toBe('gold');
    expect(primaryTier(facts, null)?.id).toBe('gold');
    expect(primaryTier(whole({ tiers: [FREE] }), null)).toBeNull();
  });

  it('a funnel is live only when switched on with a purchasable primary behind it', () => {
    expect(funnelIsLive(whole(), funnel())).toBe(true);
    expect(funnelIsLive(whole(), funnel({ status: 'draft' }))).toBe(false);
    expect(funnelIsLive(whole({ tiers: [FREE, SILVER, { ...GOLD, stripe_price_id: null }] }), funnel())).toBe(false);
    expect(funnelIsLive(whole(), null)).toBe(false);
  });

  it('a sales experience counts only when active, valid, and on the primary tier', () => {
    expect(experienceIsLive('gold', [{ tier_id: 'gold', is_active: true, valid: true }])).toBe(true);
    expect(experienceIsLive('gold', [{ tier_id: 'gold', is_active: false, valid: true }])).toBe(false);
    expect(experienceIsLive('gold', [{ tier_id: 'gold', is_active: true, valid: false }])).toBe(false);
    expect(experienceIsLive('gold', [{ tier_id: 'silver', is_active: true, valid: true }])).toBe(false);
    expect(experienceIsLive(null, [{ tier_id: 'gold', is_active: true, valid: true }])).toBe(false);
  });

  it('follow-up follows the pointer, falls back to the free-join trigger, and needs messages plus a goal', () => {
    const seq = { id: 'seq', is_active: true, trigger_type: 'free_join', goal_tier_id: 'gold', stepCount: 3 };
    expect(followupIsActive(funnel(), [seq])).toBe(true);
    // No pointer: the enroller falls back to the artist's active free_join sequence.
    expect(followupIsActive(funnel({ nurture_sequence_id: null }), [seq])).toBe(true);
    // A pointer at a switched-off sequence falls back too.
    expect(followupIsActive(funnel({ nurture_sequence_id: 'other' }), [{ ...seq, id: 'other', is_active: false }, seq])).toBe(true);
    expect(followupIsActive(funnel(), [{ ...seq, stepCount: 0 }])).toBe(false);
    expect(followupIsActive(funnel(), [{ ...seq, goal_tier_id: null }])).toBe(false);
    expect(followupIsActive(funnel({ nurture_sequence_id: null }), [{ ...seq, trigger_type: 'new_subscription' }])).toBe(false);
    expect(followupIsActive(funnel(), [])).toBe(false);
  });
});

describe('assessFunnel', () => {
  it('a whole funnel passes every check and is ready for traffic', () => {
    const a = assessFunnel(whole());
    expect(a.checks.filter((c) => c.state === 'fail')).toEqual([]);
    expect(a.readyForTraffic).toBe(true);
    expect(a.activationBlockers).toEqual([]);
    expect(a.nextFlow).toBeNull();
    expect(a.primaryTierId).toBe('gold');
    expect(a.checks.find((c) => c.key === 'offer')?.fact).toContain('CRWN delivers 1, you deliver 1');
  });

  it('an empty account fails every launch check and points at the offer first', () => {
    const a = assessFunnel(EMPTY_FUNNEL_FACTS);
    expect(a.readyForTraffic).toBe(false);
    expect(a.nextFlow).toBe('offer');
    expect(a.checks.find((c) => c.key === 'funnel_live')?.state).toBe('fail');
  });

  it('a missing downsell is a choice, not a defect', () => {
    const a = assessFunnel(whole({ automations: [funnel({ silver_tier_id: null })] }));
    const d = a.checks.find((c) => c.key === 'downsell')!;
    expect(d.state).toBe('skip');
    expect(d.requirement).toBe('optional');
    expect(a.readyForTraffic).toBe(true);
  });

  it('a downsell that is not strictly cheaper is dropped and reported, and still never blocks', () => {
    const a = assessFunnel(whole({ automations: [funnel({ silver_tier_id: 'gold' })] }));
    expect(a.checks.find((c) => c.key === 'downsell')?.state).toBe('fail');
    expect(a.readyForTraffic).toBe(true);
  });

  it('inactive follow-up is surfaced clearly and never blocks activation or traffic', () => {
    const a = assessFunnel(whole({ sequences: [] }));
    const f = a.checks.find((c) => c.key === 'followup')!;
    expect(f.state).toBe('fail');
    expect(f.requirement).toBe('recommended');
    expect(f.fact).toContain('never hears from you again');
    expect(a.activationBlockers).toEqual([]);
    expect(a.readyForTraffic).toBe(true);
  });

  it('a follow-up with no goal is named for what it does: it never stops', () => {
    const a = assessFunnel(whole({ sequences: [{ id: 'seq', is_active: true, trigger_type: 'free_join', goal_tier_id: null, stepCount: 4 }] }));
    expect(a.checks.find((c) => c.key === 'followup')?.fact).toContain('never stops');
  });

  it('a missing sales experience is a TRUTH failure: it blocks traffic readiness, not activation', () => {
    const a = assessFunnel(whole({ experiences: [] }));
    const s = a.checks.find((c) => c.key === 'sales_experience')!;
    expect(s.state).toBe('fail');
    expect(s.requirement).toBe('truth');
    expect(a.activationBlockers).toEqual([]);
    expect(a.readyForTraffic).toBe(false);
    expect(a.nextFlow).toBe('experience');
  });

  it('a disconnected Stripe is a launch failure that blocks activation and names the stripe flow', () => {
    const a = assessFunnel(whole({ stripeConnected: false }));
    expect(a.activationBlockers.map((c) => c.key)).toEqual(['checkout']);
    expect(a.checks.find((c) => c.key === 'checkout')?.flow).toBe('stripe');
    expect(a.readyForTraffic).toBe(false);
  });

  it('a deleted magnet track reopens the magnet flow', () => {
    const a = assessFunnel(whole({ tracks: [] }));
    expect(a.activationBlockers.map((c) => c.key)).toEqual(['magnet']);
    expect(a.checks.find((c) => c.key === 'magnet')?.fact).toContain('no longer exists');
    expect(a.nextFlow).toBe('magnet');
  });

  it('a deleted primary tier reopens the offer', () => {
    const a = assessFunnel(whole({ tiers: [FREE] }));
    expect(a.primaryTierId).toBeNull();
    expect(a.checks.find((c) => c.key === 'offer')?.state).toBe('fail');
    expect(a.checks.find((c) => c.key === 'primary_offer')?.state).toBe('fail');
    expect(a.nextFlow).toBe('offer');
  });

  it('a paid tier with a retired benefit only promises nothing CRWN can keep', () => {
    const a = assessFunnel(whole({ benefits: [{ tier_id: 'gold', benefit_type: 'monthly_merch' }] }));
    expect(a.checks.find((c) => c.key === 'offer')?.state).toBe('fail');
  });

  it('the switch itself is the only launch check excluded from activation blockers', () => {
    const a = assessFunnel(whole({ automations: [funnel({ status: 'draft' })] }));
    expect(a.checks.find((c) => c.key === 'funnel_live')?.state).toBe('fail');
    expect(a.activationBlockers).toEqual([]);
    expect(a.readyForTraffic).toBe(false);
  });

  it('facts carry names and counts, never ids, tokens or urls', () => {
    const a = assessFunnel(whole());
    for (const c of a.checks) {
      expect(c.fact).not.toMatch(/https?:\/\//);
      expect(c.fact).not.toContain('tok');
      expect(c.fact).not.toContain('price_g');
    }
  });
});
