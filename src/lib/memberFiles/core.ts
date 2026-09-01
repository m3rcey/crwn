// Member files: downloadable bundles an artist gives to a membership rung.
//
// Pure logic only, so the entitlement rule can be tested without a database. The routes
// are thin wrappers over these functions and hold no authority of their own.
//
// THE RULE IS THE PLATFORM'S ONE ENTITLEMENT VOCABULARY, unchanged: exact membership of
// the fan's single active tier in the bundle's allowed list. No inheritance is introduced
// here, because there is none anywhere in CRWN by deliberate design; cumulative lists are
// produced at WRITE time by expandFromTier, so "Silver and above" was already stored as
// Silver + Gold + Platinum before it ever reached this check.
//
// An EMPTY allow list means NOBODY, never everybody. That asymmetry is the whole safety
// property of a gate: reading an empty list as "no restriction" is how paid material leaks.

export interface MemberFileEntry {
  /** PRIVATE R2 object key. Never a URL, and never returned to a browser. */
  key: string;
  name: string;
  size?: number;
  type?: string;
}

export interface MemberFileBundleCore {
  allowed_tier_ids: unknown;
  is_active: boolean;
}

export type FileDenial = 'inactive' | 'not_entitled';

/**
 * May this fan download from this bundle? `fanTierId` is the fan's ACTIVE tier for the
 * OWNING artist, resolved server-side; it is never accepted from a request.
 */
export function checkFileAccess(
  bundle: MemberFileBundleCore,
  fanTierId: string | null,
): { ok: true } | { ok: false; reason: FileDenial } {
  if (!bundle.is_active) return { ok: false, reason: 'inactive' };
  const allowed = Array.isArray(bundle.allowed_tier_ids)
    ? bundle.allowed_tier_ids.filter((x): x is string => typeof x === 'string')
    : [];
  if (!fanTierId || !allowed.includes(fanTierId)) return { ok: false, reason: 'not_entitled' };
  return { ok: true };
}

export const MAX_FILES_PER_BUNDLE = 12;
export const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200MB per file: a WAV stem is large.
export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 600;

/**
 * Validate an artist-supplied file list into the stored shape.
 *
 * Keys are NOT accepted blindly: a caller could otherwise name any object in the bucket,
 * including another artist's audio, and have it served under their own bundle. The caller
 * passes the prefix this artist is allowed to write under, and every key must sit inside
 * it. Returns null when the list cannot make a legal bundle.
 */
export function normalizeFiles(raw: unknown, requiredPrefix: string): MemberFileEntry[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0 || raw.length > MAX_FILES_PER_BUNDLE) return null;

  const out: MemberFileEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === 'string' ? f.key : '';
    const name = typeof f.name === 'string' ? f.name.trim() : '';
    if (!key || !name) return null;
    // Path containment. `..` can never appear because the key is compared against a fixed
    // prefix AND rejected outright, so no traversal can climb out of the artist's folder.
    if (!key.startsWith(requiredPrefix) || key.includes('..')) return null;
    if (name.length > 200) return null;
    out.push({
      key,
      name,
      ...(typeof f.size === 'number' && f.size >= 0 ? { size: f.size } : {}),
      ...(typeof f.type === 'string' && f.type ? { type: f.type.slice(0, 120) } : {}),
    });
  }
  return out;
}

/** The prefix every one of an artist's member-file objects must live under. */
export function memberFilePrefix(artistId: string): string {
  return `member-files/${artistId}/`;
}

/**
 * What a fan is told about a bundle they cannot open yet. Names the rung rather than
 * saying "locked", because a benefit the fan cannot identify is not a benefit.
 */
export function lockedLabel(tierNames: string[]): string {
  if (!tierNames.length) return 'Members only';
  if (tierNames.length === 1) return `${tierNames[0]} members`;
  return `${tierNames[0]} and above`;
}
