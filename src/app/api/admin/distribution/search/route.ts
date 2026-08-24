// Artist Distribution Finder: start a search (admin-only).
//
// POST { artist, handle?, aliases?, windowDays?, minFollowers?, refresh? }
//
// Fresh cached observations are served immediately (phase 'done',
// source 'cache'). Otherwise this starts bounded Apify discovery runs and
// returns run references the admin UI polls via ../poll. Actor runs take
// minutes, past any Vercel function budget, so the route never blocks on one.
//
// SECURITY: requireAdmin() gates the route (session-derived, middleware skips
// /api). APIFY_API_TOKEN is read server-side only and never logged; a dummy
// build fallback is never sent to the provider (isApifyConfigured refuses it).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { parseSearchParams } from '@/lib/distribution/requestParams';
import { artistKey, buildQuerySet } from '@/lib/distribution/queries';
import { assembleResults } from '@/lib/distribution/pipeline';
import { isCacheFresh, readArtistCache } from '@/lib/distribution/store';
import {
  ApifyRequestError,
  isApifyConfigured,
  startDiscoveryRun,
} from '@/lib/distribution/apifyProvider';
import type { RunRefPayload } from '@/lib/distribution/requestParams';

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

  const cache = await readArtistCache(key, options.windowDays, now);

  if (!refresh && isCacheFresh(cache.freshestObservedAt, now)) {
    const assembled = assembleResults(cache.posts, cache.profiles, identity, options);
    return NextResponse.json({
      phase: 'done',
      source: 'cache',
      observedAt: cache.freshestObservedAt,
      results: assembled.results,
      meta: {
        postsFound: cache.posts.length,
        unenrichedAuthors: assembled.unenrichedAuthors,
        belowThresholdCount: assembled.belowThresholdCount,
        partialProviderFailure: false,
      },
    });
  }

  if (!isApifyConfigured()) {
    // Serve stale observations rather than nothing, and say so.
    if (cache.posts.length > 0) {
      const assembled = assembleResults(cache.posts, cache.profiles, identity, options);
      return NextResponse.json({
        phase: 'done',
        source: 'stale-cache',
        notConfigured: true,
        observedAt: cache.freshestObservedAt,
        results: assembled.results,
        meta: {
          postsFound: cache.posts.length,
          unenrichedAuthors: assembled.unenrichedAuthors,
          belowThresholdCount: assembled.belowThresholdCount,
          partialProviderFailure: false,
        },
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
    return NextResponse.json({ error: 'The provider rejected every search. Check the Apify account status.' }, { status: 502 });
  }

  return NextResponse.json({
    phase: 'discovery',
    runs,
    partialStart: startFailures > 0,
    migrationPending: cache.migrationPending,
  });
}
