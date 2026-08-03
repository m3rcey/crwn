import { describe, it, expect } from 'vitest';
import { decideNextAction, confidenceLabel } from './presentation';
import type { ConstraintResult, DiagnosedConstraint } from './types';

const DIAGNOSED: DiagnosedConstraint = {
  status: 'diagnosed',
  constraint: 'REACH',
  confidence: 'high',
  title: 'Almost nobody is seeing your page',
  explanation: 'Nothing about your offer has been tested yet.',
  evidence: [{ label: '12 unique visitors in the last 30 days.', metric: 'unique_visits', value: 12, unit: 'count' }],
  action: {
    label: 'Import your fan contacts',
    why: 'They cannot join a page they have never been sent.',
    href: '/studio/fans',
    verifiedBy: 'artist_has_fan_contacts',
  },
  evaluatedAt: '2026-08-03T12:00:00.000Z',
};

const INSUFFICIENT: ConstraintResult = {
  status: 'insufficient_evidence',
  reason: 'No constraint is blocking this artist right now.',
  missingEvidence: [],
  evaluatedAt: '2026-08-03T12:00:00.000Z',
};

describe('decideNextAction: the roadmap is never hidden', () => {
  it('shows the constraint card ABOVE the roadmap when one is diagnosed', () => {
    const d = decideNextAction(DIAGNOSED);
    expect(d.showConstraintCard).toBe(true);
    expect(d.constraint).toBe(DIAGNOSED);
    expect(d.showRoadmap).toBe(true);
    expect(d.reason).toBe('diagnosed');
  });

  it('preserves today\'s experience exactly when evidence is insufficient', () => {
    const d = decideNextAction(INSUFFICIENT);
    expect(d.showConstraintCard).toBe(false);
    expect(d.constraint).toBeNull();
    expect(d.showRoadmap).toBe(true);
    expect(d.reason).toBe('insufficient_evidence');
  });

  it('preserves today\'s experience when no constraint is diagnosed', () => {
    const d = decideNextAction({ ...INSUFFICIENT, reason: 'No constraint is blocking this artist right now.' });
    expect(d.showConstraintCard).toBe(false);
    expect(d.showRoadmap).toBe(true);
  });

  it('does not hide the roadmap while loading', () => {
    const d = decideNextAction(null);
    expect(d.showConstraintCard).toBe(false);
    expect(d.showRoadmap).toBe(true);
    expect(d.reason).toBe('no_result');
  });

  it('does not hide the roadmap when the fetch failed', () => {
    const d = decideNextAction(undefined);
    expect(d.showConstraintCard).toBe(false);
    expect(d.showRoadmap).toBe(true);
  });

  it('never renders two recommendations: the card carries exactly one action', () => {
    const d = decideNextAction(DIAGNOSED);
    expect(d.constraint?.action).toBeTruthy();
    expect(Object.prototype.toString.call(d.constraint?.action)).toBe('[object Object]');
  });

  it('the CTA points at an existing internal route', () => {
    const d = decideNextAction(DIAGNOSED);
    expect(d.constraint?.action.href).toBe('/studio/fans');
    expect(d.constraint?.action.href.startsWith('/')).toBe(true);
    expect(d.constraint?.action.href.startsWith('//')).toBe(false);
  });
});

describe('confidenceLabel', () => {
  it('reads as evidence strength, never as a probability', () => {
    expect(confidenceLabel('high')).toBe('Strong evidence');
    expect(confidenceLabel('medium')).toBe('Enough evidence to act on');
    expect(confidenceLabel('low')).toBe('Early signal');
  });
});
