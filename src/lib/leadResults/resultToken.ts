// Result tokens.
//
// The token is the ONLY thing standing between a stranger and an artist's answers. So:
//
//   - It is OPAQUE random bytes, not a signed payload. There is nothing to decode, so
//     there is nothing to leak. A signed JWT would put data in the URL; a random token
//     puts a lookup key in the URL and keeps the data in Postgres.
//   - Only the SHA-256 HASH is stored. A database read (a leaked backup, a SQL injection
//     elsewhere, an over-permissive admin query) does not yield a working token.
//   - Lookup is BY HASH, so validation is a single indexed equality check. There is no
//     scan-and-compare loop, which means no timing side channel to speak of.
//   - The claim token is SEPARATE from the view token and is ONE-TIME. Seeing a result and
//     taking ownership of it are different privileges and get different credentials.
//
// The existing 4 lead magnets keep using `public_token` (plaintext). That column is
// untouched. Acquisition rows populate the hashed columns instead. Both work side by side.

import { createHash, randomBytes } from 'crypto';

/** 32 bytes = 256 bits of entropy. Not guessable, not enumerable. */
const TOKEN_BYTES = 32;

export function mintToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** How long a result link stays live. 30 days matches the existing lead-magnet expiry. */
export const RESULT_TTL_SECONDS =
  parseInt(process.env.LEAD_RESULT_TOKEN_TTL_SECONDS || '', 10) || 60 * 60 * 24 * 30;

/**
 * A claim token expires FAST. It is the credential that binds an anonymous Instagram lead to
 * a real, verified CRWN account, so its blast radius is an account, not a page view.
 */
export const CLAIM_TTL_SECONDS = 60 * 60 * 24 * 7;

export function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function isExpired(iso: string | null | undefined): boolean {
  if (!iso) return false; // no expiry set == never expires (the existing tools' behavior)
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < Date.now();
}

/**
 * Build the public result URL.
 *
 * The token is the ONLY thing in the URL. No email, no phone, no Instagram handle, no
 * database id, no input values. A result URL pasted into a group chat reveals nothing about
 * who it belongs to until someone opens it, and opening it shows only that person's own
 * numbers, which they chose to share by pasting the link.
 */
export function buildResultUrl(toolSlug: string, rawToken: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app').replace(/\/+$/, '');
  return `${base}/tools/${encodeURIComponent(toolSlug)}/result/${encodeURIComponent(rawToken)}`;
}

export function buildClaimUrl(rawToken: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app').replace(/\/+$/, '');
  return `${base}/claim/${encodeURIComponent(rawToken)}`;
}
