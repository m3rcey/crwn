import { describe, it, expect } from 'vitest';
import {
  sanitizeOwnYourFansDraft,
  sanitizeOwnYourFansInputs,
  isDraftToken,
} from './ownYourFansDraft';
import { JOURNEY_EVENT_NAMES, ALL_OPPORTUNITY_EVENT_NAMES } from '../opportunityFunnels/analytics';

describe('sanitizeOwnYourFansDraft', () => {
  it('coerces a valid draft and clamps lengths', () => {
    const d = sanitizeOwnYourFansDraft({
      goal: 'text_list',
      captureType: 'both',
      headline: 'x'.repeat(200),
      subheadline: 'y'.repeat(400),
      ctaLabel: 'z'.repeat(100),
      primaryLink: 'https://example.com/song',
      step: 3,
    });
    expect(d.goal).toBe('text_list');
    expect(d.captureType).toBe('both');
    expect(d.headline).toHaveLength(80);
    expect(d.subheadline).toHaveLength(160);
    expect(d.ctaLabel).toHaveLength(40);
    expect(d.primaryLink).toBe('https://example.com/song');
    expect(d.step).toBe(3);
  });

  it('falls back safely on invalid enums and missing fields', () => {
    const d = sanitizeOwnYourFansDraft({ goal: 'hacker', captureType: 'nope' });
    expect(d.goal).toBe('email_list');
    expect(d.captureType).toBe('email');
    expect(d.step).toBe(0);
  });

  it('strips markup / angle brackets from copy', () => {
    const d = sanitizeOwnYourFansDraft({ headline: 'Hi <script>alert(1)</script> there' });
    expect(d.headline).not.toContain('<');
    expect(d.headline).not.toContain('>');
    expect(d.headline).not.toContain('script>');
  });

  it('rejects non-http(s) links (javascript:, data:, junk)', () => {
    expect(sanitizeOwnYourFansDraft({ primaryLink: 'javascript:alert(1)' }).primaryLink).toBe('');
    expect(sanitizeOwnYourFansDraft({ primaryLink: 'data:text/html,x' }).primaryLink).toBe('');
    expect(sanitizeOwnYourFansDraft({ primaryLink: 'not a url' }).primaryLink).toBe('');
    expect(sanitizeOwnYourFansDraft({ primaryLink: 'http://ok.com' }).primaryLink).toBe('http://ok.com/');
  });

  it('clamps step to a sane range', () => {
    expect(sanitizeOwnYourFansDraft({ step: -5 }).step).toBe(0);
    expect(sanitizeOwnYourFansDraft({ step: 9999 }).step).toBe(20);
    expect(sanitizeOwnYourFansDraft({ step: 2.7 }).step).toBe(3);
  });
});

describe('sanitizeOwnYourFansInputs', () => {
  it('bounds the audience number', () => {
    expect(sanitizeOwnYourFansInputs({ social_followers: 5000 }).social_followers).toBe(5000);
    expect(sanitizeOwnYourFansInputs({ social_followers: -10 }).social_followers).toBe(0);
    expect(sanitizeOwnYourFansInputs({ social_followers: 1e12 }).social_followers).toBe(100_000_000);
    expect(sanitizeOwnYourFansInputs({ social_followers: 'abc' }).social_followers).toBe(0);
    expect(sanitizeOwnYourFansInputs(null).social_followers).toBe(0);
  });
});

describe('isDraftToken (malformed-token guard)', () => {
  it('accepts a base64url token of the right shape', () => {
    expect(isDraftToken('Abc123_-Def456Ghi789xyz')).toBe(true);
  });
  it('rejects malformed, short, or wrong-charset tokens', () => {
    expect(isDraftToken('')).toBe(false);
    expect(isDraftToken('short')).toBe(false);
    expect(isDraftToken('has spaces in it aaaaaa')).toBe(false);
    expect(isDraftToken('bad/chars+here=aaaaaaaa')).toBe(false);
    expect(isDraftToken(null)).toBe(false);
    expect(isDraftToken(123)).toBe(false);
    expect(isDraftToken('x'.repeat(200))).toBe(false);
  });
});

describe('journey analytics contract', () => {
  it('defines all sixteen journey events and folds them into the allowlist', () => {
    expect(JOURNEY_EVENT_NAMES).toHaveLength(16);
    expect(JOURNEY_EVENT_NAMES).toContain('draft_claim_completed');
    expect(JOURNEY_EVENT_NAMES).toContain('signup_completed_from_opportunity');
    // The 7 funnel events + 16 journey events are all allowlistable.
    expect(ALL_OPPORTUNITY_EVENT_NAMES).toHaveLength(23);
    // A claim token is never an event name (it must never appear in analytics).
    expect(ALL_OPPORTUNITY_EVENT_NAMES.some((n) => n.includes('token'))).toBe(false);
  });
});
