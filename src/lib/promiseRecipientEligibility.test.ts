import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readStripped } from './architecture/sourceScan';
import {
  fanEligibleForObligation,
  obligationHasNoEligibleRecipient,
  type EligibilityMember,
} from './calendarProjection';
import { readConstraint } from './constraint/engine';
import { resolveOperatingFlow } from './constraint/presentation';
import { resolveRiseNextMove } from './riseNextMove';
import { assembleRoadmap, buildRoadmapDefs, type RoadmapStepResult } from './artistRoadmap';
import { onlyFanPromises } from './fulfillment';
import type { ConstraintEvidence } from './constraint/types';

// FULFILLMENT URGENCY REQUIRES A RECIPIENT.
//
// An overdue obligation is evidence that an artist broke a promise to a paying supporter only when
// somebody can currently receive it. Production on 2026-08-13 held four overdue "fan promises",
// every one of them auto-created from a tier template, all on Gold and Platinum, which had ZERO
// active subscribers between them; one of the two artists holding them had never had a single
// subscription. FULFILLMENT fires at n = 1 and outranks every growth stage, so those rows were
// about to displace the roadmap step that leads to a first paying member.
//
// The gate is zero versus one. It is NOT a sample threshold, and these tests exist to stop one
// being introduced later.

const NOW = '2026-08-13T00:00:00.000Z';
const GOLD = 'tier-gold';
const PLATINUM = 'tier-platinum';
const SILVER = 'tier-silver';

/** A tier-scoped obligation, shaped like the rows `tier_benefit_sync` writes. */
const tierObligation = (audienceId: string, serves: string[] = []) => ({
  audience_kind: 'tier',
  audience_id: audienceId,
  metadata: serves.length
    ? { source: 'tier_benefit_sync', serves_tier_ids: serves }
    : { source: 'tier_benefit_sync' },
});

const member = (tierId: string | null): EligibilityMember => ({ tierId });

describe('the canonical rule: does anybody actually receive this obligation', () => {
  it('an empty room is positively identified', () => {
    expect(obligationHasNoEligibleRecipient(tierObligation(GOLD), [])).toBe(true);
    expect(obligationHasNoEligibleRecipient(tierObligation(GOLD), [member(SILVER)])).toBe(true);
  });

  it('ONE member is enough, and no threshold above one exists', () => {
    expect(obligationHasNoEligibleRecipient(tierObligation(GOLD), [member(GOLD)])).toBe(false);
  });

  it('inheritance counts: a higher tier served through serves_tier_ids is a real recipient', () => {
    // Gold's monthly vault unlock serves Platinum too (promisePlan computeServesTierIds).
    const ob = tierObligation(GOLD, [PLATINUM]);
    expect(obligationHasNoEligibleRecipient(ob, [member(PLATINUM)])).toBe(false);
    // ...and an unrelated rung still does not.
    expect(obligationHasNoEligibleRecipient(ob, [member(SILVER)])).toBe(true);
  });

  it('all_supporters is satisfied by any active member and empty by none', () => {
    const ob = { audience_kind: 'all_supporters', audience_id: null, metadata: {} };
    expect(obligationHasNoEligibleRecipient(ob, [member(null)])).toBe(false);
    expect(obligationHasNoEligibleRecipient(ob, [])).toBe(true);
  });

  it('FAILS SAFE: an audience kind it cannot evaluate is never suppressed', () => {
    // Suppressing a promise a paying fan IS owed is far worse than letting an empty one through.
    for (const kind of ['squad', 'campaign', 'something_added_later', null]) {
      const ob = { audience_kind: kind, audience_id: 'x', metadata: {} };
      expect(obligationHasNoEligibleRecipient(ob, [])).toBe(false);
    }
  });

  it('is the existential form of fanEligibleForObligation, not a second opinion', () => {
    // Every case the per-fan rule accepts, the "anybody" rule must accept for that same fan.
    const cases: { ob: ReturnType<typeof tierObligation>; tier: string }[] = [
      { ob: tierObligation(GOLD), tier: GOLD },
      { ob: tierObligation(GOLD, [PLATINUM]), tier: PLATINUM },
    ];
    for (const c of cases) {
      expect(fanEligibleForObligation(c.ob, c.tier, new Set())).toBe(true);
      expect(obligationHasNoEligibleRecipient(c.ob, [member(c.tier)])).toBe(false);
    }
    // And the source proves it is literally implemented in terms of it, not re-derived.
    const src = readFileSync('src/lib/calendarProjection.ts', 'utf8');
    const fn = src.slice(src.indexOf('export function obligationHasNoEligibleRecipient'));
    expect(fn).toContain('fanEligibleForObligation(');
  });

  it('never reads the dead eligible_fan_count column', () => {
    // Declared "denormalized at materialize time" and written by NOTHING: every insert site omits
    // it, so it is 0 on every production row. Gating on it would silence every real promise.
    // Comments stripped: both files EXPLAIN why the column is unusable, and a scan that counted
    // the explanation as the use would pressure honest documentation out of the code.
    for (const p of [
      'src/lib/constraint/assembler.ts',
      'src/lib/promiseReminders.ts',
    ]) {
      expect(readStripped(p)).not.toContain('eligible_fan_count');
    }
  });
});

