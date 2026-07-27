import { describe, it, expect } from 'vitest';
import { resolveJourneyDestination, safeInternalPath, journeyDestinationToUrl } from './resolveJourneyDestination';
import type { LeadMagnetSeed } from '@/lib/leadResults/handoffSeed';

function seed(over: Partial<LeadMagnetSeed>): LeadMagnetSeed {
  return {
    resultId: 'r1',
    toolSlug: 'own-your-fans-calculator',
    toolName: 'Own Your Fans',
    headline: 'x',
    heroValue: null,
    heroSuffix: null,
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    conversionPayload: {},
    convertHref: '/x',
    ...over,
  } as LeadMagnetSeed;
}

const baseCtx = { isArtist: true, setupComplete: true, questEngineEnabled: false, seed: null } as const;

describe('safeInternalPath (open-redirect guard)', () => {
  it('accepts safe relative paths', () => {
    expect(safeInternalPath('/studio/fans')).toBe('/studio/fans');
    expect(safeInternalPath('/offers/new?x=1')).toBe('/offers/new?x=1');
  });
  it('rejects protocol-relative, absolute, backslash, control chars, and junk', () => {
    expect(safeInternalPath('//evil.com')).toBeNull();
    expect(safeInternalPath('http://evil.com')).toBeNull();
    expect(safeInternalPath('https://evil.com')).toBeNull();
    expect(safeInternalPath('/\\evil.com')).toBeNull();
    expect(safeInternalPath('/a\\b')).toBeNull();
    expect(safeInternalPath('javascript:alert(1)')).toBeNull();
    expect(safeInternalPath('relative')).toBeNull();
    expect(safeInternalPath('/' + 'a'.repeat(600))).toBeNull();
    expect(safeInternalPath('')).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(123 as unknown as string)).toBeNull();
  });
});

describe('resolveJourneyDestination', () => {
  it('Own Your Fans new user -> the fan-page plan (recommended action)', () => {
    const d = resolveJourneyDestination({ ...baseCtx, seed: seed({}) });
    expect(d.path).toBe('/own-your-fans/plan');
    expect(d.reason).toBe('builder_restored');
    expect(d.opportunityKey).toBe('own-your-fans');
    expect(d.params.lm_tool).toBe('own-your-fans-calculator');
  });

  it('Streaming Loss new user -> the offers builder', () => {
    const d = resolveJourneyDestination({ ...baseCtx, seed: seed({ toolSlug: 'worth', toolName: 'Streaming Loss', resultId: 'r2' }) });
    expect(d.path).toBe('/offers/new');
    expect(d.reason).toBe('builder_restored');
    expect(d.opportunityKey).toBe('streaming-loss');
  });

  it('existing fan becoming an artist (no artist row yet) -> /welcome', () => {
    const d = resolveJourneyDestination({ ...baseCtx, isArtist: false, seed: seed({}) });
    expect(d.path).toBe('/welcome');
    expect(d.reason).toBe('needs_account');
  });

  it('existing artist with incomplete setup -> /setup (setup wins, never bypassed)', () => {
    const d = resolveJourneyDestination({ ...baseCtx, setupComplete: false, seed: seed({}) });
    expect(d.path).toBe('/setup');
    expect(d.reason).toBe('setup_incomplete');
  });

  it('existing artist, complete setup, no draft -> safe dashboard fallback (no dead end)', () => {
    const d = resolveJourneyDestination({ ...baseCtx, seed: null });
    expect(d.path).toBe('/profile/artist');
    expect(d.reason).toBe('fallback_dashboard');
  });

  it('unsupported tool (no builder mapping) -> fallback dashboard, not a broken route', () => {
    const d = resolveJourneyDestination({ ...baseCtx, seed: seed({ toolSlug: 'proof-of-demand-test-builder' }) });
    expect(d.reason).toBe('fallback_dashboard');
    expect(d.path).toBe('/profile/artist');
  });

  it('Rise Mode DISABLED -> no returnTo appended (normal back)', () => {
    const d = resolveJourneyDestination({ ...baseCtx, questEngineEnabled: false, seed: seed({}) });
    expect(d.params.returnTo).toBeUndefined();
  });

  it('authorized Rise Mode cohort -> returnTo to Rise Mode, flag stays server-side', () => {
    const d = resolveJourneyDestination({ ...baseCtx, questEngineEnabled: true, seed: seed({}) });
    expect(d.params.returnTo).toBe('/profile/artist');
  });

  it('an explicit valid returnTo wins; an invalid one is dropped', () => {
    const ok = resolveJourneyDestination({ ...baseCtx, returnTo: '/studio/fans', seed: seed({}) });
    expect(ok.params.returnTo).toBe('/studio/fans');
    const bad = resolveJourneyDestination({ ...baseCtx, returnTo: 'https://evil.com', seed: seed({}) });
    expect(bad.params.returnTo).toBeUndefined();
  });

  it('preserves the experiment variant as a passthrough param', () => {
    const d = resolveJourneyDestination({ ...baseCtx, experimentVariant: 'save', seed: seed({}) });
    expect(d.params.lm_variant).toBe('save');
  });

  it('serializes to a relative url', () => {
    const d = resolveJourneyDestination({ ...baseCtx, seed: seed({}) });
    expect(journeyDestinationToUrl(d).startsWith('/own-your-fans/plan?')).toBe(true);
  });
});
