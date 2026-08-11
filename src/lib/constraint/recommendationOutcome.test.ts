import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordIssuedRecommendation } from './recommendationStore';
import {
  actionKeyFor,
  baselineFrom,
  classifyOutcome,
  isDueForMeasurement,
  issuedFrom,
  measurementWindowDays,
  outcomeSummary,
  actionIsVerifiable,
} from './recommendationOutcome';
import { CONSTRAINT_THRESHOLDS } from './thresholds';
import type { ConstraintResult, DiagnosedConstraint, InsufficientEvidence } from './types';

const NOW = '2026-08-11T00:00:00.000Z';

function diagnosed(over: Partial<DiagnosedConstraint> = {}): DiagnosedConstraint {
  return {
    status: 'diagnosed',
    constraint: 'FULFILLMENT',
    confidence: 'medium',
    title: 'Promises are slipping',
    explanation: 'x',
    evidence: [
      { label: '6 of 10 delivered', metric: 'promise_completion_rate', value: 0.6, unit: 'rate' },
      { label: '2 overdue now', metric: 'promises_overdue_now', value: 2, unit: 'count' },
    ],
    action: { label: 'Deliver "Vault drop"', why: 'y', href: '/studio/promise', verifiedBy: 'artist_promise_fulfilled' },
    evaluatedAt: NOW,
    ...over,
  };
}

const insufficient: InsufficientEvidence = {
  status: 'insufficient_evidence',
  reason: 'too few due promises',
  missingEvidence: ['promises'],
  evaluatedAt: NOW,
};

describe('recommendation identity', () => {
  it('is durable and independent of the wording shown to the artist', () => {
    const a = issuedFrom(diagnosed())!;
    const b = issuedFrom(diagnosed({ title: 'Completely rewritten copy', action: { ...diagnosed().action, label: 'Different button text' } }))!;
    expect(a.actionKey).toBe(b.actionKey);
    expect(a.actionKey).toBe('FULFILLMENT:artist_promise_fulfilled');
  });

  it('separates the two different actions one constraint can issue', () => {
    expect(actionKeyFor('REACH', 'artist_has_fan_contacts')).not.toBe(actionKeyFor('REACH', 'artist_sent_campaign'));
  });

  it('marks an advisory action as unverifiable rather than pretending it can be checked', () => {
    const advisory = issuedFrom(diagnosed({ action: { ...diagnosed().action, verifiedBy: null } }))!;
    expect(advisory.actionKey).toBe('FULFILLMENT:advisory');
    expect(actionIsVerifiable(advisory)).toBe(false);
    expect(actionIsVerifiable(issuedFrom(diagnosed())!)).toBe(true);
  });
});

describe('silence is not a recommendation', () => {
  it('records nothing when the engine declined to diagnose', () => {
    expect(issuedFrom(insufficient)).toBeNull();
  });
});

describe('baseline evidence semantics', () => {
  it('keeps a null metric MISSING and never turns it into zero', () => {
    const d = diagnosed({
      evidence: [{ label: 'no data', metric: 'promise_completion_rate', value: null, unit: 'rate' }],
    });
    const [m] = baselineFrom(d);
    expect(m.value).toBeNull();
    expect(m.state).toBe('missing');
    expect(m.value).not.toBe(0);
  });

  it('labels a real product value complete, using the canonical vocabulary', () => {
    const [m] = baselineFrom(diagnosed());
    expect(m.state).toBe('complete');
    expect(['complete', 'modeled', 'missing']).toContain(m.state);
  });

  it('carries the machine metric key, not the prose label', () => {
    expect(baselineFrom(diagnosed()).map((m) => m.metric)).toEqual([
      'promise_completion_rate',
      'promises_overdue_now',
    ]);
  });
});

describe('measurement window comes from policy, never from this module', () => {
  it('uses the engine own lookback for stages that define one', () => {
    expect(measurementWindowDays('FULFILLMENT')).toBe(CONSTRAINT_THRESHOLDS.fulfillment.lookbackDays);
    expect(measurementWindowDays('REACH')).toBe(CONSTRAINT_THRESHOLDS.reach.lookbackDays);
    expect(measurementWindowDays('CHECKOUT_COMPLETION')).toBe(CONSTRAINT_THRESHOLDS.checkoutCompletion.lookbackDays);
  });

  it('returns null for stages with no canonical window instead of inventing one', () => {
    expect(measurementWindowDays('RETENTION')).toBeNull();
    expect(measurementWindowDays('FIRST_PAID')).toBeNull();
    expect(measurementWindowDays('DEPTH')).toBeNull();
  });

  it('never calls a windowless recommendation due', () => {
    const inTenYears = '2036-08-11T00:00:00.000Z';
    expect(isDueForMeasurement({ issuedAt: NOW, measureAfterDays: null }, inTenYears)).toBe(false);
  });

  it('is due only after the full window has elapsed', () => {
    const rec = { issuedAt: NOW, measureAfterDays: 90 };
    expect(isDueForMeasurement(rec, '2026-11-08T00:00:00.000Z')).toBe(false); // day 89
    expect(isDueForMeasurement(rec, '2026-11-09T00:00:00.000Z')).toBe(true); // day 90
  });
});

