import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { vaultTrackUpdates, trackAlreadyServesVault, describeVaultEffect, findVaultPlaylist } from './vaultCollection';

const NOW = new Date('2026-09-03T12:00:00Z');
const TIERS = [
  { id: 'bronze', name: 'Bronze', price: 0 },
  { id: 'silver', name: 'Silver', price: 1000 },
  { id: 'gold', name: 'Gold', price: 2500 },
  { id: 'platinum', name: 'Platinum', price: 5000 },
];
const GOLD_UP = ['gold', 'platinum'];

describe('vaultTrackUpdates: the Vault gates the TRACK, and never narrows', () => {
  it('a public track becomes members-only for the Vault rungs', () => {
    const [u] = vaultTrackUpdates([{ id: 't1', is_free: true, allowed_tier_ids: [] }], GOLD_UP, NOW);
    expect(u.trackId).toBe('t1');
    expect(u.fields).toEqual({ is_free: false, allowed_tier_ids: GOLD_UP, public_release_date: null });
  });

  it('a track already members-only for Gold and above is left alone', () => {
    expect(vaultTrackUpdates([{ id: 't1', is_free: false, allowed_tier_ids: GOLD_UP }], GOLD_UP, NOW)).toEqual([]);
    expect(trackAlreadyServesVault({ id: 't1', is_free: false, allowed_tier_ids: ['silver', ...GOLD_UP] }, GOLD_UP, NOW)).toBe(true);
  });

  it('a Platinum-only track widens to the Vault rungs rather than locking Gold out of the Vault', () => {
    const [u] = vaultTrackUpdates([{ id: 't1', is_free: false, allowed_tier_ids: ['platinum'] }], GOLD_UP, NOW);
    expect(u.fields.allowed_tier_ids.sort()).toEqual(['gold', 'platinum']);
  });

  it('a Silver-and-above track keeps Silver: nothing a member had is taken away', () => {
    const [u] = vaultTrackUpdates(
      [{ id: 't1', is_free: true, allowed_tier_ids: ['silver', 'gold', 'platinum'], public_release_date: '2026-12-01T00:00:00Z' }],
      GOLD_UP,
      NOW,
    );
    // It was a members-first window (public later); in the Vault it is members-only, still for Silver too.
    expect(u.fields.is_free).toBe(false);
    expect(u.fields.allowed_tier_ids.sort()).toEqual(['gold', 'platinum', 'silver']);
    expect(u.fields.public_release_date).toBeNull();
  });

  it('an ungated collection changes nothing', () => {
    expect(vaultTrackUpdates([{ id: 't1', is_free: true, allowed_tier_ids: [] }], [], NOW)).toEqual([]);
  });

  it('describes the effect in the rung name, or says nothing when nothing changes', () => {
    expect(describeVaultEffect([{ id: 't1', is_free: true, allowed_tier_ids: [] }], GOLD_UP, TIERS, NOW)).toBe(
      '1 track will become members only for Gold and above when you save. Nothing a member already had is taken away.',
    );
    expect(describeVaultEffect([{ id: 't1', is_free: false, allowed_tier_ids: GOLD_UP }], GOLD_UP, TIERS, NOW)).toBeNull();
  });
});

describe('findVaultPlaylist', () => {
  const pl = (over: Record<string, unknown>) => ({ id: 'p', title: 'Demos', is_free: false, allowed_tier_ids: GOLD_UP, is_active: true, ...over });
  it('finds the gated collection whose allow list is exactly the rung and above, preferring a Vault by name', () => {
    const list = [pl({ id: 'a', title: 'Demos' }), pl({ id: 'b', title: 'The Vault' })];
    expect(findVaultPlaylist(list, TIERS, 'gold')?.id).toBe('b');
    expect(findVaultPlaylist([pl({ id: 'a' })], TIERS, 'gold')?.id).toBe('a');
  });
  it('ignores free, inactive, and differently gated playlists, and an unknown rung', () => {
    expect(findVaultPlaylist([pl({ is_free: true })], TIERS, 'gold')).toBeNull();
    expect(findVaultPlaylist([pl({ is_active: false })], TIERS, 'gold')).toBeNull();
    expect(findVaultPlaylist([pl({ allowed_tier_ids: ['silver', 'gold', 'platinum'] })], TIERS, 'gold')).toBeNull();
    expect(findVaultPlaylist([pl({})], TIERS, 'nope')).toBeNull();
  });
});

describe('no second Vault engine', () => {
  it('the module writes nothing and defines no table, route or player', () => {
    const src = readFileSync('src/lib/vaultCollection.ts', 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/supabase|fetch\(|\.insert\(|\.update\(/);
    expect(src).toMatch(/fieldsForClass/); // the ONE writer of track access fields
    expect(src).toMatch(/expandFromTier/); // the ONE rung expansion
  });
});
