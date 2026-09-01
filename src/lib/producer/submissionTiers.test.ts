import { describe, it, expect } from 'vitest';
import { submissionTierAllows } from './access';

describe('submissionTierAllows — narrows, never widens', () => {
  it('null or absent keeps the original behaviour: whoever can watch may submit', () => {
    expect(submissionTierAllows(null, 'gold')).toBe(true);
    expect(submissionTierAllows(undefined, 'gold')).toBe(true);
    expect(submissionTierAllows(null, null)).toBe(true);
  });

  it('a list admits only the listed rungs', () => {
    expect(submissionTierAllows(['platinum'], 'platinum')).toBe(true);
    expect(submissionTierAllows(['platinum'], 'gold')).toBe(false);
    expect(submissionTierAllows(['gold', 'platinum'], 'gold')).toBe(true);
  });

  it('an EMPTY list admits nobody, never everybody', () => {
    // The failure that matters: reading [] as "no restriction" is how paid material leaks.
    expect(submissionTierAllows([], 'platinum')).toBe(false);
    expect(submissionTierAllows([], null)).toBe(false);
  });

  it('a fan with no membership is refused whenever a list is set', () => {
    expect(submissionTierAllows(['platinum'], null)).toBe(false);
  });

  it('malformed input falls back to watch access rather than locking the room out', () => {
    expect(submissionTierAllows('platinum', 'platinum')).toBe(true);
    expect(submissionTierAllows(42, 'platinum')).toBe(true);
  });

  it('ignores non-string entries instead of trusting them', () => {
    expect(submissionTierAllows([null, 123, 'platinum'], 'platinum')).toBe(true);
    expect(submissionTierAllows([null, 123], 'platinum')).toBe(false);
  });
});
