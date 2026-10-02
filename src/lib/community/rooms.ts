// Tier rooms: one community room per membership rung (founder, 2026-10-02).
//
// Pure, no client. Three jobs, each with ONE home here:
//   1. planTierRooms   which rooms an artist's ladder needs, and what to refresh on the
//                      ones that exist. ADDITIVE ONLY: it never deactivates a room and never
//                      removes a tier from a room's list, because a list that shrinks locks a
//                      paying member out of posts they already had.
//   2. roomAccessFor   the RENDERING mirror of can_read_community_channel, used only where
//                      the owner previews the page as a fan. The database is the gate; this
//                      decides what to draw when the server's can_view is the owner's answer.
//   3. the rope        what a non-member is told: which rung opens the post, the headline, and
//                      the button label. One place, so the copy cannot drift between cards.
//
// The room's access list is built with expandFromTier, the same write-time cumulative rule
// every other gated surface uses: the Gold room admits Gold and everyone priced above it.

import { expandFromTier, ladderOrder, type LadderTier } from '@/lib/tierLadder';

export interface RoomChannel {
  id: string;
  artist_id: string;
  name: string;
  tier_id: string | null;
  is_free: boolean;
  allowed_tier_ids: string[] | null;
  artist_only_posting: boolean;
  position: number;
  is_active?: boolean;
}

export interface RoomDraft {
  tier_id: string;
  name: string;
  slug: string;
  position: number;
  is_free: false;
  allowed_tier_ids: string[];
  artist_only_posting: true;
}

export interface RoomUpdate {
  id: string;
  name?: string;
  allowed_tier_ids?: string[];
  position?: number;
}

export interface RoomPlan {
  create: RoomDraft[];
  update: RoomUpdate[];
}

/** Room slugs live beside chat channel slugs (unique per artist), so they carry a prefix. */
export function roomSlug(tierName: string, tierId: string): string {
  const base = tierName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `room-${base || 'tier'}-${tierId.slice(0, 8)}`;
}

/**
 * The rooms an active ladder needs. `tiers` are the artist's ACTIVE tiers; `channels` are
 * every channel the artist has (chat channels have tier_id null and are ignored).
 */
export function planTierRooms(tiers: LadderTier[], channels: RoomChannel[]): RoomPlan {
  const ordered = ladderOrder(tiers);
  const byTier = new Map(channels.filter((c) => c.tier_id).map((c) => [c.tier_id as string, c]));
  const create: RoomDraft[] = [];
  const update: RoomUpdate[] = [];

  ordered.forEach((tier, index) => {
    const want = expandFromTier(ordered, tier.id);
    const room = byTier.get(tier.id);
    if (!room) {
      create.push({
        tier_id: tier.id,
        name: tier.name,
        slug: roomSlug(tier.name, tier.id),
        position: index,
        is_free: false,
        allowed_tier_ids: want,
        artist_only_posting: true,
      });
      return;
    }
    const have = Array.isArray(room.allowed_tier_ids) ? room.allowed_tier_ids : [];
    // Union, never replace: a tier that left the active ladder keeps its members in.
    const merged = [...have, ...want.filter((id) => !have.includes(id))];
    const patch: RoomUpdate = { id: room.id };
    if (room.name !== tier.name) patch.name = tier.name;
    if (merged.length !== have.length) patch.allowed_tier_ids = merged;
    if (room.position !== index) patch.position = index;
    if (Object.keys(patch).length > 1) update.push(patch);
  });

  return { create, update };
}

/** Tier rooms in ladder order (cheapest first), for the room tabs. */
export function tierRoomsInOrder(channels: RoomChannel[], tiers: LadderTier[]): RoomChannel[] {
  const rank = new Map(ladderOrder(tiers).map((t, i) => [t.id, i]));
  return channels
    .filter((c) => c.tier_id && c.is_active !== false)
    .sort((a, b) => (rank.get(a.tier_id as string) ?? 99) - (rank.get(b.tier_id as string) ?? 99));
}

/** Rendering mirror of can_read_community_channel. Never a gate. */
export function roomAccessFor(room: RoomChannel, viewerTierId: string | null | undefined, isOwner: boolean): boolean {
  if (room.is_free) return true;
  if (isOwner) return true;
  if (!viewerTierId) return false;
  const allowed = room.allowed_tier_ids || [];
  return allowed.length === 0 || allowed.includes(viewerTierId);
}

/**
 * The rung a non-member must join to open a room or a gated post: the CHEAPEST tier on its
 * allow list, which for a tier room is the room's own rung. Null when the list names no
 * tier we know.
 */
export function entryTierFor<T extends LadderTier>(allowedTierIds: string[] | null | undefined, tiers: T[]): T | null {
  const allowed = Array.isArray(allowedTierIds) ? allowedTierIds : [];
  const sorted = ladderOrder(tiers) as T[];
  return sorted.find((t) => allowed.includes(t.id)) ?? null;
}

export type TeaserKind = 'video' | 'image' | 'text';

/** What a locked post shows at the rope. Video wins over images when both are present. */
export function teaserKindFor(mediaTypes: unknown): TeaserKind {
  const list = Array.isArray(mediaTypes) ? mediaTypes : [];
  if (list.includes('video')) return 'video';
  if (list.includes('image')) return 'image';
  return 'text';
}

const VERB: Record<TeaserKind, string> = { video: 'watching this', image: 'looking at this', text: 'reading this' };

/**
 * "Gold members are watching this. You're not a member. YET." (founder copy, 2026-10-02).
 * `room` is the banner over a whole room rather than one post.
 */
export function ropeHeadline(tierName: string, kind: TeaserKind | 'room'): string {
  const doing = kind === 'room' ? 'in here' : VERB[kind];
  return `${tierName} members are ${doing}. You're not a member. YET.`;
}

/** Cents to "$25" or "$9.99". */
export function priceLabel(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/**
 * The button on the rope. A fan on a cheaper paid rung is UPGRADING (a proration change on
 * their existing subscription), never opening a second checkout.
 */
export function ropeButtonLabel(target: LadderTier, current: LadderTier | null): string {
  if (target.price === 0) return `Join ${target.name} free`;
  const amount = `${priceLabel(target.price)}/mo`;
  if (current && current.price > 0) return `Upgrade to ${target.name} · ${amount}`;
  return `Join ${target.name} · ${amount}`;
}

// ------------------------------------------------------------------
// Private media
// ------------------------------------------------------------------
// A room post's photo or video is uploaded to the PRIVATE R2 bucket and the post stores
// the object KEY. Legacy posts store public Supabase URLs. The rule that tells them apart:
// a stored value that starts with http(s) is a public link and is used as-is; anything
// else is a private key and must be signed by /api/community/media.

/** Every community object an artist uploads lives under this prefix. */
export function communityMediaPrefix(artistId: string): string {
  return `community/${artistId}/`;
}

export function isPrivateMediaKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/^https?:\/\//i.test(value);
}

/**
 * Is this key one the signer may sign for this artist? SEC-009: the signer runs with the
 * service role, so a key is signed only inside the artist's own prefix and never with a
 * traversal segment. The route ALSO requires that the post's author is the artist.
 */
export function signableCommunityKey(key: string, artistId: string): boolean {
  return isPrivateMediaKey(key) && key.startsWith(communityMediaPrefix(artistId)) && !key.includes('..');
}
