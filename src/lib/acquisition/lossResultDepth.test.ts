// The Zero To One beat-3 section on every loss-engine result: "your audience is not one group".
//
// These assert the BRANCHING (tool-supplied vs fallback) and the honesty rules, not the prose.
// A snapshot of the copy would fail on every wording tweak and prove nothing, which is not how
// this repo tests.

import { describe, it, expect } from 'vitest';
import { buildLossResult, defaultFanDepth, type LossResultParams } from './lossResult';

function params(over: Partial<LossResultParams> = {}): LossResultParams {
  return {
    generatorVersion: 'test@1',
    headline: 'About $7,500 a month is leaking.',
    cause: 'No system captures it.',
    estimate: [{ label: 'Monthly', value: '$7,500' }],
    assumptions: ['An assumption.'],
    consequences: ['A consequence.'],
    fanLoss: 'Fans miss the thing.',
    fix: { title: 'Fix it', steps: ['Step one.'] },
    flow: ['Loss', 'Setup', 'Recovered'],
    shareSummary: 'Summary.',
    ...over,
  };
}

const depthOf = (r: ReturnType<typeof buildLossResult>) =>
  r.sections.find((s) => s.key === 'fanDepth');

describe('fan-depth section (Zero To One beat 3)', () => {
  it('is present on every loss result, even when the tool supplies nothing', () => {
    const s = depthOf(buildLossResult(params()));
    expect(s).toBeDefined();
    expect(s!.kind).toBe('summary');
    expect(s!.text).toBe(defaultFanDepth());
  });

  it('uses the tool-specific line when one is supplied', () => {
    const mine = 'Some fans bring other fans, and they are worth more than a fan who only listens.';
    expect(depthOf(buildLossResult(params({ depth: mine })))!.text).toBe(mine);
  });

  it('renders between the number and the fix, so it interprets rather than pitches', () => {
    const r = buildLossResult(params());
    const keys = r.sections.map((s) => s.key);
    expect(keys.indexOf('fanDepth')).toBeGreaterThan(keys.indexOf('estimate'));
    expect(keys.indexOf('fanDepth')).toBeLessThan(keys.indexOf('fix'));
  });

  it('the fallback invents no precision: no digits, no percentages, no multiples', () => {
    // A tool that does not model a distribution must not imply one, and must never borrow the
    // membership ladder's 10x, which is only true where Silver and Platinum are the economics.
    expect(defaultFanDepth()).not.toMatch(/\d/);
    expect(defaultFanDepth()).not.toMatch(/%|\bx\b|times/i);
  });

  it('never dismisses reach', () => {
    expect(defaultFanDepth()).not.toMatch(/followers? (do not|don't) matter|vanity/i);
  });

  it('carries no em dash, per the project copy rule', () => {
    expect(defaultFanDepth()).not.toContain('—');
  });
});
