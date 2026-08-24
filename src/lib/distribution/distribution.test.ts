import { describe, expect, it } from 'vitest';
import {
  buildQuerySet,
  collapseToTag,
  normalizeArtistIdentity,
  artistKey,
  MAX_KEYWORD_QUERIES,
  MAX_HASHTAG_QUERIES,
} from './queries';
import { matchPost, toMatchedPosts } from './matching';
import { dedupePosts, postKey, pageKey, uniqueAuthors, canonicalPostUrl } from './dedupe';
import {
  AFFINITY_WEIGHTS,
  DISTRIBUTION_WEIGHTS,
  PRIORITY_EXPONENTS,
  computeAffinity,
  computeDistributionValue,
  computePriority,
} from './score';
import {
  assembleResults,
  isArtistOwnAccount,
  selectEnrichmentCandidates,
  withinWindow,
  MAX_ENRICHED_AUTHORS,
} from './pipeline';
import type { DiscoveredPost, MatchedPost, PageProfile, SearchOptions } from './types';

const NOW = new Date('2026-08-24T12:00:00Z');

function ryan() {
  return normalizeArtistIdentity({
    name: 'Ryan Leslie',
    handle: '@RyanLeslie',
    aliases: ['R Les', 'Black Mozart'],
  });
}

function post(overrides: Partial<DiscoveredPost> = {}): DiscoveredPost {
  return {
    postId: null,
    shortcode: null,
    url: 'https://www.instagram.com/p/ABC123/',
    caption: null,
    postedAt: '2026-08-20T00:00:00Z',
    likes: null,
    comments: null,
    views: null,
    ownerUsername: 'rnbpage',
    ownerId: null,
    sourceQuery: 'ryanleslie',
    sourceKind: 'hashtag',
    ...overrides,
  };
}

function matched(overrides: Partial<MatchedPost> = {}): MatchedPost {
  return { ...post(), matchReason: 'test', strongEvidence: true, ...overrides };
}

function profile(overrides: Partial<PageProfile> = {}): PageProfile {
  return {
    igUserId: null,
    username: 'rnbpage',
    displayName: 'RnB Page',
    followers: 742_000,
    verified: false,
    isPrivate: false,
    category: 'Music',
    biography: null,
    profileUrl: 'https://www.instagram.com/rnbpage/',
    ...overrides,
  };
}

const OPTIONS: SearchOptions = { windowDays: 90, minFollowers: 50_000, now: NOW };

describe('query normalization', () => {
  it('dedupes name, @handle, and #hashtag forms into one set', () => {
    const identity = normalizeArtistIdentity({
      name: 'Ryan Leslie',
      handle: '@ryanleslie',
      aliases: ['ryan leslie', '@RyanLeslie', '#RyanLeslie'],
    });
    // Aliases that normalize to the name itself are dropped.
    expect(identity.aliases).toEqual(['ryanleslie']);
    const qs = buildQuerySet(identity);
    expect(qs.keywords[0]).toBe('ryan leslie');
    // The collapsed name, the handle, and the alias all reduce to ONE hashtag.
    expect(qs.hashtags).toEqual(['ryanleslie']);
  });

  it('bounds the query set', () => {
    const identity = normalizeArtistIdentity({
      name: 'A B',
      handle: 'abmusic',
      aliases: ['alias one', 'alias two', 'alias three', 'alias four', 'alias five', 'alias six'],
    });
    const qs = buildQuerySet(identity);
    expect(qs.keywords.length).toBeLessThanOrEqual(MAX_KEYWORD_QUERIES);
    expect(qs.hashtags.length).toBeLessThanOrEqual(MAX_HASHTAG_QUERIES);
  });

  it('keys the cache by the normalized name', () => {
    expect(artistKey(ryan())).toBe('ryan leslie');
    expect(collapseToTag('Ryan Leslie')).toBe('ryanleslie');
  });
});

