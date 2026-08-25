// Direct Big Page Discovery: pure helpers (no I/O).
//
// Production proved (Ryan Leslie, then Brent Faiyaz) that artist keyword and
// hashtag discovery structurally surfaces tiny personal accounts, so it
// cannot build the large-page universe the Big Page Index needs. This module
// discovers the universe DIRECTLY: topic profile search ("r&b", "hip hop",
// "music news" against Instagram's user search) and bounded related-profile
// expansion from indexed seeds. Candidates land in a founder REVIEW table,
// never straight into the canonical index; the founder's "Add Selected" runs
// the EXISTING manual-add flow, so the index keeps one write path.
//
// Deterministic throughout: no LLM touches classification or ranking.

import type { PageProfile } from './types';
import { SIGNIFICANT_PAGE_FOLLOWERS } from './corpus';
import { normalizeHandle } from './queries';

/** Editable defaults for the topic search. A starting point, not a rule. */
export const DEFAULT_DISCOVERY_TOPICS = [
  'r&b',
  'hip hop',
  'music news',
  'music media',
  'black music',
  'music culture',
  'independent music',
];

export const MAX_DISCOVERY_TOPICS = 10;
/** Profile-search results requested per topic term. */
export const SEARCH_RESULTS_PER_TOPIC = 25;
/** Seeds accepted per related-profile expansion. Depth 1 only, on purpose. */
export const MAX_EXPANSION_SEEDS = 10;
/** Related candidates enriched per expansion (cost ceiling). */
export const EXPANSION_ENRICH_CAP = 100;
/** Bio excerpt length in the review table. */
export const BIO_EXCERPT_LENGTH = 160;

/**
 * Seed Value ranks candidates for founder REVIEW. It is deliberately not the
 * artist-facing Distribution Value: there is no artist here, only "is this
 * page plausibly a distribution node worth indexing".
 */
export const SEED_VALUE_WEIGHTS = {
  /** Reach, log-scaled. The hard 50K floor already removed tiny pages. */
  audience: 50,
  /** How many independent discovery signals surfaced it (topics + seeds). */
  corroboration: 25,
  /** Music/culture terms in the public category, name or bio. Boost only, never a filter. */
  relevance: 15,
  verification: 10,
} as const;

/** Full corroboration credit at this many independent discovery signals. */
export const CORROBORATION_SATURATION = 3;

/**
 * Deterministic relevance vocabulary. A hit BOOSTS ranking; a miss never
 * rejects (a Black-culture or entertainment page can matter without Instagram
 * labeling it "music").
 */
export const RELEVANCE_TERMS = [
  'music', 'hip hop', 'hip-hop', 'hiphop', 'rap', 'r&b', 'rnb', 'soul',
  'artist', 'culture', 'entertainment', 'media', 'magazine', 'radio', 'dj',
  'producer', 'records', 'label', 'playlist', 'song', 'album',
];

export interface DiscoveryCandidate {
  username: string;
  displayName: string | null;
  followers: number | null;
  verified: boolean | null;
  isPrivate: boolean | null;
  category: string | null;
  bioExcerpt: string | null;
  profileUrl: string;
  /** Topic terms that surfaced this page. */
  topics: string[];
  /** Indexed seed pages that listed this page as related. */
  seeds: string[];
  seedValue: number;
  seedComponents: { audience: number; corroboration: number; relevance: number; verification: number };
}

export function parseTopicList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const term = entry.trim().replace(/\s+/g, ' ').toLowerCase();
    if (term.length < 2 || term.length > 40 || seen.has(term)) continue;
    seen.add(term);
    out.push(term);
    if (out.length >= MAX_DISCOVERY_TOPICS) break;
  }
  return out;
}

export function parseSeedList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const handle = normalizeHandle(entry);
    if (!handle || !/^[a-z0-9._]{2,30}$/.test(handle) || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
    if (out.length >= MAX_EXPANSION_SEEDS) break;
  }
  return out;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function relevanceHits(candidate: Pick<DiscoveryCandidate, 'displayName' | 'category' | 'bioExcerpt'>): number {
  const haystack = [candidate.displayName ?? '', candidate.category ?? '', candidate.bioExcerpt ?? '']
    .join(' ')
    .toLowerCase();
  let hits = 0;
  for (const term of RELEVANCE_TERMS) {
    if (haystack.includes(term)) hits += 1;
  }
  return hits;
}

export function computeSeedValue(
  candidate: Pick<DiscoveryCandidate, 'followers' | 'verified' | 'displayName' | 'category' | 'bioExcerpt' | 'topics' | 'seeds'>,
): { seedValue: number; components: DiscoveryCandidate['seedComponents'] } {
  const audience = candidate.followers !== null && candidate.followers > 0
    ? clamp01((Math.log10(candidate.followers) - 4) / 3)
    : 0;
  const corroboration = clamp01((candidate.topics.length + candidate.seeds.length) / CORROBORATION_SATURATION);
  const relevance = clamp01(relevanceHits(candidate) / 3);
  const verification = candidate.verified === true ? 1 : 0;
  const seedValue =
    audience * SEED_VALUE_WEIGHTS.audience +
    corroboration * SEED_VALUE_WEIGHTS.corroboration +
    relevance * SEED_VALUE_WEIGHTS.relevance +
    verification * SEED_VALUE_WEIGHTS.verification;
  return {
    seedValue: Math.round(seedValue),
    components: {
      audience: Math.round(audience * 100),
      corroboration: Math.round(corroboration * 100),
      relevance: Math.round(relevance * 100),
      verification: Math.round(verification * 100),
    },
  };
}

