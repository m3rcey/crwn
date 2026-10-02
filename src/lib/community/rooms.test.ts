import { describe, it, expect } from 'vitest';
import {
  planTierRooms, roomAccessFor, entryTierFor, teaserKindFor, ropeHeadline, ropeButtonLabel,
  signableCommunityKey, isPrivateMediaKey, tierRoomsInOrder, type RoomChannel,
} from './rooms';

// Prince Dre's live ladder (production read, 2026-10-02). Platinum is $50 by founder decision.
const BRONZE = { id: 'b0000000-0000-0000-0000-000000000000', name: 'Bronze', price: 0 };
const SILVER = { id: 's0000000-0000-0000-0000-000000000000', name: 'Silver', price: 1000 };
const GOLD = { id: 'g0000000-0000-0000-0000-000000000000', name: 'Gold', price: 2500 };
const PLAT = { id: 'p0000000-0000-0000-0000-000000000000', name: 'Platinum', price: 5000 };
const LADDER = [GOLD, BRONZE, PLAT, SILVER]; // deliberately out of order

function room(tier: { id: string; name: string }, allowed: string[], over: Partial<RoomChannel> = {}): RoomChannel {
  return {
    id: `room-${tier.id}`, artist_id: 'a', name: tier.name, tier_id: tier.id, is_free: false,
    allowed_tier_ids: allowed, artist_only_posting: true, position: 0, ...over,
  };
}

describe('planTierRooms', () => {
  it('creates one cumulative, artist-only room per rung, cheapest first', () => {
    const plan = planTierRooms(LADDER, []);
    expect(plan.update).toEqual([]);
    expect(plan.create.map((r) => r.name)).toEqual(['Bronze', 'Silver', 'Gold', 'Platinum']);
    const gold = plan.create.find((r) => r.tier_id === GOLD.id)!;
    expect(gold.allowed_tier_ids).toEqual([GOLD.id, PLAT.id]);
    expect(plan.create.find((r) => r.tier_id === BRONZE.id)!.allowed_tier_ids).toEqual([BRONZE.id, SILVER.id, GOLD.id, PLAT.id]);
    expect(plan.create.every((r) => r.is_free === false && r.artist_only_posting === true)).toBe(true);
    expect(new Set(plan.create.map((r) => r.slug)).size).toBe(4);
  });

  it('is idempotent once the rooms exist', () => {
    const existing = [
      room(BRONZE, [BRONZE.id, SILVER.id, GOLD.id, PLAT.id], { position: 0 }),
      room(SILVER, [SILVER.id, GOLD.id, PLAT.id], { position: 1 }),
      room(GOLD, [GOLD.id, PLAT.id], { position: 2 }),
      room(PLAT, [PLAT.id], { position: 3 }),
    ];
    expect(planTierRooms(LADDER, existing)).toEqual({ create: [], update: [] });
  });

  it('never removes a tier from a room, even one that left the active ladder', () => {
    const retired = 'r0000000-0000-0000-0000-000000000000';
    const plan = planTierRooms([GOLD, PLAT], [room(GOLD, [GOLD.id, retired], { position: 0 })]);
    const patch = plan.update.find((u) => u.id === `room-${GOLD.id}`)!;
    expect(patch.allowed_tier_ids).toEqual([GOLD.id, retired, PLAT.id]);
  });

  it('follows a rename and adds a new higher rung to every lower room', () => {
    const plan = planTierRooms([GOLD, PLAT], [room({ id: GOLD.id, name: 'Vault' }, [GOLD.id], { position: 0 })]);
    expect(plan.update[0]).toEqual({ id: `room-${GOLD.id}`, name: 'Gold', allowed_tier_ids: [GOLD.id, PLAT.id] });
    expect(plan.create.map((r) => r.tier_id)).toEqual([PLAT.id]);
  });

  it('ignores ordinary chat channels', () => {
    const chat = room({ id: 'x', name: 'general' }, [], { tier_id: null, is_free: true });
    expect(planTierRooms([GOLD], [chat]).create).toHaveLength(1);
    expect(tierRoomsInOrder([chat], [GOLD])).toEqual([]);
  });
});

describe('roomAccessFor (rendering mirror only)', () => {
  const gold = room(GOLD, [GOLD.id, PLAT.id]);
  it('admits the rung and everyone above it', () => {
    expect(roomAccessFor(gold, GOLD.id, false)).toBe(true);
    expect(roomAccessFor(gold, PLAT.id, false)).toBe(true);
  });
  it('keeps cheaper rungs and visitors at the rope', () => {
    expect(roomAccessFor(gold, SILVER.id, false)).toBe(false);
    expect(roomAccessFor(gold, BRONZE.id, false)).toBe(false);
    expect(roomAccessFor(gold, null, false)).toBe(false);
  });
  it('lets the owner in', () => {
    expect(roomAccessFor(gold, null, true)).toBe(true);
  });
});

describe('the rope', () => {
  it('names the room\'s own rung as the way in', () => {
    expect(entryTierFor([PLAT.id, GOLD.id], LADDER)?.name).toBe('Gold');
    expect(entryTierFor([], LADDER)).toBeNull();
    expect(entryTierFor(null, LADDER)).toBeNull();
  });

  it('reads the post kind from its media', () => {
    expect(teaserKindFor(['image', 'video'])).toBe('video');
    expect(teaserKindFor(['image'])).toBe('image');
    expect(teaserKindFor([])).toBe('text');
    expect(teaserKindFor(null)).toBe('text');
  });

  it('carries the founder headline word for word, with no em dash', () => {
    expect(ropeHeadline('Gold', 'video')).toBe("Gold members are watching this. You're not a member. YET.");
    expect(ropeHeadline('Gold', 'room')).toBe("Gold members are in here. You're not a member. YET.");
    for (const kind of ['video', 'image', 'text', 'room'] as const) {
      expect(ropeHeadline('Gold', kind)).not.toMatch(/[–—]/);
    }
  });

  it('upgrades a paid member instead of opening a second checkout', () => {
    expect(ropeButtonLabel(GOLD, null)).toBe('Join Gold · $25/mo');
    expect(ropeButtonLabel(GOLD, BRONZE)).toBe('Join Gold · $25/mo');
    expect(ropeButtonLabel(GOLD, SILVER)).toBe('Upgrade to Gold · $25/mo');
    expect(ropeButtonLabel(BRONZE, null)).toBe('Join Bronze free');
    expect(ropeButtonLabel({ id: 'x', name: 'Tip', price: 999 }, null)).toBe('Join Tip · $9.99/mo');
  });
});

describe('private media keys (SEC-009)', () => {
  const artist = '11111111-1111-1111-1111-111111111111';
  it('tells a public link from a private key', () => {
    expect(isPrivateMediaKey('https://x.supabase.co/storage/v1/object/public/community-media/a.jpg')).toBe(false);
    expect(isPrivateMediaKey(`community/${artist}/1-a.mp4`)).toBe(true);
    expect(isPrivateMediaKey('')).toBe(false);
  });
  it('signs only inside the artist\'s own prefix', () => {
    expect(signableCommunityKey(`community/${artist}/1-a.mp4`, artist)).toBe(true);
    expect(signableCommunityKey('community/22222222-2222-2222-2222-222222222222/1-a.mp4', artist)).toBe(false);
    expect(signableCommunityKey(`community/${artist}/../other/a.mp4`, artist)).toBe(false);
    expect(signableCommunityKey(`princedre/vod/1-a.mp4`, artist)).toBe(false);
    expect(signableCommunityKey('https://evil.example/community/' + artist + '/a.mp4', artist)).toBe(false);
  });
});
