import { describe, it, expect } from 'vitest';
import {
  buildRoadmapDefs,
  assembleRoadmap,
  DEFAULT_GOAL_MONTHLY_CENTS,
  ROADMAP_STAGE_KEYS,
  type RoadmapStepResult,
} from './artistRoadmap';
import { GUIDED_FLOWS } from './guidedSetup/flows';

const done: RoadmapStepResult = { done: true, current: 1, target: 1 };

function resultsFor(keys: string[]): Record<string, RoadmapStepResult> {
  return Object.fromEntries(keys.map((k) => [k, done]));
}

const allSteps = () => buildRoadmapDefs({}).flatMap((s) => s.steps);
const stage = (key: string) => buildRoadmapDefs({}).find((s) => s.key === key)!;

describe('buildRoadmapDefs', () => {
  it('builds five stages in the launch order, with First revenue between Foundation and the audience', () => {
    const defs = buildRoadmapDefs({});
    expect(defs.map((s) => s.key)).toEqual([...ROADMAP_STAGE_KEYS]);
    expect(defs.map((s) => s.key)).toEqual([
      'foundation',
      'first-revenue',
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

  it('falls back to the default goal without a seed', () => {
    const defs = buildRoadmapDefs({ slug: null, goalMonthlyCents: null });
    const mrr = defs[4].steps.find((s) => s.key === 'expand-mrr')!;
    expect((mrr.source as { count?: number }).count).toBe(DEFAULT_GOAL_MONTHLY_CENTS);
  });

  it('every step key is unique (draft state and results key on it)', () => {
    const keys = allSteps().map((x) => x.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('fan import is FOUNDATION work, before the launch stages (2026-08-06)', () => {
    // The launch invites the warmest imported contacts, so the list must exist before that
    // stage. Do not move this step back down.
    expect(stage('foundation').steps.some((s) => s.key === 'audience-contacts')).toBe(true);
    expect(stage('audience-launch').steps.some((s) => s.key === 'audience-contacts')).toBe(false);
  });
});

describe('launch readiness is funnel-centric (founder decision D1, 2026-09-03)', () => {
  it('the First revenue stage is the revenue machine in the order a stranger meets it', () => {
    expect(stage('first-revenue').steps.map((s) => s.key)).toEqual([
      'revenue-offer',
      'revenue-magnet',
      'revenue-experience',
      'revenue-followup',
      'revenue-stripe',
      'revenue-live',
      'revenue-tested',
      'revenue-launched',
      'revenue-first-paid',
    ]);
  });

  it('every configuration step reads canonical funnel state, never wizard state', () => {
    const sources = Object.fromEntries(stage('first-revenue').steps.map((s) => [s.key, s.source]));
    expect(sources['revenue-offer']).toEqual({ kind: 'check', check: 'artist_tier_has_benefits' });
    expect(sources['revenue-magnet']).toEqual({ kind: 'check', check: 'artist_has_lead_magnet' });
    expect(sources['revenue-experience']).toEqual({ kind: 'check', check: 'artist_offer_experience_live' });
    expect(sources['revenue-followup']).toEqual({ kind: 'check', check: 'artist_funnel_nurture_active' });
    expect(sources['revenue-stripe']).toEqual({ kind: 'check', check: 'artist_stripe_connected' });
    expect(sources['revenue-live']).toEqual({ kind: 'check', check: 'artist_funnel_live' });
    expect(sources['revenue-tested']).toEqual({ kind: 'fact', fact: 'funnel_tested' });
    expect(sources['revenue-launched']).toEqual({ kind: 'fact', fact: 'funnel_launched' });
    // The canonical first_paid_conversion event, not a manual confirmation.
    expect(sources['revenue-first-paid']).toEqual({ kind: 'fact', fact: 'first_paid' });
  });

  it('every guided step opens its guided flow, so Rise Mode never lands on a blank screen', () => {
    const href = Object.fromEntries(stage('first-revenue').steps.map((s) => [s.key, s.href]));
    expect(href['revenue-offer']).toBe(GUIDED_FLOWS.offer.href);
    expect(href['revenue-magnet']).toBe(GUIDED_FLOWS.magnet.href);
    expect(href['revenue-experience']).toBe(GUIDED_FLOWS.experience.href);
    expect(href['revenue-followup']).toBe(GUIDED_FLOWS.followup.href);
    expect(href['revenue-live']).toBe(GUIDED_FLOWS.funnel.href);
    expect(href['revenue-tested']).toBe(GUIDED_FLOWS.test.href);
    expect(href['revenue-launched']).toBe(GUIDED_FLOWS.launch.href);
    // Stripe is a DIRECT action: the one Connect control lives on the tiers screen.
    expect(href['revenue-stripe']).toBe('/account/tiers');
  });

  it('a published page is a prerequisite, not the definition of launch', () => {
    // The page-centric steps left the launch stage: "first page visit" is an outcome of traffic
    // (removed), the welcome post moved to deliver-and-retain, the first ten to the audience launch.
    const keys = allSteps().map((s) => s.key);
    expect(keys).not.toContain('private-first-visit');
    expect(keys.some((k) => k.startsWith('private-'))).toBe(false);
    expect(allSteps().some((s) => s.source.kind === 'check' && s.source.check === 'artist_first_visit')).toBe(false);
    expect(stage('deliver-retain').steps.some((s) => s.key === 'deliver-welcome-post')).toBe(true);
    expect(stage('audience-launch').steps.some((s) => s.key === 'audience-first-10')).toBe(true);
    expect(stage('first-revenue').steps.some((s) => s.source.kind === 'check' && s.source.check === 'artist_has_community_post')).toBe(false);
  });

  it('Stripe moved out of Foundation into the revenue chain, once', () => {
    const stripeSteps = allSteps().filter((s) => s.source.kind === 'check' && s.source.check === 'artist_stripe_connected');
    expect(stripeSteps.map((s) => s.key)).toEqual(['revenue-stripe']);
    expect(stage('foundation').steps.some((s) => s.key === 'foundation-stripe')).toBe(false);
  });

  it('no Foundation step depends on a scheduled promise, because cadence is optional (2026-09-03)', () => {
    // "Get your promises on the calendar" used to sit in Foundation and could never complete for
    // an artist who chose no fixed schedule, which parked them before the revenue stage forever.
    expect(stage('foundation').steps.some((s) => s.source.kind === 'fact' && s.source.fact === 'promises_scheduled')).toBe(false);
  });

  it('the later stages are preserved', () => {
    expect(stage('audience-launch').steps.map((s) => s.key)).toEqual(['audience-announce', 'audience-first-10', 'audience-share-to-earn']);
    expect(stage('expand').steps.map((s) => s.key)).toEqual(['expand-ladder', 'expand-product', 'expand-campaign', 'expand-mrr']);
    expect(stage('deliver-retain').steps.map((s) => s.key)).toEqual([
      'deliver-first-promise',
      'deliver-welcome-post',
      'deliver-on-track',
      'deliver-members-post',
      'deliver-retention',
    ]);
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
    const r = assembleRoadmap(defs, resultsFor([...foundationKeys, 'revenue-offer']));
    expect(r.currentStageKey).toBe('first-revenue');
    expect(r.nextStep?.key).toBe('revenue-magnet');
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
    const invite = r.stages[2].steps.find((s) => s.key === 'audience-first-10')!;
    expect(invite.done).toBe(false);
    expect(invite.target).toBe(10);
  });

  it('is derived on read: a step that was done and is no longer done reopens (quest XP is separate)', () => {
    // Quest completion is permanent (founder decision D3). The roadmap is the surface that tells
    // the artist "this needs attention again", because it holds nothing and re-reads every time.
    const defs = buildRoadmapDefs({});
    const before = assembleRoadmap(defs, resultsFor(['foundation-profile', 'foundation-front-door']));
    expect(before.nextStep?.key).toBe('foundation-paid-offer');
    const after = assembleRoadmap(defs, resultsFor(['foundation-profile']));
    expect(after.nextStep?.key).toBe('foundation-front-door');
  });
});
