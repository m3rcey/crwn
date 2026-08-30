// Encryption-at-rest for artist social connection tokens. SERVER ONLY.
//
// This is the narrow exception to the house rule that third-party tokens live in the server
// environment: multi-tenant OAuth means every artist has their own Meta token, and the
// environment belongs to the platform, not to a tenant. The compensating controls are
// (1) the artist_social_connections table is closed to every client role (RLS on, zero
// policies, ALL revoked), (2) this module stores only AES-256-GCM ciphertext under a server
// env key, and (3) src/lib/fanAutomations/connections.ts is the ONE reader of that table.
//
// Fails CLOSED: no key configured means encrypt and decrypt both refuse, which makes every
// connect and every send refuse, which is the correct dark state before the founder sets
// SOCIAL_TOKEN_ENC_KEY. A misconfigured key can never silently store plaintext.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VERSION = 'v1';
const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

function loadKey(rawKey?: string): Buffer | null {
  const raw = (rawKey ?? process.env.SOCIAL_TOKEN_ENC_KEY ?? '').trim();
  if (!raw) return null;
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    return null;
  }
  return key.length === KEY_BYTES ? key : null;
}

export function socialTokenKeyConfigured(rawKey?: string): boolean {
  return loadKey(rawKey) !== null;
}

/** Encrypt a provider access token for storage. Returns null (never plaintext) without a key. */
export function encryptToken(plaintext: string, rawKey?: string): string | null {
  const key = loadKey(rawKey);
  if (!key || typeof plaintext !== 'string' || !plaintext) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

/** Decrypt a stored token. Any tamper, truncation, or wrong key returns null. */
export function decryptToken(stored: string | null | undefined, rawKey?: string): string | null {
  const key = loadKey(rawKey);
  if (!key || typeof stored !== 'string') return null;

  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const ct = Buffer.from(parts[3], 'base64url');
    if (iv.length !== IV_BYTES) return null;
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // GCM authentication failure: tampered ciphertext or wrong key. Refuse, never guess.
    return null;
  }
}
