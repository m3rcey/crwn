import { describe, it, expect } from 'vitest';
import { participantKey, mergedResults } from './publicParticipant';

const SECRET = 'test-service-role-key';
const OPTIONS = [
  { id: 'a', label: '"I Like" - Guy' },
  { id: 'b', label: '"Outstanding" - The GAP Band' },
];

describe('participantKey', () => {
  it('is stable for the same address, so one person cannot vote twice', () => {
    const a = participantKey('mary@example.com', SECRET);
    const b = participantKey('  MARY@Example.com ', SECRET);
    expect(a).toBe(b);
  });

  it('differs per address', () => {
    expect(participantKey('mary@example.com', SECRET))
      .not.toBe(participantKey('mary2@example.com', SECRET));
  });

  it('stores no readable address: the key is an opaque digest', () => {
    const key = participantKey('mary@example.com', SECRET)!;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('mary');
    expect(key).not.toContain('example');
  });

  it('is keyed, so the digest cannot be reproduced without the server secret', () => {
    expect(participantKey('mary@example.com', SECRET))
      .not.toBe(participantKey('mary@example.com', 'a-different-secret'));
  });

  it('fails closed with no secret or no address', () => {
    expect(participantKey('mary@example.com', undefined)).toBeNull();
    expect(participantKey('', SECRET)).toBeNull();
    expect(participantKey('   ', SECRET)).toBeNull();
  });
});

describe('mergedResults', () => {
  it('counts account votes and public votes as one tally', () => {
    const r = mergedResults(OPTIONS, [{ option_id: 'a' }], [{ option_id: 'a' }, { option_id: 'b' }]);
    expect(r.total).toBe(3);
    expect(r.options.find((o) => o.id === 'a')!.votes).toBe(2);
    expect(r.options.find((o) => o.id === 'b')!.votes).toBe(1);
  });

  it('percentages always sum to exactly 100 (no 54/47 on a phone)', () => {
    for (const [a, b] of [[1, 2], [2, 1], [7, 6], [1, 0], [0, 1], [5, 5], [33, 67], [1, 1]]) {
      const r = mergedResults(
        OPTIONS,
        Array.from({ length: a }, () => ({ option_id: 'a' })),
        Array.from({ length: b }, () => ({ option_id: 'b' })),
      );
      expect(r.options.reduce((s, o) => s + o.percent, 0), `${a} vs ${b}`).toBe(100);
    }
  });

  it('sums to 100 across three and four way ballots too', () => {
    const four = [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' },
      { id: 'c', label: 'C' }, { id: 'd', label: 'D' },
    ];
    const votes = [
      ...Array.from({ length: 1 }, () => ({ option_id: 'a' })),
      ...Array.from({ length: 1 }, () => ({ option_id: 'b' })),
      ...Array.from({ length: 1 }, () => ({ option_id: 'c' })),
    ];
    const r = mergedResults(four, votes, []);
    expect(r.options.reduce((s, o) => s + o.percent, 0)).toBe(100);
    expect(r.options.find((o) => o.id === 'd')!.percent).toBe(0);
  });

  it('an empty ballot is all zeroes, never a divide by zero', () => {
    const r = mergedResults(OPTIONS, [], []);
    expect(r.total).toBe(0);
    expect(r.options.every((o) => o.votes === 0 && o.percent === 0)).toBe(true);
  });

  it('ignores votes for options that are no longer on the ballot', () => {
    const r = mergedResults(OPTIONS, [{ option_id: 'zz' }], [{ option_id: 'a' }]);
    expect(r.total).toBe(1);
    expect(r.options.find((o) => o.id === 'a')!.percent).toBe(100);
  });

  it('keeps ballot order, so the screen matches the buttons the fan just tapped', () => {
    const r = mergedResults(OPTIONS, [{ option_id: 'b' }], []);
    expect(r.options.map((o) => o.id)).toEqual(['a', 'b']);
  });
});
