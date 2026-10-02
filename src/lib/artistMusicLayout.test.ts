import { describe, expect, it } from 'vitest';
import {
  latestRelease,
  nextPinRank,
  rankTopSongs,
  releaseDateLabel,
  releaseYear,
  standaloneTracks,
  toColumns,
  TOP_SONGS_LIMIT,
} from './artistMusicLayout';

const t = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, ...extra });

describe('rankTopSongs', () => {
  it('puts pins first in pin order, then the rest by plays', () => {
    const tracks = [
      t('a', { play_count: 50 }),
      t('b', { play_count: 900 }),
      t('c', { pin_rank: 2, play_count: 0 }),
      t('d', { pin_rank: 1, play_count: 1 }),
      t('e', { play_count: 400 }),
    ];
    expect(rankTopSongs(tracks).map((x) => x.id)).toEqual(['d', 'c', 'b', 'e', 'a']);
  });

  it('keeps the running order when nothing is pinned and nothing has played', () => {
    const tracks = [t('x', { play_count: 0 }), t('y', { play_count: 0 }), t('z')];
    expect(rankTopSongs(tracks).map((x) => x.id)).toEqual(['x', 'y', 'z']);
  });

  it('treats a missing pin_rank (migration not applied) as unpinned', () => {
    const tracks = [t('a', { play_count: 1 }), t('b', { play_count: 5 })];
    expect(rankTopSongs(tracks).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('caps at the limit and never mutates its input', () => {
    const tracks = Array.from({ length: 30 }, (_, i) => t(`t${i}`, { play_count: i }));
    const before = tracks.map((x) => x.id);
    const out = rankTopSongs(tracks);
    expect(out).toHaveLength(TOP_SONGS_LIMIT);
    expect(out[0].id).toBe('t29');
    expect(tracks.map((x) => x.id)).toEqual(before);
  });
});

describe('toColumns', () => {
  it('splits into columns of four', () => {
    expect(toColumns([1, 2, 3, 4, 5, 6, 7, 8, 9]).map((c) => c.length)).toEqual([4, 4, 1]);
    expect(toColumns([])).toEqual([]);
  });
});

describe('nextPinRank', () => {
  it('pins after every existing pin, gaps included', () => {
    expect(nextPinRank([t('a'), t('b')])).toBe(1);
    expect(nextPinRank([t('a', { pin_rank: 1 }), t('b', { pin_rank: 7 })])).toBe(8);
  });
});

describe('latestRelease', () => {
  const albums = [
    { id: 'old', title: 'Old', release_date: '2021-05-01', created_at: '2026-01-01' },
    { id: 'new', title: 'New', release_date: '2024-02-01', created_at: '2026-01-01' },
  ];

  it('picks the newest album when it beats every single', () => {
    const r = latestRelease(albums, [t('s', { release_date: '2023-01-01' })], new Set());
    expect(r).toMatchObject({ kind: 'album', album: { id: 'new' } });
  });

  it('picks a newer single over an older album', () => {
    const r = latestRelease(albums, [t('s', { release_date: '2026-09-30' })], new Set());
    expect(r).toMatchObject({ kind: 'single', track: { id: 's' }, date: '2026-09-30' });
  });

  it('never treats a track inside an album as a release of its own', () => {
    const r = latestRelease(albums, [t('in-album', { release_date: '2030-01-01' })], new Set(['in-album']));
    expect(r).toMatchObject({ kind: 'album', album: { id: 'new' } });
  });

  it('breaks a same-day tie by the later upload', () => {
    const same = [
      { id: 'first', title: 'First', release_date: '2026-09-29', created_at: '2026-09-29T00:00:00Z' },
      { id: 'second', title: 'Second', release_date: '2026-09-29', created_at: '2026-09-29T17:00:00Z' },
    ];
    expect(latestRelease(same, [], new Set())).toMatchObject({ kind: 'album', album: { id: 'second' } });
  });

  it('is null for an empty catalog', () => {
    expect(latestRelease([], [], new Set())).toBeNull();
  });
});

describe('standaloneTracks', () => {
  it('keeps only tracks that are in no album', () => {
    expect(standaloneTracks([t('a'), t('b'), t('c')], new Set(['b'])).map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('date labels', () => {
  it('formats a calendar date without shifting it across a timezone', () => {
    expect(releaseDateLabel('2026-09-30')).toBe('SEP 30, 2026');
    expect(releaseDateLabel('2026-01-01T02:00:00+00:00')).toBe('JAN 1, 2026');
    expect(releaseDateLabel(null)).toBeNull();
    expect(releaseYear('2018-04-02')).toBe('2018');
    expect(releaseYear(undefined)).toBeNull();
  });
});
