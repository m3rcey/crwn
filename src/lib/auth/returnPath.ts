// returnPath.ts: keeping a fan's intent alive across the login/signup/verify hop.
//
// WHY THIS EXISTS (Astra activation audit, 2026-09-08). A signed-out supporter pressed Join Free
// on an artist page. `SubscribeSection` sent them to `/login?next=/<slug>`, which was correct.
// The login page's "Sign up" link was a bare `/signup`, so the destination died there. Signup
// then had no `next` to persist, `/verify` found no `pending_next`, and routed the brand new FAN
// into the ARTIST setup wizard, which asked "What do fans call you?" and demanded a stage name.
// The supporter had to abandon the wizard and find the artist again by hand to finish joining.
//
// The rail itself was already complete and is not changed: signup reads `?next`, `signUp` writes
// it to `user_metadata.pending_next` (server-side, never browser storage, so it survives the
// email hop), and `/verify` re-validates it before using it. Only the link was dropping it.
//
// ONE VALIDATOR, BOTH DIRECTIONS. Login builds the signup link and signup builds the login link,
// so the same rules apply either way and neither page hand-rolls its own check. Validation is
// `safeLabPath`, the client-safe twin of `safeInternalPath` (`src/lib/safeRedirect.ts` imports
// node:crypto and cannot ship in a client bundle). Relative CRWN paths only: a protocol-relative
// `//evil.example`, any scheme, a backslash variant and a control character are all refused, so
// this can never become an open redirect.

import { safeLabPath } from '@/lib/songLab/core';

/** The validated internal destination, or null. Re-exported so callers need one import. */
export function safeReturnPath(raw: unknown): string | null {
  return safeLabPath(raw);
}

/**
 * An auth route with the caller's return destination attached, when that destination is safe.
 * A refused or absent `next` yields the bare path, so the link always works.
 */
export function authPathWithNext(base: '/login' | '/signup', next: unknown): string {
  const safe = safeReturnPath(next);
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base;
}