describe('ramp and internal rows stay excluded, whatever the audience says', () => {
  it('a Revenue Ramp step is still not a fan promise', () => {
    const rows = [
      { id: 'a', metadata: { ramp_step_key: 'connect_stripe' } },
      { id: 'b', metadata: {} },
    ];
    expect(onlyFanPromises(rows).map((r) => r.id)).toEqual(['b']);
  });

  it('the assembler applies the fan boundary BEFORE the recipient gate', () => {
    // Order matters: a ramp step has no audience, so evaluating the gate first would classify it
    // as an empty room and quietly reach the right answer for the wrong reason.
    const src = readFileSync('src/lib/constraint/assembler.ts', 'utf8');
    expect(src.indexOf('onlyFanPromises(')).toBeLessThan(
      src.indexOf('obligationHasNoEligibleRecipient('),
    );
  });
});

// ---------------------------------------------------------------------------
// The engine and Rise Mode, through the real decision path
// ---------------------------------------------------------------------------

function evidence(over: Partial<ConstraintEvidence> = {}): ConstraintEvidence {
  return {
    now: NOW,
    launch: { pageLive: true, stripeConnected: true, tierPurchasable: true, hasTrack: true, daysLive: 60 },
    reach: { uniqueVisits: 400, lookbackDays: 30 },
    membership: {
      freeMembers: 40, paidMembers: 12, freeJoinsInWindow: 40, daysSinceFirstFreeMember: 40,
      hasFirstPaidConversion: true, mrrCents: 20000, premiumMrrShare: 0.9,
    },
    tiers: { interactionDataAvailable: false, paidRungs: [], lookbackDays: 30 },
    promises: {
      resolved: 0, completed: 0, missed: 0, completionRate: null,
      overdueNow: 0, oldestOverdue: null, lookbackDays: 90,
    },
    retention: { churnRatePct: 2, platformChurnRatePct: 5, cancelReasonResponses: 0 },
    slug: 'someone',
    ...over,
  };
}

const roadmapWithOpenProfile = () => {
  const defs = buildRoadmapDefs({ slug: 'someone' });
  const results: Record<string, RoadmapStepResult> = {};
  for (const stage of defs) {
    for (const step of stage.steps) {
      const done = stage.key === 'foundation' && step.key !== 'foundation-profile';
      results[step.key] = { done, current: done ? 1 : 0, target: 1 };
    }
  }
  return assembleRoadmap(defs, results);
};

