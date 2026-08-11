import { describe, it, expect } from 'vitest';
import {
  canonicalPriorityBrief,
  constraintRank,
  outranks,
  protectsEarnedRevenue,
} from './readership';
import { CONSTRAINT_TYPES, type ConstraintResult, type DiagnosedConstraint } from './types';
import { readConstraint } from './engine';
import { CONSTRAINT_THRESHOLDS } from './thresholds';
import { buildActionPrompt, SYSTEM_PROMPT } from '@/lib/ai/generateActions';
import type { ArtistDataForAI } from '@/lib/ai/collectArtistData';

const NOW = '2026-08-11T00:00:00.000Z';

function diagnosed(over: Partial<DiagnosedConstraint> = {}): DiagnosedConstraint {
  return {
    status: 'diagnosed',
    constraint: 'FULFILLMENT',
    confidence: 'high',
    title: 'Promises are slipping',
    explanation: 'x',
    evidence: [{ label: '6 of 10 delivered.', metric: 'promise_completion_rate', value: 0.6, unit: 'rate' }],
    action: { label: 'Deliver "Vault drop"', why: 'y', href: '/studio/promise', verifiedBy: 'artist_promise_fulfilled' },
    evaluatedAt: NOW,
    ...over,
  };
}
const insufficient: ConstraintResult = {
  status: 'insufficient_evidence',
  reason: 'too few due promises',
  missingEvidence: ['promises'],
  evaluatedAt: NOW,
};

// Z4: one fact -> one owner -> many readers. These prove the readers cannot re-rank the owner.
describe('canonical priority ordering is the engine own order, not a second policy', () => {
  it('derives rank from CONSTRAINT_TYPES so it cannot drift from the engine', () => {
    for (const t of CONSTRAINT_TYPES) expect(constraintRank(t)).toBe(CONSTRAINT_TYPES.indexOf(t));
  });

  it('puts FULFILLMENT ahead of every acquisition-side constraint', () => {
    for (const t of ['REACH', 'FREE_CAPTURE', 'FIRST_PAID', 'PAID_TIER_INTEREST', 'CHECKOUT_COMPLETION', 'DEPTH'] as const) {
      expect(outranks('FULFILLMENT', t), `FULFILLMENT should outrank ${t}`).toBe(true);
    }
  });

  it('puts RETENTION ahead of every acquisition-side constraint', () => {
    for (const t of ['REACH', 'FREE_CAPTURE', 'FIRST_PAID', 'PAID_TIER_INTEREST', 'CHECKOUT_COMPLETION', 'DEPTH'] as const) {
      expect(outranks('RETENTION', t), `RETENTION should outrank ${t}`).toBe(true);
    }
  });

  it('marks exactly the two constraints that protect already-earned revenue', () => {
    const protecting = CONSTRAINT_TYPES.filter(protectsEarnedRevenue);
    expect(protecting).toEqual(['FULFILLMENT', 'RETENTION']);
  });
});

