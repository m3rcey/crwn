// Cumulative tier access: "this rung and everyone above it".
//
// THE PROBLEM THIS SOLVES. CRWN's entitlement gate matches a fan's tier EXACTLY against a
// piece of content's allowed_tier_ids (hasTierAccess, and can_play_track in the database).
// There is no inheritance, and there must not be: that oracle is ratified, every playback
// path reads it, and re-deriving entitlement anywhere else is how paid audio leaked once
// already.
//
// But every real ladder is cumulative. An artist writing "Silver, includes Bronze plus..."
// means a Gold member sees the Silver post too. Ticking only Silver produces the worst
// possible outcome: the fan paying the MOST silently gets the LEAST, with no error, no log
// and nothing on screen, until they complain.
//
// So the expansion happens at WRITE time. When the artist picks "Silver and above", the
// saved allowed_tier_ids is [silver, gold, platinum]. The gate never changes, never learns
// about ladders, and keeps answering the one question it already answers correctly. This
// is the same shape as the release waterfall: the schedule mutates the field, the gate is
// left alone.
//
// ORDER IS PRICE ORDER. Artists rename tiers freely (GB's free rung is called "Economy"),
// so a name can never decide who is "above" whom. Price can, and it is the same rule the
// waterfall staggers on.

export interface LadderTier {
  id: string;
  name: string;
  price: number;
}

/** Active tiers cheapest-first. Ties break on id so the order is stable across reads. */
export function ladderOrder(tiers: LadderTier[]): LadderTier[] {
  return [...(tiers || [])]
    .filter((t) => t && typeof t.id === 'string')
    .sort((a, b) => (a.price - b.price) || a.id.localeCompare(b.id));
}

/**
 * Every tier at or above `fromTierId`, by price. The returned list is what gets SAVED to
 * allowed_tier_ids, so the exact-match gate then admits exactly the intended people.
 *
 * An unknown tier id returns an empty list rather than everything: an allow list that
 * silently widened because an id went stale would hand paid content to the wrong rung.
 */
export function expandFromTier(tiers: LadderTier[], fromTierId: string | null | undefined): string[] {
  if (!fromTierId) return [];
  const ordered = ladderOrder(tiers);
  const from = ordered.find((t) => t.id === fromTierId);
  if (!from) return [];
  return ordered.filter((t) => t.price >= from.price).map((t) => t.id);
}

/**
 * Read a stored allow list back as a rung, so an editor can show what was chosen.
 * Returns the LOWEST tier in the list only when the list is exactly that tier and
 * everything above it; a hand-picked or drifted set returns null and the caller shows
 * the raw selection rather than claiming a tidy answer it does not have.
 */
export function rungFromAllowList(tiers: LadderTier[], allowed: unknown): string | null {
  const list = Array.isArray(allowed) ? allowed.filter((x): x is string => typeof x === 'string') : [];
  if (!list.length) return null;
  const ordered = ladderOrder(tiers);
  const lowest = ordered.find((t) => list.includes(t.id));
  if (!lowest) return null;
  const expected = expandFromTier(ordered, lowest.id);
  if (expected.length !== list.length) return null;
  return expected.every((id) => list.includes(id)) ? lowest.id : null;
}

/** Plain words for what a saved selection actually admits. Never a guess. */
export function describeTierAccess(tiers: LadderTier[], allowed: unknown, isFree: boolean): string {
  if (isFree) return 'Everyone';
  const list = Array.isArray(allowed) ? allowed.filter((x): x is string => typeof x === 'string') : [];
  if (!list.length) return 'Nobody yet';
  const ordered = ladderOrder(tiers);
  const rung = rungFromAllowList(ordered, list);
  if (rung) {
    const tier = ordered.find((t) => t.id === rung);
    const isTop = ordered.length > 0 && ordered[ordered.length - 1]?.id === rung;
    if (!tier) return `${list.length} tiers`;
    return isTop ? `${tier.name} only` : `${tier.name} and above`;
  }
  const names = ordered.filter((t) => list.includes(t.id)).map((t) => t.name);
  return names.length ? names.join(', ') : `${list.length} tiers`;
}
