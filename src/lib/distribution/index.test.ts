// Big Page Index: pure-logic tests for promotion, corpus matching, source
// attribution, staleness, batching, and the founder input parsers.

import { describe, expect, it } from 'vitest';
import {
  SIGNIFICANT_PAGE_FOLLOWERS,
  batchUsernames,
  buildCorpusSearchPatterns,
  corpusRowToDiscoveredPost,
  decideIndexEligibility,
  dedupeProfiles,
  estimateBootstrapRuns,
  pageSources,
  parseHandleList,
  selectStalePages,
  POSTS_FRESH_HOURS,
} from './corpus';
import { normalizeArtistIdentity } from './queries';
import { matchPost, toMatchedPosts } from './matching';
import { dedupePosts } from './dedupe';
import { assembleResults } from './pipeline';
import type { CorpusPostRow } from './corpus';
import type { MatchedPost, PageProfile } from './types';

const NOW = new Date('2026-08-24T12:00:00Z');

function ryan() {
  return normalizeArtistIdentity({ name: 'Ryan Leslie', handle: '@ryanleslie', aliases: [] });
}

function corpusRow(overrides: Partial<CorpusPostRow> = {}): CorpusPostRow {
  return {
    page_username: 'rnbpage',
    post_key: 'id:123',
    post_url: 'https://www.instagram.com/p/ABC/',
    caption: null,
    posted_at: '2026-08-20T00:00:00Z',
    likes: 5000,
    comments: 100,
    views: null,
    ...overrides,
  };
}

describe('index eligibility (automatic promotion)', () => {
  it('promotes a global find at or above the significant threshold, not below', () => {
    const at = { followers: SIGNIFICANT_PAGE_FOLLOWERS, isPrivate: false };
    const below = { followers: SIGNIFICANT_PAGE_FOLLOWERS - 1, isPrivate: false };
    expect(decideIndexEligibility(at, 'global_search')).toBe(true);
    expect(decideIndexEligibility(below, 'global_search')).toBe(false);
    expect(decideIndexEligibility({ followers: null, isPrivate: false }, 'global_search')).toBe(false);
  });

  it('indexes founder-curated manual additions regardless of size, but never private pages', () => {
    expect(decideIndexEligibility({ followers: 3_000, isPrivate: false }, 'manual')).toBe(true);
    expect(decideIndexEligibility({ followers: 900_000, isPrivate: true }, 'manual')).toBe(false);
    expect(decideIndexEligibility({ followers: 900_000, isPrivate: true }, 'global_search')).toBe(false);
  });
});

describe('corpus matching', () => {
  it('a corpus post matches only on caption evidence, never on prefilter provenance', () => {
    const noEvidence = matchPost(corpusRowToDiscoveredPost(corpusRow({ caption: 'nothing relevant here' })), ryan());
    expect(noEvidence.matched).toBe(false);
    const withEvidence = matchPost(corpusRowToDiscoveredPost(corpusRow({ caption: 'Ryan Leslie ran it up' })), ryan());
    expect(withEvidence.matched).toBe(true);
    expect(withEvidence.strong).toBe(true);
  });

  it('maps corpus rows back to discovered posts with the stable id preserved', () => {
    const post = corpusRowToDiscoveredPost(corpusRow({ post_key: 'sc:XYZ' }));
    expect(post.shortcode).toBe('XYZ');
    expect(post.sourceKind).toBe('corpus');
  });

  it('builds broad ilike patterns with LIKE wildcards escaped and or() syntax stripped', () => {
    const patterns = buildCorpusSearchPatterns(
      normalizeArtistIdentity({ name: '100% Ryan, (Leslie)', handle: '@ryanleslie', aliases: [] }),
    );
    expect(patterns.some((p) => p.includes('@ryanleslie'))).toBe(true);
    expect(patterns.some((p) => p.includes('#'))).toBe(true);
    for (const p of patterns) {
      const inner = p.slice(1, -1); // between the outer %...%
      expect(inner.includes(',')).toBe(false);
      expect(inner.includes('(')).toBe(false);
      expect(/(?<!\\)%/.test(inner)).toBe(false);
    }
  });
});

