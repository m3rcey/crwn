import { describe, it, expect } from 'vitest';
import { readCohortConstraint, AVATAR_FUNNEL_SPINE, COHORT_MIN_SAMPLE } from './cohortConstraint';

const stage = (stage: string, label: string, count: number | null) => ({ stage, label, count });

describe('readCohortConstraint', () => {
  it('finds the largest proportional drop between adjacent measured stages', () => {
    const c = readCohortConstraint([
      stage('page_viewed', 'Entry page viewed', 1000),
      stage('calculator_started', 'Calculator started', 600),
      stage('calculator_completed', 'Calculator completed', 500),
      stage('email_submitted', 'Email captured', 50),
    ]);
    expect(c?.constraintId).toBe('drop:calculator_completed->email_submitted');
    expect(c?.stage).toBe('email_submitted');
    expect(c?.severity).toBe('high');
    expect(c?.confidence).toBe('high');
    expect(c?.evidence.length).toBe(3);
  });

  it('returns null below the minimum sample: no diagnosis, not a low-confidence one', () => {
    const c = readCohortConstraint([
      stage('page_viewed', 'Entry page viewed', COHORT_MIN_SAMPLE - 1),
      stage('calculator_started', 'Calculator started', 1),
    ]);
    expect(c).toBeNull();
  });

  it('skips unmeasured (null) stages entirely: null is silence, never zero', () => {
    const c = readCohortConstraint([
      stage('page_viewed', 'Entry page viewed', 1000),
      stage('tier_viewed', 'Tier viewed', null),
      stage('email_submitted', 'Email captured', 100),
    ]);
    expect(c?.constraintId).toBe('drop:page_viewed->email_submitted');
  });

  it('refuses to diagnose when the downstream count exceeds the upstream one', () => {
    const c = readCohortConstraint([
      stage('account_created', 'Account created', 50),
      stage('setup_completed', 'Setup completed', 80), // backfilled accounts: not comparable
    ]);
    expect(c).toBeNull();
  });

  it('severity bands: 70% drop is medium, under 70% is low', () => {
    const medium = readCohortConstraint([
      stage('a', 'A', 100),
      stage('b', 'B', 25),
    ]);
    expect(medium?.severity).toBe('medium');
    const low = readCohortConstraint([
      stage('a', 'A', 100),
      stage('b', 'B', 60),
    ]);
    expect(low?.severity).toBe('low');
  });

  it('confidence is sample sufficiency: medium at the floor, high at 2x', () => {
    const atFloor = readCohortConstraint([stage('a', 'A', COHORT_MIN_SAMPLE), stage('b', 'B', 10)]);
    expect(atFloor?.confidence).toBe('medium');
    const atTwice = readCohortConstraint([stage('a', 'A', COHORT_MIN_SAMPLE * 2), stage('b', 'B', 10)]);
    expect(atTwice?.confidence).toBe('high');
  });

  it('recommends an INVESTIGATION, never a causal verdict', () => {
    const c = readCohortConstraint([
      stage('fan_invited', 'Fans invited', 200),
      stage('first_paid_conversion', 'First paid fan', 5),
    ]);
    expect(c?.recommendedInvestigation).toMatch(/^Investigate/);
    expect(c?.recommendedInvestigation).not.toMatch(/definitely|certainly|is too high|is too low/i);
    expect(c?.explanation).toContain('largest observed drop');
  });

  it('returns null on flat or rising funnels', () => {
    expect(
      readCohortConstraint([stage('a', 'A', 100), stage('b', 'B', 100)]),
    ).toBeNull();
  });

  it('the published spine starts at the entry page and ends at first paid fan', () => {
    expect(AVATAR_FUNNEL_SPINE[0].stage).toBe('page_viewed');
    expect(AVATAR_FUNNEL_SPINE[AVATAR_FUNNEL_SPINE.length - 1].stage).toBe('first_paid_conversion');
  });
});
