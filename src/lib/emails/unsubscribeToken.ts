// Signed unsubscribe links for the FAN and PROSPECT email rails.
//
// WHY THIS EXISTS. The four unsubscribe endpoints (campaign per-artist, campaign all-artists,
// artist sequence, CRM outreach) each mutated a communication preference straight off a bare row
// id in a plain GET. Two consequences, both real:
//   1. A link-prefetching mail client, an antivirus URL scanner or a corporate link-rewriter can
//      fetch the link with nobody reading the email, and the fan is silently opted out. The
//      all-artists variant opts them out of EVERY artist on the platform.
//   2. Anyone who obtains a send id (a forwarded email, a log line, a shared screenshot) can opt
//      that person out, and can edit the path to change which list they are opted out of.
//
// The correct pattern already existed at src/lib/acquisition/unsubscribe.ts (HMAC-SHA256 over a
// canonical value, timingSafeEqual, stateless, deliberately non-expiring). This module is the same
// idea generalized from "an email address" to "a recipient AND a scope", because these four
// endpoints touch four different lists and a token must not be portable between them.
//
// WHAT THE TOKEN BINDS. `unsub.v1|kind|id|artistId|recipient`:
//   kind      which endpoint (a token minted for the per-artist link is invalid on the all link)
//   id        the row id that appears in the URL path (a guessed or incremented id has no token)
//   artistId  which list ('*' for every artist, 'crwn' for platform outreach)
//   recipient who the opt-out belongs to ('fan:<uuid>' | 'contact:<uuid>' | 'email:<address>')
// The verifying route derives all four from the ROW it just looked up, never from the query
// string, so a token can only ever authorize the scope its own row implies.
//
// WHY NO EXPIRY. CAN-SPAM requires the opt-out to keep working for at least 30 days after a send,
// and marketing email sits in inboxes for years. A short-lived token would strand a real person
// who wants out, which is a worse outcome than the threat it defends. Same reasoning, and the same
// stable server secret, as the acquisition signer.
//
// WHY THE SECRET IS THE SERVICE-ROLE KEY. It is always set in production, is server-only, and
// never reaches a client. HMAC is one-way, so signing with it does not expose it. Rotating it
// invalidates outstanding tokens, which is acceptable because the routes still accept an unsigned
// legacy link (see ALLOW_UNSIGNED_LEGACY_LINKS).

import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build';

/** Which unsubscribe endpoint a token was minted for. Not interchangeable. */
export type UnsubscribeKind =
  | 'campaign-artist'
  | 'campaign-all'
  | 'sequence-artist'
  | 'crm-outreach';

export interface UnsubscribeScope {
  kind: UnsubscribeKind;
  /** The row id in the link path: campaign_sends.id, sequence_enrollments.id, crm_outreach_sends.id. */
  id: string;
  /** Which list this opt-out covers. An artist_profiles id, ALL_ARTISTS, or CRWN_PLATFORM. */
  artistId: string;
  /** Who the opt-out belongs to. Build with fanRecipient / contactRecipient / emailRecipient. */
  recipient: string;
}

/** The query/form parameter the signature travels in. */
export const UNSUBSCRIBE_TOKEN_PARAM = 't';

/** Scope value meaning "every artist on the platform". */
export const ALL_ARTISTS = '*';

/** Scope value meaning "CRWN's own outreach list", which belongs to no artist. */
export const CRWN_PLATFORM = 'crwn';

/**
 * Unsigned links are still honored, because millions of already-sent emails carry them and
 * stranding a real unsubscribe is a compliance failure, not a security win. What protects those
 * links is the confirm step: the GET only RENDERS, and the mutation needs a POST carrying a token
 * the server minted for that exact row. That is what defeats a prefetcher and a cross-site POST.
 *
 * Flip this to false once every sender emits signed links AND the unsigned generation has aged out
 * of inboxes. At that point an unsigned link is refused outright and the row id stops being a
 * capability. Nothing else needs to change.
 */
export const ALLOW_UNSIGNED_LEGACY_LINKS = true;

export function fanRecipient(fanId: string | null | undefined): string {
  return `fan:${(fanId || 'none').trim().toLowerCase()}`;
}

export function contactRecipient(contactId: string | null | undefined): string {
  return `contact:${(contactId || 'none').trim().toLowerCase()}`;
}

export function emailRecipient(email: string | null | undefined): string {
  return `email:${(email || 'none').trim().toLowerCase()}`;
}

/**
 * The exact bytes the signature covers. Every field is normalized so a link that survived a
 * mail client's case-mangling still verifies, and the pipe-joined form keeps the fields from
 * running together (an id ending in a digit cannot borrow the next field's first character).
 */
function canonical(scope: UnsubscribeScope): string {
  const part = (v: string) => (v || '').trim().toLowerCase();
  return [
    'unsub.v1',
    part(scope.kind),
    part(scope.id),
    part(scope.artistId),
    part(scope.recipient),
  ].join('|');
}

export function signUnsubscribeScope(scope: UnsubscribeScope): string {
  return createHmac('sha256', SECRET).update(canonical(scope)).digest('hex');
}

/**
 * Constant-time comparison. A `===` on the hex string leaks the length of the matching prefix,
 * which is enough to forge a signature one character at a time against a route that answers fast.
 */
export function verifyUnsubscribeScope(scope: UnsubscribeScope, token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const expected = Buffer.from(signUnsubscribeScope(scope), 'hex');
    const given = Buffer.from(String(token), 'hex');
    // timingSafeEqual throws on a length mismatch, and a wrong-length signature is simply invalid.
    return expected.length > 0 && expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

/** Append the signature to an unsubscribe URL, preserving any params already on it. */
export function appendUnsubscribeToken(url: string, scope: UnsubscribeScope): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${UNSUBSCRIBE_TOKEN_PARAM}=${signUnsubscribeScope(scope)}`;
}
