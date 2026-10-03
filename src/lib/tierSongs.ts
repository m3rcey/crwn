// Which gated songs a membership rung NEWLY unlocks, for the artist page's tier cards.
// Pure: the cards read it, and it holds no access decision (playability is the player's gate).
import type { Track } from '@/types';
import { unlockMonthsFor } from '@/lib/memberDrip';

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


/** A project as the tier cards need it: the album and every track on it, in any order. */
export interface ProjectLike {
  id: string;
  title: string;
  artUrl: string | null;
  trackIds: string[];
}

export interface TierProject {
  id: string;
  title: string;
  artUrl: string | null;
  /** Every song on the project, free ones included: the card says "complete (N songs)". */
  songCount: number;
  /** 0 = the day you join; N = N months after you join (the member drip). */
  months: number;
}

/**
 * What a rung NEWLY unlocks, as WHOLE PROJECTS wherever it can (founder, 2026-10-03: "the tiers
 * shouldn't list songs if full projects are offered, it should show the projects"), plus the loose
 * songs that belong to no project the rung completes.
 *
 * A project belongs to a card when this rung holds every paid song on it, and at least one of them
 * is NEW here: the rung below lacks it, or only gets it LATER (Gold waits months for a drip project
 * Platinum has today, so Platinum's card names it). Free songs on a project count toward its size
 * and never decide anything. Rendering only: playability stays the player's gate.
 */
export function unlocksAtTier(
  tracks: Track[],
  tiers: TierLike[],
  tierId: string,
  projects: ProjectLike[],
): { projects: TierProject[]; songs: Track[] } {
  const byPrice = [...tiers].sort((a, b) => a.price - b.price);
  const i = byPrice.findIndex((t) => t.id === tierId);
  if (i < 0) return { projects: [], songs: [] };
  const below = i > 0 ? byPrice[i - 1].id : null;

  const delay = (t: Track, rung: string | null): number => {
    if (!rung) return Infinity;
    const allowed = Array.isArray(t.allowed_tier_ids) ? t.allowed_tier_ids : [];
    return allowed.includes(rung) ? unlockMonthsFor(t.tier_unlock_months, rung) : Infinity;
  };
  const isNew = (t: Track) => !t.is_free && delay(t, tierId) < delay(t, below);

  const byId = new Map(tracks.map((t) => [t.id, t]));
  const used = new Set<string>();
  const out: TierProject[] = [];
  for (const p of projects) {
    const onPage = p.trackIds.map((id) => byId.get(id)).filter((t): t is Track => !!t);
    const paid = onPage.filter((t) => !t.is_free);
    if (!paid.length) continue;
    if (!paid.every((t) => Number.isFinite(delay(t, tierId)))) continue;
    if (!paid.some(isNew)) continue;
    for (const t of paid) used.add(t.id);
    out.push({
      id: p.id,
      title: p.title,
      artUrl: p.artUrl,
      songCount: onPage.length,
      months: Math.max(...paid.map((t) => delay(t, tierId))),
    });
  }
  out.sort((a, b) => a.months - b.months);
  return { projects: out, songs: tracks.filter((t) => isNew(t) && !used.has(t.id)) };
}
