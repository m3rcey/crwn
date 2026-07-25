// Tests for the continuation CTA copy.
//
// The five named calculators must read EXACTLY as specified (they are on the buttons artists click),
// and every other calculator must still get a feature-specific CTA, never the old generic string.
// The signup URL must carry the token into the EXISTING flow, not a new one.

import { describe, expect, it } from 'vitest';

import { continueCtaFor, buildContinueUrl } from './continuationCta';
import { LEAD_MAGNET_SLUGS } from './registry';

describe('continueCtaFor: the five named calculators are exact', () => {
  it('matches the specified copy', () => {
    expect(continueCtaFor('worth')).toBe('Build My Membership');
    expect(continueCtaFor('share-to-earn-planner')).toBe('Turn On Share-to-Earn');
    expect(continueCtaFor('executive-producer-session')).toBe('Build My Executive Producer Session');
    expect(continueCtaFor('live-experience-calculator')).toBe('Create My First Ticketed Live Event');
    expect(continueCtaFor('vault-revenue-planner')).toBe('Build My Vault');
  });
});

describe('continueCtaFor: every calculator gets feature-specific copy', () => {
  it('derives "Build My {featureName}" for a tool with no override', () => {
    // movement-page-blueprint -> featureName "Movement Page"
    expect(continueCtaFor('movement-page-blueprint')).toBe('Build My Movement Page');
    expect(continueCtaFor('proof-of-demand-test-builder')).toBe('Build My Proof of Demand');
  });

  it('never returns the old generic CTA for any registered calculator', () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      const cta = continueCtaFor(slug);
      expect(cta).not.toMatch(/create your crwn account/i);
      expect(cta).not.toBe('Build This In CRWN'); // the last-resort fallback should never trigger
      expect(cta.length).toBeGreaterThan(3);
    }
  });

  it('falls back only for a truly unknown slug', () => {
    expect(continueCtaFor('not-a-real-tool')).toBe('Build This In CRWN');
  });
});

describe('buildContinueUrl: existing signup flow, context preserved', () => {
  it('opens /signup with the result token (the flow auto-claim already consumes)', () => {
    const url = buildContinueUrl('worth', 'tok_abc');
    expect(url.startsWith('/signup?')).toBe(true);
    expect(url).toContain('result=tok_abc');
    expect(url).toContain('tool=worth');
    expect(url).toContain('ref=lead-magnet');
  });

  it('still opens signup (tool-tagged) when no token exists yet', () => {
    const url = buildContinueUrl('vault-revenue-planner');
    expect(url.startsWith('/signup?')).toBe(true);
    expect(url).not.toContain('result=');
    expect(url).toContain('tool=vault-revenue-planner');
  });
});