describe('the brief a coaching surface receives', () => {
  it('names the constraint and the action the artist was already given', () => {
    const brief = canonicalPriorityBrief(diagnosed())!;
    expect(brief).toContain('FULFILLMENT');
    expect(brief).toContain('Deliver "Vault drop"');
    expect(brief).toContain('overrides your own ranking');
  });

  it('forbids growth actions while earned revenue is leaking', () => {
    for (const c of ['FULFILLMENT', 'RETENTION'] as const) {
      const brief = canonicalPriorityBrief(diagnosed({ constraint: c }))!;
      expect(brief.toLowerCase(), c).toContain('do not recommend acquisition');
      expect(brief.toLowerCase(), c).toContain('already been paid');
    }
  });

  it('does not carry the earned-revenue prohibition for acquisition constraints', () => {
    const brief = canonicalPriorityBrief(diagnosed({ constraint: 'FREE_CAPTURE' }))!;
    expect(brief.toLowerCase()).not.toContain('do not recommend acquisition');
    expect(brief).toContain('must serve this constraint');
  });

  // The heart of §12: refusing when data is thin is a real answer.
  it('returns NOTHING when the engine declined to diagnose', () => {
    expect(canonicalPriorityBrief(insufficient)).toBeNull();
    expect(canonicalPriorityBrief(null)).toBeNull();
    expect(canonicalPriorityBrief(undefined)).toBeNull();
  });

  it('is pure: reading it twice gives the same answer and does not touch the diagnosis', () => {
    const d = diagnosed();
    const snapshot = JSON.stringify(d);
    expect(canonicalPriorityBrief(d)).toBe(canonicalPriorityBrief(d));
    expect(JSON.stringify(d)).toBe(snapshot);
  });

  it('does not alter the engine output or its thresholds', () => {
    const thresholds = JSON.stringify(CONSTRAINT_THRESHOLDS);
    const evidence = {
      now: NOW,
      launch: { pageLive: true, stripeConnected: true, tierPurchasable: true, hasTrack: true, daysLive: 100 },
      reach: { uniqueVisits: null, lookbackDays: 30 },
      membership: { freeMembers: null, paidMembers: null, freeJoinsInWindow: null, daysSinceFirstFreeMember: null, hasFirstPaidConversion: null, mrrCents: null, premiumMrrShare: null },
      tiers: { interactionDataAvailable: false, paidRungs: [], lookbackDays: 30 },
      promises: { resolved: null, completed: null, missed: null, completionRate: null, overdueNow: null, oldestOverdue: null, lookbackDays: 90 },
      retention: { churnRatePct: null, platformChurnRatePct: null, cancelReasonResponses: null },
      slug: 'x',
    };
    const before = JSON.stringify(readConstraint(evidence));
    canonicalPriorityBrief(readConstraint(evidence));
    expect(JSON.stringify(readConstraint(evidence))).toBe(before);
    expect(JSON.stringify(CONSTRAINT_THRESHOLDS)).toBe(thresholds);
  });
});

// The manager is the Z4 reader. It may re-word the priority; it may not re-rank it.
describe('the AI manager receives the canonical priority', () => {
  const data = {
    artistName: 'A', platformTier: 'pro',
    unitEconomics: { mrr: 0, arpu: 0, ltv: 0, churnRate: 0, revenuePerVisitor: 0, uniqueVisitors30d: 0, salesVelocity: 0 },
    revenue: { thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0 },
    subscribers: { active: 0, newThisMonth: 0, churnedThisMonth: 0, fanActivity: { active: 0, atRisk: 0, churning: 0 }, atRiskFans: [] },
    retention: { cancelReasons: [] },
    community: { postsThisMonth: 0, lastPostDate: null },
    topFans: [],
  } as unknown as ArtistDataForAI;
  const ctx = { sequences: [], tiers: [], freeTracks: [], gatedTracks: [] };

  it('states the canonical diagnosis BEFORE any metric it might reason from', () => {
    const prompt = buildActionPrompt(data, { ...ctx, canonicalBrief: canonicalPriorityBrief(diagnosed()) });
    expect(prompt).toContain('CRWN CANONICAL DIAGNOSIS');
    expect(prompt.indexOf('CRWN CANONICAL DIAGNOSIS')).toBeLessThan(prompt.indexOf('=== UNIT ECONOMICS ==='));
  });

  it('adds nothing at all when the engine declined, so no priority is fabricated', () => {
    const withNull = buildActionPrompt(data, { ...ctx, canonicalBrief: null });
    const without = buildActionPrompt(data, ctx);
    expect(withNull).toBe(without);
    expect(withNull).not.toContain('CANONICAL DIAGNOSIS');
  });

  it('tells the model the canonical diagnosis outranks its own framework', () => {
    expect(SYSTEM_PROMPT).toContain('CANONICAL DIAGNOSIS, READ THIS FIRST');
    expect(SYSTEM_PROMPT).toContain('OUTRANKS the decision framework');
    // ...and that silence from the engine is not licence to invent confidence.
    expect(SYSTEM_PROMPT).toContain('do not claim a confidence CRWN itself refused to claim');
  });
});
