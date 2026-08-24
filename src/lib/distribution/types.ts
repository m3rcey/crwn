// Artist Distribution Finder: normalized internal types.
// Provider-specific response shapes (Apify actor items) belong ONLY in the
// adapter (apifyProvider.ts). Everything else in the feature operates on these.

export interface ArtistIdentity {
  /** Raw artist name as entered by the founder. */
  name: string;
  /** Lowercased, whitespace-collapsed name. The cache/persistence key. */
  nameNormalized: string;
  /** Instagram handle, lowercased, no leading @. Null when not supplied. */
  handle: string | null;
  /** Normalized aliases (lowercased, deduped, never empty strings). */
  aliases: string[];
}

export interface QuerySet {
  /** Free-text keyword searches (name + aliases). */
  keywords: string[];
  /** Hashtag searches, stored without the leading #. */
  hashtags: string[];
}

export type SourceKind = 'keyword' | 'hashtag';

export interface DiscoveredPost {
  /** Instagram's post id when available. Strongest dedupe key. */
  postId: string | null;
  shortcode: string | null;
  url: string;
  caption: string | null;
  /** ISO timestamp. Null when the provider omitted it. */
  postedAt: string | null;
  /** Null means "not publicly observable" (hidden likes), NEVER zero. */
  likes: number | null;
  comments: number | null;
  views: number | null;
  /** Lowercased owner username. */
  ownerUsername: string;
  ownerId: string | null;
  /** The query term that surfaced this post (provenance). */
  sourceQuery: string;
  sourceKind: SourceKind;
}

export interface MatchDecision {
  matched: boolean;
  /** Human-readable, auditable reason. Null when not matched. */
  reason: string | null;
  /** True for caption-level evidence (handle/name/alias/hashtag in caption). */
  strong: boolean;
}

export interface MatchedPost extends DiscoveredPost {
  matchReason: string;
  strongEvidence: boolean;
}

export interface PageProfile {
  igUserId: string | null;
  /** Lowercased username. */
  username: string;
  displayName: string | null;
  /** Null means enrichment did not observe a count, never zero. */
  followers: number | null;
  verified: boolean | null;
  isPrivate: boolean | null;
  category: string | null;
  biography: string | null;
  profileUrl: string;
}

export interface ScoreComponents {
  /** Each component is 0-100, or null when genuinely unobserved. */
  audience: number | null;
  recency: number | null;
  frequency: number | null;
  engagement: number | null;
  evidence: number | null;
}

export interface DistributionResult {
  username: string;
  profile: PageProfile;
  matchedPosts: MatchedPost[];
  postCount: number;
  latestPostAt: string | null;
  latestPostUrl: string | null;
  /** Average of likes+comments across posts with observed metrics; null when none observed. */
  avgEngagement: number | null;
  score: number;
  components: ScoreComponents;
}

export interface SearchOptions {
  windowDays: number;
  minFollowers: number;
  /** Reference time for window/recency math, injected for determinism. */
  now: Date;
}
