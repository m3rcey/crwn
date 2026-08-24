// Deduplication for the Artist Distribution Finder.
// Posts dedupe by the strongest stable identifier (post id > shortcode >
// canonical URL); pages dedupe by Instagram user id when available, otherwise
// normalized username. The same post surfaced by several search variants must
// count exactly once.

import type { MatchedPost } from './types';

export function canonicalPostUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return url.split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

/** The strongest stable identifier for a post. */
export function postKey(post: Pick<MatchedPost, 'postId' | 'shortcode' | 'url'>): string {
  if (post.postId) return `id:${post.postId}`;
  if (post.shortcode) return `sc:${post.shortcode.toLowerCase()}`;
  return `url:${canonicalPostUrl(post.url)}`;
}

export function pageKey(post: Pick<MatchedPost, 'ownerId' | 'ownerUsername'>): string {
  return post.ownerId ? `uid:${post.ownerId}` : `un:${post.ownerUsername.toLowerCase()}`;
}

/**
 * Keep one entry per post. When duplicates carry different match evidence,
 * keep the stronger (caption-level) reason so the audit trail shows the best
 * evidence rather than whichever query happened to return first.
 */
export function dedupePosts(posts: MatchedPost[]): MatchedPost[] {
  const byKey = new Map<string, MatchedPost>();
  for (const post of posts) {
    const key = postKey(post);
    const existing = byKey.get(key);
    if (!existing || (post.strongEvidence && !existing.strongEvidence)) {
      byKey.set(key, post);
    }
  }
  return [...byKey.values()];
}

/** Unique author usernames across a deduped post list. */
export function uniqueAuthors(posts: MatchedPost[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const post of posts) {
    const username = post.ownerUsername.toLowerCase();
    if (seen.has(username)) continue;
    seen.add(username);
    out.push(username);
  }
  return out;
}
