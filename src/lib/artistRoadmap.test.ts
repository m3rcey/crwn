import { describe, it, expect } from 'vitest';
import {
  buildRoadmapDefs,
  assembleRoadmap,
  DEFAULT_GOAL_MONTHLY_CENTS,
  type RoadmapStepResult,
} from './artistRoadmap';

const done: RoadmapStepResult = { done: true, current: 1, target: 1 };

function resultsFor(keys: string[]): Record<string, RoadmapStepResult> {
  return Object.fromEntries(keys.map((k) => [k, done]));
}

describe('buildRoadmapDefs', () => {
  it('builds five stages in the launch order', () => {
    const defs = buildRoadmapDefs({});
    expect(defs.map((s) => s.key)).toEqual([
      'foundation',
      'private-launch',
      'audience-launch',
      'deliver-retain',
      'expand',
    ]);
  });

  it('personalizes the MRR milestone from the calculator goal', () => {
    const defs = buildRoadmapDefs({ goalMonthlyCents: 123400 });
    const mrr = defs[4].steps.find((s) => s.key === 'expand-mrr')!;
    expect(mrr.source).toEqual({ kind: 'check', check: 'artist_mrr_milestone', count: 123400 });
  });

  it('falls back to the default goal and profile link without a seed', () => {
    const defs = buildRoadmapDefs({ slug: null, goalMonthlyCents: null });
    const mrr = defs[4].steps.find((s) => s.key === 'expand-mrr')!;
    expect((mrr.source as { count?: number }).count).toBe(DEFAULT_GOAL_MONTHLY_CENTS);
    const invite = defs[1].steps.find((s) => s.key === 'private-first-10')!;
    expect(invite.href).toBe('/account/profile');
  });

  it('share steps deep-link to the public page when the slug exists', () => {
    const defs = buildRoadmapDefs({ slug: 'm3rcey' });
    const invite = defs[1].steps.find((s) => s.key === 'private-first-10')!;
    expect(invite.href).toBe('/m3rcey');
  });

  it('every step key is unique (draft state and results key on it)', () => {
    const keys = buildRoadmapDefs({}).flatMap((s) => s.steps.map((x) => x.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('fan import is FOUNDATION work, before the private launch (2026-08-06)', () => {
    // The private launch invites the warmest imported contacts, so the list
    // must exist before that stage. Do not move this step back down.
    const defs = buildRoadmapDefs({});
    const foundation = defs.find((s) => s.key === 'foundation')!;
    expect(foundation.steps.some((s) => s.key === 'audience-contacts')).toBe(true);
    const audience = defs.find((s) => s.key === 'audience-launch')!;
    expect(audience.steps.some((s) => s.key === 'audience-contacts')).toBe(false);
  });
});

describe('assembleRoadmap', () => {
  it('starts a brand-new artist at Foundation with the first step next', () => {
    const defs = buildRoadmapDefs({});
    const r = assembleRoadmap(defs, {});
    expect(r.currentStageKey).toBe('foundation');
    expect(r.nextStep?.key).toBe('foundation-profile');
    expect(r.progressPercent).toBe(0);
  });

  it('advances to the first stage with work left and picks its first open step', () => {
    const defs = buildRoadmapDefs({});
    const foundationKeys = defs[0].steps.map((s) => s.key);
    const r = assembleRoadmap(defs, resultsFor([...foundationKeys, 'private-checkout']));
    expect(r.currentStageKey).toBe('private-launch');
    expect(r.nextStep?.key).toBe('private-welcome-post');
    expect(r.stages[0].done).toBe(true);
  });

  it('a done stage later does not mask an earlier open stage', () => {
    const defs = buildRoadmapDefs({});
    const audienceKeys = defs[2].steps.map((s) => s.key);
    const r = assembleRoadmap(defs, resultsFor(audienceKeys));
    expect(r.currentStageKey).toBe('foundation');
  });

  it('everything done lands on Expand with no next step', () => {
    const defs = buildRoadmapDefs({});
    const all = defs.flatMap((s) => s.steps.map((x) => x.key));
    const r = assembleRoadmap(defs, resultsFor(all));
    expect(r.currentStageKey).toBe('expand');
    expect(r.nextStep).toBeNull();
    expect(r.progressPercent).toBe(100);
  });

  it('missing results fail safe to not-done with the def target', () => {
    const defs = buildRoadmapDefs({});
    const r = assembleRoadmap(defs, {});
    const invite = r.stages[1].steps.find((s) => s.key === 'private-first-10')!;
    expect(invite.done).toBe(false);
    expect(invite.target).toBe(10);
  });
});
