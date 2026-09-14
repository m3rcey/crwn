import { describe, it, expect } from 'vitest';
import {
  scoreboardToken,
  verifyScoreboardToken,
  scoreboardPath,
} from './scoreboardToken';

const SECRET = 'test-service-role-key';
const JULIUS = '9b532570-cfdd-4d9a-b6a3-17c427b5bd13';
const GB = '11111111-2222-3333-4444-555555555555';

describe('scoreboardToken', () => {
  it('is stable for one artist, so the link on his home screen keeps working', () => {
    expect(scoreboardToken(JULIUS, SECRET)).toBe(scoreboardToken(JULIUS, SECRET));
  });

  it('is short enough to text and long enough to be unguessable (128 bits)', () => {
    expect(scoreboardToken(JULIUS, SECRET)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('differs per artist, so one artist link never opens another artist board', () => {
    expect(scoreboardToken(JULIUS, SECRET)).not.toBe(scoreboardToken(GB, SECRET));
  });

  it('cannot be reproduced without the server secret', () => {
    expect(scoreboardToken(JULIUS, SECRET)).not.toBe(scoreboardToken(JULIUS, 'another-secret'));
  });

  it('fails closed with no secret or no artist', () => {
    expect(scoreboardToken(JULIUS, undefined)).toBeNull();
    expect(scoreboardToken('', SECRET)).toBeNull();
  });
});

describe('verifyScoreboardToken', () => {
  const good = scoreboardToken(JULIUS, SECRET)!;

  it('opens the right artist board', () => {
    expect(verifyScoreboardToken(JULIUS, good, SECRET)).toBe(true);
  });

  it("refuses another artist's token (no cross-artist access)", () => {
    const gbToken = scoreboardToken(GB, SECRET)!;
    expect(verifyScoreboardToken(JULIUS, gbToken, SECRET)).toBe(false);
  });

  it('refuses a token that is one character off', () => {
    const last = good.slice(-1) === 'a' ? 'b' : 'a';
    expect(verifyScoreboardToken(JULIUS, good.slice(0, -1) + last, SECRET)).toBe(false);
  });

  it('refuses malformed input without throwing', () => {
    for (const bad of ['', 'nope', good.toUpperCase(), good + '0', good.slice(0, 31), null, undefined, '../../etc']) {
      expect(verifyScoreboardToken(JULIUS, bad as string, SECRET)).toBe(false);
    }
  });

  it('refuses everything when the server has no secret', () => {
    expect(verifyScoreboardToken(JULIUS, good, undefined)).toBe(false);
  });
});

describe('scoreboardPath', () => {
  it('builds the artist-scoped link', () => {
    expect(scoreboardPath('julius-williams', 'abc')).toBe('/julius-williams/results/abc');
  });
});
