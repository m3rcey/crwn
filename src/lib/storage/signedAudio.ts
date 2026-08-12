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
 *
 * NEVER SIGN A PATH A USER SUPPLIED (SEC-009)
 * -------------------------------------------
 * This module signs with the SERVICE ROLE, so whatever key reaches it is
 * readable by whoever gets the URL back. A path that arrived in a request body
 * and was written to a row the attacker controls is still an attacker-supplied
 * path: storing it does not launder it. The trust boundary is the WRITE, and it
 * lives in the routes that accept the value:
 *   - `voiceNotePathForOwner()` is the ONE validator for a DM voice note. It
 *     accepts only `voice/<owner uuid>/<file>` and only when the owner is the
 *     authenticated sender, so a caller can never name another artist's master
 *     (`<artistProfileId>/<epochMs>.<ext>`) or another user's voice note.
 *   - `isVoiceNotePath()` re-checks the same shape on READ, so a legacy or
 *     hand-written row that points outside `voice/` is refused rather than signed.
 * Absolute URLs are accepted ONLY in the exact `getPublicUrl()` shape the app
 * itself wrote for tracks (scheme, host, then the public prefix and nothing
 * else). A string that merely CONTAINS the prefix is refused.
 */

export const AUDIO_BUCKET = 'audio';

/** One hour. Long enough for an unbroken listen, short enough that a leaked URL rots. */
export const SIGNED_URL_TTL_SECONDS = 3600;

const PUBLIC_PREFIX = `/storage/v1/object/public/${AUDIO_BUCKET}/`;

/**
 * The only absolute-URL shape this module will reduce to a path: exactly what
 * `supabase.storage.getPublicUrl()` produced for the `audio` bucket. Anchored at
 * both ends, so `https://evil.example/x?u=/storage/v1/object/public/audio/...`
 * no longer resolves to a signable key the way a substring search allowed.
 */
const PUBLIC_URL_RE = new RegExp(
  `^https?://[^/?#]+${PUBLIC_PREFIX.replace(/\//g, '\\/')}(.+)$`,
  'i',
);

/** Voice notes are uploaded as `voice/<uploader auth uuid>/<epochMs>.<ext>`. */
const VOICE_DIR = 'voice';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOICE_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.([A-Za-z0-9]{1,5})$/;
const VOICE_EXTENSIONS = new Set(['webm', 'ogg', 'oga', 'mp3', 'm4a', 'mp4', 'wav', 'aac']);

/**
 * Is this a well-formed voice-note key inside the `audio` bucket?
 *
 * Shape only. Use it on READ, where the uploader may legitimately be the other
 * party in the conversation. It is what stops `voice-urls` from signing a track
 * master that reached `dm_messages.audio_url` before the write gate existed.
 */
export function isVoiceNotePath(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const segments = value.split('/');
  if (segments.length !== 3) return false;
  const [dir, owner, file] = segments;
  if (dir !== VOICE_DIR) return false;
  if (!UUID_RE.test(owner)) return false;
  const m = VOICE_FILE_RE.exec(file);
  if (!m) return false;
  return VOICE_EXTENSIONS.has(m[1].toLowerCase());
}

/**
 * Validate a caller-supplied voice-note value and return the canonical storage
 * key, or null when it is anything else.
 *
 * THIS IS THE TRUST BOUNDARY FOR SEC-009. It accepts only the bare path the
 * app's own recorder produces, `voice/<ownerId>/<file>`, and only when
 * `<ownerId>` is the authenticated sender.
 *
 * Two gates, and only two. `isVoiceNotePath` is the SHAPE gate, and the shape
 * is strict enough to be the whole story: exactly three segments, the literal
 * `voice` folder, a uuid, and a plain audio filename. That is what rules out an
 * absolute URL (many segments), traversal, a backslash path, a leading slash, a
 * percent escape and any key outside `voice/`, including a track master
 * (`<artistProfileId>/<epochMs>.<ext>`, two segments). Owner equality is the
 * TENANCY gate. Nothing else is needed, and an extra guard that the shape gate
 * already covers is untestable code that hides which line is doing the work.
 */
export function voiceNotePathForOwner(value: unknown, ownerId: string): string | null {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!isVoiceNotePath(candidate)) return null;
  const owner = candidate.split('/')[1];
  if (owner.toLowerCase() !== ownerId.toLowerCase()) return null;
  return candidate;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Reduce a STORED value to an object path inside the `audio` bucket.
 *
 * Accepts the legacy public URL the track uploaders still write (millions of
 * `tracks.audio_url_128` rows hold one, so refusing them here would silently
 * mute the whole catalog) or an already-bare path. The URL form must match
 * `PUBLIC_URL_RE` exactly: scheme, host, the public `audio` prefix, then the
 * key. A value that merely contains the prefix somewhere is not ours to sign.
 *
 * This is a NORMALIZER, not an authorization check. It cannot tell whose object
 * a key names, so a caller that accepts user input must validate ownership
 * first (`voiceNotePathForOwner` for DMs, `tracks_public` entitlement for
 * tracks). `getPublicUrl()` percent-encodes, `createSignedUrl()` wants the raw
 * key, so the path is decoded on the way through.
 */
export function storagePathFromAudioValue(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  // Control characters and backslashes never appear in a key this app wrote.
  if (value.includes('\\')) return null;
  if (Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;

  let path: string;
  if (value.includes('://')) {
    const m = PUBLIC_URL_RE.exec(value);
    // A full URL that isn't a public `audio` object is not ours to sign.
    if (!m) return null;
    path = m[1];
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

  if (!path || path.includes('..') || path.startsWith('/')) return null;
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
