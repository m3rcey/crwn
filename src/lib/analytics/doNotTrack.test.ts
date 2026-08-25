import { describe, it, expect } from 'vitest';
import { hasDntCookie, requestHasDnt } from './doNotTrack';

describe('the founder do-not-track cookie is recognized wherever it appears in the header', () => {
  it('matches the cookie alone, first, middle, and last', () => {
    expect(hasDntCookie('crwn_dnt=1')).toBe(true);
    expect(hasDntCookie('crwn_dnt=1; sb-access-token=abc')).toBe(true);
    expect(hasDntCookie('a=b; crwn_dnt=1; c=d')).toBe(true);
    expect(hasDntCookie('a=b; crwn_dnt=1')).toBe(true);
  });

  it('does not match an absent, empty, or different-valued cookie', () => {
    expect(hasDntCookie(null)).toBe(false);
    expect(hasDntCookie(undefined)).toBe(false);
    expect(hasDntCookie('')).toBe(false);
    expect(hasDntCookie('a=b; c=d')).toBe(false);
    expect(hasDntCookie('crwn_dnt=0')).toBe(false);
    // A cookie NAMED like ours but longer must not count (prefix confusion).
    expect(hasDntCookie('xcrwn_dnt=1')).toBe(false);
    expect(hasDntCookie('crwn_dnt_other=1')).toBe(false);
  });

  it('requestHasDnt reads the Cookie header off a Headers-like object', () => {
    const withIt = { get: (n: string) => (n === 'cookie' ? 'crwn_dnt=1' : null) };
    const without = { get: () => null };
    expect(requestHasDnt(withIt)).toBe(true);
    expect(requestHasDnt(without)).toBe(false);
  });
});