describe('matching', () => {
  it('prefers the handle mention as the reason', () => {
    const d = matchPost(post({ caption: 'New drop from @ryanleslie is crazy' }), ryan());
    expect(d).toEqual({
      matched: true,
      strong: true,
      reason: '@ryanleslie was mentioned in the caption',
    });
  });

  it('matches the exact name as a phrase, not inside another word', () => {
    const yes = matchPost(post({ caption: 'Ryan Leslie changed the game.' }), ryan());
    expect(yes.matched).toBe(true);
    expect(yes.strong).toBe(true);
    const no = matchPost(
      post({ caption: 'bryan lesliewilson posted', sourceKind: 'hashtag', sourceQuery: 'unrelated' }),
      ryan(),
    );
    expect(no.matched).toBe(false);
  });

  it('matches supplied aliases and artist hashtags in captions', () => {
    expect(matchPost(post({ caption: 'the Black Mozart era' }), ryan()).matched).toBe(true);
    expect(matchPost(post({ caption: 'tonight #ryanleslie' }), ryan()).strong).toBe(true);
  });

  it('accepts hashtag provenance as weak evidence when the caption proves nothing', () => {
    const d = matchPost(post({ caption: 'legendary run', sourceKind: 'hashtag', sourceQuery: 'ryanleslie' }), ryan());
    expect(d.matched).toBe(true);
    expect(d.strong).toBe(false);
    expect(d.reason).toContain('#ryanleslie');
  });

  it('rejects a post from an unrelated hashtag with no caption evidence', () => {
    const d = matchPost(post({ caption: 'no relation', sourceKind: 'hashtag', sourceQuery: 'rnbmusic' }), ryan());
    expect(d.matched).toBe(false);
  });

  it('toMatchedPosts drops unmatched posts and keeps reasons', () => {
    const out = toMatchedPosts(
      [
        post({ caption: '@ryanleslie live', url: 'https://instagram.com/p/A/' }),
        post({ caption: 'nothing here', sourceKind: 'hashtag', sourceQuery: 'other', url: 'https://instagram.com/p/B/' }),
      ],
      ryan(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].matchReason).toContain('@ryanleslie');
  });
});

describe('deduplication', () => {
  it('counts the same post once across multiple queries, by strongest identifier', () => {
    const a = matched({ postId: '123', shortcode: 'ABC', url: 'https://instagram.com/p/ABC/?igsh=x', sourceQuery: 'ryan leslie' });
    const b = matched({ postId: '123', shortcode: 'ABC', url: 'https://instagram.com/p/ABC/', sourceQuery: 'ryanleslie' });
    expect(postKey(a)).toBe(postKey(b));
    expect(dedupePosts([a, b])).toHaveLength(1);
  });

  it('falls back shortcode then canonical URL when ids are missing', () => {
    const a = matched({ postId: null, shortcode: 'XYZ' });
    const b = matched({ postId: null, shortcode: 'xyz' });
    expect(postKey(a)).toBe(postKey(b));
    const c = matched({ postId: null, shortcode: null, url: 'https://instagram.com/p/Q1/?utm_source=x' });
    const d = matched({ postId: null, shortcode: null, url: 'https://instagram.com/p/Q1' });
    expect(postKey(c)).toBe(postKey(d));
    expect(canonicalPostUrl('https://instagram.com/p/Q1/?x=1')).toBe('https://instagram.com/p/q1');
  });

  it('keeps the stronger match reason when duplicates disagree', () => {
    const weak = matched({ postId: '9', strongEvidence: false, matchReason: 'hashtag search' });
    const strong = matched({ postId: '9', strongEvidence: true, matchReason: 'caption mention' });
    const out = dedupePosts([weak, strong]);
    expect(out).toHaveLength(1);
    expect(out[0].matchReason).toBe('caption mention');
  });

  it('dedupes pages by user id when present, otherwise username', () => {
    expect(pageKey({ ownerId: '55', ownerUsername: 'x' })).toBe(pageKey({ ownerId: '55', ownerUsername: 'y' }));
    expect(pageKey({ ownerId: null, ownerUsername: 'RnBPage' })).toBe(pageKey({ ownerId: null, ownerUsername: 'rnbpage' }));
    const authors = uniqueAuthors([matched({ ownerUsername: 'A' }), matched({ ownerUsername: 'a' }), matched({ ownerUsername: 'b' })]);
    expect(authors).toEqual(['a', 'b']);
  });
});

describe('window filtering', () => {
  it('excludes posts outside the selected window and undated posts', () => {
    expect(withinWindow('2026-08-01T00:00:00Z', OPTIONS)).toBe(true);
    expect(withinWindow('2026-04-01T00:00:00Z', OPTIONS)).toBe(false);
    expect(withinWindow(null, OPTIONS)).toBe(false);
    expect(withinWindow('not-a-date', OPTIONS)).toBe(false);
  });
});

describe('artist self-exclusion', () => {
  it('excludes the artist by handle, collapsed name, or alias', () => {
    expect(isArtistOwnAccount('ryanleslie', ryan())).toBe(true);
    expect(isArtistOwnAccount('blackmozart', ryan())).toBe(true);
    expect(isArtistOwnAccount('rnbpage', ryan())).toBe(false);
  });
});

