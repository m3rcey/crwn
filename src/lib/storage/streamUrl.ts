/**
 * A pre-signed stream url riding on a Track row (client-safe half).
 *
 * WHY THIS EXISTS
 * ---------------
 * Click-to-sound on the public artist page measured 2.2s on a fast desktop link
 * (headless Chrome against production, 2026-09-08), and 0.7 to 1.0s of that was
 * two sequential round trips BEFORE the browser asked for a single byte of
 * audio: an artist-metadata read, then /api/tracks/[id]/stream minting a signed
 * url. On a phone every one of those hops is slower, which is how a fan waits
 * six seconds for a song another app starts instantly.
 *
 * Surfaces that read `tracks_public` server-side AS THE CALLER have already had
 * entitlement decided by the view: a non-NULL `audio_url_128` IS the grant, the
 * same fact the stream route keys on. So they sign right there
 * (`attachStreamUrls` in signedAudio.ts, server only) and hand the player a
 * ready url. Same gate, one round trip fewer. Nothing here widens access: a
 * reader the view refused has no locator, so no url is ever attached.
 *
 * The player uses the url only while it is FRESH. Past the margin it falls back
 * to the stream route, so a tab left open for an hour still plays.
 */
export interface StreamUrlCarrier {
  /** Signed url minted server-side for an entitled reader, or absent. */
  stream_url?: string | null;
  /** Epoch ms at which `stream_url` stops resolving. */
  stream_url_expires_at?: number | null;
}

/** A listen must never start on a url about to rot mid-song. */
export const STREAM_URL_FRESH_MARGIN_MS = 10 * 60 * 1000;

export function freshStreamUrl(track: StreamUrlCarrier, now: number = Date.now()): string | null {
  const url = track.stream_url;
  const expiresAt = track.stream_url_expires_at;
  if (!url || typeof url !== 'string') return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  if (now >= expiresAt - STREAM_URL_FRESH_MARGIN_MS) return null;
  return url;
}
