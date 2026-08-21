import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signature checks for webhook senders CRWN does not control.
 *
 * Ordinary HMACs, verified here with node's crypto rather than by adding the svix SDK
 * for ~20 lines of hashing.
 *
 * Every function fails CLOSED: no secret configured, no header, malformed header, wrong
 * digest all return false. An unauthenticated POST to these routes is not a curiosity,
 * it writes to the database: forged Resend traffic can suppress any artist's email
 * address.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
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

/**
 * Twilio signs inbound webhooks with HMAC-SHA1 over the exact request URL followed by
 * every POST parameter, sorted by key and concatenated as key+value, base64 encoded,
 * sent as the X-Twilio-Signature header.
 *
 * Implemented here rather than by adding the Twilio SDK for one hash, the same call this
 * module already makes for Svix. The algorithm is pinned against Twilio's own published
 * test vector in webhookSignatures.test.ts, so a mistake fails the suite instead of a show.
 *
 * THE URL MUST BE THE ONE TWILIO SIGNED, query string included, with the public scheme
 * and host. Behind a proxy the internal request URL can arrive as http, which is why the
 * caller reconstructs an explicit https URL rather than trusting req.url.
 *
 * Fails CLOSED: no token, no signature, or a malformed one is a rejection. An inbound SMS
 * route without this would let anyone on the internet make CRWN send a text.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string | null,
  authToken: string | undefined
): boolean {
  if (!authToken || !signature || !url) return false;

  let payload = url;
  for (const key of Object.keys(params).sort()) {
    payload += key + (params[key] ?? '');
  }

  const expected = createHmac('sha1', authToken).update(Buffer.from(payload, 'utf8')).digest('base64');
  return safeEqual(expected, signature);
}
