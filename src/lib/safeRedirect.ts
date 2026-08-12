// safeRedirect.ts: the ONE place CRWN decides whether a URL is safe to send a person to.
//
// WHY THIS EXISTS (SEC-016, cybersecurity audit 2026-08-12). Three email click-tracking routes
// did `NextResponse.redirect(searchParams.get('url'), 302)` with no validation at all, so
// `https://thecrwn.app/api/campaigns/track/<id>?url=https://evil.example` served
// attacker-chosen content from CRWN's own domain. That is phishing aimed at the exact artists
// CRWN emails, plus link laundering through a host their mail client already trusts. The same
// class reached the notification bell, whose anchor rendered whatever `link` an artist posted,
// `javascript:` included.
//
// THREE POLICIES, AND THE DIFFERENCE MATTERS
//
//   safeInternalPath      A relative CRWN path and nothing else. Use it when the destination is
//                         a screen inside the product (notification links, returnTo).
//   safeInternalRedirect  A relative path or an absolute URL on a CRWN origin, returned absolute.
//   resolveTrackedLink    The email click tracker only. Artists legitimately link OUT of CRWN
//                         (their Spotify, their store, their Instagram), so an origin allowlist
//                         here would break real campaigns. Evidence: `wrapLinks` in
//                         `src/lib/emails/campaignEmail.ts` wraps every `https?://` href, and
//                         `appendUtmParams` right above it short-circuits on
//                         `!url.includes('thecrwn.app')`, which only makes sense if non-CRWN
//                         destinations are expected. So this policy keeps http(s) working and
//                         removes the two properties that made it an attack: a hostile SCHEME,
//                         and a SILENT hop through a trusted domain. An unsigned external
//                         destination gets a CRWN-branded page that names where it goes; a
//                         destination CRWN itself signed, or one on CRWN, redirects straight
//                         through with no friction.
//
// WHY PARSE, THEN COMPARE THE PARSED ORIGIN. String matching a hostname is how allowlists get
// bypassed (`https://evil.com\@thecrwn.app/` reads as thecrwn.app to a human and as evil.com to
// the WHATWG parser, which turns backslashes into slashes for http(s)). Everything here parses
// first and compares `URL.origin`, so the value tested is the value the browser will act on.
//
// NEVER THROWS. A click tracker that 500s on a weird link is a broken email for a real person,
// so every entry point returns null or a safe fallback instead.

import { createHmac, timingSafeEqual } from 'crypto';

/** Nothing legitimate is this long, and a bounded input is a bounded parse. */
const MAX_URL_LENGTH = 2048;
/** Relative paths are shorter still; this matches the existing journey validator. */
const MAX_PATH_LENGTH = 512;
/** Only the scheme region needs the paranoid treatment, so only it is decoded. */
const MAX_SCHEME_PROBE = 64;

/** The only schemes a person may be redirected to. Everything else is refused, including any
 *  scheme invented after this was written. An allowlist cannot go stale the way a denylist does. */
const ALLOWED_SCHEMES = new Set(['http', 'https']);

/** Signing key: server-only, always set in production, never reaches a client. Same reasoning as
 *  `src/lib/acquisition/unsubscribe.ts`. HMAC is one-way, so using it here exposes nothing. */
const SIGNING_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build';

/** The canonical CRWN base URL. Read per call, not at module load, so a test can vary the env. */
export function crwnBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://thecrwn.app';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://thecrwn.app';
  }
}

/** Every origin that counts as "still on CRWN". */
export function crwnOrigins(): string[] {
  const origins = new Set<string>(['https://thecrwn.app', 'https://www.thecrwn.app']);
  for (const candidate of [process.env.NEXT_PUBLIC_BASE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin);
    } catch {
      /* a malformed env var must not widen the allowlist */
    }
  }
  return Array.from(origins);
}

/** Where a caller lands when the requested destination is refused. Never a 500, never a dead end. */
export function crwnFallbackUrl(): string {
  return `${crwnBaseUrl()}/`;
}

/**
 * Remove the characters a URL parser ignores but a naive scheme check does not: whitespace, C0
 * and C1 controls, the BOM, and the Unicode line separators. `java\nscript:` and ` javascript:`
 * are both live in a browser, so both must be dead here.
 */
