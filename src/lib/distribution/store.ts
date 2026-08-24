// Persistence + cache for the Artist Distribution Finder. SERVER-SIDE ONLY:
// uses the service-role client, so it may only be imported from /api routes
// that have already passed requireAdmin(). The tables are admin-only
// (schema-phase3-distribution-finder.sql).
//
// Every method fails SOFT before the migration is applied (42P01/PGRST205):
// a live provider search still works, it just is not cached or compounded.

import { createClient } from '@supabase/supabase-js';
import type { MatchedPost, PageProfile } from './types';
import { postKey } from './dedupe';

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

/** Upsert enriched page profiles. Errors are swallowed: caching is best-effort. */
export async function upsertPages(profiles: PageProfile[]): Promise<void> {
  if (profiles.length === 0) return;
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from('distribution_pages').upsert(
    profiles.map((p) => ({
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
    })),
    { onConflict: 'username' },
  );
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
