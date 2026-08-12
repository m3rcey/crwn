// ============================================================================
// SEC-MED: notification link safety + check-limit enumeration
// ============================================================================
// The two MEDIUM findings from docs/CYBERSECURITY_AUDIT_2026-08-12.md that this
// suite guards:
//
//   1. /api/notifications/notify-subscribers took `type`, `title`, `message` and
//      `link` from the request body with no allowlist and no bounds, and wrote
//      them into every subscriber's feed. NotificationBell rendered
//      `href={notification.link}` through next/link, so a `javascript:` value
//      became a live anchor executing in CRWN's origin, against cookies that are
//      httpOnly:false with no script-src CSP to contain it.
//
//   2. /api/tiers/check-limit and /api/tracks/check-limit took a body `artistId`
//      with ZERO authentication and answered with that artist's platform plan and
//      catalog size, read through a service-role client that bypasses RLS.
//
// Two kinds of assertion, on purpose. The link RULE is tested directly against
// `safeInternalPath`, which is the actual validator both sides now use, so the
// hostile payloads are executed rather than pattern-matched. The WIRING (that the
// route and the component call it at all) is a source scan, because a static check
// is the only thing that can prove a call site still exists.
//
// Every assertion here carries a positive control and every one was mutation
// tested: the violation was introduced, this suite was watched to fail with the
// intended message, and the violation was reverted. An assertion nobody has
// watched fail is not protection.
//
// NOTE ON THE PAYLOADS BELOW: hostile control characters are written as \u escapes,
// never as literal bytes. A literal control character in a test file is invisible to
// review, and a reviewer who cannot see the payload cannot tell a real check from a
// decorative one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { safeInternalPath } from './safeRedirect';

const ROUTE = 'src/app/api/notifications/notify-subscribers/route.ts';
const BELL = 'src/components/notifications/NotificationBell.tsx';
const TIERS_LIMIT = 'src/app/api/tiers/check-limit/route.ts';
const TRACKS_LIMIT = 'src/app/api/tracks/check-limit/route.ts';

const read = (p: string) => readFileSync(p, 'utf8');
/** Same comment-stripping idiom as sourceScan.ts; the [^:] guard keeps 'https://' alive. */
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const readStripped = (p: string) => strip(read(p));

