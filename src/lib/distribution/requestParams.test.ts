import { describe, expect, it } from 'vitest';
import { parseSearchParams, parseRunRefs, DEFAULT_MIN_FOLLOWERS, DEFAULT_WINDOW_DAYS } from './requestParams';
import { isCacheFresh, CACHE_FRESH_HOURS } from './store';

const NOW = new Date('2026-08-24T12:00:00Z');

describe('parseSearchParams', () => {
  it('rejects a missing or tiny artist name', () => {
    expect(parseSearchParams({}, NOW)).toHaveProperty('error');
    expect(parseSearchParams({ artist: 'x' }, NOW)).toHaveProperty('error');
  });

  it('applies defaults and clamps founder inputs', () => {
    const parsed = parseSearchParams({ artist: 'Ryan Leslie' }, NOW);
    if ('error' in parsed) throw new Error('expected success');
    expect(parsed.options.windowDays).toBe(DEFAULT_WINDOW_DAYS);
    expect(parsed.options.minFollowers).toBe(DEFAULT_MIN_FOLLOWERS);
    expect(parsed.refresh).toBe(false);

    const clamped = parseSearchParams(
      { artist: 'Ryan Leslie', windowDays: 100000, minFollowers: -5, refresh: true },
      NOW,
    );
    if ('error' in clamped) throw new Error('expected success');
    expect(clamped.options.windowDays).toBe(365);
    expect(clamped.options.minFollowers).toBe(0);
    expect(clamped.refresh).toBe(true);
  });

  it('normalizes identity through the shared normalizer', () => {
    const parsed = parseSearchParams({ artist: '  Ryan   Leslie ', handle: '@RyanLeslie', aliases: ['R Les', ''] }, NOW);
    if ('error' in parsed) throw new Error('expected success');
    expect(parsed.identity.nameNormalized).toBe('ryan leslie');
    expect(parsed.identity.handle).toBe('ryanleslie');
    expect(parsed.identity.aliases).toEqual(['r les']);
  });
});

describe('parseRunRefs', () => {
  it('accepts well-formed run references and rejects junk', () => {
    const good = parseRunRefs([{ runId: 'AbC123xyz9', term: 'ryanleslie', kind: 'hashtag' }]);
    expect(good).toHaveLength(1);
    expect(parseRunRefs([])).toBeNull();
    expect(parseRunRefs([{ runId: '../etc', term: 'x', kind: 'hashtag' }])).toBeNull();
    expect(parseRunRefs([{ runId: 'AbC123xyz9', term: 'x', kind: 'nonsense' }])).toBeNull();
    expect(parseRunRefs(Array.from({ length: 11 }, () => ({ runId: 'AbC123xyz9', term: 'x', kind: 'keyword' })))).toBeNull();
  });
});

describe('cache freshness', () => {
  it('treats observations inside the freshness window as reusable', () => {
    const recent = new Date(NOW.getTime() - (CACHE_FRESH_HOURS - 1) * 60 * 60 * 1000).toISOString();
    const stale = new Date(NOW.getTime() - (CACHE_FRESH_HOURS + 1) * 60 * 60 * 1000).toISOString();
    expect(isCacheFresh(recent, NOW)).toBe(true);
    expect(isCacheFresh(stale, NOW)).toBe(false);
    expect(isCacheFresh(null, NOW)).toBe(false);
    expect(isCacheFresh('garbage', NOW)).toBe(false);
  });
});
