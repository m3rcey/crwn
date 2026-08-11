// unifiedFanDepth: the artist's OWN concentration, derived from the ladder split the unified
// model already produced. It adds no rate, no assumption, and nothing summed across
// opportunities. These tests pin the refusals, which are the safety property.

import { describe, it, expect } from 'vitest';
import { unifiedFanDepth } from './unifiedAdapter';

const tier = (name: string, supporters: number, monthlyCents: number) => ({
  name,
  supporters,
  monthlyCents,
});

// The canonical shape: 70/22/8 of 2,250 payers at $10 / $25 / $100.
const ladder = () => [
  tier('Silver', 1575, 1_575_000),
  tier('Gold', 495, 1_237_500),
  tier('Platinum', 180, 1_800_000),
];

describe('unifiedFanDepth', () => {
  it('names the top rung by REVENUE, not by price or by headcount', () => {
    const t = unifiedFanDepth(ladder())!;
    expect(t).toContain('Platinum');
    expect(t).not.toContain('Silver is about');
  });

  it('states both shares, and the money share exceeds the people share', () => {
    const t = unifiedFanDepth(ladder())!;
    // 180/2250 = 8%; 1,800,000/4,612,500 = 39%.
    expect(t).toContain('8%');
    expect(t).toContain('39%');
  });

  it('returns null when there is no concentration to claim', () => {
    // One rung carries everything: nothing interesting to say, so say nothing.
    expect(unifiedFanDepth([tier('Silver', 100, 100_000)])).toBeNull();
  });

  it('returns null when the top rung does not out-earn its headcount share', () => {
    // Perfectly proportional: money share equals people share, so the claim would be empty.
    expect(
      unifiedFanDepth([tier('A', 100, 100_000), tier('B', 100, 100_000)]),
    ).toBeNull();
  });

  it('ignores rungs with no supporters or no revenue rather than dividing by zero', () => {
    const t = unifiedFanDepth([
      tier('Silver', 1575, 1_575_000),
      tier('Empty', 0, 0),
      tier('Platinum', 180, 1_800_000),
    ]);
    expect(t).toBeTruthy();
    expect(t).not.toContain('Empty');
  });

  it('survives an empty or malformed ladder', () => {
    expect(unifiedFanDepth([])).toBeNull();
    expect(unifiedFanDepth(undefined as never)).toBeNull();
  });

  it('never implies opportunities can be added together', () => {
    const t = unifiedFanDepth(ladder())!;
    expect(t).not.toMatch(/add(ed)? up|combined total|sum of/i);
  });

  it('carries no em dash, per the project copy rule', () => {
    expect(unifiedFanDepth(ladder())!).not.toContain('—');
  });
});
