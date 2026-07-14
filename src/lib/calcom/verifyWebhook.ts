// Cal.com webhook verification.
//
// Unlike ManyChat, Cal.com CAN sign its webhooks: it sends an HMAC-SHA256 of the raw request
// body in `x-cal-signature-256`, keyed on a secret you set when creating the webhook.
//
// So this one gets REAL signature verification, not a shared bearer secret. That means:
//   - a captured request cannot be replayed with a modified body
//   - an attacker cannot forge a booking without the secret
//
// FAIL CLOSED. An unconfigured deployment rejects every request rather than accepting every
// request. A forged booking would cancel a lead's nurture sequence and mark her as converted,
// which is a quiet, annoying kind of damage.

import { createHmac, timingSafeEqual } from 'crypto';

export type CalVerifyFailure = 'not_configured' | 'missing_signature' | 'bad_signature';

export interface CalVerifyResult {
  ok: boolean;
  reason?: CalVerifyFailure;
}

/**
 * Verify against the RAW body, not the parsed object.
 *
 * JSON.parse + JSON.stringify does not round-trip byte-for-byte (key order, whitespace,
 * unicode escapes), so re-serializing would break the MAC for reasons that look like an
 * attack. Always hash the exact bytes that arrived.
 */
export function verifyCalcomRequest(rawBody: string, signature: string | null): CalVerifyResult {
  // TRIM. A secret pasted into a Vercel env var very often arrives with a trailing newline, and
  // a one-character difference produces a completely different MAC. The failure is then
  // indistinguishable from an attack, which is exactly the kind of bug that eats an afternoon.
  const secret = process.env.CALCOM_WEBHOOK_SECRET?.trim();

  if (!secret) return { ok: false, reason: 'not_configured' };
  if (!signature) return { ok: false, reason: 'missing_signature' };

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature.trim().toLowerCase(), 'utf8');

  // timingSafeEqual throws on a length mismatch, and that throw is itself an oracle.
  if (a.length !== b.length) return { ok: false, reason: 'bad_signature' };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' };

  return { ok: true };
}

export const MAX_CAL_BODY_BYTES = 64 * 1024;

// ---------------------------------------------------------------------------
// Payload
// ---------------------------------------------------------------------------

export interface CalBooking {
  triggerEvent: string;
  uid: string | null;
  startTime: string | null;
  endTime: string | null;
  attendeeEmail: string | null;
  attendeeName: string | null;
  /** The CRWN lead identity, carried through the booking URL. */
  leadIdentityId: string | null;
  /**
   * BOOKING_NO_SHOW_UPDATED only. TRUE = Josh marked her a no-show, FALSE = he un-marked her.
   * `null` on every other trigger, and null NEVER means no-show.
   *
   * This is a HUMAN's verdict relayed through Cal.com, not Cal.com's own inference. That
   * distinction is the whole reason we can act on it: the "guest didn't join cal video" trigger
   * is a guess (she might join at minute 7), and this is a decision.
   */
  noShow: boolean | null;
}

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/**
 * Parse a Cal.com webhook.
 *
 * TOLERANT BY DESIGN. The hard-won lesson of the ManyChat integration is that an integration
 * must bend to what the other system ACTUALLY sends, not to what its docs imply. Cal.com moves
 * custom values around between `metadata`, `responses`, and `bookingFieldsResponses` depending
 * on version and on how the booking link was built.
 *
 * So rather than assert a path, we hunt for a UUID anywhere in the payload and let the caller
 * verify it against lead_identities. A UUID that is not a real lead simply does not match.
 */
export function parseCalBooking(body: unknown): CalBooking | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const trigger = typeof b.triggerEvent === 'string' ? b.triggerEvent : '';
  if (!trigger) return null;

  const p = (b.payload && typeof b.payload === 'object' ? b.payload : {}) as Record<string, unknown>;

  const attendees = Array.isArray(p.attendees) ? (p.attendees as Record<string, unknown>[]) : [];
  const first = attendees[0] ?? {};

  return {
    triggerEvent: trigger,
    // BOOKING_NO_SHOW_UPDATED sends `bookingUid`, the others send `uid`. Same identifier,
    // different key, and getting this wrong would silently orphan every no-show.
    uid: str(p.uid) ?? str(p.bookingUid),
    startTime: str(p.startTime),
    endTime: str(p.endTime),
    attendeeEmail: str(first.email)?.toLowerCase() ?? null,
    attendeeName: str(first.name),
    leadIdentityId: findLeadId(p),
    noShow: findNoShow(p),
  };
}

/**
 * Did the human mark her a no-show?
 *
 * Cal.com puts the flag on the attendee, not the booking, and it has moved between
 * `noShow` and `no_show` across versions. Undefined is NOT false and it is NOT true: on any
 * trigger that carries no flag at all we return null, and null never fires the ladder.
 *
 * Defaulting a missing flag to `true` would be catastrophic here (every booking becomes a
 * no-show); defaulting to `false` is merely useless. So: null, and the caller ignores it.
 */
function findNoShow(payload: Record<string, unknown>): boolean | null {
  const attendees = Array.isArray(payload.attendees) ? (payload.attendees as Record<string, unknown>[]) : [];

  // Deliberately NOT `noShowHost`. That flag means the HOST did not turn up, and DMing an
  // artist "sorry we missed you" because Josh missed the call would be spectacular.
  for (const a of attendees) {
    const v = a.noShow ?? a.no_show;
    if (typeof v === 'boolean') return v;
  }

  const top = payload.noShow ?? payload.no_show;
  if (typeof top === 'boolean') return top;

  return null;
}

/**
 * Find the CRWN lead id anywhere in the payload.
 *
 * An Instagram lead has NO EMAIL, so email is not a reliable join key: she may type a brand new
 * address into Cal.com that CRWN has never seen. The lead id has to be carried through the
 * booking URL, and Cal.com puts URL params in different places depending on how you pass them.
 * So we look everywhere rather than betting on one path.
 */
function findLeadId(payload: Record<string, unknown>): string | null {
  const seen = new Set<unknown>();

  const walk = (v: unknown, depth: number): string | null => {
    if (depth > 6 || v == null || seen.has(v)) return null;

    if (typeof v === 'string') {
      const m = v.match(UUID);
      return m ? m[0].toLowerCase() : null;
    }

    if (typeof v === 'object') {
      seen.add(v);
      for (const child of Object.values(v as Record<string, unknown>)) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
    }

    return null;
  };

  // Look in the likely places first, then anywhere.
  for (const key of ['metadata', 'responses', 'bookingFieldsResponses', 'description', 'title']) {
    const found = walk(payload[key], 0);
    if (found) return found;
  }

  return walk(payload, 0);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
