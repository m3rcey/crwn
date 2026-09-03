// Fan recognition: the ONE definition of what status a fan carries with an artist.
//
// WHY THIS EXISTS. Recognition was promised on two rungs and visible in exactly one place
// (live chat). Badge rows were read only by two artist-facing routes, and the comment
// badge was drawn from a browser query against `subscriptions`, whose row-level security
// returns only the viewer's OWN row — so every fan saw a badge beside their own name and
// nobody else's. A status only its owner can see is not recognition.
//
// TWO STATUSES, AND THEY BEHAVE DIFFERENTLY ON PURPOSE.
//
//   Day One   EARNED and PERMANENT. Derived from subscriptions.is_founder, which the
//             founder window already sets once and never clears ("permanently marked
//             is_founder" — schema-phase2-founder-window.sql). It survives cancellation,
//             because "I was here early" does not stop being true when someone's card
//             expires. Reusing that flag rather than inventing a second notion of early.
//
//   Tier      CURRENT and CONDITIONAL. It is a statement about a live membership, so it
//             ends when the membership does. Inventing permanent Platinum status would
//             mean a fan who cancelled still outranking one who pays.
//
// WHAT THIS IS NOT. A label here is community thanks. It never asserts songwriting,
// production, publishing, master ownership, royalties, revenue participation, approval
// rights, creative control, or any Team Split entitlement. The label is the artist's own
// tier name, not an industry role, precisely so it cannot be read as a credit.

export interface RecognitionInput {
  /** subscriptions.is_founder — set once by the founder window, never cleared. */
  isFounder: boolean;
  /** 'active' | 'canceled' | 'never' for THIS artist. */
  subscriptionStatus: string | null;
  /** The artist's own name for the rung. Null when there is no live membership. */
  tierName: string | null;
  /** True when this rung is the artist's highest-priced active tier. */
  isTopTier: boolean;
}

export interface Recognition {
  /** Earned, permanent. Shown even after a cancellation. */
  dayOne: boolean;
  /** The live rung's name, or null. Disappears the moment a membership lapses. */
  tierLabel: string | null;
  /** The top rung specifically, for surfaces that highlight only the highest status. */
  isTopTier: boolean;
  /** Nothing to show at all — lets a caller skip rendering entirely. */
  isEmpty: boolean;
}

export const EMPTY_RECOGNITION: Recognition = {
  dayOne: false,
  tierLabel: null,
  isTopTier: false,
  isEmpty: true,
};

export function deriveRecognition(input: RecognitionInput): Recognition {
  const active = input.subscriptionStatus === 'active';
  // A tier label states a CURRENT fact. No live membership, no label — regardless of what
  // the fan once held.
  const tierLabel = active && input.tierName ? input.tierName : null;
  const dayOne = !!input.isFounder;
  const isTopTier = active && input.isTopTier;

  return {
    dayOne,
    tierLabel,
    isTopTier,
    isEmpty: !dayOne && !tierLabel,
  };
}

/**
 * The single short string a compact surface shows when it has room for one thing.
 * The live rung wins over Day One: what someone is paying for now is the more useful
 * signal to the artist and to the room, and Day One is additive beside it where space
 * allows.
 */
export function primaryLabel(r: Recognition): string | null {
  if (r.tierLabel) return r.tierLabel;
  if (r.dayOne) return 'Day One';
  return null;
}

/** Every label a roomy surface can show, most significant first. */
export function allLabels(r: Recognition): string[] {
  const out: string[] = [];
  if (r.tierLabel) out.push(r.tierLabel);
  if (r.dayOne) out.push('Day One');
  return out;
}

/**
 * "Member since August 2026", from the fan's OWN subscription row (created_at). Self-visible
 * recognition (founder decision D1, 2026-09-03): the truthful join fact CRWN already holds,
 * shown to the member and to nobody else. Null for a missing or unparseable date, so a
 * surface can skip the line rather than print "Member since Invalid Date".
 */
export function memberSinceLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
