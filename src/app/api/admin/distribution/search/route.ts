// Artist Distribution Finder: start a search (admin-only).
//
// POST { artist, handle?, aliases?, windowDays?, minFollowers?, refresh? }
//
// HYBRID since the Big Page Index upgrade: every response path merges the
// LOCAL indexed corpus (recent posts of known significant pages, matched
// deterministically) with whatever else is available. Fresh cached
// observations are served immediately (phase 'done', source 'cache');
// otherwise this starts bounded Apify discovery runs and returns run
// references the admin UI polls via ../poll, which merges the corpus again at
// finish. Actor runs take minutes, past any Vercel function budget, so the
// route never blocks on one — and an artist search NEVER scrapes the index.
//
// SECURITY: requireAdmin() gates the route (session-derived, middleware skips
// /api). APIFY_API_TOKEN is read server-side only and never logged; a dummy
// build fallback is never sent to the provider (isApifyConfigured refuses it).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { parseSearchParams } from '@/lib/distribution/requestParams';
import { artistKey, buildQuerySet } from '@/lib/distribution/queries';
import { assembleResults } from '@/lib/distribution/pipeline';
import { dedupePosts } from '@/lib/distribution/dedupe';
import { pageSources } from '@/lib/distribution/corpus';
import {
  corpusMatchesFor,
  isCacheFresh,
  readArtistCache,
  readProfiles,
} from '@/lib/distribution/store';
import {
  ApifyRequestError,
  isApifyConfigured,
  startDiscoveryRun,
} from '@/lib/distribution/apifyProvider';
import type { RunRefPayload } from '@/lib/distribution/requestParams';
import type { ArtistIdentity, MatchedPost, PageProfile, SearchOptions } from '@/lib/distribution/types';

/** Assemble a response from stored observations (mentions cache + corpus). */
async function respondFromStore(
  cachePosts: MatchedPost[],
  cacheProfiles: Map<string, PageProfile>,
  corpusPosts: MatchedPost[],
  identity: ArtistIdentity,
  options: SearchOptions,
  extra: Record<string, unknown>,
) {
  const merged = [...corpusPosts, ...cachePosts];
  const profiles = new Map(cacheProfiles);
  const missing = [...new Set(merged.map((p) => p.ownerUsername))].filter((u) => !profiles.has(u));
  for (const [username, profile] of await readProfiles(missing)) profiles.set(username, profile);
  const deduped = dedupePosts(merged);
  const assembled = assembleResults(deduped, profiles, identity, options, pageSources(merged));
  return NextResponse.json({
    phase: 'done',
    results: assembled.results,
    meta: {
      postsFound: deduped.length,
      indexedMatches: corpusPosts.length,
      totalMatchedPages: assembled.totalMatchedPages,
      unenrichedAuthors: assembled.unenrichedAuthors,
      belowThresholdCount: assembled.belowThresholdCount,
      partialProviderFailure: false,
    },
    ...extra,
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const now = new Date();
  const parsed = parseSearchParams(body, now);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { identity, options, refresh } = parsed;
  const key = artistKey(identity);

  const [cache, corpus] = await Promise.all([
    readArtistCache(key, options.windowDays, now),
    corpusMatchesFor(identity, options.windowDays, now),
  ]);

  if (!refresh && isCacheFresh(cache.freshestObservedAt, now)) {
    return respondFromStore(cache.posts, cache.profiles, corpus.posts, identity, options, {
      source: 'cache',
      observedAt: cache.freshestObservedAt,
    });
  }

  if (!isApifyConfigured()) {
    // Serve stored observations rather than nothing, and say so.
    if (cache.posts.length > 0 || corpus.posts.length > 0) {
      return respondFromStore(cache.posts, cache.profiles, corpus.posts, identity, options, {
        source: 'stale-cache',
        notConfigured: true,
        observedAt: cache.freshestObservedAt,
      });
    }
    return NextResponse.json({ phase: 'not_configured' });
  }

  const querySet = buildQuerySet(identity);
  const runs: RunRefPayload[] = [];
  let startFailures = 0;
  const startOne = async (term: string, kind: 'keyword' | 'hashtag') => {
    try {
      const { runId } = await startDiscoveryRun([term], kind);
      runs.push({ runId, term, kind });
    } catch (err) {
      startFailures += 1;
      if (err instanceof ApifyRequestError && err.status === 429) throw err;
    }
  };

  try {
    await Promise.all([
      ...querySet.hashtags.map((t) => startOne(t, 'hashtag')),
      ...querySet.keywords.map((t) => startOne(t, 'keyword')),
    ]);
  } catch {
    return NextResponse.json({ error: 'The provider is rate limiting searches. Try again in a few minutes.' }, { status: 429 });
  }

  if (runs.length === 0) {
    // Global discovery is down; the index can still answer.
    if (corpus.posts.length > 0) {
      return respondFromStore([], new Map(), corpus.posts, identity, options, {
        source: 'index-only',
        providerDown: true,
        observedAt: now.toISOString(),
      });
    }
    return NextResponse.json({ error: 'The provider rejected every search. Check the Apify account status.' }, { status: 502 });
  }

  return NextResponse.json({
    phase: 'discovery',
    runs,
    partialStart: startFailures > 0,
    migrationPending: cache.migrationPending,
    indexMigrationPending: corpus.migrationPending,
  });
}
