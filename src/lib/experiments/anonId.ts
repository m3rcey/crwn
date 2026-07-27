// Durable anonymous id for experiment assignment + journey stitching.
//
// A stable, non-PII random id that persists across the pre-signup journey (calculator -> result ->
// draft -> signup) so a visitor keeps ONE variant and their anonymous stages can be linked to the
// authenticated user later (the id rides on events; joining by it reconstructs the journey). It is
// NOT a fingerprint and carries no personal data. Stored in localStorage AND a first-party cookie so
// it survives a refresh and a same-site auth redirect.

const KEY = 'crwn_aid';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  // Non-crypto fallback: this id is a bucketing key, not a secret.
  return `a-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** Get (or create) the durable anonymous id. Client-only; returns '' on the server. */
export function getAnonId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(KEY) || readCookie(KEY);
    if (!id) id = randomId();
    localStorage.setItem(KEY, id);
    // SameSite=Lax so it survives the same-site signup redirect; not HttpOnly (the client reads it).
    document.cookie = `${KEY}=${encodeURIComponent(id)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    return id;
  } catch {
    return '';
  }
}

// Best-effort exclusion of automated traffic from experiment exposure. Deliberately conservative:
// it only flags obvious automation, so it never silently drops real artists.
export function isLikelyBot(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    if ((navigator as unknown as { webdriver?: boolean }).webdriver) return true;
    return /bot|crawler|spider|crawling|headless|lighthouse|prerender/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}
