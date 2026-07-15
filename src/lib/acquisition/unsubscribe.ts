// Unsubscribe signing for acquisition (Instagram funnel) email.
//
// WHY A SIGNED LINK. The unsubscribe URL carries the recipient's own email so the route can
// suppress it with no session. Signing stops a scraper from mass-suppressing arbitrary
// addresses by iterating emails: without the matching HMAC, the route refuses.
//
// WHY A STABLE SECRET, NOT A PER-SEND TOKEN. CAN-SPAM requires the opt-out to keep working for
// at least 30 days after the email is sent, and these emails sit in inboxes indefinitely. A
// per-send token in a table would have to live forever. Signing with a stable server secret is
// stateless and never expires. We reuse the service-role key: it is always set in production,
// is server-only, and never reaches a client. HMAC is one-way, so using it as the signing key
// does not expose it. If that key is ever rotated (rare, deliberate), outstanding links stop
// verifying, which is acceptable.

import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';

/** Canonical form the signature is computed over. Lowercased + trimmed, so the link a person
 *  clicks matches the address we stored regardless of casing. */
function canonical(email: string): string {
  return (email || '').trim().toLowerCase();
}

export function signUnsubscribe(email: string): string {
  return createHmac('sha256', SECRET).update(canonical(email)).digest('hex');
}

export function verifyUnsubscribe(email: string, sig: string): boolean {
  if (!email || !sig) return false;
  try {
    const a = Buffer.from(signUnsubscribe(email), 'hex');
    const b = Buffer.from(sig, 'hex');
    // timingSafeEqual throws on a length mismatch; a wrong-length signature is simply invalid.
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function buildUnsubscribeUrl(email: string): string {
  return `${APP_URL}/api/acquisition/unsubscribe?e=${encodeURIComponent(canonical(email))}&t=${signUnsubscribe(email)}`;
}