describe('source attribution', () => {
  function mp(overrides: Partial<MatchedPost>): MatchedPost {
    return {
      postId: null,
      shortcode: null,
      url: 'https://instagram.com/p/X/',
      caption: 'Ryan Leslie',
      postedAt: '2026-08-20T00:00:00Z',
      likes: null,
      comments: null,
      views: null,
      ownerUsername: 'rnbpage',
      ownerId: null,
      sourceQuery: 'ryan leslie',
      sourceKind: 'keyword',
      matchReason: 'test',
      strongEvidence: true,
      ...overrides,
    };
  }

  it('marks pages indexed, global, or both, and the same post found both ways counts once', () => {
    const viaIndex = mp({ postId: '9', sourceKind: 'corpus', ownerUsername: 'bothpage' });
    const viaGlobal = mp({ postId: '9', sourceKind: 'keyword', ownerUsername: 'bothpage' });
    const onlyIndex = mp({ postId: '1', sourceKind: 'corpus', ownerUsername: 'indexpage' });
    const onlyGlobal = mp({ postId: '2', sourceKind: 'hashtag', ownerUsername: 'globalpage' });
    const all = [viaIndex, viaGlobal, onlyIndex, onlyGlobal];

    const sources = pageSources(all);
    expect(sources.get('bothpage')).toBe('both');
    expect(sources.get('indexpage')).toBe('indexed');
    expect(sources.get('globalpage')).toBe('global');

    const deduped = dedupePosts(all);
    expect(deduped.filter((p) => p.ownerUsername === 'bothpage')).toHaveLength(1);

    const profiles = new Map<string, PageProfile>(
      ['bothpage', 'indexpage', 'globalpage'].map((u) => [
        u,
        {
          igUserId: null,
          username: u,
          displayName: null,
          followers: 200_000,
          verified: false,
          isPrivate: false,
          category: null,
          biography: null,
          profileUrl: `https://www.instagram.com/${u}/`,
        },
      ]),
    );
    const { results } = assembleResults(deduped, profiles, ryan(), { windowDays: 90, minFollowers: 50_000, now: NOW }, sources);
    expect(results.find((r) => r.username === 'bothpage')?.source).toBe('both');
    expect(results.find((r) => r.username === 'bothpage')?.postCount).toBe(1);
    expect(results.find((r) => r.username === 'indexpage')?.source).toBe('indexed');
    expect(results.find((r) => r.username === 'globalpage')?.source).toBe('global');
  });

  it('indexed recent posts can match an artist end to end', () => {
    const rows = [
      corpusRow({ caption: 'New @ryanleslie interview tonight', post_key: 'id:77' }),
      corpusRow({ caption: 'unrelated content', post_key: 'id:78' }),
    ];
    const matched = toMatchedPosts(rows.map(corpusRowToDiscoveredPost), ryan());
    expect(matched).toHaveLength(1);
    expect(matched[0].matchReason).toContain('@ryanleslie');
  });
});

describe('refresh planning', () => {
  it('selects never-refreshed and stale pages, oldest first, skipping fresh ones', () => {
    const fresh = new Date(NOW.getTime() - (POSTS_FRESH_HOURS - 2) * 3600 * 1000).toISOString();
    const stale = new Date(NOW.getTime() - (POSTS_FRESH_HOURS + 2) * 3600 * 1000).toISOString();
    const older = new Date(NOW.getTime() - (POSTS_FRESH_HOURS + 50) * 3600 * 1000).toISOString();
    const picked = selectStalePages(
      [
        { username: 'freshpage', last_posts_refresh_at: fresh },
        { username: 'stalepage', last_posts_refresh_at: stale },
        { username: 'neverpage', last_posts_refresh_at: null },
        { username: 'olderpage', last_posts_refresh_at: older },
      ],
      NOW,
    );
    expect(picked).toEqual(['neverpage', 'olderpage', 'stalepage']);
  });

  it('batches usernames at the configured size', () => {
    const batches = batchUsernames(Array.from({ length: 53 }, (_, i) => `page${i}`), 25);
    expect(batches.map((b) => b.length)).toEqual([25, 25, 3]);
  });
});

describe('founder input parsing', () => {
  it('parses and dedupes pasted handles, rejecting junk', () => {
    expect(parseHandleList(['@PageOne', 'pageone', ' @page_two ', 'not a handle!', ''])).toEqual(['pageone', 'page_two']);
  });

  it('estimates bootstrap provider runs from the real query builder', () => {
    const estimate = estimateBootstrapRuns(['SZA', 'Brent Faiyaz', '  ', 'Lucky Daye']);
    expect(estimate.artists).toBe(3);
    expect(estimate.enrichmentRuns).toBe(3);
    // Each name yields one keyword run plus one hashtag run.
    expect(estimate.discoveryRuns).toBe(6);
  });

  it('dedupes profiles for index insertion by user id then username', () => {
    const p = (username: string, igUserId: string | null): PageProfile => ({
      igUserId,
      username,
      displayName: null,
      followers: 100_000,
      verified: false,
      isPrivate: false,
      category: null,
      biography: null,
      profileUrl: `https://www.instagram.com/${username}/`,
    });
    expect(dedupeProfiles([p('a', '1'), p('b', '1'), p('c', null), p('c', null)])).toHaveLength(2);
  });
});
