// The pure logic behind project-based onboarding uploads. These pin the
// repository conventions the feature depends on: album_tracks order comes from
// review order, retries never duplicate join rows, and the album cover fills
// only EMPTY track artwork slots.

import { describe, expect, it } from 'vitest';
import {
  PROJECT_TYPE_OPTIONS,
  albumInsertPayload,
  albumTrackRows,
  artworkBackfill,
  moveItem,
  validateProject,
} from './projectUpload';

describe('albumInsertPayload', () => {
  it('matches the established albums shape (is_active, album_art_url, access fields)', () => {
    const p = albumInsertPayload({
      artistId: 'a1',
      title: '  Night Tapes  ',
      albumArtUrl: 'https://x/cover.jpg',
      access: { isFree: false, allowedTierIds: ['t1'] },
      releaseDate: '2026-08-01',
    });
    expect(p).toEqual({
      artist_id: 'a1',
      title: 'Night Tapes',
      description: null,
      album_art_url: 'https://x/cover.jpg',
      release_date: '2026-08-01',
      is_free: false,
      allowed_tier_ids: ['t1'],
      is_active: true,
      price: null,
    });
  });

  it('a free project never carries tier ids (matches QuickCreateAlbumModal)', () => {
    const p = albumInsertPayload({
      artistId: 'a1',
      title: 'X',
      albumArtUrl: null,
      access: { isFree: true, allowedTierIds: ['t1', 't2'] },
    });
    expect(p.allowed_tier_ids).toEqual([]);
    expect(p.is_free).toBe(true);
  });
});

describe('albumTrackRows', () => {
  it('numbers tracks 1-based in review order (track_number, never position)', () => {
    const rows = albumTrackRows('alb', ['t1', 't2', 't3']);
    expect(rows).toEqual([
      { album_id: 'alb', track_id: 't1', track_number: 1 },
      { album_id: 'alb', track_id: 't2', track_number: 2 },
      { album_id: 'alb', track_id: 't3', track_number: 3 },
    ]);
  });

  it('drops duplicates so a retry cannot double-link or renumber', () => {
    const rows = albumTrackRows('alb', ['t1', 't2', 't1', 't2']);
    expect(rows.map((r) => r.track_id)).toEqual(['t1', 't2']);
    expect(rows.map((r) => r.track_number)).toEqual([1, 2]);
  });

  it('continues numbering from startAt when appending to an existing album', () => {
    const rows = albumTrackRows('alb', ['t9'], 4);
    expect(rows).toEqual([{ album_id: 'alb', track_id: 't9', track_number: 4 }]);
  });

  it('ignores empty ids', () => {
    expect(albumTrackRows('alb', ['', 't1'])).toHaveLength(1);
  });
});

describe('artworkBackfill', () => {
  it('fills only tracks WITHOUT their own artwork (one upload, N references)', () => {
    const plan = artworkBackfill('https://x/cover.jpg', [
      { id: 't1', album_art_url: null },
      { id: 't2', album_art_url: 'https://x/custom.jpg' },
      { id: 't3' },
    ]);
    expect(plan).toEqual({ trackIds: ['t1', 't3'], albumArtUrl: 'https://x/cover.jpg' });
  });

  it('does nothing without a cover, and nothing when every track has art', () => {
    expect(artworkBackfill(null, [{ id: 't1' }])).toBeNull();
    expect(artworkBackfill('https://x/c.jpg', [{ id: 't1', album_art_url: 'a' }])).toBeNull();
  });
});

describe('moveItem', () => {
  it('moves within bounds and clamps at the edges', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, -5)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 99)).toEqual(['a', 'b', 'c']);
  });

  it('is pure: the input array is untouched', () => {
    const input = ['a', 'b'];
    moveItem(input, 0, 1);
    expect(input).toEqual(['a', 'b']);
  });
});

describe('validateProject', () => {
  it('a project needs a title and at least one track; artwork never blocks', () => {
    expect(validateProject('project', { title: '', trackCount: 0 }).errors).toHaveLength(2);
    expect(validateProject('project', { title: 'EP', trackCount: 3 }).ok).toBe(true);
  });

  it('a single is exactly one audio file (the standalone-track convention)', () => {
    expect(validateProject('single', { title: 'S', trackCount: 0 }).ok).toBe(false);
    expect(validateProject('single', { title: 'S', trackCount: 2 }).ok).toBe(false);
    expect(validateProject('single', { title: 'S', trackCount: 1 }).ok).toBe(true);
  });

  it('loose tracks need only files: no title, no artwork', () => {
    expect(validateProject('loose', { trackCount: 0 }).ok).toBe(false);
    expect(validateProject('loose', { trackCount: 5 }).ok).toBe(true);
  });
});

describe('PROJECT_TYPE_OPTIONS', () => {
  it('covers the three flows, keeps existing vocabulary, and uses no em dashes', () => {
    expect(PROJECT_TYPE_OPTIONS.map((o) => o.value)).toEqual(['project', 'single', 'loose']);
    expect(JSON.stringify(PROJECT_TYPE_OPTIONS)).not.toContain('—');
  });
});
