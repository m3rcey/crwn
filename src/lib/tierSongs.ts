// Which gated songs a membership rung NEWLY unlocks, for the artist page's tier cards.
// Pure: the cards read it, and it holds no access decision (playability is the player's gate).
import type { Track } from '@/types';

type TierLike = { id: string; price: number };

/** The gated songs a rung NEWLY unlocks: on this tier's allow-list and not on the next
 *  cheaper tier's, so a song shows once, on the lowest rung that gets it. Free tracks are
 *  public and belong to no card. */
export function songsNewAtTier(tracks: Track[], tiers: TierLike[], tierId: string): Track[] {
  const byPrice = [...tiers].sort((a, b) => a.price - b.price);
  const i = byPrice.findIndex((t) => t.id === tierId);
  if (i < 0) return [];
  const below = i > 0 ? byPrice[i - 1].id : null;
  return tracks.filter((t) => {
    if (t.is_free) return false;
    const allowed = Array.isArray(t.allowed_tier_ids) ? t.allowed_tier_ids : [];
    return allowed.includes(tierId) && !(below && allowed.includes(below));
  });
}

