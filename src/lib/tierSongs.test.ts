import { describe, it, expect } from 'vitest';
import { songsNewAtTier } from './tierSongs';
import type { Track } from '@/types';

const tiers = [
  { id: 'P', price: 10000 }, { id: 'B', price: 0 }, { id: 'G', price: 2500 }, { id: 'S', price: 1000 },
];
const t = (id: string, allowed: string[], isFree = false) => ({ id, title: id, is_free: isFree, allowed_tier_ids: allowed }) as unknown as Track;
const tracks = [
  t('sampler', [], true),
  t('bonus', ['B', 'S', 'G', 'P']),
  t('archive', ['S', 'G', 'P']),
  t('cut', ['P']),
];
const ids = (tier: string) => songsNewAtTier(tracks, tiers, tier).map((x) => x.id);

describe('songsNewAtTier', () => {
  it('shows each gated song once, on the lowest rung that gets it', () => {
    expect(ids('B')).toEqual(['bonus']);
    expect(ids('S')).toEqual(['archive']);
    expect(ids('G')).toEqual([]);
    expect(ids('P')).toEqual(['cut']);
  });
  it('never lists a free track on a card', () => {
    expect(['B', 'S', 'G', 'P'].flatMap(ids)).not.toContain('sampler');
  });
  it('a song opened to Gold later (the winning project) moves to the Gold card', () => {
    const opened = tracks.map((x) => (x.id === 'cut' ? t('cut', ['P', 'G']) : x));
    expect(songsNewAtTier(opened, tiers, 'G').map((x) => x.id)).toEqual(['cut']);
    expect(songsNewAtTier(opened, tiers, 'P').map((x) => x.id)).toEqual([]);
  });
});
