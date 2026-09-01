import { describe, it, expect } from 'vitest';
import {
  checkFileAccess,
  normalizeFiles,
  memberFilePrefix,
  lockedLabel,
  MAX_FILES_PER_BUNDLE,
} from './core';

const SILVER = 'silver-id';
const GOLD = 'gold-id';
const BRONZE = 'bronze-id';
const ARTIST = 'artist-1';
const PREFIX = memberFilePrefix(ARTIST);

// "Silver and above" is stored expanded, exactly as TierAccessSelect writes it.
const stems = { allowed_tier_ids: [SILVER, GOLD, 'platinum-id'], is_active: true };

describe('checkFileAccess', () => {
  it('admits an entitled member', () => {
    expect(checkFileAccess(stems, SILVER)).toEqual({ ok: true });
    expect(checkFileAccess(stems, GOLD)).toEqual({ ok: true });
  });

  it('refuses a lower rung — Bronze cannot reach Silver stems', () => {
    expect(checkFileAccess(stems, BRONZE)).toEqual({ ok: false, reason: 'not_entitled' });
  });

  it('refuses a fan with no membership at all', () => {
    expect(checkFileAccess(stems, null)).toEqual({ ok: false, reason: 'not_entitled' });
  });

  it('an EMPTY allow list admits nobody, never everybody', () => {
    const empty = { allowed_tier_ids: [], is_active: true };
    expect(checkFileAccess(empty, SILVER)).toEqual({ ok: false, reason: 'not_entitled' });
    expect(checkFileAccess(empty, null)).toEqual({ ok: false, reason: 'not_entitled' });
  });

  it('an inactive bundle is refused even for an entitled member', () => {
    expect(checkFileAccess({ ...stems, is_active: false }, SILVER))
      .toEqual({ ok: false, reason: 'inactive' });
  });

  it('malformed tier data fails closed', () => {
    expect(checkFileAccess({ allowed_tier_ids: 'silver-id', is_active: true }, SILVER))
      .toEqual({ ok: false, reason: 'not_entitled' });
    expect(checkFileAccess({ allowed_tier_ids: null, is_active: true }, SILVER))
      .toEqual({ ok: false, reason: 'not_entitled' });
  });

  it('ignores non-string entries rather than trusting them', () => {
    expect(checkFileAccess({ allowed_tier_ids: [null, 7, SILVER], is_active: true }, SILVER))
      .toEqual({ ok: true });
    expect(checkFileAccess({ allowed_tier_ids: [null, 7], is_active: true }, SILVER))
      .toEqual({ ok: false, reason: 'not_entitled' });
  });
});

describe('normalizeFiles — a key is never taken on trust', () => {
  const ok = [{ key: `${PREFIX}1-drums.wav`, name: 'drums.wav', size: 900, type: 'audio/wav' }];

  it('accepts a well-formed bundle inside the artist prefix', () => {
    expect(normalizeFiles(ok, PREFIX)).toEqual([
      { key: `${PREFIX}1-drums.wav`, name: 'drums.wav', size: 900, type: 'audio/wav' },
    ]);
  });

  it('REFUSES a key belonging to another artist', () => {
    const foreign = [{ key: `member-files/someone-else/1-secret.wav`, name: 'secret.wav' }];
    expect(normalizeFiles(foreign, PREFIX)).toBeNull();
  });

  it('REFUSES a key pointing anywhere else in the bucket', () => {
    for (const key of ['tracks/master.wav', 'producer-submissions/x/y/z.wav', '../../etc']) {
      expect(normalizeFiles([{ key, name: 'x.wav' }], PREFIX)).toBeNull();
    }
  });

  it('refuses traversal even when the prefix matches', () => {
    expect(normalizeFiles([{ key: `${PREFIX}../../other/a.wav`, name: 'a.wav' }], PREFIX)).toBeNull();
  });

  it('refuses an empty bundle and an over-long one', () => {
    expect(normalizeFiles([], PREFIX)).toBeNull();
    const many = Array.from({ length: MAX_FILES_PER_BUNDLE + 1 }, (_, i) => ({
      key: `${PREFIX}${i}.wav`, name: `${i}.wav`,
    }));
    expect(normalizeFiles(many, PREFIX)).toBeNull();
  });

  it('refuses malformed entries', () => {
    expect(normalizeFiles('nope', PREFIX)).toBeNull();
    expect(normalizeFiles([{ key: `${PREFIX}a.wav` }], PREFIX)).toBeNull();
    expect(normalizeFiles([{ name: 'a.wav' }], PREFIX)).toBeNull();
    expect(normalizeFiles([null], PREFIX)).toBeNull();
  });

  it('drops unknown fields rather than storing them', () => {
    const dirty = [{ key: `${PREFIX}a.wav`, name: 'a.wav', evil: 'x', url: 'https://public' }];
    expect(normalizeFiles(dirty, PREFIX)).toEqual([{ key: `${PREFIX}a.wav`, name: 'a.wav' }]);
  });
});

describe('memberFilePrefix / lockedLabel', () => {
  it('scopes every artist to their own folder', () => {
    expect(memberFilePrefix('a')).toBe('member-files/a/');
    expect(memberFilePrefix('a')).not.toBe(memberFilePrefix('b'));
  });

  it('names the rung instead of just saying locked', () => {
    expect(lockedLabel(['Silver'])).toBe('Silver members');
    expect(lockedLabel(['Silver', 'Gold'])).toBe('Silver and above');
    expect(lockedLabel([])).toBe('Members only');
  });
});
