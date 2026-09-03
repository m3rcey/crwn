import { describe, it, expect } from 'vitest';
import { canContinue, resumeIndex, visibleSteps, type FollowupState } from './followupSteps';
import { buildFreeJoinStarter } from '@/lib/sequences/freeJoinStarter';

const starter = buildFreeJoinStarter({ magnetTitle: 'Midnight Tape', tierName: 'Gold', priceCents: 2500, firstBenefit: 'Hear music only members get', secondBenefit: null, pageUrl: 'https://thecrwn.app/gb' });

const state = (over: Partial<FollowupState> = {}): FollowupState => ({ steps: starter, primaryTierName: 'Gold', existing: false, ...over });

describe('the follow-up flow', () => {
  it('is the shape, one screen per message, then turn it on', () => {
    const steps = visibleSteps(state());
    expect(steps[0].key).toBe('shape');
    expect(steps.filter((s) => s.key === 'message').length).toBe(5);
    expect(steps[steps.length - 1].key).toBe('review');
    expect(steps[0].subtitle).toContain('stop the moment someone buys Gold');
  });

  it('never asks for the trigger, the goal or an id', () => {
    for (const s of visibleSteps(state())) {
      expect(`${s.title} ${s.subtitle}`).not.toMatch(/trigger|goal_tier|sequence id|free_join/i);
    }
  });

  it('a message needs a subject and a body', () => {
    const steps = visibleSteps(state());
    const m = steps[1];
    expect(canContinue(m, state())).toBe(true);
    const blank = state({ steps: starter.map((x, i) => (i === 0 ? { ...x, body: ' ' } : x)) });
    expect(canContinue(m, blank)).toBe(false);
    expect(canContinue(steps[steps.length - 1], blank)).toBe(false);
  });

  it('resumes at review for an existing whole sequence, at the first empty message otherwise', () => {
    const fresh = visibleSteps(state());
    expect(resumeIndex(fresh, state())).toBe(0);
    const existing = state({ existing: true });
    expect(resumeIndex(visibleSteps(existing), existing)).toBe(visibleSteps(existing).length - 1);
    const partial = state({ existing: true, steps: starter.map((x, i) => (i === 2 ? { ...x, subject: '' } : x)) });
    expect(visibleSteps(partial)[resumeIndex(visibleSteps(partial), partial)].messageIndex).toBe(2);
  });
});
