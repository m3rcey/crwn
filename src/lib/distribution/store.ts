// Persistence + cache for the Artist Distribution Finder. SERVER-SIDE ONLY:
// uses the service-role client, so it may only be imported from /api routes
// that have already passed requireAdmin(). The tables are admin-only
// (schema-phase3-distribution-finder.sql).
//
// Every method fails SOFT before the migration is applied (42P01/PGRST205):
// a live provider search still works, it just is not cached or compounded.

import { createClient } from '@supabase/supabase-js';
import type { ArtistIdentity, DiscoveredPost, MatchedPost, PageProfile } from './types';
import { postKey } from './dedupe';
import { toMatchedPosts } from './matching';
import {
  CORPUS_MATCH_LIMIT,
  POSTS_FRESH_HOURS,
  SIGNIFICANT_PAGE_FOLLOWERS,
  buildCorpusSearchPatterns,
  corpusRowToDiscoveredPost,
  decideIndexEligibility,
  dedupeProfiles,
  selectStalePages,
} from './corpus';

export type DiscoverySource = 'global_search' | 'manual' | 'bootstrap';

/** Reuse observations newer than this instead of re-calling the provider. */
export const CACHE_FRESH_HOURS = 24;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (error.message ?? '').toLowerCase().includes('does not exist') ||
    (error.message ?? '').toLowerCase().includes('could not find')
  );
}

export interface CacheReadResult {
  posts: MatchedPost[];
  profiles: Map<string, PageProfile>;
  /** Newest observation for this artist, ISO. Null when nothing is stored. */
  freshestObservedAt: string | null;
  /** True when the migration has not been applied yet. */
  migrationPending: boolean;
}

interface MentionRow {
  page_username: string;
  post_key: string;
  post_url: string;
  posted_at: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  match_reason: string;
  strong_evidence: boolean;
  source_query: string | null;
  observed_at: string;
}

interface PageRow {
  ig_user_id: string | null;
  username: string;
  display_name: string | null;
  followers: number | null;
  verified: boolean | null;
  is_private: boolean | null;
  category: string | null;
  biography: string | null;
  profile_url: string;
  last_observed_at: string;
}

export function isCacheFresh(freshestObservedAt: string | null, now: Date): boolean {
  if (!freshestObservedAt) return false;
  const t = Date.parse(freshestObservedAt);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= CACHE_FRESH_HOURS * 60 * 60 * 1000;
}

export async function readArtistCache(artistKey: string, windowDays: number, now: Date): Promise<CacheReadResult> {
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: mentions, error } = await supabaseAdmin
    .from('distribution_mentions')
    .select('page_username, post_key, post_url, posted_at, likes, comments, views, match_reason, strong_evidence, source_query, observed_at')
    .eq('artist_key', artistKey)
    .gte('posted_at', windowStart)
    .order('observed_at', { ascending: false })
    .limit(1000);

  if (error) {
    return { posts: [], profiles: new Map(), freshestObservedAt: null, migrationPending: isMissingTable(error) };
  }

  const rows = (mentions ?? []) as MentionRow[];
  const posts: MatchedPost[] = rows.map((row) => ({
    postId: row.post_key.startsWith('id:') ? row.post_key.slice(3) : null,
    shortcode: row.post_key.startsWith('sc:') ? row.post_key.slice(3) : null,
    url: row.post_url,
    caption: null,
    postedAt: row.posted_at,
    likes: row.likes,
    comments: row.comments,
    views: row.views,
    ownerUsername: row.page_username,
    ownerId: null,
    sourceQuery: row.source_query ?? '',
    sourceKind: 'keyword',
    matchReason: row.match_reason,
    strongEvidence: row.strong_evidence,
  }));

  const usernames = [...new Set(rows.map((r) => r.page_username))];
  const profiles = new Map<string, PageProfile>();
  if (usernames.length > 0) {
    const { data: pages, error: pagesError } = await supabaseAdmin
      .from('distribution_pages')
      .select('ig_user_id, username, display_name, followers, verified, is_private, category, biography, profile_url, last_observed_at')
      .in('username', usernames);
    if (!pagesError) {
      for (const page of (pages ?? []) as PageRow[]) {
        profiles.set(page.username, {
          igUserId: page.ig_user_id,
          username: page.username,
          displayName: page.display_name,
          followers: page.followers,
          verified: page.verified,
          isPrivate: page.is_private,
          category: page.category,
          biography: page.biography,
          profileUrl: page.profile_url,
        });
      }
    }
  }

  // Freshness comes from ALL observations for the artist, not only in-window
  // posts, so a fresh search that found little does not immediately re-run.
  const { data: newest } = await supabaseAdmin
    .from('distribution_mentions')
    .select('observed_at')
    .eq('artist_key', artistKey)
    .order('observed_at', { ascending: false })
    .limit(1);
  const freshestObservedAt = (newest as Array<{ observed_at: string }> | null)?.[0]?.observed_at ?? null;

  return { posts, profiles, freshestObservedAt, migrationPending: false };
}

