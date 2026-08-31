import { describe, it, expect } from 'vitest';
import { applyPlanOverrides, getEffectiveLimits, getTierLimits } from './platformTier';

const launch = getTierLimits('starter');
const pro = getTierLimits('pro');

describe('applyPlanOverrides — comped capabilities are ADDITIVE ONLY', () => {
  it('grants a capability the plan does not include', () => {
    expect(launch.allowsLive).toBe(false);
    const comped = applyPlanOverrides(launch, { allowsLive: true, allowsDMs: true });
    expect(comped.allowsLive).toBe(true);
    expect(comped.allowsDMs).toBe(true);
  });

  it('NEVER revokes: false is ignored, so a paid plan cannot be silently downgraded', () => {
    expect(pro.allowsLive).toBe(true);
    expect(applyPlanOverrides(pro, { allowsLive: false }).allowsLive).toBe(true);
    expect(applyPlanOverrides(pro, { allowsDMs: false }).allowsDMs).toBe(true);
  });

  it('ignores anything that is not exactly true, so a truthy string cannot grant', () => {
    for (const v of ['true', 1, {}, [], null, undefined]) {
      expect(applyPlanOverrides(launch, { allowsLive: v }).allowsLive).toBe(false);
    }
  });

  it('never touches numeric limits: a comped fee percent would change real money', () => {
    const tampered = applyPlanOverrides(launch, {
      platformFeePercent: 0, maxTracks: 99999, maxFanTiers: 99, maxMembers: 5,
    } as Record<string, unknown>);
    expect(tampered.platformFeePercent).toBe(launch.platformFeePercent);
    expect(tampered.maxTracks).toBe(launch.maxTracks);
    expect(tampered.maxFanTiers).toBe(launch.maxFanTiers);
    expect(tampered.maxMembers).toBe(launch.maxMembers);
  });

  it('does not mutate the shared plan object (a leak would comp every artist)', () => {
    applyPlanOverrides(launch, { allowsLive: true });
    expect(getTierLimits('starter').allowsLive).toBe(false);
  });

  it('garbage and absence both fall back to the plan exactly', () => {
    for (const v of [null, undefined, 'nope', 42, []]) {
      expect(applyPlanOverrides(launch, v)).toEqual(launch);
    }
    expect(getEffectiveLimits('starter')).toEqual(launch);
    expect(getEffectiveLimits('starter', {})).toEqual(launch);
  });

  it('getEffectiveLimits composes plan + comp', () => {
    expect(getEffectiveLimits('starter', { allowsLive: true }).allowsLive).toBe(true);
    expect(getEffectiveLimits('starter', { allowsLive: true }).platformFeePercent)
      .toBe(launch.platformFeePercent);
  });
});