function stripInvisible(value: string): string {
  // Escaped explicitly rather than written as literal characters: C0 controls and
  // space (00-20), DEL and C1 (7f-9f), the BOM (feff), and the Unicode line and
  // paragraph separators (2028/2029). A literal control character in source is
  // invisible to review, which is how a filter quietly stops filtering.
  return value.replace(/[\u0000-\u0020\u007f-\u009f\ufeff\u2028\u2029]/g, '');
}

/**
 * The part of the value that could carry a scheme: everything before the first path, query or
 * fragment delimiter. Bounding it here is what lets the decode below be strict without rejecting
 * a legitimate `%` inside a query string (a real store link like `?discount=50%` must survive).
 */
function schemeProbe(value: string): string {
  const cut = value.search(/[/?#]/);
  const head = cut === -1 ? value : value.slice(0, cut);
  return head.slice(0, MAX_SCHEME_PROBE);
}

/** The scheme of a candidate string, lowercased, or null when it carries none. */
function schemeOf(candidate: string): string | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.\-]*):/.exec(candidate);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Every form of the scheme region an attacker could be counting on the browser to normalize:
 * as written, with the invisible characters removed, and percent-decoded (repeatedly, because
 * `%2570` decodes to `%70` decodes to `p`).
 *
 * Returns null when the encoding is MALFORMED. A scheme region that cannot be decoded is never
 * a real link, and passing it through unexamined is exactly the hole this closes.
 */
function schemeVariants(value: string): string[] | null {
  const probe = schemeProbe(value);
  const variants = new Set<string>([probe, stripInvisible(probe)]);

  let current = probe;
  for (let round = 0; round < 4; round++) {
    if (!current.includes('%')) break;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return null; // malformed percent-encoding: refuse rather than guess
    }
    if (decoded === current) break;
    current = decoded;
    variants.add(current);
    variants.add(stripInvisible(current));
  }

  return Array.from(variants);
}

/** Shared front door: bounded, printable, and carrying no scheme outside the allowlist. */
function screen(raw: unknown): { value: string; scheme: string | null } | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;
  // A raw control character in a URL is always smuggling: a real one would be percent-encoded.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;

  const variants = schemeVariants(value);
  if (!variants) return null;

  let scheme: string | null = null;
  for (const variant of variants) {
    const found = schemeOf(variant);
    if (!found) continue;
    if (!ALLOWED_SCHEMES.has(found)) return null; // javascript:, data:, vbscript:, file:, ...
    scheme = found;
  }
  return { value, scheme };
}

/**
 * A safe RELATIVE CRWN path, or null.
 * Must start with a single `/`. Rejects protocol-relative `//evil.com`, the backslash variants
 * `/\evil.com` and `\\evil.com`, any scheme, and anything over-long.
 */
export function safeInternalPath(raw: unknown): string | null {
  const screened = screen(raw);
  if (!screened) return null;
  const { value } = screened;
  if (value.length > MAX_PATH_LENGTH) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  if (value.includes('\\')) return null;
  if (value.includes('://')) return null;
  return value;
}

/** Is this absolute URL on a CRWN origin? Compares the PARSED origin, never a substring. */
export function isCrwnUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  try {
    return crwnOrigins().includes(new URL(raw).origin);
  } catch {
    return false;
  }
}

/**
 * An absolute URL that is definitely still CRWN, or null. Accepts a relative path (resolved
 * against the CRWN base) or an absolute URL already on a CRWN origin.
 */
export function safeInternalRedirect(raw: unknown): string | null {
  const relative = safeInternalPath(raw);
  if (relative) {
    try {
      const resolved = new URL(relative, crwnBaseUrl());
      return crwnOrigins().includes(resolved.origin) ? resolved.href : null;
    } catch {
      return null;
    }
  }

  const screened = screen(raw);
  if (!screened || !screened.scheme) return null;
  try {
    const parsed = new URL(screened.value);
    if (!ALLOWED_SCHEMES.has(parsed.protocol.replace(':', ''))) return null;
    if (!parsed.hostname) return null;
    return crwnOrigins().includes(parsed.origin) ? parsed.href : null;
  } catch {
    return null;
  }
}

/**
 * An absolute http(s) URL on ANY host, with hostile schemes and encoding tricks refused, or null.
 * Only the email click tracker may use this, and only through `resolveTrackedLink`.
 */
