import { describe, it, expect } from 'vitest';
import { buildFreeJoinStarter, FREE_JOIN_STARTER_NAME } from './freeJoinStarter';

const facts = {
  magnetTitle: 'Unreleased: Midnight Tape',
  tierName: 'Gold',
  priceCents: 2500,
  firstBenefit: 'Hear music only members get',
  secondBenefit: 'Help make creative decisions',
  pageUrl: 'https://thecrwn.app/gb',
};

// The tokens the sequence cron resolves. Anything else would reach a fan as raw braces.
const KNOWN_TOKENS = new Set(['first_name', 'artist_name']);

describe('the starter follow-up', () => {
  const steps = buildFreeJoinStarter(facts);

  it('is five messages over two weeks in the ratified shape', () => {
    expect(steps.map((s) => s.delay_days)).toEqual([0, 2, 5, 9, 14]);
    expect(steps[0].body).toContain('Unreleased: Midnight Tape');
    expect(steps[1].body).toContain('Gold');
    expect(steps[1].body).toContain('$25 a month');
    expect(steps[2].body).toContain('Hear music only members get');
    expect(steps[3].subject).toContain('question');
    expect(steps[4].body).toContain('https://thecrwn.app/gb');
  });

  it('uses only tokens the cron resolves', () => {
    for (const s of steps) {
      for (const m of `${s.subject}\n${s.body}`.matchAll(/\{\{([a-z_]+)\}\}/g)) {
        expect(KNOWN_TOKENS.has(m[1]), m[1]).toBe(true);
      }
    }
  });

  it('promises no cadence, no result, no proof, and uses no em dash', () => {
    for (const s of steps) {
      const text = `${s.subject}\n${s.body}`;
      expect(text).not.toContain('—');
      expect(text).not.toMatch(/every (week|month)|weekly|monthly|guarantee|thousands of|fans love it/i);
    }
  });

  it('degrades honestly when a fact is missing', () => {
    const s = buildFreeJoinStarter({ ...facts, magnetTitle: '', firstBenefit: null, secondBenefit: null, priceCents: 999 });
    expect(s[0].subject).toContain('the drop');
    expect(s[1].body).toContain('music only members get');
    expect(s[1].body).toContain('$9.99');
    expect(FREE_JOIN_STARTER_NAME.length).toBeGreaterThan(0);
  });
});
