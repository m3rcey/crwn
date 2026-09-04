import { describe, it, expect } from 'vitest';
import { PRIZE_RAIL, prizeTierIdOf } from './prizeState';

describe('PRIZE_RAIL: the product capability behind prizeFulfillable', () => {
  it('is NOT ready, and says exactly why', () => {
    // The delivery rail exists (executor, proven Stripe construction, webhook transitions,
    // prize-aware accounting). What does not exist is any surface that can invoke it: the
    // participant table cannot record a selected winner, so no endpoint can check one. This
    // pin exists so the flag can only flip in a change that also ships that surface, and the
    // reason travels with the flag rather than living in someone's memory.
    expect(PRIZE_RAIL.ready).toBe(false);
    expect(PRIZE_RAIL.blocker).toMatch(/selected winner/);
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
