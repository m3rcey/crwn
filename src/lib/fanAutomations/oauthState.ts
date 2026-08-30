// Signed OAuth `state` for artist social connects. SERVER ONLY.
//
// The state parameter is the CSRF defense for the Meta redirect flow: the callback must
// prove the connect was started by THIS signed-in artist owner in THIS app, not pasted in
// by an attacker binding their social account to someone else's artist (or vice versa).
//
// Shape: base64url(payload).base64url(hmac-sha256(payload)). The payload binds the artist,
// the user who started the flow, the provider, and a freshness window. The callback verifies
// the HMAC, the window, AND that the session user still matches state.userId, so a state
// minted for one browser cannot complete in another. Replay inside the window by the same
// user is harmless: completing the exchange twice upserts the same connection row.
//
// Secret: SUPABASE_SERVICE_ROLE_KEY, the same server-only signing root the unsubscribe
// tokens use (src/lib/emails/unsubscribeToken.ts). Fails CLOSED without it.

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const MAX_AGE_MS = 15 * 60 * 1000;

export interface OAuthStatePayload {
  artistId: string;
  userId: string;
  provider: 'instagram' | 'facebook';
  ts: number;
  nonce: string;
}

function secretKey(rawSecret?: string): string | null {
  const s = rawSecret ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return s ? s : null;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`oauth-state.v1|${payload}`).digest('base64url');
}

export function mintOAuthState(
  input: { artistId: string; userId: string; provider: 'instagram' | 'facebook' },
  now = Date.now(),
  rawSecret?: string,
): string | null {
  const secret = secretKey(rawSecret);
  if (!secret || !input.artistId || !input.userId) return null;
  const payload: OAuthStatePayload = { ...input, ts: now, nonce: randomBytes(8).toString('base64url') };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

/** Verify a state string. Any tamper, expiry, or missing secret returns null. */
export function verifyOAuthState(
  state: string | null | undefined,
  now = Date.now(),
  rawSecret?: string,
): OAuthStatePayload | null {
  const secret = secretKey(rawSecret);
  if (!secret || typeof state !== 'string') return null;
  const parts = state.split('.');
  if (parts.length !== 2) return null;

  const expected = sign(parts[0], secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(parts[1]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.artistId !== 'string' || !payload.artistId) return null;
  if (typeof payload.userId !== 'string' || !payload.userId) return null;
  if (payload.provider !== 'instagram' && payload.provider !== 'facebook') return null;
  if (typeof payload.ts !== 'number' || Math.abs(now - payload.ts) > MAX_AGE_MS) return null;
  return payload;
}
