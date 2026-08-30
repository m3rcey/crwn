import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken, socialTokenKeyConfigured } from './connectionTokens';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');

describe('connectionTokens', () => {
  it('round-trips a token under a valid key', () => {
    const stored = encryptToken('IGAAR-example-token-123', KEY);
    expect(stored).toBeTruthy();
    expect(stored).not.toContain('IGAAR');
    expect(decryptToken(stored, KEY)).toBe('IGAAR-example-token-123');
  });

  it('fails CLOSED with no key: encrypt and decrypt both refuse', () => {
    expect(socialTokenKeyConfigured('')).toBe(false);
    expect(encryptToken('secret', '')).toBeNull();
    const stored = encryptToken('secret', KEY)!;
    expect(decryptToken(stored, '')).toBeNull();
  });

  it('refuses a key of the wrong length instead of weakening the cipher', () => {
    const shortKey = Buffer.alloc(16, 1).toString('base64');
    expect(socialTokenKeyConfigured(shortKey)).toBe(false);
    expect(encryptToken('secret', shortKey)).toBeNull();
  });

  it('a tampered ciphertext decrypts to null, never to garbage', () => {
    const stored = encryptToken('secret-token', KEY)!;
    const parts = stored.split('.');
    const ct = Buffer.from(parts[3], 'base64url');
    ct[0] = ct[0] ^ 0xff;
    parts[3] = ct.toString('base64url');
    expect(decryptToken(parts.join('.'), KEY)).toBeNull();
  });

  it('the wrong key decrypts to null', () => {
    const stored = encryptToken('secret-token', KEY)!;
    expect(decryptToken(stored, OTHER_KEY)).toBeNull();
  });

  it('malformed storage shapes are refused', () => {
    expect(decryptToken(null, KEY)).toBeNull();
    expect(decryptToken('', KEY)).toBeNull();
    expect(decryptToken('v2.a.b.c', KEY)).toBeNull();
    expect(decryptToken('plaintext-token', KEY)).toBeNull();
  });

  it('each encryption uses a fresh IV (two ciphertexts of the same token differ)', () => {
    const a = encryptToken('same-token', KEY)!;
    const b = encryptToken('same-token', KEY)!;
    expect(a).not.toBe(b);
  });
});
