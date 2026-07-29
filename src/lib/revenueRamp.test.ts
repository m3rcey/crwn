import { describe, it, expect } from 'vitest';
import {
  RAMP_PHASES,
  RAMP_STEPS,
  buildRamp,
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

  it('knows which phase a date falls in, and returns null outside the year', () => {
    const ramp = buildRamp({ targetMonthlyCents: 2_432_200, startedAt: START });
    expect(phaseAt(ramp, new Date('2026-01-05T00:00:00.000Z'))?.key).toBe('foundation');
    expect(phaseAt(ramp, new Date('2026-02-01T00:00:00.000Z'))?.key).toBe('founding_window'); // day 31
    expect(phaseAt(ramp, new Date('2026-02-20T00:00:00.000Z'))?.key).toBe('rhythm'); // day 50
    expect(phaseAt(ramp, new Date('2026-12-01T00:00:00.000Z'))?.key).toBe('retention');
    expect(phaseAt(ramp, new Date('2028-01-01T00:00:00.000Z'))).toBeNull();
  });
});
