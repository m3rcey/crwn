// The artist's no-sign-in scoreboard link.
//
// WHY A LINK AND NOT A LOGIN. The artist this was built for is older and not comfortable with
// technology. Signing in, finding a hidden Studio route, choosing the right tab and not
// touching the edit buttons mid-show is four ways to fail before seeing a single number. One
// link on his home screen, opening straight onto the standings, is zero.
//
// WHY THIS IS SAFE TO HAND OUT. The scoreboard shows AGGREGATE vote counts for the artist's
// own polls and nothing else: no names, no emails, no fan ids, no controls. Every fan already
// sees the live percentages the moment they vote (the ballot success screen), so the only
// thing this link adds is seeing them WITHOUT voting. It can open nothing, change nothing and
// enrol nobody.
//
// WHY IT IS A TOKEN AND NOT JUST THE SLUG. The public Lab page deliberately hides an open
// vote's tally until the reveal (GB's co-creation dynamic). A slug-only scoreboard would
// break that for every Song Lab artist. The token makes the scoreboard opt-in per artist:
// only someone signed in as that artist can ever see their link.
//
// WHY STATELESS. The token is an HMAC of the artist id, so it needs no table and no SQL for
// the founder to run before a show. The cost: it cannot be revoked for one artist alone. If
// a link ever leaks, bump SCOREBOARD_TOKEN_VERSION, which issues every artist a new link and
// kills every old one at once.

import { createHmac, timingSafeEqual } from 'crypto';

/** Bump to invalidate every scoreboard link ever issued. */
export const SCOREBOARD_TOKEN_VERSION = 'v1';

/** 32 hex characters = 128 bits: unguessable, and short enough to text to someone. */
const TOKEN_HEX_LENGTH = 32;
const TOKEN_RE = new RegExp(`^[0-9a-f]{${TOKEN_HEX_LENGTH}}$`);

/**
 * The token for one artist. Purpose-bound: the secret derives a subkey first, so this value
 * cannot be replayed against anything else keyed off the same secret.
 */
export function scoreboardToken(artistId: string, secret: string | undefined): string | null {
  if (!artistId || !secret) return null;
  const subkey = createHmac('sha256', secret)
    .update(`song-lab:scoreboard:${SCOREBOARD_TOKEN_VERSION}`)
    .digest();
  return createHmac('sha256', subkey).update(artistId).digest('hex').slice(0, TOKEN_HEX_LENGTH);
}

/**
 * Does this token open this artist's scoreboard? Constant-time, and fails closed on anything
 * missing or malformed, so a probe cannot learn a token byte by byte from response timing.
 */
export function verifyScoreboardToken(
  artistId: string,
  token: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) return false;
  const expected = scoreboardToken(artistId, secret);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The full link, as Studio shows it to the artist. */
export function scoreboardPath(artistSlug: string, token: string): string {
  return `/${artistSlug}/results/${token}`;
}
