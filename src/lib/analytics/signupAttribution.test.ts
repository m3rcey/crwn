import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FRESH_ACCOUNT_WINDOW_MS,
  PENDING_RESULT_TOKEN_META_KEY,
  SIGNUP_ATTRIBUTION_META_KEY,
  isCarryableResultToken,
  signupFallbackDims,
  signupMetadataPatch,
} from './signupAttribution';
import { parseCampaignAttribution } from './campaignAttribution';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const fresh = new Date(NOW - 60_000).toISOString();
const old = new Date(NOW - FRESH_ACCOUNT_WINDOW_MS - 60_000).toISOString();
const attr = parseCampaignAttribution(new URLSearchParams('utm_source=instagram&utm_content=link_in_bio&utm_campaign=content-test-day3'));
const TOKEN = 'abcDEF123_-abcDEF123_-abcDEF123_'; // base64url, the shape both token mints produce

describe('signupMetadataPatch: what a fresh account writes before its first auto-claim', () => {
  it('writes the first-touch snapshot and a carried result token for a fresh account', () => {
    const p = signupMetadataPatch({ existingMeta: {}, attribution: attr, pendingResultToken: TOKEN, userCreatedAt: fresh, now: NOW });
    expect(p).toEqual({ [SIGNUP_ATTRIBUTION_META_KEY]: attr, [PENDING_RESULT_TOKEN_META_KEY]: TOKEN });
  });

  it('writes nothing for a returning login: history is never rewritten', () => {
    expect(signupMetadataPatch({ existingMeta: {}, attribution: attr, pendingResultToken: TOKEN, userCreatedAt: old, now: NOW })).toBeNull();
    expect(signupMetadataPatch({ existingMeta: {}, attribution: attr, pendingResultToken: TOKEN, userCreatedAt: null, now: NOW })).toBeNull();
  });

  it('never overwrites a value already present (email signup set it at creation)', () => {
    const p = signupMetadataPatch({
      existingMeta: { [SIGNUP_ATTRIBUTION_META_KEY]: { campaign: 'earlier' }, [PENDING_RESULT_TOKEN_META_KEY]: 'x' },
      attribution: attr,
      pendingResultToken: TOKEN,
      userCreatedAt: fresh,
      now: NOW,
    });
    expect(p).toBeNull();
  });

  it('ignores an empty snapshot and a token of the wrong shape', () => {
    expect(signupMetadataPatch({ existingMeta: {}, attribution: parseCampaignAttribution(null), pendingResultToken: 'not a token!', userCreatedAt: fresh, now: NOW })).toBeNull();
    expect(isCarryableResultToken('short')).toBe(false);
    expect(isCarryableResultToken(TOKEN)).toBe(true);
  });
});

describe('ordering in useAuth: the metadata write lands BEFORE the first auto-claim', () => {
  // account_created dedups on the user id, so whichever auto-claim runs first decides that row's
  // attribution forever. Every session handler must await the attach before redeeming claims.
  it('awaits attachSignupAttribution immediately before every redeemPendingClaims() call', () => {
    const src = readFileSync(join(process.cwd(), 'src/hooks/useAuth.tsx'), 'utf8').replace(/\r\n/g, '\n');
    const calls = [...src.matchAll(/^\s*redeemPendingClaims\(\);$/gm)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const m of calls) {
      const before = src.slice(0, m.index).trimEnd().split('\n').pop() ?? '';
      expect(before.trim()).toBe('await attachSignupAttribution(supabase, session.user);');
    }
  });
});

describe('signupFallbackDims: the claimed row wins, the snapshot only fills silence', () => {
  it('keeps the claimed result row dims when it has any', () => {
    const row = { campaign: 'from-row', video: 'reel-1' };
    expect(signupFallbackDims(row, { [SIGNUP_ATTRIBUTION_META_KEY]: attr })).toBe(row);
  });

  it('falls back to the sanitized metadata snapshot when the row carries nothing', () => {
    const d = signupFallbackDims({}, { [SIGNUP_ATTRIBUTION_META_KEY]: attr });
    expect(d.campaign).toBe('content-test-day3');
    expect(d.video).toBe('link_in_bio');
    expect(d.referrer).toBe('instagram');
  });

  it('re-sanitizes client-written metadata: a hostile value cannot reach a funnel row', () => {
    const d = signupFallbackDims({}, { [SIGNUP_ATTRIBUTION_META_KEY]: { campaign: '<img src=x>', channel: 'evil', platform: 'IG' } });
    expect(d.campaign).toBe('img-srcx');
    expect(d.campaign).toMatch(/^[a-z0-9._-]+$/);
    expect(d.metadata?.channel).toBeUndefined();
    expect(d.referrer).toBe('instagram');
  });

  it('returns the empty dims untouched when there is no snapshot', () => {
    expect(signupFallbackDims({}, {})).toEqual({});
    expect(signupFallbackDims({}, null)).toEqual({});
  });
});
