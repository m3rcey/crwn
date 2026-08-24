// Deterministic post-to-artist matching for the Artist Distribution Finder.
// Every match carries an auditable reason. No fuzzy matching: the evidence is
// exact handle mention, exact name/alias in caption, artist hashtag, or the
// provenance of the search that surfaced the post.

import type { ArtistIdentity, DiscoveredPost, MatchDecision, MatchedPost } from './types';
import { collapseToTag } from './queries';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function captionHasPhrase(caption: string, phrase: string): boolean {
  // Word-boundary match, case-insensitive: "ryan leslie" must appear as a
  // phrase, not inside another word.
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}($|[^a-z0-9])`, 'i');
  return re.test(caption);
}

export function matchPost(post: DiscoveredPost, identity: ArtistIdentity): MatchDecision {
  const caption = post.caption ?? '';
  const captionLower = caption.toLowerCase();

  if (identity.handle && captionLower.includes(`@${identity.handle}`)) {
    return { matched: true, strong: true, reason: `@${identity.handle} was mentioned in the caption` };
  }

  if (caption && captionHasPhrase(caption, identity.nameNormalized)) {
    return { matched: true, strong: true, reason: `"${identity.name}" appeared in the caption` };
  }

  for (const alias of identity.aliases) {
    if (caption && captionHasPhrase(caption, alias)) {
      return { matched: true, strong: true, reason: `Alias "${alias}" appeared in the caption` };
    }
  }

  const artistTags = new Set(
    [
      collapseToTag(identity.nameNormalized),
      identity.handle ? collapseToTag(identity.handle) : '',
      ...identity.aliases.map(collapseToTag),
    ].filter((t) => t.length >= 3),
  );
  for (const tag of artistTags) {
    if (captionLower.includes(`#${tag}`)) {
      return { matched: true, strong: true, reason: `#${tag} appeared in the caption` };
    }
  }

  // Provenance-only evidence: the post was surfaced by an artist hashtag
  // search (the author tagged it) or a keyword search. Hashtag provenance is
  // accepted; keyword provenance without any caption evidence is the weakest
  // signal and is only accepted so ambiguous captions (caption unavailable)
  // are not silently dropped. Both are flagged as non-strong.
  if (post.sourceKind === 'hashtag' && artistTags.has(post.sourceQuery)) {
    return { matched: true, strong: false, reason: `Found under the #${post.sourceQuery} hashtag` };
  }
  if (post.sourceKind === 'keyword') {
    return { matched: true, strong: false, reason: `Surfaced by the "${post.sourceQuery}" search` };
  }

  return { matched: false, strong: false, reason: null };
}

export function toMatchedPosts(posts: DiscoveredPost[], identity: ArtistIdentity): MatchedPost[] {
  const out: MatchedPost[] = [];
  for (const post of posts) {
    const decision = matchPost(post, identity);
    if (decision.matched && decision.reason) {
      out.push({ ...post, matchReason: decision.reason, strongEvidence: decision.strong });
    }
  }
  return out;
}
