import { createClient } from '@supabase/supabase-js';

/**
 * Short-lived signed URLs for the `audio` Storage bucket.
 *
 * WHY THIS EXISTS
 * ---------------
 * `tracks.audio_url_128/320` are withheld from anon+authenticated by column
 * privilege, and `tracks_public` hands them back only to an entitled reader.
 * That stops ENUMERATION. It revokes nothing: while the bucket is public, any
 * URL captured before the redaction landed still resolves forever, to anyone,
 * with no credentials. Verified 2026-07-10 -- a paid track's master returned
 * 200 / 41MB / audio/wav to a bare curl.
 *
 * A private bucket plus a signed URL is the only thing that expires a URL that
 * has already escaped.
 *
 * WHAT THIS IS NOT
 * ----------------
 * This module is a SIGNER, never a GATE. Entitlement is already decided by the
 * database -- `can_play_track()` behind the `tracks_public` view -- and callers
 * must prove it before signing. Re-deriving "is this fan subscribed?" in
 * TypeScript is precisely the shape of the original leak (`usePlayer` once
 * returned `canPlay: true` unconditionally). Sign only where entitlement has
 * already been established:
 *   - /api/tracks/[id]/stream    -- tracks_public returned a non-NULL url
 *   - /api/messages/*            -- caller proved conversation membership
 *
 * STORED VALUES ARE LOCATORS, NOT LINKS
 * -------------------------------------
 * Rows keep holding `/storage/v1/object/public/audio/<path>` strings. Once the
 * bucket is private those no longer resolve, which is the point: any consumer
 * missed during the migration yields a dead link rather than audio. Fail-closed.
 * `storagePathFromAudioValue` accepts either that legacy URL or a bare path, so
 * new writers may store the bare path without a data migration.
 */

export const AUDIO_BUCKET = 'audio';

/** One hour. Long enough for an unbroken listen, short enough that a leaked URL rots. */
export const SIGNED_URL_TTL_SECONDS = 3600;

const PUBLIC_PREFIX = `/storage/v1/object/public/${AUDIO_BUCKET}/`;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Reduce a stored value to an object path inside the `audio` bucket.
 *
 * Accepts a legacy public URL or an already-bare path. Returns null for empty
 * input, for a URL pointing at some other bucket, or for a path that tries to
 * escape the bucket. `getPublicUrl()` percent-encodes, `createSignedUrl()` wants
 * the raw key, so the path is decoded on the way through.
 */
export function storagePathFromAudioValue(value: string | null | undefined): string | null {
  if (!value) return null;

  let path: string;
  if (value.includes('://')) {
    const idx = value.indexOf(PUBLIC_PREFIX);
    // A full URL that isn't a public `audio` object is not ours to sign.
    if (idx === -1) return null;
    path = value.slice(idx + PUBLIC_PREFIX.length);
    // Drop any query string / fragment a CDN may have appended.
    path = path.split('?')[0].split('#')[0];
  } else {
    path = value.replace(/^\/+/, '');
    // Tolerate a bare path that still carries the bucket name.
    if (path.startsWith(`${AUDIO_BUCKET}/`)) path = path.slice(AUDIO_BUCKET.length + 1);
  }

  try {
    path = decodeURIComponent(path);
  } catch {
    // Malformed escape sequence -- use the raw form rather than throwing.
  }

  if (!path || path.includes('..')) return null;
  return path;
}

/**
 * Mint a signed URL for a stored audio value. Returns null when the value is
 * absent (an unentitled reader gets NULL from `tracks_public`) or unsignable.
 *
 * CALLERS MUST HAVE ALREADY CHECKED ENTITLEMENT.
 */
export async function signAudioValue(
  value: string | null | undefined,
  ttlSeconds: number = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const path = storagePathFromAudioValue(value);
  if (!path) return null;

  const { data, error } = await admin()
    .storage.from(AUDIO_BUCKET)
    .createSignedUrl(path, ttlSeconds);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
