import { describe, it, expect } from 'vitest';
import {
  RAMP_PHASES,
  RAMP_STEPS,
  buildRamp,
  computeRampProgress,
  netCentsPerPayer,
  phaseAt,
} from './revenueRamp';
import { calculate, getAssumptions } from './leadCalculator';

const START = new Date('2026-01-01T00:00:00.000Z');

describe('revenue ramp (the calculator number, dated)', () => {
  it('reconciles with the calculator: the ramp target implies the calculator payer count', () => {
    // The whole model hangs on this. If netCentsPerPayer drifts from leadCalculator's
    // assumptions, every milestone headcount on every artist's calendar is wrong.
    const a = getAssumptions('conservative');
    const result = calculate({ monthlyListeners: 0, engagedFollowers: 250_000, currentStreamingCents: 0 }, a);
    const ramp = buildRamp({ targetMonthlyCents: result.netMrrCents, startedAt: START });
    const finalPhase = ramp.phases[ramp.phases.length - 1];

    // Same population the calculator computed, reached from the money instead of the audience.
    expect(finalPhase.targetPayers).toBe(Math.round(result.payers));
    expect(finalPhase.targetMonthlyCents).toBe(result.netMrrCents);
  });

  it('derives per-payer value from the calculator, never a second price map', () => {
    const a = getAssumptions('conservative');
    const gross =
      a.tier1Share * a.tier1PriceCents +
      a.tier2Share * a.tier2PriceCents +
      a.tier3Share * a.tier3PriceCents +
      a.alacarteArpuCents;
    expect(netCentsPerPayer()).toBeCloseTo(gross * 0.92, 6);
  });

  it('money trails headcount until the final phase, because the top tier fills last', () => {
    for (const p of RAMP_PHASES) {
      expect(p.mrrPct).toBeLessThanOrEqual(p.payerPct);
    }
    const last = RAMP_PHASES[RAMP_PHASES.length - 1];
    expect(last.mrrPct).toBe(1);
    expect(last.payerPct).toBe(1);
  });

  it('phases are contiguous, ordered, and cover exactly one year', () => {
    expect(RAMP_PHASES[0].startDay).toBe(0);
    for (let i = 1; i < RAMP_PHASES.length; i++) {
      expect(RAMP_PHASES[i].startDay).toBe(RAMP_PHASES[i - 1].endDay + 1);
      expect(RAMP_PHASES[i].mrrPct).toBeGreaterThan(RAMP_PHASES[i - 1].mrrPct);
    }
    expect(RAMP_PHASES[RAMP_PHASES.length - 1].endDay).toBe(365);
  });

  it('earns nothing in foundation, and first money lands inside the first month and a half', () => {
    const foundation = RAMP_PHASES[0];
    expect(foundation.mrrPct).toBe(0);
    const firstEarning = RAMP_PHASES[1];
    expect(firstEarning.endDay).toBeLessThanOrEqual(45);
    expect(firstEarning.mrrPct).toBeGreaterThan(0);
  });

  it('every step has a stable unique key and falls inside its own phase window', () => {
    const keys = new Set<string>();
    const byKey = new Map(RAMP_PHASES.map((p) => [p.key, p]));
    for (const s of RAMP_STEPS) {
      expect(keys.has(s.key), `duplicate step key ${s.key}`).toBe(false);
      keys.add(s.key);
      const phase = byKey.get(s.phase)!;
      expect(phase, `step ${s.key} references an unknown phase`).toBeTruthy();
      expect(s.dueDay, `step ${s.key} is due before its phase starts`).toBeGreaterThanOrEqual(phase.startDay);
      expect(s.dueDay, `step ${s.key} is due after its phase ends`).toBeLessThanOrEqual(phase.endDay);
    }
  });

  it('every step points at an internal CRWN route', () => {
    // A roadmap that links an artist to a door that does not open is worse than no roadmap.
    for (const s of RAMP_STEPS) {
      expect(s.href.startsWith('/'), `${s.key} has a non-internal href`).toBe(true);
    }
  });

  it('the accelerators are real and are what compress the year', () => {
    const accel = RAMP_STEPS.filter((s) => s.accelerator);
    expect(accel.length).toBeGreaterThanOrEqual(4);
    const ramp = buildRamp({ targetMonthlyCents: 1_000_000, startedAt: START });
    expect(ramp.acceleratedDays).toBeLessThan(ramp.totalDays);
  });

  it('never uses an em dash or an en dash in artist-facing copy', () => {
    for (const p of RAMP_PHASES) {
      expect(p.name + p.focus + p.expect).not.toMatch(/[—–]/);
    }
    for (const s of RAMP_STEPS) {
      expect(s.title + s.detail, `${s.key} uses a dash`).not.toMatch(/[—–]/);
    }
  });

  it('survives an artist with no calculator number', () => {
    const ramp = buildRamp({ targetMonthlyCents: null, startedAt: START });
    expect(ramp.targetMonthlyCents).toBeNull();
    expect(ramp.steps).toHaveLength(RAMP_STEPS.length);
    for (const p of ramp.phases) {
      expect(p.targetMonthlyCents).toBeNull();
      expect(p.targetPayers).toBeNull();
    }
  });

  it('dates every step and phase off the start date', () => {
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    const connect = ramp.steps.find((s) => s.key === 'connect_stripe')!;
    expect(connect.dueAt).toBe('2026-01-02T00:00:00.000Z'); // day 1
    expect(ramp.phases[0].startsAt).toBe(START.toISOString());
    expect(new Date(ramp.phases[ramp.phases.length - 1].endsAt).getTime()).toBe(
      START.getTime() + 365 * 86_400_000,
    );
  });

  it('pulls the entry calculator\'s step to the front, and never later', () => {
    // An artist who came in through the Vault calculator saw a number attached to the Vault.
    // Making them wait to day 7 behind generic setup is how that number stops feeling theirs.
    const vault = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START, entryTool: 'vault-revenue-planner' });
    const share = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START, entryTool: 'share-to-earn-planner' });

    // stock_vault is already day 7, earlier than the promotion slot: leave it alone.
    expect(vault.steps.find((s) => s.key === 'stock_vault')!.dueDay).toBe(7);
    expect(vault.steps.find((s) => s.key === 'stock_vault')!.entryPriority).toBeUndefined();

    // Referrals normally sit at day 95. For a share-to-earn artist they move to the front.
    const referrals = share.steps.find((s) => s.key === 'turn_on_referrals')!;
    expect(referrals.dueDay).toBe(18);
    expect(referrals.phase).toBe('founding_window');
    expect(referrals.entryPriority).toBe(true);
  });

  it('promotion never disturbs the foundation steps', () => {
    // Stripe and a ladder still have to exist before anyone can pay, whatever they came in for.
    const share = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START, entryTool: 'share-to-earn-planner' });
    const foundation = share.steps.filter((s) => s.phase === 'foundation');
    expect(foundation.map((s) => s.key)).toContain('connect_stripe');
    expect(share.steps[0].key).toBe('connect_stripe');
    expect(share.steps.length).toBe(RAMP_STEPS.length);
  });

  it('unknown or missing entry tool changes nothing', () => {
    const plain = buildRamp({ targetMonthlyCents: 1, startedAt: START });
    const bogus = buildRamp({ targetMonthlyCents: 1, startedAt: START, entryTool: 'not-a-tool' });
    expect(bogus.steps.map((s) => s.key)).toEqual(plain.steps.map((s) => s.key));
    expect(bogus.steps.every((s) => !s.entryPriority)).toBe(true);
  });

  it('shows ONE next action, not the whole year', () => {
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    const p = computeRampProgress(
      ramp,
      { steps: [{ key: 'connect_stripe', status: 'completed', dueAt: ramp.steps[0].dueAt }] },
      new Date('2026-01-04T00:00:00.000Z'),
    );
    expect(p.stepsDone).toBe(1);
    expect(p.nextStep?.key).toBe('build_ladder');
    expect(p.currentPhaseKey).toBe('foundation');
    // Foundation earns nothing by design, so its bar counts steps rather than money.
    expect(p.phaseProgressPct).toBeGreaterThan(0);
  });

  it('keeps the artist in the milestone they are actually in, not the one the date says', () => {
    // Someone three weeks behind is still in Founding window. Telling them they are in "Rhythm"
    // while they have not launched is how a plan stops being believed.
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    const doneKeys = ramp.steps.filter((s) => s.phase === 'foundation').map((s) => s.key);
    const p = computeRampProgress(
      ramp,
      { steps: doneKeys.map((k) => ({ key: k, status: 'completed' as const, dueAt: START.toISOString() })) },
      new Date('2026-03-15T00:00:00.000Z'), // day 73, calendar says Rhythm
    );
    expect(phaseAt(ramp, new Date('2026-03-15T00:00:00.000Z'))?.key).toBe('rhythm');
    expect(p.currentPhaseKey).toBe('founding_window');
    expect(p.behindDays).toBeGreaterThan(0);
  });

  it('re-plans the finish date from real pace, and never promises faster than the accelerated bound', () => {
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    const behind = computeRampProgress(ramp, { steps: [] }, new Date('2026-02-01T00:00:00.000Z'));
    expect(behind.behindDays).toBeGreaterThan(0);
    expect(behind.projectedTotalDays).toBeGreaterThan(ramp.totalDays);

    // Everything done, far ahead of schedule: pulled in, but floored.
    const ahead = computeRampProgress(
      ramp,
      { steps: ramp.steps.slice(0, -1).map((s) => ({ key: s.key, status: 'completed' as const, dueAt: s.dueAt })) },
      new Date('2026-01-20T00:00:00.000Z'),
    );
    expect(ahead.behindDays).toBe(0);
    expect(ahead.aheadDays).toBeGreaterThan(0);
    expect(ahead.projectedTotalDays).toBeGreaterThanOrEqual(ramp.acceleratedDays);
    expect(ahead.projectedTotalDays).toBeLessThan(ramp.totalDays);
  });

  it('counts the next win in supporters, which is the unit that motivates', () => {
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    // Past foundation, earning a little, working toward the founding-window milestone.
    const done = ramp.steps.filter((s) => s.phase === 'foundation').map((s) => s.key);
    const p = computeRampProgress(
      ramp,
      {
        steps: done.map((k) => ({ key: k, status: 'completed' as const, dueAt: START.toISOString() })),
        currentMrrCents: 100_000, // $1,000/mo
      },
      new Date('2026-01-16T00:00:00.000Z'),
    );
    const milestone = ramp.phases.find((x) => x.key === 'founding_window')!.targetMonthlyCents!;
    expect(p.nextMilestoneTargetCents).toBe(milestone);
    expect(p.centsToNextMilestone).toBe(milestone - 100_000);
    expect(p.supportersToNextMilestone).toBe(Math.ceil((milestone - 100_000) / netCentsPerPayer()));
    // The bar is money-based once there is money to measure.
    expect(p.phaseProgressPct).toBe(Math.round((100_000 / milestone) * 100));
  });

  it('falls back to counting steps when MRR is unknown', () => {
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    const p = computeRampProgress(ramp, { steps: [], currentMrrCents: null }, START);
    expect(p.currentMrrCents).toBeNull();
    expect(p.overallProgressPct).toBe(0);
    expect(p.supportersToNextMilestone).toBeNull();
  });

  it('knows which phase a date falls in, and returns null outside the year', () => {
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    expect(phaseAt(ramp, new Date('2026-01-05T00:00:00.000Z'))?.key).toBe('foundation');
    expect(phaseAt(ramp, new Date('2026-02-01T00:00:00.000Z'))?.key).toBe('founding_window'); // day 31
    expect(phaseAt(ramp, new Date('2026-02-20T00:00:00.000Z'))?.key).toBe('rhythm'); // day 50
    expect(phaseAt(ramp, new Date('2026-12-01T00:00:00.000Z'))?.key).toBe('retention');
    expect(phaseAt(ramp, new Date('2028-01-01T00:00:00.000Z'))).toBeNull();
  });
});
