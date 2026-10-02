import { describe, expect, it } from 'vitest';
import { parseCount } from './fieldRegistry';
import { DECISION_TOOL } from './prompts/leadDecision';

// Every string here is a real DM reply from production (2026-09-26 to 09-30), or the exact
// variant of one. The words-only cases used to cost a Claude call or a re-ask.
describe('parseCount: counts written as words', () => {
  it.each([
    ['About a million', 1_000_000],
    ['Around a million', 1_000_000],
    ['2mill', 2_000_000],
    ['1.5 million', 1_500_000],
    ['half a million', 500_000],
    ['A few hundred', 300],
    ['a couple thousand', 2_000],
    ['a few hundred thousand', 300_000],
    ['Zero', 0],
    ['None', 0],
    ['none yet', 0],
  ])('%s -> %d', (raw, want) => {
    expect(parseCount(raw)).toBe(want);
  });

  it.each(['Hundreds', 'A lot', 'Quite a few', 'Too many!', 'Idk'])('%s stays unknown', (raw) => {
    expect(parseCount(raw)).toBeNull();
  });
});

describe('parseCount: digit answers keep their old values', () => {
  it.each([
    ['3,000', 3_000],
    ['11.6K', 11_600],
    ['2.6 M', 2_600_000],
    ['3 on spotify', 3],
    ['7 monthly listeners but my music ain’t on Spotify', 7],
    ['40000 thousand', 40_000],
    ['250 - 300', 250],
    ['It says 0 right now', 0],
  ])('%s -> %d', (raw, want) => {
    expect(parseCount(raw)).toBe(want);
  });
});

describe('decision tool schema', () => {
  const props = Object.keys(DECISION_TOOL.input_schema.properties);

  it('asks the model only for fields the code reads', () => {
    for (const unread of ['artistSegment', 'primaryBlocker', 'careerStage', 'nextQuestion', 'missingRequiredFields', 'recommendedLeadMagnet', 'recommendedCalculator', 'recommendedRiseModeStep']) {
      expect(props).not.toContain(unread);
    }
  });

  it('requires only properties it declares', () => {
    for (const r of DECISION_TOOL.input_schema.required) expect(props).toContain(r);
  });
});
