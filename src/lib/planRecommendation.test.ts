import { describe, it, expect } from 'vitest';
import {
  recommendPlan,
  proBreakEvenGmvCents,
  scaleBreakEvenGmvCents,
  monthlyPlanCostCents,
} from './planRecommendation';

describe('break-even math', () => {
  it('Pro break-even is $1,225/mo GMV ($49 / 4 points of fee)', () => {
    expect(proBreakEvenGmvCents()).toBe(122500);
  });

  it('Scale break-even is $5,000/mo GMV ($150 delta / 3 points of fee)', () => {
    expect(scaleBreakEvenGmvCents()).toBe(500000);
  });

  it('plan costs cross exactly at the break-even points', () => {
    const proBE = proBreakEvenGmvCents();
    expect(monthlyPlanCostCents('starter', proBE)).toBe(monthlyPlanCostCents('pro', proBE));
    const scaleBE = scaleBreakEvenGmvCents();
    expect(monthlyPlanCostCents('pro', scaleBE)).toBe(monthlyPlanCostCents('scale', scaleBE));
  });
});

describe('recommendPlan', () => {
  it('recommends Launch for a small test of one offer', () => {
    const r = recommendPlan({ projectedMonthlyGmvCents: 50000, catalogTracks: 20, contacts: 100 });
    expect(r.plan).toBe('starter');
  });

  it('recommends Launch with no inputs at all', () => {
    expect(recommendPlan({}).plan).toBe('starter');
  });

  it('recommends Pro above the Pro break-even', () => {
    const r = recommendPlan({ projectedMonthlyGmvCents: 340000 });
    expect(r.plan).toBe('pro');
    expect(r.reason).toBe('gmv_above_pro_break_even');
  });

  it('recommends Pro when the catalog exceeds Launch limits', () => {
    const r = recommendPlan({ projectedMonthlyGmvCents: 0, catalogTracks: 82 });
    expect(r.plan).toBe('pro');
    expect(r.reason).toBe('catalog_over_launch_limit');
  });

  it('recommends Pro for a big list, on send cadence rather than a member cap', () => {
    const r = recommendPlan({ contacts: 1200 });
    expect(r.plan).toBe('pro');
    // CRWN caps members on NO plan, so the reason must be the email cadence
    // limit (the one limit that is really enforced), never a member cap.
    expect(r.reason).toBe('contacts_need_more_sends');
    expect(r.reasons.join(' ')).not.toMatch(/member/i);
  });

  it('leaves a small contact list on Launch', () => {
    expect(recommendPlan({ contacts: 40 }).plan).toBe('starter');
  });

  it('recommends Pro on feature intent alone', () => {
    expect(recommendPlan({ wantsLiveExperiences: true }).plan).toBe('pro');
    expect(recommendPlan({ wantsAutomatedSequences: true }).plan).toBe('pro');
    expect(recommendPlan({ wantsShareToEarn: true }).plan).toBe('pro');
  });

  it('recommends Scale above the Scale break-even', () => {
    const r = recommendPlan({ projectedMonthlyGmvCents: 820000 });
    expect(r.plan).toBe('scale');
    expect(r.reason).toBe('gmv_above_scale_break_even');
  });

  it('recommends Scale for assisted migration regardless of GMV', () => {
    const r = recommendPlan({ projectedMonthlyGmvCents: 0, wantsAssistedMigration: true });
    expect(r.plan).toBe('scale');
  });

  it('recommends Scale when migrating an established platform', () => {
    expect(recommendPlan({ migratingFromEstablishedPlatform: true }).plan).toBe('scale');
  });

  it('recommends Scale for team operations', () => {
    expect(recommendPlan({ teamSize: 3 }).plan).toBe('scale');
    expect(recommendPlan({ needsAdvancedPermissions: true }).plan).toBe('scale');
  });

  it('is deterministic: same input, same output', () => {
    const input = { projectedMonthlyGmvCents: 340000, catalogTracks: 82, wantsDMs: true };
    expect(recommendPlan(input)).toEqual(recommendPlan(input));
  });

  it('savings claims carry the math (dollar amount in the reason text)', () => {
    const r = recommendPlan({ projectedMonthlyGmvCents: 340000 });
    expect(r.reasons[0]).toMatch(/\$\d/);
  });

  it('never emits an em dash in artist-facing reasons', () => {
    const r = recommendPlan({
      projectedMonthlyGmvCents: 820000,
      catalogTracks: 82,
      contacts: 1200,
      wantsAssistedMigration: true,
      wantsLiveExperiences: true,
    });
    for (const reason of r.reasons) {
      expect(reason).not.toMatch(/—|–/);
    }
  });
});
