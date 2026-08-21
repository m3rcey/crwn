import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  cleanFirstName,
  identityDecision,
  NEEDS_SIGN_IN_MESSAGE,
  accountEmailNote,
} from './liveClaim';

describe('normalizeEmail', () => {
  it('lowercases and trims, because providers treat addresses case-insensitively', () => {
    expect(normalizeEmail('  Mary.Jane@Gmail.com ')).toBe('mary.jane@gmail.com');
    expect(normalizeEmail(undefined)).toBe('');
    expect(normalizeEmail(42)).toBe('');
  });
});

describe('cleanFirstName', () => {
  it('trims, collapses and caps', () => {
    expect(cleanFirstName('  Mary   Jane ')).toBe('Mary Jane');
    expect(cleanFirstName('x'.repeat(100))).toHaveLength(60);
    expect(cleanFirstName(null)).toBe('');
  });
});

describe('identityDecision', () => {
  it('creates a captured contact when the email is unknown', () => {
    expect(identityDecision('new@example.com', [])).toEqual({ kind: 'create' });
  });

  it('reuses an UNCONFIRMED capture account (the same fan at the second set)', () => {
    const rows = [{ id: 'u1', email: 'mary@example.com', email_confirmed_at: null }];
    expect(identityDecision('mary@example.com', rows)).toEqual({ kind: 'reuse', userId: 'u1' });
  });

  it('REFUSES to act for a confirmed account: that is a real person\'s identity', () => {
    const rows = [{ id: 'u2', email: 'josh@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' }];
    expect(identityDecision('josh@example.com', rows)).toEqual({ kind: 'needs_sign_in' });
  });

  it('treats the legacy confirmed_at column as verification too', () => {
    const rows = [{ id: 'u3', email: 'a@example.com', confirmed_at: '2026-01-01T00:00:00Z' }];
    expect(identityDecision('a@example.com', rows)).toEqual({ kind: 'needs_sign_in' });
  });

  it('matches case-insensitively', () => {
    const rows = [{ id: 'u4', email: 'Mary@Example.com', email_confirmed_at: null }];
    expect(identityDecision('mary@example.com', rows)).toEqual({ kind: 'reuse', userId: 'u4' });
  });

  it('NEVER accepts a near match: the admin lookup is a search, not an exact query', () => {
    // Searching "mary@example.com" can return "mary@example.com.au" or "rosemary@...".
    // Voting one fan as another would be the worst possible outcome here.
    const rows = [
      { id: 'other1', email: 'mary@example.com.au', email_confirmed_at: null },
      { id: 'other2', email: 'rosemary@example.com', email_confirmed_at: '2026-01-01T00:00:00Z' },
    ];
    expect(identityDecision('mary@example.com', rows)).toEqual({ kind: 'create' });
  });

  it('picks the exact row even when near matches come back alongside it', () => {
    const rows = [
      { id: 'other', email: 'mary@example.com.au', email_confirmed_at: null },
      { id: 'exact', email: 'mary@example.com', email_confirmed_at: null },
    ];
    expect(identityDecision('mary@example.com', rows)).toEqual({ kind: 'reuse', userId: 'exact' });
  });

  it('fails safe on an empty email rather than creating an anonymous account', () => {
    expect(identityDecision('', [])).toEqual({ kind: 'needs_sign_in' });
  });
});

describe('copy', () => {
  it('the existing-account message reveals no role and claims no vote', () => {
    const m = NEEDS_SIGN_IN_MESSAGE.toLowerCase();
    expect(m).toContain('already has a crwn account');
    expect(m).not.toContain('artist');
    expect(m).not.toContain('admin');
    expect(m).not.toContain('your vote is in');
    expect(NEEDS_SIGN_IN_MESSAGE.includes('—')).toBe(false);
  });

  it('the account note is subordinate and only claims an email that was actually sent', () => {
    expect(accountEmailNote(true)).toContain('emailed you a link');
    expect(accountEmailNote(false)).toBe('');
    expect(accountEmailNote(true).includes('—')).toBe(false);
  });
});
