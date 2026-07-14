import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signature checks for the two webhook senders CRWN does not control.
 *
 * Both are ordinary HMACs, so they are verified here with node's crypto rather than by
 * adding the twilio and svix SDKs for ~20 lines of hashing.
 *
 * Every function fails CLOSED: no secret configured, no header, malformed header, wrong
 * digest all return false. An unauthenticated POST to these routes is not a curiosity,
 * it writes to the database: forged Twilio traffic can fabricate rows in
 * `sms_consent_log`, which is the record CRWN would rely on to prove a fan consented to
 * being texted, and forged Resend traffic can suppress any artist's email address.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Twilio signs the exact url it called plus every POST param, sorted by key and
 * concatenated: HMAC-SHA1(authToken, url + k1 + v1 + k2 + v2 ...), base64.
 *
 * The url MUST be the public one Twilio was configured with, not `req.url`: behind
 * Vercel the request arrives with an internal host and the digest would never match.
 */
export function verifyTwilioSignature(
  publicUrl: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string | undefined
): boolean {
  if (!authToken || !signature) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], publicUrl);

  const expected = createHmac('sha1', authToken).update(Buffer.from(payload, 'utf8')).digest('base64');
  return safeEqual(expected, signature);
}

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over `${id}.${timestamp}.${rawBody}`,
 * keyed by the secret's base64 payload (the part after `whsec_`), base64 encoded.
 *
 * The raw body text is required, byte for byte. Re-serialising the parsed JSON changes
 * key order and whitespace, and the digest will not match.
 *
 * The timestamp is checked against a 5 minute window so a captured POST cannot be
 * replayed forever.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string | undefined,
  toleranceSeconds = 300
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - sentAt);
  if (ageSeconds > toleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');

  // The header carries a space-separated list of `v1,<signature>` so a secret can be
  // rotated without dropping traffic. Any one of them matching is a valid signature.
  return signature
    .split(' ')
    .filter((part) => part.startsWith('v1,'))
    .some((part) => safeEqual(expected, part.slice(3)));
}