/** Profiles observed within the freshness window: skip re-enriching these. */
export async function readFreshProfiles(usernames: string[], now: Date): Promise<Map<string, PageProfile>> {
  const fresh = new Map<string, PageProfile>();
  if (usernames.length === 0) return fresh;
  const cutoff = new Date(now.getTime() - CACHE_FRESH_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('distribution_pages')
    .select('ig_user_id, username, display_name, followers, verified, is_private, category, biography, profile_url, last_observed_at')
    .in('username', usernames)
    .gte('last_observed_at', cutoff);
  if (error) return fresh;
  for (const page of (data ?? []) as PageRow[]) {
    fresh.set(page.username, {
      igUserId: page.ig_user_id,
      username: page.username,
      displayName: page.display_name,
      followers: page.followers,
      verified: page.verified,
      isPrivate: page.is_private,
      category: page.category,
      biography: page.biography,
      profileUrl: page.profile_url,
    });
  }
  return fresh;
}

function baseProfileRow(p: PageProfile, nowIso: string) {
  return {
    ig_user_id: p.igUserId,
    username: p.username,
    display_name: p.displayName,
    followers: p.followers,
    verified: p.verified,
    is_private: p.isPrivate,
    category: p.category,
    biography: p.biography,
    profile_url: p.profileUrl,
    last_observed_at: nowIso,
  };
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || (error.message ?? '').toLowerCase().includes('column');
}

/**
 * Upsert enriched page profiles, maintaining Big Page Index metadata:
 * - NEW pages record how they were discovered and whether they qualify for
 *   the index (global finds need SIGNIFICANT_PAGE_FOLLOWERS; manual adds are
 *   founder-curated and always qualify while public).
 * - EXISTING pages keep their first_discovered_at/discovery_source; index
 *   eligibility only PROMOTES (a page that grew qualifies) except that a page
 *   turned private is demoted.
 * Falls back to the pre-index-migration shape on missing columns, and
 * swallows errors: caching is best-effort.
 */
export async function upsertPages(profiles: PageProfile[], source: DiscoverySource = 'global_search'): Promise<void> {
  const deduped = dedupeProfiles(profiles);
  if (deduped.length === 0) return;
  const nowIso = new Date().toISOString();
  const usernames = deduped.map((p) => p.username);

  const { data: existingRows, error: readError } = await supabaseAdmin
    .from('distribution_pages')
    .select('username, index_eligible, discovery_source')
    .in('username', usernames);

  if (readError) {
    // Pre-index-migration (or table missing): legacy upsert, no metadata.
    await supabaseAdmin
      .from('distribution_pages')
      .upsert(deduped.map((p) => baseProfileRow(p, nowIso)), { onConflict: 'username' });
    return;
  }

  const existing = new Map(
    ((existingRows ?? []) as Array<{ username: string; index_eligible: boolean | null; discovery_source: string | null }>).map(
      (r) => [r.username, r],
    ),
  );

  const inserts = deduped
    .filter((p) => !existing.has(p.username))
    .map((p) => ({
      ...baseProfileRow(p, nowIso),
      discovery_source: source,
      index_eligible: decideIndexEligibility(p, source),
      first_discovered_at: nowIso,
    }));
  const updates = deduped
    .filter((p) => existing.has(p.username))
    .map((p) => {
      const row = existing.get(p.username);
      const wasEligible = row?.index_eligible === true;
      const rowSource = (row?.discovery_source ?? 'global_search') as DiscoverySource;
      const eligible = p.isPrivate === true ? false : wasEligible || decideIndexEligibility(p, rowSource) || decideIndexEligibility(p, source);
      return { ...baseProfileRow(p, nowIso), index_eligible: eligible };
    });

  if (inserts.length > 0) {
    const { error } = await supabaseAdmin.from('distribution_pages').insert(inserts);
    if (isMissingColumn(error)) {
      await supabaseAdmin
        .from('distribution_pages')
        .upsert(inserts.map(({ ...row }) => {
          const { discovery_source: _s, index_eligible: _e, first_discovered_at: _f, ...legacy } = row;
          return legacy;
        }), { onConflict: 'username' });
    }
  }
  if (updates.length > 0) {
    const { error } = await supabaseAdmin.from('distribution_pages').upsert(updates, { onConflict: 'username' });
    if (isMissingColumn(error)) {
      await supabaseAdmin
        .from('distribution_pages')
        .upsert(updates.map(({ index_eligible: _e, ...legacy }) => legacy), { onConflict: 'username' });
    }
  }
}

// ---------------------------------------------------------------------------
// Big Page Index: recent-post corpus + index reads
// ---------------------------------------------------------------------------

/**
 * Search the cached corpus for posts that MIGHT mention the artist (broad
 * ilike prefilter; the deterministic matcher decides afterwards). Fails soft
 * pre-migration: no corpus, empty result.
 */
export async function fetchCorpusCandidates(
  patterns: string[],
  windowDays: number,
  now: Date,
): Promise<{ rows: import('./corpus').CorpusPostRow[]; migrationPending: boolean }> {
  if (patterns.length === 0) return { rows: [], migrationPending: false };
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const orExpr = patterns.map((p) => `caption.ilike.${p}`).join(',');
  const { data, error } = await supabaseAdmin
    .from('distribution_page_posts')
    .select('page_username, post_key, post_url, caption, posted_at, likes, comments, views')
    .gte('posted_at', windowStart)
    .or(orExpr)
    .limit(CORPUS_MATCH_LIMIT);
  if (error) return { rows: [], migrationPending: isMissingTable(error) };
  return { rows: (data ?? []) as import('./corpus').CorpusPostRow[], migrationPending: false };
}

/**
 * The index half of an artist search: corpus candidates through the same
 * deterministic matcher the global path uses. Corpus posts carry sourceKind
 * 'corpus', so they only match on caption evidence, never on provenance.
 */
export async function corpusMatchesFor(
  identity: ArtistIdentity,
  windowDays: number,
  now: Date,
): Promise<{ posts: MatchedPost[]; migrationPending: boolean }> {
  const { rows, migrationPending } = await fetchCorpusCandidates(buildCorpusSearchPatterns(identity), windowDays, now);
  return { posts: toMatchedPosts(rows.map(corpusRowToDiscoveredPost), identity), migrationPending };
}

/** Stored profiles for a set of usernames, freshness aside (index pages keep their last observation). */
export async function readProfiles(usernames: string[]): Promise<Map<string, PageProfile>> {
  const map = new Map<string, PageProfile>();
  if (usernames.length === 0) return map;
  const { data, error } = await supabaseAdmin
    .from('distribution_pages')
    .select('ig_user_id, username, display_name, followers, verified, is_private, category, biography, profile_url, last_observed_at')
    .in('username', usernames);
  if (error) return map;
  for (const page of (data ?? []) as PageRow[]) {
    map.set(page.username, {
      igUserId: page.ig_user_id,
      username: page.username,
      displayName: page.display_name,
      followers: page.followers,
      verified: page.verified,
      isPrivate: page.is_private,
      category: page.category,
      biography: page.biography,
      profileUrl: page.profile_url,
    });
  }
  return map;
}

/** Upsert a refresh batch's posts into the corpus, deduped per (page, post). */
export async function upsertPagePosts(posts: DiscoveredPost[]): Promise<void> {
  if (posts.length === 0) return;
  const nowIso = new Date().toISOString();
  const seen = new Set<string>();
  const rows = [];
  for (const post of posts) {
    const key = `${post.ownerUsername}|${postKey(post)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      page_username: post.ownerUsername,
      post_key: postKey(post),
      post_url: post.url,
      caption: post.caption,
      posted_at: post.postedAt,
      likes: post.likes,
      comments: post.comments,
      views: post.views,
      observed_at: nowIso,
    });
  }
  await supabaseAdmin.from('distribution_page_posts').upsert(rows, { onConflict: 'page_username,post_key' });
}

/**
 * Mark a refresh batch's pages as refreshed. The whole batch is marked, posts
 * or none: a page with zero recent posts was still successfully checked.
 */
export async function markPagesRefreshed(usernames: string[], now: Date): Promise<void> {
  if (usernames.length === 0) return;
  await supabaseAdmin
    .from('distribution_pages')
    .update({ last_posts_refresh_at: now.toISOString() })
    .in('username', usernames);
}

/** Usernames of index-eligible pages whose recent-post cache is stale. */
export async function readStaleEligiblePages(now: Date): Promise<{ stale: string[]; total: number; migrationPending: boolean }> {
  const { data, error } = await supabaseAdmin
    .from('distribution_pages')
    .select('username, last_posts_refresh_at')
    .eq('index_eligible', true)
    .limit(2000);
  if (error) return { stale: [], total: 0, migrationPending: isMissingColumn(error) || isMissingTable(error) };
  const pages = (data ?? []) as Array<{ username: string; last_posts_refresh_at: string | null }>;
  return { stale: selectStalePages(pages, now, POSTS_FRESH_HOURS), total: pages.length, migrationPending: false };
}

/**
 * Which of these usernames are already INDEXED (index_eligible), for
 * discovery-candidate exclusion. A page merely known from old mentions but
 * not indexed stays a valid candidate: adding it promotes the existing row.
 */
export async function readIndexedUsernameSet(usernames: string[]): Promise<Set<string>> {
  const set = new Set<string>();
  if (usernames.length === 0) return set;
  const { data, error } = await supabaseAdmin
    .from('distribution_pages')
    .select('username')
    .eq('index_eligible', true)
    .in('username', usernames);
  if (error) return set;
  for (const row of (data ?? []) as Array<{ username: string }>) set.add(row.username);
  return set;
}

export interface IndexSummary {
  pageCount: number;
  /** Indexed pages at or above the significant-page threshold. */
  pages50k: number;
  medianFollowers: number | null;
  staleCount: number;
  postsCached: number;
  lastRefreshAt: string | null;
  migrationPending: boolean;
}

export async function readIndexSummary(now: Date): Promise<IndexSummary> {
  const { data, error } = await supabaseAdmin
    .from('distribution_pages')
    .select('username, followers, last_posts_refresh_at')
    .eq('index_eligible', true)
    .limit(2000);
  if (error) {
    return {
      pageCount: 0,
      pages50k: 0,
      medianFollowers: null,
      staleCount: 0,
      postsCached: 0,
      lastRefreshAt: null,
      migrationPending: isMissingColumn(error) || isMissingTable(error),
    };
  }
  const pages = (data ?? []) as Array<{ username: string; followers: number | null; last_posts_refresh_at: string | null }>;
  const followers = pages.map((p) => p.followers).filter((f): f is number => f !== null).sort((a, b) => a - b);
  const medianFollowers = followers.length > 0 ? followers[Math.floor(followers.length / 2)] : null;
  const pages50k = followers.filter((f) => f >= SIGNIFICANT_PAGE_FOLLOWERS).length;
  const staleCount = selectStalePages(pages, now, POSTS_FRESH_HOURS).length;
  const refreshTimes = pages.map((p) => p.last_posts_refresh_at).filter((t): t is string => t !== null).sort();
  const lastRefreshAt = refreshTimes.length > 0 ? refreshTimes[refreshTimes.length - 1] : null;

  const { count } = await supabaseAdmin
    .from('distribution_page_posts')
    .select('id', { count: 'exact', head: true });

  return {
    pageCount: pages.length,
    pages50k,
    medianFollowers,
    staleCount,
    postsCached: count ?? 0,
    lastRefreshAt,
    migrationPending: false,
  };
}

export interface IndexPageListing {
  username: string;
  followers: number | null;
  verified: boolean | null;
  category: string | null;
  discoverySource: string | null;
  lastPostsRefreshAt: string | null;
  profileUrl: string;
  /** Distinct artists this page has been observed covering (from mentions). */
  artistsObserved: number;
}

export async function listIndexPages(query: string | null): Promise<{ pages: IndexPageListing[]; migrationPending: boolean }> {
  let builder = supabaseAdmin
    .from('distribution_pages')
    .select('username, followers, verified, category, discovery_source, last_posts_refresh_at, profile_url')
    .eq('index_eligible', true)
    .order('followers', { ascending: false, nullsFirst: false })
    .limit(100);
  if (query) builder = builder.ilike('username', `%${query.replace(/[%_\\]/g, '')}%`);
  const { data, error } = await builder;
  if (error) return { pages: [], migrationPending: isMissingColumn(error) || isMissingTable(error) };
  const rows = (data ?? []) as Array<{
    username: string;
    followers: number | null;
    verified: boolean | null;
    category: string | null;
    discovery_source: string | null;
    last_posts_refresh_at: string | null;
    profile_url: string;
  }>;

  const artistCounts = new Map<string, Set<string>>();
  if (rows.length > 0) {
    const { data: mentions } = await supabaseAdmin
      .from('distribution_mentions')
      .select('page_username, artist_key')
      .in('page_username', rows.map((r) => r.username))
      .limit(5000);
    for (const m of (mentions ?? []) as Array<{ page_username: string; artist_key: string }>) {
      const set = artistCounts.get(m.page_username) ?? new Set<string>();
      set.add(m.artist_key);
      artistCounts.set(m.page_username, set);
    }
  }

  return {
    pages: rows.map((r) => ({
      username: r.username,
      followers: r.followers,
      verified: r.verified,
      category: r.category,
      discoverySource: r.discovery_source,
      lastPostsRefreshAt: r.last_posts_refresh_at,
      profileUrl: r.profile_url,
      artistsObserved: artistCounts.get(r.username)?.size ?? 0,
    })),
    migrationPending: false,
  };
}

/** Upsert mention observations, deduped on (artist_key, post_key). */
export async function upsertMentions(
  artistKey: string,
  artistHandle: string | null,
  posts: MatchedPost[],
): Promise<void> {
  if (posts.length === 0) return;
  const nowIso = new Date().toISOString();
  const seen = new Set<string>();
  const rows = [];
  for (const post of posts) {
    const key = postKey(post);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      artist_key: artistKey,
      artist_handle: artistHandle,
      page_username: post.ownerUsername,
      post_key: key,
      post_url: post.url,
      posted_at: post.postedAt,
      likes: post.likes,
      comments: post.comments,
      views: post.views,
      match_reason: post.matchReason,
      strong_evidence: post.strongEvidence,
      source_query: post.sourceQuery || null,
      observed_at: nowIso,
    });
  }
  await supabaseAdmin.from('distribution_mentions').upsert(rows, { onConflict: 'artist_key,post_key' });
}