export function safeExternalRedirect(raw: unknown): string | null {
  const internal = safeInternalRedirect(raw);
  if (internal) return internal;

  const screened = screen(raw);
  if (!screened || !screened.scheme) return null;
  try {
    const parsed = new URL(screened.value);
    if (!ALLOWED_SCHEMES.has(parsed.protocol.replace(':', ''))) return null;
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Signed destinations
// ---------------------------------------------------------------------------
//
// A tracking link CRWN built itself can be proven, which is what removes the last of the open
// redirect. The sender signs the destination it is wrapping; the tracker verifies and hops
// straight through. An attacker cannot produce the signature, so their link always lands on the
// interstitial that names where it really goes.

/** HMAC over the exact destination string the sender wrapped. */
export function signRedirectTarget(url: string): string {
  return createHmac('sha256', SIGNING_SECRET).update(String(url)).digest('hex');
}

/** Constant-time check. A wrong-length signature is simply invalid, never an exception. */
export function verifyRedirectTarget(url: string, signature: unknown): boolean {
  if (typeof signature !== 'string' || !signature) return false;
  try {
    const expected = Buffer.from(signRedirectTarget(url), 'hex');
    const given = Buffer.from(signature, 'hex');
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

export type TrackedLinkAction = 'redirect' | 'confirm' | 'fallback';

export interface TrackedLink {
  /** redirect: hop straight through. confirm: show the leaving page. fallback: nothing usable. */
  action: TrackedLinkAction;
  /** Always an absolute, already-validated URL. Safe to put in a Location header or an href. */
  url: string;
}

/**
 * The email click tracker's decision, in one place for all three tracking routes.
 *
 * - refused (hostile scheme, encoding trick, protocol-relative, unparseable) -> CRWN homepage
 * - a CRWN destination, or one CRWN signed -> straight through, no friction
 * - any other http(s) destination -> the leaving page, which names the real host
 */
export function resolveTrackedLink(raw: unknown, signature?: unknown): TrackedLink {
  const target = safeExternalRedirect(raw);
  if (!target) return { action: 'fallback', url: crwnFallbackUrl() };
  if (isCrwnUrl(target)) return { action: 'redirect', url: target };
  // Verify against the value as it arrived: that is what the sender signed.
  if (typeof raw === 'string' && verifyRedirectTarget(raw.trim(), signature)) {
    return { action: 'redirect', url: target };
  }
  return { action: 'confirm', url: target };
}

/** Minimal HTML escape for anything attacker-influenced that lands in the leaving page. */
export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The leaving page. It exists to break the one property that made the open redirect worth
 * attacking: a link that reads as thecrwn.app and silently becomes somebody else's site. Naming
 * the destination, on a CRWN-branded page, costs a real recipient one click and costs a phisher
 * the whole trick.
 */
export function leavingCrwnPage(destination: string): string {
  let host = '';
  try {
    host = new URL(destination).host;
  } catch {
    host = '';
  }
  const safeHref = escapeHtml(destination);
  const safeHost = escapeHtml(host);
  const shown = escapeHtml(destination.length > 120 ? `${destination.slice(0, 117)}...` : destination);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <meta name="referrer" content="no-referrer">
  <title>Leaving CRWN</title>
</head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;max-width:440px;">
    <h1 style="color:#D4AF37;font-size:32px;margin:0 0 24px;">CRWN</h1>
    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <p style="color:#FFFFFF;font-size:16px;line-height:1.6;margin:0 0 8px;">You are leaving CRWN.</p>
      <p style="color:#A0A0A0;font-size:14px;line-height:1.6;margin:0 0 20px;">This link goes to <strong style="color:#FFFFFF;">${safeHost}</strong>. Only continue if you recognize it.</p>
      <p style="color:#666;font-size:12px;word-break:break-all;margin:0 0 24px;">${shown}</p>
      <a href="${safeHref}" rel="noopener noreferrer nofollow" style="display:inline-block;background-color:#D4AF37;color:#0D0D0D;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:999px;">Continue</a>
    </div>
    <p style="color:#666;font-size:12px;margin:24px 0 0;">
      <a href="${escapeHtml(crwnFallbackUrl())}" style="color:#D4AF37;text-decoration:none;">Back to CRWN</a>
    </p>
  </div>
</body>
</html>`;
}