// ---------------------------------------------------------------------------
// 1. The rule itself
// ---------------------------------------------------------------------------
describe('SEC-MED: a notification link is a relative CRWN path or it is refused', () => {
  // Positive control. If these stopped being accepted the validator would be
  // rejecting everything, and every rejection assertion below would pass
  // vacuously while the notification bell quietly lost all its links.
  it('accepts the links the two real callers actually send (positive control)', () => {
    // src/components/artist/TrackUploadForm.tsx
    expect(safeInternalPath('/artist/m3rcey')).toBe('/artist/m3rcey');
    // src/components/artist/LivestreamManager.tsx
    expect(safeInternalPath('/m3rcey/live/8f1c2f1e-0000-4000-8000-000000000000')).toBe(
      '/m3rcey/live/8f1c2f1e-0000-4000-8000-000000000000',
    );
    // Query strings and fragments are ordinary product links.
    expect(safeInternalPath('/studio/music?tab=uploads#new')).toBe('/studio/music?tab=uploads#new');
  });

  it('refuses every scheme-bearing form of the XSS payload', () => {
    const hostile = [
      'java\u000ascript:alert(1)',
      'java\u000dscript:alert(1)',
      'java\u0009script:alert(1)',
      'java script:alert(1)',
      // Percent-encoded, including the double encoding that decodes twice.
      '%6a%61%76%61%73%63%72%69%70%74:alert(1)',
      '%256a%2561%2576%2561script:alert(1)',
      // Malformed percent-encoding must be refused, not guessed at.
      '%zzjavascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ];
    for (const value of hostile) {
      expect(safeInternalPath(value), `safeInternalPath accepted ${JSON.stringify(value)}`).toBeNull();
    }
  });

  it('refuses protocol-relative, backslash and absolute-origin escapes', () => {
    const hostile = [
      '//evil.example/phish',
      '/\\evil.example/phish',
      '\\\\evil.example\\phish',
      'https://evil.example/phish',
      // Reads as thecrwn.app to a person, evil.example to a URL parser.
      'https://evil.example\\@thecrwn.app/',
      'https://thecrwn.app.evil.example/',
      // Even a genuine CRWN absolute URL is refused by THIS policy: a notification
      // link is a relative path, and keeping the strictest policy strict is what
      // stops the next caller reaching for safeExternalRedirect instead.
      'https://thecrwn.app/studio',
      'artist/m3rcey',
      '',
      '   ',
    ];
    for (const value of hostile) {
      expect(safeInternalPath(value), `safeInternalPath accepted ${JSON.stringify(value)}`).toBeNull();
    }
  });

  it('refuses non-strings and anything unbounded', () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      expect(safeInternalPath(value)).toBeNull();
    }
    expect(safeInternalPath(`/${'a'.repeat(4096)}`)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. The write side is wired to that rule
// ---------------------------------------------------------------------------
describe('SEC-MED: notify-subscribers validates everything it writes', () => {
  it('found the route (positive control)', () => {
    expect(readStripped(ROUTE).length).toBeGreaterThan(500);
  });

  it('validates `link` through the canonical validator', () => {
    const src = readStripped(ROUTE);
    expect(
      /from '@\/lib\/safeRedirect'/.test(src) && /safeInternalPath\(\s*link\s*\)/.test(src),
      "notify-subscribers no longer runs the body `link` through safeInternalPath. This route writes into every subscriber's feed and NotificationBell renders the value as an href, so an unvalidated link is a javascript: URI executing in CRWN's origin. Validate with src/lib/safeRedirect.ts, never with a local scheme check.",
    ).toBe(true);
  });

  it('writes only the validated values, never the raw body fields', () => {
    const src = readStripped(ROUTE);
    // The original bug shape: shorthand `type, title, message, link` spread
    // straight from the destructured body into the insert.
    expect(
      /title:\s*safeTitle/.test(src) && /message:\s*safeMessage/.test(src) && /link:\s*safeLink/.test(src),
      'the notifications insert no longer uses the validated title/message/link values. Validating a value and then inserting the raw one is the same bug with extra steps.',
    ).toBe(true);
  });

  it('allowlists `type` from the notification taxonomy and bounds the text', () => {
    const src = readStripped(ROUTE);
    expect(
      /NOTIFICATION_TAXONOMY/.test(src) && /FAN_NOTIFICATION_TYPES\.has\(\s*type\s*\)/.test(src),
      "`type` is no longer allowlisted against src/lib/comms/taxonomy.ts. An arbitrary type lets an artist mint a money-shaped notification (the bell renders a dollar icon for `earning`) in a fan's feed, which is a free credibility upgrade for a phishing message.",
    ).toBe(true);
    expect(
      /MAX_TITLE/.test(src) && /MAX_MESSAGE/.test(src),
      'the title/message length bounds are gone. These fields render into a one-line feed row, so an unbounded value is layout abuse aimed at a fan.',
    ).toBe(true);
  });

  it('every type it accepts is fan-audience, and no artist money type is reachable', async () => {
    const { NOTIFICATION_TAXONOMY } = await import('./comms/taxonomy');
    const fanTypes = Object.entries(NOTIFICATION_TAXONOMY)
      .filter(([, c]) => c.audience === 'fan')
      .map(([t]) => t);
    // Positive control: the derived allowlist is not empty, and it contains the
    // two types the real callers send.
    expect(fanTypes.length).toBeGreaterThan(5);
    expect(fanTypes).toContain('new_track');
    expect(fanTypes).toContain('live_session');
    for (const artistMoneyType of ['earning', 'cashout', 'team_split_payout', 'new_purchase']) {
      expect(
        fanTypes,
        `${artistMoneyType} is now classified fan-audience, so notify-subscribers would accept it. Artist money types render a money icon in the bell and have no business in a fan feed.`,
      ).not.toContain(artistMoneyType);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The render side cannot be poisoned by a legacy row
// ---------------------------------------------------------------------------
describe('SEC-MED: NotificationBell never renders a stored link as a raw href', () => {
  it('found the component (positive control)', () => {
    expect(readStripped(BELL).length).toBeGreaterThan(500);
  });

  it('the anchor href goes through the render-side guard', () => {
    const src = readStripped(BELL);
    expect(
      /href=\{safeNotificationHref\(/.test(src),
      "NotificationBell's href no longer goes through safeNotificationHref. Rows written before the route was validated are still in the table, and `notifications` has had an anonymous INSERT hole (SEC-004), so the stored value must be treated as hostile at render time.",
    ).toBe(true);
    expect(
      /href=\{\s*notification\.link/.test(src),
      'NotificationBell renders notification.link directly into an href again. next/link puts the raw value on the anchor, so a stored javascript: URI runs in CRWN\'s origin.',
    ).toBe(false);
  });

  it('the guard refuses the same shapes safeInternalPath refuses', () => {
    // RAW, not stripped: the comment stripper's line-comment rule eats
    // `value.startsWith('//')` because the slashes sit inside a string literal.
    // Slicing from the function keyword excludes the JSDoc above it, so no prose
    // can satisfy these patterns.
    const src = read(BELL);
    const guard = src.slice(src.indexOf('function safeNotificationHref'));
    expect(guard.length, 'positive control: guard body located').toBeGreaterThan(200);
    const required: Array<[RegExp, string]> = [
      [/value\.startsWith\('\/'\)/, 'a leading single slash (refuses any scheme and any bare host)'],
      [/value\.startsWith\('\/\/'\)/, 'protocol-relative //evil.example'],
      [/value\.includes\('\\\\'\)/, 'backslash host confusion'],
      [/value\.includes\(':\/\/'\)/, 'an embedded scheme'],
      [/\\u0000-\\u001f/, 'control characters, which is how a split javascript: scheme survives a naive check'],
    ];
    for (const [pattern, what] of required) {
      expect(
        pattern.test(guard),
        `safeNotificationHref no longer refuses ${what}. It is the render-side backstop for legacy rows and must keep the same shape as safeInternalPath.`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. check-limit enumeration
// ---------------------------------------------------------------------------
describe('SEC-MED: the check-limit routes prove ownership before answering', () => {
  it('found both routes (positive control)', () => {
    expect(readStripped(TIERS_LIMIT).length).toBeGreaterThan(300);
    expect(readStripped(TRACKS_LIMIT).length).toBeGreaterThan(300);
  });

  for (const [name, path] of [
    ['tiers/check-limit', TIERS_LIMIT],
    ['tracks/check-limit', TRACKS_LIMIT],
  ] as const) {
    it(`${name} calls requireArtistOwner on the body artistId`, () => {
      const src = readStripped(path);
      expect(
        /from '@\/lib\/apiAuth'/.test(src) && /requireArtistOwner\(\s*artistId\s*\)/.test(src),
        `${name} answers with an artist's platform plan and catalog size. It reads through a service-role client (RLS bypassed) and middleware skips /api/, so this route IS the authorization boundary. Prove ownership with requireArtistOwner (src/lib/apiAuth.ts), the same helper every sibling limit surface uses.`,
      ).toBe(true);
      // The ownership result must be enforced, not merely computed.
      expect(
        /if\s*\(\s*!owner\.ok\s*\)\s*return owner\.error/.test(src),
        `${name} calls requireArtistOwner but does not return its error response, so the check computes a verdict and then ignores it.`,
      ).toBe(true);
      // And it must run BEFORE the read it protects. Both needles carry the open
      // paren so they match the CALL SITE, not the import line.
      expect(
        src.indexOf('requireArtistOwner('),
        `${name} calls checkArtistLimit before requireArtistOwner, so the data is read before the caller is authorized.`,
      ).toBeLessThan(src.indexOf('checkArtistLimit('));
    });
  }
});