describe('affinity score', () => {
  it('rises with recency and frequency', () => {
    const base = { strongEvidenceRatio: 1, avgEngagement: 5000, followers: 300_000, windowDays: 90 };
    const recent = computeAffinity({ ...base, daysSinceLatest: 4, postCount: 3 });
    const stale = computeAffinity({ ...base, daysSinceLatest: 80, postCount: 3 });
    const often = computeAffinity({ ...base, daysSinceLatest: 10, postCount: 6 });
    const once = computeAffinity({ ...base, daysSinceLatest: 10, postCount: 1 });
    expect(recent.affinity).toBeGreaterThan(stale.affinity);
    expect(often.affinity).toBeGreaterThan(once.affinity);
  });

  it('lets a tiny superfan page legitimately max affinity', () => {
    const fan = computeAffinity({ daysSinceLatest: 2, postCount: 9, strongEvidenceRatio: 1, avgEngagement: 200, followers: 1_000, windowDays: 90 });
    expect(fan.affinity).toBeGreaterThan(85);
  });

  it('treats null engagement as unobserved, not zero', () => {
    const nullEng = computeAffinity({ daysSinceLatest: 10, postCount: 3, strongEvidenceRatio: 1, avgEngagement: null, followers: 300_000, windowDays: 90 });
    const zeroEng = computeAffinity({ daysSinceLatest: 10, postCount: 3, strongEvidenceRatio: 1, avgEngagement: 0, followers: 300_000, windowDays: 90 });
    expect(nullEng.components.engagement).toBeNull();
    expect(zeroEng.components.engagement).toBe(0);
    expect(nullEng.affinity).toBeGreaterThan(zeroEng.affinity);
  });
});

describe('distribution value score', () => {
  it('is reach-dominated: a 1K page can never beat a healthy 500K page', () => {
    const tiny = computeDistributionValue({ followers: 1_000, avgEngagement: 500 });
    const big = computeDistributionValue({ followers: 500_000, avgEngagement: 2_000 });
    expect(big.distributionValue).toBeGreaterThan(tiny.distributionValue + 30);
  });

  it('renormalizes unobserved engagement instead of counting it as zero', () => {
    const nullEng = computeDistributionValue({ followers: 500_000, avgEngagement: null });
    const zeroEng = computeDistributionValue({ followers: 500_000, avgEngagement: 0 });
    expect(nullEng.components.engagement).toBeNull();
    expect(nullEng.distributionValue).toBeGreaterThan(zeroEng.distributionValue);
    // A small OBSERVED follower count is an honest zero, not a null.
    expect(computeDistributionValue({ followers: 1_000, avgEngagement: null }).components.audience).toBe(0);
  });
});

