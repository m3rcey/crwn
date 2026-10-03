import { describe, it, expect } from 'vitest';
import { songsNewAtTier, unlocksAtTier } from './tierSongs';
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

// Whole projects on the cards (founder, 2026-10-03: "the tiers shouldn't list songs if full
// projects are offered, it should show the projects").
const ladder = [
  { id: 'bronze', price: 0 },
  { id: 'silver', price: 1000 },
  { id: 'gold', price: 2500 },
  { id: 'plat', price: 5000 },
];
const tr = (id: string, allowed: string[], o: Partial<Track> = {}): Track =>
  ({ id, title: id, is_free: false, allowed_tier_ids: allowed, tier_unlock_months: null, ...o }) as unknown as Track;
const catalog = [
  tr('bb1', ['silver', 'gold', 'plat']),
  tr('bb2', ['silver', 'gold', 'plat']),
  tr('bbFree', [], { is_free: true }),
  tr('drip1', ['gold', 'plat'], { tier_unlock_months: { gold: 1 } }),
  tr('drip2', ['gold', 'plat'], { tier_unlock_months: { gold: 1 } }),
  tr('stompin1', ['plat']),
  tr('stompin2', ['plat']),
  tr('loose', ['gold', 'plat']),
];
const projects = [
  { id: 'BB', title: 'Blood Brothaz', artUrl: null, trackIds: ['bb1', 'bb2', 'bbFree'] },
  { id: 'DRIP', title: 'Only The O', artUrl: null, trackIds: ['drip1', 'drip2'] },
  { id: 'STTT', title: 'Stompin', artUrl: null, trackIds: ['stompin1', 'stompin2'] },
];

describe('unlocksAtTier: cards show projects, not song lists', () => {
  it('a rung that holds a whole project shows the project, free songs counted in its size', () => {
    const r = unlocksAtTier(catalog, ladder, 'silver', projects);
    expect(r.projects).toEqual([{ id: 'BB', title: 'Blood Brothaz', artUrl: null, songCount: 3, months: 0 }]);
    expect(r.songs).toEqual([]);
  });
  it('a drip project reads "after month N" on the rung that waits, and loose songs stay songs', () => {
    const r = unlocksAtTier(catalog, ladder, 'gold', projects);
    expect(r.projects.map((p) => [p.id, p.months])).toEqual([['DRIP', 1]]);
    expect(r.songs.map((s) => s.id)).toEqual(['loose']);
  });
  it('the rung above gets the drip project TODAY, so its card names it', () => {
    const r = unlocksAtTier(catalog, ladder, 'plat', projects);
    expect(r.projects.map((p) => [p.id, p.months])).toEqual([['DRIP', 0], ['STTT', 0]]);
    expect(r.songs).toEqual([]);
  });
  it('a project the rung only partly holds is not claimed as complete', () => {
    const partial = [...catalog, tr('stompin3', ['nobody'])];
    const r = unlocksAtTier(partial, ladder, 'plat', [{ ...projects[2], trackIds: ['stompin1', 'stompin2', 'stompin3'] }]);
    expect(r.projects).toEqual([]);
    expect(r.songs.map((s) => s.id)).toContain('stompin1');
  });
  it('the free rung unlocks nothing new', () => {
    expect(unlocksAtTier(catalog, ladder, 'bronze', projects)).toEqual({ projects: [], songs: [] });
  });
});
