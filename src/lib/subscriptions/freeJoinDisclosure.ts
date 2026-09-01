// What a fan is told when claiming something ALSO joins an artist's free membership.
//
// The claim surfaces already said this in prose, but prose in a component is uncontracted:
// a future edit could quietly remove the one sentence that makes the free join informed
// rather than silent. This is the shared home, and its test pins the elements that must
// never disappear: what they get, that they are joining the artist's free membership,
// that the artist may email them, and that they can unsubscribe.
//
// Product language on purpose. A fan is joining a musician's list, not accepting terms.
// (Song Lab's ballot keeps its own tested wording in voteForm.ts, tuned for a live room;
// its test pins the same elements.)

export function freeJoinDisclosure(deliverable: string, artistName: string): string {
  const what = deliverable.trim() || 'the drop';
  const who = artistName.trim() || 'this artist';
  return `You get ${what} plus a free spot on ${who}'s members list, with early word on new drops by email. Unsubscribe anytime.`;
}

/**
 * The semantic elements every free-join disclosure must carry, whatever its wording.
 * Tests match these against each surface's builder so copy can evolve without losing
 * the substance.
 */
export const DISCLOSURE_MUST_CONVEY = ['free', 'email', 'unsubscribe'] as const;
