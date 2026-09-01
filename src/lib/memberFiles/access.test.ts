import { describe, it, expect } from 'vitest';
import {
  checkFileAccess,
  normalizeFiles,
  memberFilePrefix,
  lockedLabel,
  MAX_FILES_PER_BUNDLE,
} from './core';

const ARTIST = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const SILVER = 'aaaa';
const GOLD = 'bbbb';
const BRONZE = 'cccc';

describe('stem delivery — entitlement', () => {
  const bundle = { allowed_tier_ids: [SILVER, GOLD], is_active: true };

  it('a Silver member gets the Silver stems', () => {
    expect(checkFileAccess(bundle, SILVER).ok).toBe(true);
  });

  it('BRONZE CANNOT reach a Silver stem file', () => {
    const v = checkFileAccess(bundle, BRONZE);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe('not_entitled');
  });

  it('a signed-out visitor cannot reach it', () => {
    expect(checkFileAccess(bundle, null).ok).toBe(false);
  });

  it('an EMPTY allow list means nobody, never everybody', () => {
    // The dangerous reading of "no tiers listed" is "unrestricted". Here it is a closed
    // door, which is the only safe default for a file the artist has not yet shared.
    expect(checkFileAccess({ allowed_tier_ids: [], is_active: true }, GOLD).ok).toBe(false);
    expect(checkFileAccess({ allowed_tier_ids: null, is_active: true }, GOLD).ok).toBe(false);
  });

  it('a switched-off bundle is closed even to an entitled member', () => {
    const v = checkFileAccess({ allowed_tier_ids: [GOLD], is_active: false }, GOLD);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toBe('inactive');
  });
});

describe('stem delivery — a key can never point outside its own artist', () => {
  const prefix = memberFilePrefix(ARTIST);

  it('accepts a key the server minted for this artist', () => {
    const out = normalizeFiles([{ key: `${prefix}1-stems.zip`, name: 'stems.zip', size: 10 }], prefix);
    expect(out).toHaveLength(1);
  });

  it('REFUSES a key belonging to another artist', () => {
    expect(normalizeFiles(
      [{ key: `${memberFilePrefix(OTHER)}1-stems.zip`, name: 'stems.zip' }],
      prefix,
    )).toBeNull();
  });

  it('refuses traversal out of the prefix', () => {
    expect(normalizeFiles([{ key: `${prefix}../${OTHER}/x.zip`, name: 'x' }], prefix)).toBeNull();
  });

  it('refuses a bucket-root or absolute key', () => {
    expect(normalizeFiles([{ key: 'tracks/secret.wav', name: 'x' }], prefix)).toBeNull();
    expect(normalizeFiles([{ key: '/etc/passwd', name: 'x' }], prefix)).toBeNull();
  });

  it('refuses an empty bundle and one over the cap', () => {
    expect(normalizeFiles([], prefix)).toBeNull();
    const many = Array.from({ length: MAX_FILES_PER_BUNDLE + 1 }, (_, i) => ({
      key: `${prefix}${i}.wav`, name: `${i}.wav`,
    }));
    expect(normalizeFiles(many, prefix)).toBeNull();
  });
});

describe('locked labels name the rung, never the file', () => {
  it('names the tiers that unlock it', () => {
    expect(lockedLabel(['Silver', 'Gold'])).toContain('Silver');
  });

  it('says something sane when the rungs cannot be read', () => {
    expect(lockedLabel([])).toBeTruthy();
  });
});