describe('priority (required ranking behaviors)', () => {
  function scorePage(p: { followers: number; posts: number; daysSinceLatest: number; avgEngagement: number; strong: number }) {
    const { affinity } = computeAffinity({
      daysSinceLatest: p.daysSinceLatest,
      postCount: p.posts,
      strongEvidenceRatio: p.strong,
      avgEngagement: p.avgEngagement,
      followers: p.followers,
      windowDays: 90,
    });
    const { distributionValue } = computeDistributionValue({ followers: p.followers, avgEngagement: p.avgEngagement });
    return { affinity, distributionValue, priority: computePriority(affinity, distributionValue) };
  }

  it('Case A: strong recent affinity at 300K outranks one stale mention at 3M', () => {
    const focused = scorePage({ followers: 300_000, posts: 6, daysSinceLatest: 5, avgEngagement: 8000, strong: 1 });
    const celeb = scorePage({ followers: 3_000_000, posts: 1, daysSinceLatest: 75, avgEngagement: 8000, strong: 1 });
    expect(focused.priority).toBeGreaterThan(celeb.priority);
  });

  it('Case B: a 1K superfan posting 9 times has higher affinity but dramatically lower priority than a 500K page with 2 recent posts', () => {
    const fanPage = scorePage({ followers: 1_000, posts: 9, daysSinceLatest: 2, avgEngagement: 200, strong: 1 });
    const bigPage = scorePage({ followers: 500_000, posts: 2, daysSinceLatest: 8, avgEngagement: 2_000, strong: 1 });
    expect(fanPage.affinity).toBeGreaterThan(bigPage.affinity);
    expect(bigPage.distributionValue).toBeGreaterThan(fanPage.distributionValue + 40);
    expect(bigPage.priority).toBeGreaterThan(fanPage.priority + 20);
  });

  it('is multiplicative: zero reach cannot be rescued by maxed affinity', () => {
    expect(computePriority(100, 0)).toBe(0);
    expect(computePriority(0, 100)).toBe(0);
  });

  it('keeps weights centralized: each score sums to 100, exponents to 1', () => {
    expect(Object.values(AFFINITY_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(DISTRIBUTION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect(PRIORITY_EXPONENTS.distribution + PRIORITY_EXPONENTS.affinity).toBeCloseTo(1);
  });
});

describe('assembleResults', () => {
  it('filters below-threshold pages, private pages, and the artist, and reports partial enrichment', () => {
    const posts: MatchedPost[] = [
      matched({ ownerUsername: 'rnbpage', postId: '1' }),
      matched({ ownerUsername: 'smallfan', postId: '2' }),
      matched({ ownerUsername: 'privatepage', postId: '3' }),
      matched({ ownerUsername: 'ryanleslie', postId: '4' }),
      matched({ ownerUsername: 'unenriched', postId: '5' }),
    ];
    const profiles = new Map<string, PageProfile>([
      ['rnbpage', profile()],
      ['smallfan', profile({ username: 'smallfan', followers: 900 })],
      ['privatepage', profile({ username: 'privatepage', isPrivate: true })],
      ['ryanleslie', profile({ username: 'ryanleslie', followers: 1_000_000 })],
    ]);
    const { results, unenrichedAuthors, belowThresholdCount, totalMatchedPages } = assembleResults(posts, profiles, ryan(), OPTIONS);
    expect(results.map((r) => r.username)).toEqual(['rnbpage']);
    expect(unenrichedAuthors).toEqual(['unenriched']);
    expect(belowThresholdCount).toBe(1);
    // The empty-state contract: filtered matches are still MATCHES.
    expect(totalMatchedPages).toBe(4);
  });

  it('Case C: matches below the minimum leave the table empty but are still reported as found', () => {
    const posts: MatchedPost[] = [
      matched({ ownerUsername: 'smallfan1', postId: 's1' }),
      matched({ ownerUsername: 'smallfan2', postId: 's2' }),
    ];
    const profiles = new Map<string, PageProfile>([
      ['smallfan1', profile({ username: 'smallfan1', followers: 900 })],
      ['smallfan2', profile({ username: 'smallfan2', followers: 12_000 })],
    ]);
    const { results, belowThresholdCount, totalMatchedPages } = assembleResults(posts, profiles, ryan(), OPTIONS);
    expect(results).toEqual([]);
    expect(totalMatchedPages).toBe(2);
    expect(belowThresholdCount).toBe(2);
  });

  it('computes latest post, average engagement over observed metrics only, and ranks by score', () => {
    const posts: MatchedPost[] = [
      matched({ ownerUsername: 'rnbpage', postId: 'a', postedAt: '2026-08-20T00:00:00Z', likes: 8000, comments: 300, url: 'https://instagram.com/p/a/' }),
      matched({ ownerUsername: 'rnbpage', postId: 'b', postedAt: '2026-07-01T00:00:00Z', likes: null, comments: null }),
      matched({ ownerUsername: 'bigcelb', postId: 'c', postedAt: '2026-06-10T00:00:00Z', likes: 100, comments: 0, strongEvidence: false }),
    ];
    const profiles = new Map<string, PageProfile>([
      ['rnbpage', profile()],
      ['bigcelb', profile({ username: 'bigcelb', followers: 3_000_000 })],
    ]);
    const { results } = assembleResults(posts, profiles, ryan(), OPTIONS);
    expect(results[0].username).toBe('rnbpage');
    // The all-null post contributes no engagement observation: avg is 8300, not 4150.
    expect(results[0].avgEngagement).toBe(8300);
    expect(results[0].latestPostUrl).toBe('https://instagram.com/p/a/');
    expect(results[0].postCount).toBe(2);
    expect(results[0].priority).toBeGreaterThan(results[1].priority);
  });

  it('a post outside the window does not count toward a page', () => {
    const posts: MatchedPost[] = [
      matched({ ownerUsername: 'rnbpage', postId: 'in', postedAt: '2026-08-01T00:00:00Z' }),
      matched({ ownerUsername: 'rnbpage', postId: 'out', postedAt: '2026-01-01T00:00:00Z' }),
    ];
    const { results } = assembleResults(posts, new Map([['rnbpage', profile()]]), ryan(), OPTIONS);
    expect(results[0].postCount).toBe(1);
  });
});

describe('enrichment candidate selection', () => {
  it('is bounded and prefers strong evidence and volume, excluding the artist', () => {
    const posts: MatchedPost[] = [];
    for (let i = 0; i < 40; i += 1) {
      posts.push(matched({ ownerUsername: `page${i}`, postId: `p${i}`, strongEvidence: false }));
    }
    posts.push(matched({ ownerUsername: 'heavy', postId: 'h1' }));
    posts.push(matched({ ownerUsername: 'heavy', postId: 'h2' }));
    posts.push(matched({ ownerUsername: 'ryanleslie', postId: 'self' }));
    const picked = selectEnrichmentCandidates(posts, ryan());
    expect(picked.length).toBeLessThanOrEqual(MAX_ENRICHED_AUTHORS);
    expect(picked[0]).toBe('heavy');
    expect(picked).not.toContain('ryanleslie');
  });
});
