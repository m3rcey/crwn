// Live-show capture: the rules for turning "first name + email" into a counted vote
// WITHOUT proving inbox ownership first, and without ever handing out a session.
//
// THE BOUNDARY THIS FILE EXISTS TO KEEP.
//
// CRWN has two different things that are easy to blur:
//
//   CAPTURED CONTACT  an email somebody typed. It can own a free membership and one
//                     advisory vote, because neither is sensitive and neither can be
//                     used to reach anything private. It carries NO session, so it can
//                     do nothing else at all.
//   VERIFIED OWNER    somebody who proved they control the inbox. Only they can sign in,
//                     and only a signed-in account can reach anything sensitive.
//
// The important observation is that CRWN ALREADY creates the first thing: with email
// confirmation on, `supabase.auth.signUp` writes an unconfirmed auth user the instant the
// form is submitted, and returns no session. So a captured contact is not a new identity
// class invented for this feature; it is the row signup already made. All this flow
// changes is that the vote and the free membership are now recorded against it, server
// side, at the moment of the tap, instead of being abandoned unless the fan goes to their
// email. `email_confirmed_at` stays NULL, which is the honest state: we never claim they
// verified anything.
//
// WHAT IS DELIBERATELY REFUSED: an email that already belongs to a CONFIRMED account is
// a real person's identity, and acting as them on an unproven claim would let anyone cast
// votes and join memberships in someone else's name. That case writes nothing and is
// routed to sign-in instead. See `identityDecision`.

/** Lowercased, trimmed. Emails are matched case-insensitively, as every provider treats them. */
export function normalizeEmail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

/** First name as stored on the profile. Length-capped, whitespace collapsed. */
export function cleanFirstName(raw: unknown, max = 60): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, ' ').slice(0, max);
}

export type IdentityState =
  /** No account for this email. Create a captured contact and count the vote. */
  | { kind: 'create' }
  /** An unconfirmed capture account already exists (e.g. the same fan at the second set).
   *  Reuse it: it represents exactly the same unproven claim, so nothing is escalated. */
  | { kind: 'reuse'; userId: string }
  /** A CONFIRMED account owns this email. Write nothing; send them to sign in. */
  | { kind: 'needs_sign_in' };

export interface ExistingUserRow {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

/**
 * Decide what to do about the submitted email.
 *
 * `candidates` comes from the admin user search, which is a SEARCH and can return near
 * matches, so the exact address is re-matched here. A partial match must never be treated
 * as "this account exists", or one fan could be silently voted as another.
 */
export function identityDecision(email: string, candidates: ExistingUserRow[]): IdentityState {
  const wanted = normalizeEmail(email);
  if (!wanted) return { kind: 'needs_sign_in' }; // caller validates first; fail safe anyway

  const exact = (candidates || []).find((u) => normalizeEmail(u.email) === wanted);
  if (!exact) return { kind: 'create' };

  const verified = !!(exact.email_confirmed_at || exact.confirmed_at);
  return verified ? { kind: 'needs_sign_in' } : { kind: 'reuse', userId: exact.id };
}

/**
 * What the fan is told when their email already belongs to a real account. It must not
 * say whether that account is an artist, an admin or a fan, and it must not pretend the
 * vote was counted.
 */
export const NEEDS_SIGN_IN_MESSAGE =
  'That email already has a CRWN account. Sign in and your vote goes straight in.';

/** The subordinate line under a successful vote. Truthful about what was and was not done. */
export function accountEmailNote(sent: boolean): string {
  return sent
    ? 'We also emailed you a link, so you can get into your free account whenever you like.'
    : '';
}
