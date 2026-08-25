// Direct Big Page Discovery: pure-logic tests for normalization, provenance
// merging, qualification, Seed Value ranking, and bounded expansion planning.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCOVERY_TOPICS,
  EXPANSION_ENRICH_CAP,
  MAX_DISCOVERY_TOPICS,
  MAX_EXPANSION_SEEDS,
  SEED_VALUE_WEIGHTS,
  computeSeedValue,
  estimateTopicDiscovery,
  mergeCandidates,
  parseSeedList,
  parseTopicList,
  planExpansionEnrichment,
  qualifyCandidates,
  SEARCH_RESULTS_PER_TOPIC,
} from './discovery';
import { SIGNIFICANT_PAGE_FOLLOWERS } from './corpus';
import type { PageProfile } from './types';
import type { RelatedStub } from './discovery';

function profile(overrides: Partial<PageProfile> = {}): PageProfile {
  return {
    igUserId: null,
    username: 'rnbpage',
    displayName: 'R&B Page',
    followers: 500_000,
    verified: false,
    isPrivate: false,
    category: 'Media',
    biography: 'Daily R&B and soul music.',
    profileUrl: 'https://www.instagram.com/rnbpage/',
    ...overrides,
  };
}

describe('topic and seed input parsing', () => {
  it('normalizes, dedupes and caps topics', () => {
    const parsed = parseTopicList(['  R&B ', 'r&b', 'Hip  Hop', '', 'x'.repeat(41)]);
    expect(parsed).toEqual(['r&b', 'hip hop']);
    expect(parseTopicList(Array.from({ length: 30 }, (_, i) => `topic ${i}`))).toHaveLength(MAX_DISCOVERY_TOPICS);
    expect(DEFAULT_DISCOVERY_TOPICS.length).toBeLessThanOrEqual(MAX_DISCOVERY_TOPICS);
  });

  it('parses seeds like handles and caps them', () => {
    expect(parseSeedList(['@PureStrap', 'purestrap', 'bad handle!'])).toEqual(['purestrap']);
    expect(parseSeedList(Array.from({ length: 30 }, (_, i) => `seed${i}`))).toHaveLength(MAX_EXPANSION_SEEDS);
  });

  it('estimates the pre-run workload from the parsed topics', () => {
    const estimate = estimateTopicDiscovery(['r&b', 'hip hop']);
    expect(estimate).toEqual({ searches: 2, maxCandidates: 2 * SEARCH_RESULTS_PER_TOPIC });
  });
});

describe('provenance merging', () => {
  it('a page found via multiple topics appears once and keeps every discovery reason', () => {
    const merged = mergeCandidates([
      { profile: profile(), topic: 'r&b' },
      { profile: profile(), topic: 'music media' },
      { profile: profile({ username: 'otherpage' }), topic: 'r&b' },
    ]);
    expect(merged.size).toBe(2);
    expect(merged.get('rnbpage')?.topics).toEqual(['r&b', 'music media']);
  });

  it('later observations fill missing fields but never overwrite observed ones', () => {
    const merged = mergeCandidates([
      { profile: profile({ followers: null, category: null }), topic: 'r&b' },
      { profile: profile({ followers: 750_000, category: 'Media' }), seed: 'purestrap' },
    ]);
    const candidate = merged.get('rnbpage');
    expect(candidate?.followers).toBe(750_000);
    expect(candidate?.category).toBe('Media');
    expect(candidate?.topics).toEqual(['r&b']);
    expect(candidate?.seeds).toEqual(['purestrap']);
  });

  it('skips malformed usernames safely', () => {
    const merged = mergeCandidates([{ profile: profile({ username: 'not a user!!' }), topic: 'r&b' }]);
    expect(merged.size).toBe(0);
  });
});

