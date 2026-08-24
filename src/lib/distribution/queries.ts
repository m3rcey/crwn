// Deterministic search-query construction for the Artist Distribution Finder.
// No LLM involvement: the query set is a small, bounded, normalized expansion
// of exactly what the founder typed.

import type { ArtistIdentity, QuerySet } from './types';

/** Hard bound on provider searches per run, to control cost. */
export const MAX_KEYWORD_QUERIES = 4;
export const MAX_HASHTAG_QUERIES = 4;

export function normalizeTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const h = raw.trim().replace(/^@+/, '').toLowerCase();
  return h.length > 0 ? h : null;
}

/** "Ryan Leslie" -> "ryanleslie" (hashtag/handle-shaped form). */
export function collapseToTag(raw: string): string {
  return normalizeTerm(raw).replace(/[^a-z0-9_]/g, '');
}

export function normalizeArtistIdentity(input: {
  name: string;
  handle?: string | null;
  aliases?: string[] | null;
}): ArtistIdentity {
  const name = input.name.trim().replace(/\s+/g, ' ');
  const nameNormalized = normalizeTerm(name);
  const handle = normalizeHandle(input.handle);
  const seen = new Set<string>([nameNormalized]);
  const aliases: string[] = [];
  for (const raw of input.aliases ?? []) {
    const a = normalizeTerm(raw.replace(/^[@#]+/, ''));
    if (a.length === 0 || seen.has(a)) continue;
    seen.add(a);
    aliases.push(a);
  }
  return { name, nameNormalized, handle, aliases };
}

/** The cache/persistence key for an artist search. */
export function artistKey(identity: ArtistIdentity): string {
  return identity.nameNormalized;
}

/**
 * Build the bounded query set. Example for Ryan Leslie (@ryanleslie):
 *   keywords: ["ryan leslie", ...aliases]
 *   hashtags: ["ryanleslie" (from name), "ryanleslie" (from handle, deduped), ...]
 */
export function buildQuerySet(identity: ArtistIdentity): QuerySet {
  const keywords: string[] = [];
  const kwSeen = new Set<string>();
  for (const term of [identity.nameNormalized, ...identity.aliases]) {
    if (term.length < 2 || kwSeen.has(term)) continue;
    kwSeen.add(term);
    keywords.push(term);
    if (keywords.length >= MAX_KEYWORD_QUERIES) break;
  }

  const hashtags: string[] = [];
  const tagSeen = new Set<string>();
  const tagCandidates = [
    collapseToTag(identity.nameNormalized),
    identity.handle ? collapseToTag(identity.handle) : '',
    ...identity.aliases.map(collapseToTag),
  ];
  for (const tag of tagCandidates) {
    if (tag.length < 3 || tagSeen.has(tag)) continue;
    tagSeen.add(tag);
    hashtags.push(tag);
    if (hashtags.length >= MAX_HASHTAG_QUERIES) break;
  }

  return { keywords, hashtags };
}