describe('outcome classification', () => {
  const issued = { constraint: 'FULFILLMENT' as const };

  it('is persists when the engine still names the same constraint', () => {
    const o = classifyOutcome(issued, diagnosed(), NOW);
    expect(o.outcome).toBe('constraint_persists');
    expect(o.constraintNow).toBe('FULFILLMENT');
  });

  it('is cleared when the artist has moved to a different constraint', () => {
    const o = classifyOutcome(issued, diagnosed({ constraint: 'FREE_CAPTURE' }), NOW);
    expect(o.outcome).toBe('constraint_cleared');
    expect(o.constraintNow).toBe('FREE_CAPTURE');
  });

  // The single most important test in this file.
  it('never reads missing evidence as success', () => {
    const o = classifyOutcome(issued, insufficient, NOW);
    expect(o.outcome).toBe('insufficient_evidence');
    expect(o.outcome).not.toBe('constraint_cleared');
    expect(o.constraintNow).toBeNull();
    expect(o.observed).toEqual([]);
  });

  it('records the later observation without touching the baseline shape it was given', () => {
    const before = baselineFrom(diagnosed());
    const o = classifyOutcome(issued, diagnosed({ evidence: [{ label: 'l', metric: 'promise_completion_rate', value: 0.9, unit: 'rate' }] }), NOW);
    expect(o.observed[0].value).toBe(0.9);
    expect(before[0].value).toBe(0.6); // untouched
  });
});

describe('a completed action is not a successful recommendation', () => {
  it('says so in every combination, and never claims causation', () => {
    const persistsButActed = outcomeSummary('constraint_persists', true);
    expect(persistsButActed).toBe('Acted on, still the constraint');

    const clearedNotActed = outcomeSummary('constraint_cleared', false);
    expect(clearedNotActed).toContain('never verified');

    for (const state of ['not_measured_yet', 'insufficient_evidence', 'constraint_cleared', 'constraint_persists'] as const) {
      for (const acted of [true, false]) {
        const s = outcomeSummary(state, acted).toLowerCase();
        expect(s).not.toMatch(/caused|because of this|thanks to|produced|impact/);
      }
    }
  });

  it('does not let action completion change the outcome classification', () => {
    // classifyOutcome takes no completion flag at all: the two facts cannot be conflated.
    const o = classifyOutcome({ constraint: 'FULFILLMENT' }, diagnosed(), NOW);
    expect(o.outcome).toBe('constraint_persists');
  });
});

// Fail soft for the artist, observable for CRWN. supabase-js RETURNS an {error} rather than
// throwing, so a swallowed write is the single easiest silent failure in this codebase to ship.
describe('write failures never reach the artist, but the real ones are visible', () => {
  const fakeDb = (error: { code: string; message: string } | null) =>
    ({ from: () => ({ insert: async () => ({ error }) }) }) as never;

  afterEach(() => vi.restoreAllMocks());

  it('stays silent on a duplicate: that is the idempotency guarantee working', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordIssuedRecommendation(fakeDb({ code: '23505', message: 'duplicate key' }), 'a1', diagnosed());
    expect(spy).not.toHaveBeenCalled();
  });

  it('stays silent before the migration has been applied', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordIssuedRecommendation(fakeDb({ code: '42P01', message: 'relation does not exist' }), 'a1', diagnosed());
    expect(spy).not.toHaveBeenCalled();
  });

  it('reports any other fault instead of hiding it forever', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await recordIssuedRecommendation(fakeDb({ code: '42501', message: 'permission denied' }), 'a1', diagnosed());
    expect(spy).toHaveBeenCalled();
  });

  it('never throws, whatever the database says, so the dashboard cannot break on bookkeeping', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const exploding = { from: () => ({ insert: async () => { throw new Error('network down'); } }) } as never;
    await expect(recordIssuedRecommendation(exploding, 'a1', diagnosed())).resolves.toBeUndefined();
    await expect(recordIssuedRecommendation(fakeDb({ code: '42501', message: 'x' }), 'a1', diagnosed())).resolves.toBeUndefined();
  });

  it('writes nothing at all when the engine declined to diagnose', async () => {
    let called = false;
    const watching = { from: () => ({ insert: async () => { called = true; return { error: null }; } }) } as never;
    await recordIssuedRecommendation(watching, 'a1', insufficient);
    expect(called).toBe(false);
  });
});

describe('several recommendations remain distinguishable', () => {
  it('gives different constraints different identities', () => {
    const results: ConstraintResult[] = [diagnosed(), diagnosed({ constraint: 'REACH', action: { label: 'a', why: 'b', href: '/studio/fans', verifiedBy: 'artist_has_fan_contacts' } })];
    const keys = results.map((r) => issuedFrom(r)!.actionKey);
    expect(new Set(keys).size).toBe(2);
  });
});
