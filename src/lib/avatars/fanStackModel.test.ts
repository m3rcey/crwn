import { describe, it, expect } from 'vitest';
import {
  computeFanStack,
  fanStackScenarios,
  getFanStackAssumptions,
  FAN_STACK_MODEL_VERSION,
} from './fanStackModel';
import { RECOMMENDED_LADDER } from '../tierTemplate';

const BASE = {
  platformsUsed: ['Patreon', 'Discord', 'Shopify'],
  monthlySoftwareCostCents: 6000,
  paidMembersElsewhere: 100,
  avgRevenuePerFanCents: 800,
  otherDirectMonthlyCents: 20000,
  audience: 250000,
};

describe('fan stack model', () => {
  it('is versioned', () => {
    expect(FAN_STACK_MODEL_VERSION).toBe('fanStack@1');
    expect(computeFanStack(BASE).modelVersion).toBe('fanStack@1');
  });

  it('ladder ARPU derives from the canonical ladder, never a duplicated price map', () => {
    const a = getFanStackAssumptions();
    const [, silver, gold, platinum] = RECOMMENDED_LADDER;
    expect(a.ladderArpuCents).toBe(
      Math.round(0.7 * silver.priceCents + 0.22 * gold.priceCents + 0.08 * platinum.priceCents),
    );
    expect(a.entryTierCents).toBe(silver.priceCents);
  });

  it('all zeros produce an honest zero, not an invented floor', () => {
    const r = computeFanStack({});
    expect(r.addedMonthlyCents).toBe(0);
    expect(r.migratedMembers).toBe(0);
    expect(r.newPayers).toBe(0);
    expect(r.toolCostCents).toBe(0);
  });

  it('migration is partial: never all existing members', () => {
    const r = computeFanStack(BASE);
    expect(r.migratedMembers).toBeLessThan(BASE.paidMembersElsewhere);
    expect(r.migratedMembers).toBe(Math.round(BASE.paidMembersElsewhere * getFanStackAssumptions().migrationRate));
  });

  it('claims no uplift for an artist already earning above ladder ARPU', () => {
    const r = computeFanStack({ ...BASE, avgRevenuePerFanCents: 5000 });
    expect(r.perFanUpliftCents).toBe(0);
  });

  it('net-new payers subtract members already paying elsewhere (no double count)', () => {
    const withMembers = computeFanStack(BASE);
    const withoutMembers = computeFanStack({ ...BASE, paidMembersElsewhere: 0 });
    expect(withMembers.newPayers).toBe(Math.max(0, withoutMembers.newPayers - BASE.paidMembersElsewhere));
  });

  it('tool cost is separate: never inside the added-revenue headline', () => {
    const withCost = computeFanStack(BASE);
    const withoutCost = computeFanStack({ ...BASE, monthlySoftwareCostCents: 0 });
    expect(withCost.addedMonthlyCents).toBe(withoutCost.addedMonthlyCents);
    expect(withCost.toolCostCents).toBe(6000);
  });

  it('existing revenue is context, never claimed as new', () => {
    const more = computeFanStack({ ...BASE, otherDirectMonthlyCents: 500000 });
    const less = computeFanStack({ ...BASE, otherDirectMonthlyCents: 0 });
    expect(more.addedMonthlyCents).toBe(less.addedMonthlyCents);
    expect(more.currentMonthlyCents).toBeGreaterThan(less.currentMonthlyCents);
  });

  it('annual is exactly 12x monthly', () => {
    const r = computeFanStack(BASE);
    expect(r.addedAnnualCents).toBe(r.addedMonthlyCents * 12);
  });

  it('scenario band is monotone: conservative <= expected <= high', () => {
    const s = fanStackScenarios(BASE);
    expect(s.conservative.addedMonthlyCents).toBeLessThanOrEqual(s.expected.addedMonthlyCents);
    expect(s.expected.addedMonthlyCents).toBeLessThanOrEqual(s.high.addedMonthlyCents);
  });

  it('handles very large inputs without NaN or negatives', () => {
    const r = computeFanStack({ ...BASE, audience: 100_000_000, paidMembersElsewhere: 1_000_000 });
    expect(Number.isFinite(r.addedMonthlyCents)).toBe(true);
    expect(r.addedMonthlyCents).toBeGreaterThanOrEqual(0);
    expect(r.newPayers).toBeGreaterThanOrEqual(0);
  });
});
