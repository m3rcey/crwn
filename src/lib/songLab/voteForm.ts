// The vote-first ballot form: pure rules for the public live-show landing.
//
// WHY THIS EXISTS. A `vote` lead magnet is scanned off a QR code in a live room. The
// attendee was asked from the stage to vote, so the vote is the action and the free
// membership is the relationship created underneath it. That inverts the old landing,
// which asked them to "Join free" BEFORE showing the songs. Everything here is pure so
// the venue-critical rules (what is required, what the button says, what the disclosure
// promises) are tested in node instead of being trapped in a component.
//
// Everything this module decides is COSMETIC or VALIDATION-ONLY. Authorization,
// eligibility and the actual vote are re-derived server-side by /api/song-lab/claim
// through checkVote, exactly as /api/song-lab/vote does. A client that lies here gets
// a refusal there.

/** The one primary action label in ballot mode. The artist's cta_label is deliberately
 *  NOT used here: the button performs a vote, and "Join free" / "Continue" / "Subscribe"
 *  would misdescribe the action the attendee believes they are taking. */
export const BALLOT_CTA_LABEL = 'Cast my vote';

/** Names the CTA may never take in ballot mode, asserted by test so a later edit that
 *  reintroduces signup language fails the suite instead of reaching a venue. */
export const FORBIDDEN_BALLOT_CTA = ['join free', 'sign up', 'create account', 'continue', 'subscribe'];

export const MAX_FIRST_NAME_LENGTH = 60;
export const MAX_EMAIL_LENGTH = 254;

/** Deliberately permissive: this is a typo guard for someone standing in a dark room,
 *  not an RFC validator. The authoritative check is the auth service refusing the address. */
export function isPlausibleEmail(raw: string): boolean {
  const s = raw.trim();
  if (!s || s.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(s)) return false;
  const at = s.indexOf('@');
  if (at <= 0 || at !== s.lastIndexOf('@')) return false;
  const domain = s.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

export function cleanFirstName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_FIRST_NAME_LENGTH);
}

export interface BallotSubmission {
  /** The option id the fan tapped, or null if they have not chosen yet. */
  selectedOptionId: string | null;
  /** Whether CRWN already knows who this is. A signed-in fan is never asked again. */
  signedIn: boolean;
  firstName: string;
  email: string;
}

export type BallotField = 'option' | 'firstName' | 'email';

export interface BallotRejection {
  field: BallotField;
  /** Plain English for an attendee. No CRWN vocabulary, no error codes. */
  message: string;
}

/**
 * Can this submission be sent? Order matters: the song comes first, because that is the
 * field the attendee believes they are filling in.
 */
export function validateBallotSubmission(input: BallotSubmission): BallotRejection | null {
  if (!input.selectedOptionId) {
    return { field: 'option', message: 'Choose a song first.' };
  }
  if (input.signedIn) return null;
  if (cleanFirstName(input.firstName).length < 1) {
    return { field: 'firstName', message: 'Enter your first name.' };
  }
  if (!isPlausibleEmail(input.email)) {
    return { field: 'email', message: 'Enter a valid email.' };
  }
  return null;
}

/** Does the landing need to ask who this is? Only when nobody is signed in. */
export function needsIdentity(signedIn: boolean): boolean {
  return !signedIn;
}

/**
 * The membership disclosure rendered directly under the button. It must say three things
 * an attendee can act on: voting also joins, it is free, and no card is involved. It
 * promises only what CRWN can actually deliver for a free member (the artist can email
 * them the result and news about shows); it deliberately does not promise member-only
 * content, which exists only if that artist uploads some. No em dash (copy rule).
 */
export function ballotDisclosure(artistName: string): string {
  const who = artistName.trim() || 'this artist';
  return `By casting your vote, you also join ${who}'s free fan community, so ${who} can send you the result and news about upcoming shows. Free. No card, ever.`;
}

/** What the fan is told while the request is in flight (also the disabled-button label). */
export const BALLOT_SUBMITTING_LABEL = 'One moment...';

/** The recoverable network failure message. The chosen song is never cleared for this. */
export const BALLOT_NETWORK_ERROR = 'We could not submit your vote. Try again.';

/** Shown when the artist closed the vote between page load and submit. */
export const BALLOT_CLOSED_ERROR = 'Voting has closed.';

/**
 * Map a claim-route refusal onto attendee-readable copy. `reason` is the machine code the
 * route already returns for vote denials; anything unrecognized falls back to the generic
 * retry line rather than leaking a server string onto a phone screen.
 */
export function ballotErrorFor(reason: string | null | undefined, serverMessage?: string | null): string {
  if (reason === 'not_open') return BALLOT_CLOSED_ERROR;
  if (reason === 'invalid_option') return 'That song is no longer on the list. Pick another.';
  if (serverMessage && serverMessage.length <= 140) return serverMessage;
  return BALLOT_NETWORK_ERROR;
}
