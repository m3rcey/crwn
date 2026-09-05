import { describe, it, expect } from 'vitest';
import { PRIZE_RAIL, prizeTierIdOf } from './prizeState';

describe('PRIZE_RAIL: the product capability behind prizeFulfillable', () => {
  it('is NOT ready, and names the exact thing that is missing', () => {
    // The whole application rail now exists: winner recording, both ownership-checked routes,
    // the executor, the proven Stripe construction, the webhook transition, prize-aware
    // accounting. The one remaining dependency is SCHEMA, which only the founder can apply.
    // This pin keeps the reason attached to the flag so it cannot be flipped on a hunch.
    expect(PRIZE_RAIL.ready).toBe(false);
    expect(PRIZE_RAIL.blocker).toMatch(/schema-phase3-campaign-winner-selection\.sql/);
  });

  it('the blocker names a migration the registry also lists as pending', async () => {
    // Two places record this fact; they must agree, or one of them is lying about production.
    const { EXPECTED_MIGRATION_STATE } = await import('@/lib/architecture/invariants');
    const row = EXPECTED_MIGRATION_STATE.find((m) => PRIZE_RAIL.blocker.includes(m.file));
    expect(row, 'the blocker must name a registered migration').toBeTruthy();
    expect(row!.state).toBe('pending');
  });
});

describe('prizeTierIdOf: a pointer, validated for shape only', () => {
  const UUID = '11111111-2222-4333-8444-555555555555';

  it('reads a well-formed uuid', () => {
    expect(prizeTierIdOf({ prize_tier_id: UUID })).toBe(UUID);
    expect(prizeTierIdOf({ prize_tier_id: '  ' + UUID + ' ' })).toBe(UUID);
  });

  it('returns null for anything that is not a uuid, so a tier NAME can never be a pointer', () => {
    for (const bad of ['Platinum', 'platinum', '', 42, null, undefined, { id: UUID }, UUID + 'x']) {
      expect(prizeTierIdOf({ prize_tier_id: bad })).toBeNull();
    }
    expect(prizeTierIdOf(null)).toBeNull();
    expect(prizeTierIdOf({})).toBeNull();
  });
});
