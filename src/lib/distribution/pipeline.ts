// Pure assembly pipeline for the Artist Distribution Finder:
// matched posts + enriched profiles -> filtered, scored, ranked results.
// No I/O here; the API route feeds it provider data or persisted observations.

import type {
  ArtistIdentity,
  DistributionResult,
  MatchedPost,
  PageProfile,
  ResultSource,
  SearchOptions,
} from './types';
import { collapseToTag } from './queries';
import { computeAffinity, computeDistributionValue, computePriority } from './score';

/** Bounded profile enrichment: never enrich more than this many authors. */
export const MAX_ENRICHED_AUTHORS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function withinWindow(postedAt: string | null, options: SearchOptions): boolean {
  if (!postedAt) return false; // an undated post cannot prove recency
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return false;
  return options.now.getTime() - t <= options.windowDays * DAY_MS && t <= options.now.getTime() + DAY_MS;
}

/**
 * Is this page identifiably the artist themself? Only excludes on real
 * identity evidence: the supplied handle, or a username that IS the collapsed
 * artist name / alias.
 */
export function isArtistOwnAccount(username: string, identity: ArtistIdentity): boolean {
  const u = username.toLowerCase();
  if (identity.handle && u === identity.handle) return true;
  if (u === collapseToTag(identity.nameNormalized)) return true;
  return identity.aliases.some((alias) => u === collapseToTag(alias));
}

/**
 * Pick which authors are worth spending profile enrichment on: strongest
 * evidence first, then matched-post volume, then best observed engagement.
 */
export function selectEnrichmentCandidates(
  posts: MatchedPost[],
  identity: ArtistIdentity,
  cap: number = MAX_ENRICHED_AUTHORS,
): string[] {
  const byAuthor = new Map<string, { strong: number; total: number; bestEngagement: number }>();
  for (const post of posts) {
    const username = post.ownerUsername.toLowerCase();
    if (isArtistOwnAccount(username, identity)) continue;
    const entry = byAuthor.get(username) ?? { strong: 0, total: 0, bestEngagement: 0 };
    entry.total += 1;
    if (post.strongEvidence) entry.strong += 1;
    const engagement = (post.likes ?? 0) + (post.comments ?? 0);
    if (engagement > entry.bestEngagement) entry.bestEngagement = engagement;
    byAuthor.set(username, entry);
  }
  return [...byAuthor.entries()]
    .sort(([, a], [, b]) => b.strong - a.strong || b.total - a.total || b.bestEngagement - a.bestEngagement)
    .slice(0, cap)
    .map(([username]) => username);
}

export interface AssembledResults {
  results: DistributionResult[];
  /** Authors whose profiles could not be enriched (partial provider failure). */
  unenrichedAuthors: string[];
  /** Pages excluded only because they sit below the follower threshold. */
  belowThresholdCount: number;
  /**
   * Pages that MATCHED the artist inside the window (before any eligibility
   * filtering, after self-exclusion). The empty state must report this,
   * never "0 pages matched" when matches were merely filtered.
   */
  totalMatchedPages: number;
}

export function assembleResults(
  posts: MatchedPost[],
  profiles: Map<string, PageProfile>,
  identity: ArtistIdentity,
  options: SearchOptions,
  sources?: Map<string, ResultSource>,
): AssembledResults {
  const inWindow = posts.filter((p) => withinWindow(p.postedAt, options));

  const byAuthor = new Map<string, MatchedPost[]>();
  for (const post of inWindow) {
    const username = post.ownerUsername.toLowerCase();
    if (isArtistOwnAccount(username, identity)) continue;
    const list = byAuthor.get(username) ?? [];
    list.push(post);
    byAuthor.set(username, list);
  }

  const results: DistributionResult[] = [];
  const unenrichedAuthors: string[] = [];
  let belowThresholdCount = 0;

  for (const [username, authorPosts] of byAuthor) {
    const profile = profiles.get(username) ?? null;
    if (!profile) {
      unenrichedAuthors.push(username);
      continue;
    }
    if (profile.isPrivate === true) continue;
    if (profile.followers === null || profile.followers < options.minFollowers) {
      if (profile.followers !== null) belowThresholdCount += 1;
      else unenrichedAuthors.push(username);
      continue;
    }

    const dated = authorPosts
      .filter((p) => p.postedAt !== null)
      .sort((a, b) => Date.parse(b.postedAt as string) - Date.parse(a.postedAt as string));
    const latest = dated[0] ?? null;
    const latestPostAt = latest?.postedAt ?? null;
    const daysSinceLatest = latestPostAt
      ? Math.max(0, (options.now.getTime() - Date.parse(latestPostAt)) / DAY_MS)
      : null;

    const observed = authorPosts
      .map((p) => (p.likes === null && p.comments === null ? null : (p.likes ?? 0) + (p.comments ?? 0)))
      .filter((v): v is number => v !== null);
    const avgEngagement = observed.length > 0 ? Math.round(observed.reduce((a, b) => a + b, 0) / observed.length) : null;

    const strongCount = authorPosts.filter((p) => p.strongEvidence).length;

    const { affinity, components: affinityComponents } = computeAffinity({
      daysSinceLatest,
      postCount: authorPosts.length,
      strongEvidenceRatio: authorPosts.length > 0 ? strongCount / authorPosts.length : 0,
      avgEngagement,
      followers: profile.followers,
      windowDays: options.windowDays,
    });
    const { distributionValue, components: distributionComponents } = computeDistributionValue({
      followers: profile.followers,
      avgEngagement,
    });

    results.push({
      username,
      profile,
      matchedPosts: authorPosts,
      postCount: authorPosts.length,
      latestPostAt,
      latestPostUrl: latest?.url ?? null,
      avgEngagement,
      affinity,
      affinityComponents,
      distributionValue,
      distributionComponents,
      priority: computePriority(affinity, distributionValue),
      source: sources?.get(username) ?? 'global',
    });
  }

  results.sort((a, b) => b.priority - a.priority || (b.profile.followers ?? 0) - (a.profile.followers ?? 0));
  return { results, unenrichedAuthors, belowThresholdCount, totalMatchedPages: byAuthor.size };
}
