// ManyChat webhook verification.
//
// READ THIS BEFORE YOU TRUST THIS ROUTE.
//
// ManyChat's External Request step CANNOT sign a request. There is no HMAC, no
// `x-manychat-signature`, no shared-nonce scheme. All it can send is custom headers you
// type into its UI. So this is a SHARED-SECRET BEARER check, and it is important to be
// precise about what that does and does not buy:
//
//   IT DOES prevent an anonymous stranger from writing to the acquisition tables.
//   IT DOES fail closed when the secret is unset (an unconfigured deploy rejects everything).
//   IT DOES resist timing analysis of the secret.
//   IT DOES NOT prevent replay of a captured request. A recorded POST can be resent.
//
// Replay is therefore handled ONE layer down, by the idempotency claim in
// acquisition_events (UNIQUE(idempotency_key), insert-as-claim, 23505 = already seen).
// A replayed event returns the ORIGINAL cached response and mutates nothing. That makes
// replay a no-op rather than a vulnerability, which is the best available answer given the
// transport's constraints.
//
// The precedent for this pattern is src/app/api/notifications/new-artist-hook/route.ts,
// where a Postgres pg_net trigger has the same "cannot sign" limitation.
//
// If the secret leaks: rotate MANYCHAT_WEBHOOK_SECRET in Vercel, update the ManyChat
// External Request header, redeploy. Nothing else is required, because the webhook can
// only WRITE lead data. It can never READ PII back out (see responseMapper.ts).

import { createHash, timingSafeEqual } from 'crypto';

export type VerifyFailure =
  | 'not_configured'
  | 'missing_secret'
  | 'bad_secret'
  | 'stale_timestamp';

export interface VerifyResult {
  ok: boolean;
  reason?: VerifyFailure;
}

/**
 * Constant-time compare of two secrets of arbitrary length.
 *
 * timingSafeEqual throws when the buffers differ in length, and that throw is itself a
 * length oracle. Hashing both sides first makes them fixed-length, so the comparison leaks
 * nothing about the real secret, not even its size.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** Default tolerance for the optional `sent_at` freshness check. */
const DEFAULT_TOLERANCE_SECONDS = 600;

export interface VerifyInput {
  /** Value of the x-webhook-secret header. */
  presentedSecret: string | null;
  /** Optional ISO timestamp from the payload. When absent, the freshness check is skipped. */
  sentAt?: string | null;
  nowMs?: number;
}

export function verifyManyChatRequest(input: VerifyInput): VerifyResult {
  const expected = process.env.MANYCHAT_WEBHOOK_SECRET;

  // FAIL CLOSED. An unconfigured deployment rejects every request rather than accepting
  // every request. This is the opposite of /api/admin/track's fail-open behavior, and the
  // difference is deliberate: track only writes analytics, this writes lead identities.
  if (!expected) return { ok: false, reason: 'not_configured' };

  if (!input.presentedSecret) return { ok: false, reason: 'missing_secret' };
  if (!safeEqual(input.presentedSecret, expected)) return { ok: false, reason: 'bad_secret' };

  // Best-effort freshness. ManyChat can be configured to send a timestamp; when it is, we
  // enforce it. When it isn't, we do NOT pretend to: we rely on idempotency instead of
  // claiming a replay defense we don't have.
  if (input.sentAt) {
    const tolerance =
      parseInt(process.env.MANYCHAT_WEBHOOK_TOLERANCE_SECONDS || '', 10) || DEFAULT_TOLERANCE_SECONDS;
    const sent = Date.parse(input.sentAt);
    const now = input.nowMs ?? Date.now();
    if (Number.isFinite(sent) && Math.abs(now - sent) > tolerance * 1000) {
      return { ok: false, reason: 'stale_timestamp' };
    }
  }

  return { ok: true };
}

/** Max inbound body we will even parse. A 1MB DM payload is an attack, not a message. */
export const MAX_BODY_BYTES = 32 * 1024;