export function profileToCandidateBase(profile: PageProfile): Omit<DiscoveryCandidate, 'topics' | 'seeds' | 'seedValue' | 'seedComponents'> {
  const bio = profile.biography?.trim() ?? null;
  return {
    username: profile.username,
    displayName: profile.displayName,
    followers: profile.followers,
    verified: profile.verified,
    isPrivate: profile.isPrivate,
    category: profile.category,
    bioExcerpt: bio ? (bio.length > BIO_EXCERPT_LENGTH ? `${bio.slice(0, BIO_EXCERPT_LENGTH - 3)}...` : bio) : null,
    profileUrl: profile.profileUrl,
  };
}

/**
 * Merge discovery observations of the same page: the page appears ONCE and
 * keeps every discovery reason (all topics, all seeds). Later observations
 * fill missing profile fields but never overwrite observed ones.
 */
export function mergeCandidates(
  observations: Array<{ profile: PageProfile; topic?: string; seed?: string }>,
): Map<string, DiscoveryCandidate> {
  const merged = new Map<string, DiscoveryCandidate>();
  for (const { profile, topic, seed } of observations) {
    const username = profile.username.toLowerCase();
    if (!/^[a-z0-9._]{2,30}$/.test(username)) continue;
    let candidate = merged.get(username);
    if (!candidate) {
      candidate = { ...profileToCandidateBase(profile), topics: [], seeds: [], seedValue: 0, seedComponents: { audience: 0, corroboration: 0, relevance: 0, verification: 0 } };
      merged.set(username, candidate);
    } else {
      if (candidate.followers === null) candidate.followers = profile.followers;
      if (candidate.verified === null) candidate.verified = profile.verified;
      if (candidate.isPrivate === null) candidate.isPrivate = profile.isPrivate;
      if (candidate.category === null) candidate.category = profile.category;
      if (candidate.bioExcerpt === null) candidate.bioExcerpt = profileToCandidateBase(profile).bioExcerpt;
    }
    if (topic && !candidate.topics.includes(topic)) candidate.topics.push(topic);
    if (seed && !candidate.seeds.includes(seed)) candidate.seeds.push(seed);
  }
  return merged;
}

export interface QualificationOutcome {
  qualified: DiscoveryCandidate[];
  excluded: { belowThreshold: number; privateAccounts: number; alreadyIndexed: number; unknownFollowers: number };
}

/**
 * Hard gate into the review table. Relevance never filters; these do:
 * follower floor (unknown counts as unqualified, never as zero evidence of
 * size), public account, not already indexed.
 */
export function qualifyCandidates(
  candidates: Iterable<DiscoveryCandidate>,
  alreadyIndexed: Set<string>,
  threshold: number = SIGNIFICANT_PAGE_FOLLOWERS,
): QualificationOutcome {
  const qualified: DiscoveryCandidate[] = [];
  const excluded = { belowThreshold: 0, privateAccounts: 0, alreadyIndexed: 0, unknownFollowers: 0 };
  for (const candidate of candidates) {
    if (alreadyIndexed.has(candidate.username)) {
      excluded.alreadyIndexed += 1;
      continue;
    }
    if (candidate.isPrivate === true) {
      excluded.privateAccounts += 1;
      continue;
    }
    if (candidate.followers === null) {
      excluded.unknownFollowers += 1;
      continue;
    }
    if (candidate.followers < threshold) {
      excluded.belowThreshold += 1;
      continue;
    }
    const { seedValue, components } = computeSeedValue(candidate);
    qualified.push({ ...candidate, seedValue, seedComponents: components });
  }
  qualified.sort((a, b) => b.seedValue - a.seedValue || (b.followers ?? 0) - (a.followers ?? 0));
  return { qualified, excluded };
}

/** Related-profile stubs from a seed scrape (no follower counts yet). */
export interface RelatedStub {
  username: string;
  verified: boolean | null;
  isPrivate: boolean | null;
}

/**
 * Plan the expansion enrichment: dedupe related stubs across seeds (keeping
 * every seed relationship), drop known-private and already-indexed pages
 * BEFORE paying for enrichment, and cap the batch.
 */
export function planExpansionEnrichment(
  bySeed: Map<string, RelatedStub[]>,
  alreadyIndexed: Set<string>,
  cap: number = EXPANSION_ENRICH_CAP,
): { usernames: string[]; provenance: Record<string, string[]>; droppedIndexed: number; droppedPrivate: number; droppedByCap: number } {
  const provenance: Record<string, string[]> = {};
  let droppedIndexed = 0;
  let droppedPrivate = 0;
  for (const [seed, stubs] of bySeed) {
    for (const stub of stubs) {
      const username = stub.username.toLowerCase();
      if (!/^[a-z0-9._]{2,30}$/.test(username) || username === seed) continue;
      if (alreadyIndexed.has(username)) {
        if (!provenance[username]) droppedIndexed += 1;
        continue;
      }
      if (stub.isPrivate === true) {
        if (!provenance[username]) droppedPrivate += 1;
        continue;
      }
      if (!provenance[username]) provenance[username] = [];
      if (!provenance[username].includes(seed)) provenance[username].push(seed);
    }
  }
  const all = Object.keys(provenance);
  const usernames = all.slice(0, cap);
  const droppedByCap = all.length - usernames.length;
  const cappedProvenance: Record<string, string[]> = {};
  for (const u of usernames) cappedProvenance[u] = provenance[u];
  return { usernames, provenance: cappedProvenance, droppedIndexed, droppedPrivate, droppedByCap };
}

/** Pre-run estimate shown to the founder before a topic discovery starts. */
export function estimateTopicDiscovery(topics: string[]): { searches: number; maxCandidates: number } {
  return { searches: topics.length, maxCandidates: topics.length * SEARCH_RESULTS_PER_TOPIC };
}