describe('candidate qualification', () => {
  function candidatesFrom(profiles: PageProfile[]) {
    return mergeCandidates(profiles.map((p) => ({ profile: p, topic: 'r&b' }))).values();
  }

  it('applies the hard gate: threshold, public, not indexed, known followers', () => {
    const { qualified, excluded } = qualifyCandidates(
      candidatesFrom([
        profile({ username: 'bigpage', followers: SIGNIFICANT_PAGE_FOLLOWERS }),
        profile({ username: 'smallpage', followers: SIGNIFICANT_PAGE_FOLLOWERS - 1 }),
        profile({ username: 'privatepage', isPrivate: true, followers: 900_000 }),
        profile({ username: 'indexedpage', followers: 800_000 }),
        profile({ username: 'unknownpage', followers: null }),
      ]),
      new Set(['indexedpage']),
    );
    expect(qualified.map((c) => c.username)).toEqual(['bigpage']);
    expect(excluded).toEqual({ belowThreshold: 1, privateAccounts: 1, alreadyIndexed: 1, unknownFollowers: 1 });
  });

  it('ranks by Seed Value with reach leading, corroboration and relevance boosting', () => {
    const { qualified } = qualifyCandidates(
      mergeCandidates([
        { profile: profile({ username: 'corroborated', followers: 300_000 }), topic: 'r&b' },
        { profile: profile({ username: 'corroborated' }), topic: 'music media' },
        { profile: profile({ username: 'corroborated' }), seed: 'purestrap' },
        { profile: profile({ username: 'lonely', followers: 300_000 }), topic: 'r&b' },
        { profile: profile({ username: 'giant', followers: 5_000_000 }), topic: 'r&b' },
      ]).values(),
      new Set(),
    );
    const order = qualified.map((c) => c.username);
    // Reach dominates: the 5M page leads even with one discovery signal.
    expect(order[0]).toBe('giant');
    // Equal reach: three independent signals beat one.
    expect(order.indexOf('corroborated')).toBeLessThan(order.indexOf('lonely'));
  });

  it('relevance boosts but never rejects: a generic-category page still qualifies', () => {
    const { qualified } = qualifyCandidates(
      candidatesFrom([
        profile({ username: 'genericpage', category: 'Public Figure', biography: 'Living my life', displayName: 'Some Page', followers: 200_000 }),
      ]),
      new Set(),
    );
    expect(qualified.map((c) => c.username)).toEqual(['genericpage']);
    expect(qualified[0].seedComponents.relevance).toBe(0);
  });

  it('keeps weights centralized and summing to 100', () => {
    expect(Object.values(SEED_VALUE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    const maxed = computeSeedValue({
      followers: 10_000_000,
      verified: true,
      displayName: 'Music Media',
      category: 'Music',
      bioExcerpt: 'hip hop and r&b culture',
      topics: ['a', 'b'],
      seeds: ['c'],
    });
    expect(maxed.seedValue).toBe(100);
  });
});

describe('expansion planning', () => {
  const stub = (username: string, overrides: Partial<RelatedStub> = {}): RelatedStub => ({
    username,
    verified: null,
    isPrivate: false,
    ...overrides,
  });

  it('dedupes related profiles across seeds while keeping every seed relationship', () => {
    const plan = planExpansionEnrichment(
      new Map([
        ['purestrap', [stub('shared'), stub('onlyone')]],
        ['plugcaptions', [stub('shared')]],
      ]),
      new Set(),
    );
    expect(plan.usernames.sort()).toEqual(['onlyone', 'shared']);
    expect(plan.provenance.shared).toEqual(['purestrap', 'plugcaptions']);
    expect(plan.provenance.onlyone).toEqual(['purestrap']);
  });

  it('drops indexed and private pages before paying for enrichment, and never returns a seed as its own candidate', () => {
    const plan = planExpansionEnrichment(
      new Map([
        ['purestrap', [stub('purestrap'), stub('alreadyin'), stub('hidden', { isPrivate: true }), stub('fresh')]],
      ]),
      new Set(['alreadyin']),
    );
    expect(plan.usernames).toEqual(['fresh']);
    expect(plan.droppedIndexed).toBe(1);
    expect(plan.droppedPrivate).toBe(1);
  });

  it('caps the enrichment batch and reports what the cap dropped', () => {
    const many = Array.from({ length: EXPANSION_ENRICH_CAP + 20 }, (_, i) => stub(`rel${i}`));
    const plan = planExpansionEnrichment(new Map([['purestrap', many]]), new Set());
    expect(plan.usernames).toHaveLength(EXPANSION_ENRICH_CAP);
    expect(plan.droppedByCap).toBe(20);
    expect(Object.keys(plan.provenance)).toHaveLength(EXPANSION_ENRICH_CAP);
  });
});
