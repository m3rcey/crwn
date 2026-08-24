// Big Page Index: pure helpers (no I/O). The index is a persistent universe
// of significant Instagram pages plus a cached corpus of their recent public
// posts, so an artist search asks the LOCAL corpus "which known pages posted
// this artist recently" instead of re-scraping anything.

import type { ArtistIdentity, DiscoveredPost, MatchedPost, PageProfile, ResultSource } from './types';
import { postOrigin } from './types';
import { buildQuerySet, normalizeHandle } from './queries';
import { pageKey } from './dedupe';

/**
 * A page found by GLOBAL discovery joins the index at or above this follower
 * count. Same default as the search's follower minimum on purpose: one
 * definition of "significant". Manual and bootstrap additions are
 * founder-curated and are indexed regardless.
 */
export const SIGNIFICANT_PAGE_FOLLOWERS = 50_000;

/** Recent posts fetched per page on an index refresh (cost ceiling per page). */
export const POSTS_PER_PAGE_REFRESH = 24;
/** Date floor for corpus posts: the provider is told to go no further back. */
export const CORPUS_WINDOW_DAYS = 90;
/** A page's recent-post cache is stale after this many hours. */
export const POSTS_FRESH_HOURS = 7 * 24;
/** Usernames per provider posts-run during a refresh. */
export const REFRESH_BATCH_SIZE = 25;
/** Most corpus rows pulled per artist search (SQL prefilter cap). */
export const CORPUS_MATCH_LIMIT = 500;

/** Should this enriched profile be (or stay) index-eligible? */
export function decideIndexEligibility(
  profile: Pick<PageProfile, 'followers' | 'isPrivate'>,
  source: 'global_search' | 'manual' | 'bootstrap',
  threshold: number = SIGNIFICANT_PAGE_FOLLOWERS,
): boolean {
  if (profile.isPrivate === true) return false;
  if (source === 'manual') return true; // the founder chose it
  return profile.followers !== null && profile.followers >= threshold;
}

/**
 * ilike prefilter patterns for the corpus query. Broad on purpose: the
 * deterministic matcher (toMatchedPosts) makes the real decision afterwards,
 * so a false prefilter hit costs nothing but a row fetch.
 */
export function buildCorpusSearchPatterns(identity: ArtistIdentity): string[] {
  // Strip characters PostgREST's or() parser treats as syntax, escape LIKE wildcards.
  const escape = (s: string) => s.replace(/[%_\\]/g, (m) => `\\${m}`).replace(/[(),]/g, '');
  const terms = new Set<string>();
  terms.add(identity.nameNormalized);
  if (identity.handle) terms.add(`@${identity.handle}`);
  for (const alias of identity.aliases) terms.add(alias);
  const { hashtags } = buildQuerySet(identity);
  for (const tag of hashtags) terms.add(`#${tag}`);
  return [...terms].filter((t) => t.length >= 3).map((t) => `%${escape(t)}%`);
}

export interface CorpusPostRow {
  page_username: string;
  post_key: string;
  post_url: string;
  caption: string | null;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
}

/** Corpus rows become DiscoveredPosts with kind 'corpus': caption evidence only. */
export function corpusRowToDiscoveredPost(row: CorpusPostRow): DiscoveredPost {
  return {
    postId: row.post_key.startsWith('id:') ? row.post_key.slice(3) : null,
    shortcode: row.post_key.startsWith('sc:') ? row.post_key.slice(3) : null,
    url: row.post_url,
    caption: row.caption,
    postedAt: row.posted_at,
    likes: row.likes,
    comments: row.comments,
    views: row.views,
    ownerUsername: row.page_username,
    ownerId: null,
    sourceQuery: '',
    sourceKind: 'corpus',
  };
}

/**
 * Per-page source attribution, computed BEFORE post dedupe so a post found by
 * both the corpus and global discovery still marks the page as 'both'.
 */
export function pageSources(posts: MatchedPost[]): Map<string, ResultSource> {
  const map = new Map<string, ResultSource>();
  for (const post of posts) {
    const key = post.ownerUsername.toLowerCase();
    const origin = postOrigin(post);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, origin);
    } else if (existing !== 'both' && existing !== origin) {
      map.set(key, 'both');
    }
  }
  return map;
}

export interface IndexPageRow {
  username: string;
  last_posts_refresh_at: string | null;
}

/** Pages whose recent-post cache is stale (or never fetched), oldest first. */
export function selectStalePages(pages: IndexPageRow[], now: Date, freshHours: number = POSTS_FRESH_HOURS): string[] {
  const cutoff = now.getTime() - freshHours * 60 * 60 * 1000;
  return pages
    .filter((p) => {
      if (!p.last_posts_refresh_at) return true;
      const t = Date.parse(p.last_posts_refresh_at);
      return Number.isNaN(t) || t < cutoff;
    })
    .sort((a, b) => {
      const ta = a.last_posts_refresh_at ? Date.parse(a.last_posts_refresh_at) : 0;
      const tb = b.last_posts_refresh_at ? Date.parse(b.last_posts_refresh_at) : 0;
      return ta - tb;
    })
    .map((p) => p.username);
}

export function batchUsernames(usernames: string[], batchSize: number = REFRESH_BATCH_SIZE): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < usernames.length; i += batchSize) {
    batches.push(usernames.slice(i, i + batchSize));
  }
  return batches;
}

/** Parse founder-pasted handles ("@a, @b" / newline-separated), deduped. */
export function parseHandleList(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const handle = normalizeHandle(entry);
    if (!handle || !/^[a-z0-9._]{2,30}$/.test(handle) || seen.has(handle)) continue;
    seen.add(handle);
    out.push(handle);
  }
  return out;
}

/**
 * Provider-run estimate for a reference-artist bootstrap, shown to the
 * founder before starting. Each artist reuses the existing global discovery
 * (one run per query term) plus at most one enrichment run.
 */
export function estimateBootstrapRuns(artists: string[]): { artists: number; discoveryRuns: number; enrichmentRuns: number } {
  let discoveryRuns = 0;
  let counted = 0;
  for (const name of artists) {
    const trimmed = name.trim();
    if (trimmed.length < 2) continue;
    counted += 1;
    const qs = buildQuerySet({
      name: trimmed,
      nameNormalized: trimmed.toLowerCase().replace(/\s+/g, ' '),
      handle: null,
      aliases: [],
    });
    discoveryRuns += qs.keywords.length + qs.hashtags.length;
  }
  return { artists: counted, discoveryRuns, enrichmentRuns: counted };
}

/** Dedupe profiles for index insertion (by ig user id, else username). */
export function dedupeProfiles(profiles: PageProfile[]): PageProfile[] {
  const byKey = new Map<string, PageProfile>();
  for (const profile of profiles) {
    const key = pageKey({ ownerId: profile.igUserId, ownerUsername: profile.username });
    if (!byKey.has(key)) byKey.set(key, profile);
  }
  return [...byKey.values()];
}
