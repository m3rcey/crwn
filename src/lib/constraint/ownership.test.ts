import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Z5: the ownership boundary, asserted against the source so a future change has to argue with a
// test rather than quietly reintroduce a second recommendation owner.
//
// One recommendation owner (the Constraint Engine), many execution and read surfaces.

const read = (p: string) => readFileSync(p, 'utf8');
const ACTION_PLAN = read('src/app/api/action-plan/route.ts');
const STUDIO = read('src/app/(main)/studio/page.tsx');
const HUB = read('src/components/layout/AccountHub.tsx');
const MANAGER_PROMPT = read('src/lib/ai/generateActions.ts');

describe('Action Plan owns events and obligations, not strategy', () => {
  // These three fired on a STANDING STATE, which made them strategic recommendations competing
  // with the Constraint Engine. They were removed, not moved.
  it.each(['no-offer-yet', 'promotion-off', 'no-demand-test'])(
    'no longer emits the standing-gap recommendation %s',
    (id) => {
      expect(ACTION_PLAN).not.toContain(`id: '${id}'`);
    },
  );

  // Everything that reports something that HAPPENED or is DUE stays. Deleting useful event
  // intelligence was never the goal.
  it.each([
    'lead-magnet-mission',
    'clip-window-closing',
    'pending-fan-suggestions',
    'proof-of-demand-met',
  ])('still surfaces the event/deadline signal %s', (id) => {
    expect(ACTION_PLAN).toContain(id);
  });

  it('does not re-derive launch readiness, which the Roadmap owns', () => {
    // The removed rule counted tiers and products to decide whether an artist "has an offer".
    expect(ACTION_PLAN).not.toContain("from('subscription_tiers')");
    expect(ACTION_PLAN).not.toContain("from('products')");
  });

  it('still writes nothing and stays advisory', () => {
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(ACTION_PLAN, `action plan must not ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('resolves the artist from the session, never from a caller-supplied id', () => {
    expect(ACTION_PLAN).toContain("eq('user_id', user.id)");
    expect(ACTION_PLAN).not.toMatch(/searchParams\.get\(['"]artistId['"]\)/);
  });
});

describe('the artist is not offered two strategy surfaces side by side', () => {
  it('no longer labels the events feed as a plan competing with Manager', () => {
    expect(STUDIO).toContain("title: 'Needs You'");
    expect(STUDIO).not.toContain("title: 'Action Plan'");
    expect(HUB).toContain("label: 'Needs You'");
    expect(HUB).not.toContain("label: 'Action Plan'");
  });

  it('lists Manager exactly once in each navigation surface', () => {
    expect(STUDIO.match(/href: '\/studio\/manager'/g) ?? []).toHaveLength(1);
    expect(HUB.match(/href: '\/studio\/manager'/g) ?? []).toHaveLength(1);
  });

  it('keeps the route itself, so existing links and analytics still resolve', () => {
    expect(STUDIO).toContain("href: '/action-plan'");
    expect(HUB).toContain("href: '/action-plan'");
  });
});

// Z4 protections must survive Z5.
describe('the canonical priority still cannot be contradicted', () => {
  it('keeps the Manager subordinate to the Constraint Engine', () => {
    expect(MANAGER_PROMPT).toContain('CANONICAL DIAGNOSIS, READ THIS FIRST');
    expect(MANAGER_PROMPT).toContain('OUTRANKS the decision framework');
  });

  it('keeps insufficient evidence honest', () => {
    expect(MANAGER_PROMPT).toContain('do not claim a confidence CRWN itself refused to claim');
  });
});

describe('no second recommendation owner was created', () => {
  it('adds no aggregator, ranking layer or unified-recommendations table', () => {
    // Z5 removes owners. If a future change adds one of these, it should have to delete this test.
    expect(ACTION_PLAN).not.toMatch(/unified_recommendations|recommendation_queue|rankRecommendations/);
  });

  it('leaves Z3 issuance with exactly one writer', () => {
    // Only the constraint route issues. Action Plan and Manager read.
    expect(ACTION_PLAN).not.toContain('recordIssuedRecommendation');
    expect(MANAGER_PROMPT).not.toContain('recordIssuedRecommendation');
  });
});

describe('Path to Monetization has not come back', () => {
  it('is absent from the surfaces most likely to recreate it', () => {
    for (const src of [ACTION_PLAN, STUDIO, HUB, MANAGER_PROMPT]) {
      expect(src).not.toMatch(/MonetizationRoadmap|Path to Monetization/i);
    }
  });
});
