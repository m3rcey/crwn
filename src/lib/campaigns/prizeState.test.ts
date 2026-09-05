import { describe, it, expect } from 'vitest';
import { PRIZE_RAIL, prizeTierIdOf } from './prizeState';

describe('PRIZE_RAIL: the product capability behind prizeFulfillable', () => {
  it('is READY: every part of the delivery rail now exists', () => {
    // Winner state + recording + both ownership-checked routes + executor + proven Stripe
    // construction + webhook transition + prize-aware accounting.
    expect(PRIZE_RAIL.ready).toBe(true);
  });

  it('readiness agrees with the migration registry in BOTH directions', async () => {
    // This is what makes `ready` deterministic rather than a boolean somebody set. It cannot
    // read true while the registry calls the schema pending, and it cannot be left false once
    // the schema is applied: either drift fails here.
    const { EXPECTED_MIGRATION_STATE } = await import('@/lib/architecture/invariants');
    const row = EXPECTED_MIGRATION_STATE.find((m) => m.file === PRIZE_RAIL.migration);
    expect(row, 'PRIZE_RAIL.migration must name a registered migration').toBeTruthy();
    expect(row!.state).toBe(PRIZE_RAIL.ready ? 'applied' : 'pending');
  });

  it('READY does not mean any campaign may show a prize', async () => {
    // The capability and the permission are different questions. A fully-capable rail still
    // renders nothing for a campaign missing its Official Rules, eligibility, free-entry line
    // or dates, which is exactly Founding A&R Week's state.
    const { campaignReadiness } = await import('./giveaway');
    const r = campaignReadiness(
      {
        id: 'c', artist_id: 'a', archetype: 'founding_ar_week', title: 'Founding A&R Week',
        status: 'draft', starts_at: null, ends_at: '2099-01-01T00:00:00Z',
        toolkit: { promise: 'Help shape what comes next.', what_to_do: 'Join free.', prize: '1 year of Platinum', prize_tier_id: '11111111-2222-4333-8444-555555555555' },
      },
      { prizeFulfillable: PRIZE_RAIL.ready },
    );
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' ')).toMatch(/Official Rules/);
    // ...and the reason is never "CRWN cannot deliver this" any more.
    expect(r.blockers.join(' ')).not.toMatch(/no way to deliver/);
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