describe('the engine sees only promises somebody is owed', () => {
  const roadmap = roadmapWithOpenProfile();

  it('a real overdue promise still wins, and still beats a roadmap milestone', () => {
    const r = readConstraint(
      evidence({
        promises: {
          resolved: 0, completed: 0, missed: 0, completionRate: null,
          overdueNow: 1,
          oldestOverdue: { id: 'fe-1', title: 'August vault drop', dueAt: '2026-08-01T00:00:00.000Z' },
          lookbackDays: 90,
        },
      }),
    );
    expect(r.status === 'diagnosed' && r.constraint).toBe('FULFILLMENT');
    const next = resolveRiseNextMove(resolveOperatingFlow(r), roadmap);
    expect(next.move?.owner).toBe('constraint');
    expect(next.move?.title).toContain('August vault drop');
    expect(next.afterThis).toBe('Complete your public profile');
  });

  it('an empty-room promise never reaches the engine, so Rise Mode moves on', () => {
    // The assembler filters it out, which the engine sees as overdueNow 0. Nothing downstream is
    // blocking either, so the roadmap leads: the artist is sent toward a first paying member
    // instead of being told to deliver a vault unlock to nobody.
    const r = readConstraint(evidence());
    expect(r.status).toBe('insufficient_evidence');
    const next = resolveRiseNextMove(resolveOperatingFlow(r), roadmap);
    expect(next.move?.owner).toBe('roadmap');
    expect(next.move?.title).toBe('Complete your public profile');
  });

  it('precedence itself is untouched: fulfillment still outranks reach', () => {
    const both = readConstraint(
      evidence({
        reach: { uniqueVisits: 1, lookbackDays: 30 },
        promises: {
          resolved: 0, completed: 0, missed: 0, completionRate: null,
          overdueNow: 1,
          oldestOverdue: { id: 'fe-9', title: 'Members-only demo', dueAt: '2026-08-02T00:00:00.000Z' },
          lookbackDays: 90,
        },
      }),
    );
    expect(both.status === 'diagnosed' && both.constraint).toBe('FULFILLMENT');
  });

  it('the gate lives in the evidence, never in the engine stage order', () => {
    const engine = readFileSync('src/lib/constraint/engine.ts', 'utf8');
    expect(engine).not.toContain('obligationHasNoEligibleRecipient');
    expect(engine).not.toContain('eligible');
    // Stage 1 still fires at n = 1 on whatever overdue evidence it is handed.
    expect(engine).toContain('if ((p.overdueNow ?? 0) > 0)');
  });
});

describe('the reminder cron and the engine share one rule', () => {
  const reminders = readFileSync('src/lib/promiseReminders.ts', 'utf8');
  const assembler = readFileSync('src/lib/constraint/assembler.ts', 'utf8');

  it('both import the same helper rather than expressing it twice', () => {
    for (const src of [reminders, assembler]) {
      expect(src).toContain('obligationHasNoEligibleRecipient');
      expect(src).toContain("from '@/lib/calendarProjection'");
      // No local re-implementation of "who is owed this".
      expect(src).not.toMatch(/function\s+\w*[eE]ligib\w*\s*\(/);
    }
  });

  it('the reminder reads the audience it needs and only active subscriptions', () => {
    expect(reminders).toContain('audience_kind, audience_id, metadata');
    expect(reminders).toContain("eq('status', 'active')");
  });

  it('a failed subscription read suppresses nothing', () => {
    // Unknown must never silence a promise a paying fan may be owed.
    expect(reminders).toContain('subsLoaded.ok &&');
    expect(assembler).toContain('if (!obErr)');
  });

  it('leaves offsets, dedupe and cron frequency alone', () => {
    expect(reminders).toContain('[7, 3, 1]');
    expect(reminders).toContain('remindedOffsetsOf(e.metadata)');
  });
});

describe('the obligation itself is not deleted, only its urgency', () => {
  it('nothing in this fix archives, cancels or deletes an obligation', () => {
    for (const p of ['src/lib/constraint/assembler.ts', 'src/lib/promiseReminders.ts']) {
      const src = readFileSync(p, 'utf8');
      expect(src).not.toMatch(/\.delete\(\)|status: 'archived'|status: 'cancelled'/);
    }
    // The calendar still projects every obligation, empty room or not.
    const projection = readFileSync('src/lib/calendarProjection.ts', 'utf8');
    expect(projection).not.toContain('obligationHasNoEligibleRecipient(ob, ');
  });
});
