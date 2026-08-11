import { describe, it, expect } from 'vitest';
import { fanScore, toPublicLeaderboardEntry, type FanScoreInput } from './leaderboardPrivacy';

const fan: FanScoreInput = {
  fanId: 'fan-1',
  spentCents: 12_345,
  referralCount: 2,
  commentCount: 4,
  likeCount: 7,
  tier: 'Gold',
};

describe('the public fan leaderboard cannot reveal what a fan spent', () => {
  it('still ranks on the full score, spend included, server-side', () => {
    expect(fanScore(fan)).toBe(Math.round(12_345 / 100) + 2 * 50 + 4 * 5 + 7 * 2);
    expect(fanScore({ ...fan, spentCents: 0 })).toBeLessThan(fanScore(fan));
  });

  it('publishes no score, no spend and no money field of any kind', () => {
    const entry = toPublicLeaderboardEntry(fan, 1, 'Someone', null);
    expect(Object.keys(entry).sort()).toEqual(
      ['avatar', 'commentCount', 'fanId', 'likeCount', 'name', 'rank', 'referralCount', 'tier'].sort(),
    );
    expect(JSON.stringify(entry)).not.toContain('12345');
  });

  it('leaves spend algebraically unrecoverable from the payload', () => {
    // The old defect: given the score and the three counts, spend fell straight out. With no score
    // in the payload, two fans whose spend differs by hundreds of dollars are indistinguishable.
    const poor = toPublicLeaderboardEntry({ ...fan, spentCents: 100 }, 1, 'A', null);
    const rich = toPublicLeaderboardEntry({ ...fan, spentCents: 500_000 }, 1, 'A', null);
    expect(poor).toEqual(rich);
  });
});
