// Artist Distribution Finder: poll in-flight provider runs (admin-only).
//
// POST { phase: 'discovery'|'enrichment', artist..., runs, enrichRunId?, discoveryRuns? }
//
// The server holds no run state between polls: the admin UI carries the run
// references, and Apify keeps each run's dataset, so every poll can rebuild
// what it needs. When discovery completes this route matches + dedupes posts,
// skips authors whose profiles are still fresh in the cache, and either
// finishes immediately or starts one bounded enrichment run. When enrichment
// completes it assembles results and persists the public observations.
//
// Partial failure never fails the whole search: a failed discovery run drops
// that query's coverage, a failed enrichment run returns posts without
// profiles, and a missing migration only disables caching.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { parseRunRefs, parseSearchParams } from '@/lib/distribution/requestParams';
import type { RunRefPayload } from '@/lib/distribution/requestParams';
import { artistKey } from '@/lib/distribution/queries';
import { toMatchedPosts } from '@/lib/distribution/matching';
import { dedupePosts } from '@/lib/distribution/dedupe';
import { assembleResults, selectEnrichmentCandidates } from '@/lib/distribution/pipeline';
import { pageSources } from '@/lib/distribution/corpus';
import {
  corpusMatchesFor,
  readFreshProfiles,
  readProfiles,
  upsertMentions,
  upsertPages,
} from '@/lib/distribution/store';
import {
  getDiscoveredPosts,
  getProfiles,
  getRunStatus,
  isApifyConfigured,
  isTerminalStatus,
  startProfileRun,
} from '@/lib/distribution/apifyProvider';
import type { ArtistIdentity, DiscoveredPost, MatchedPost, PageProfile, SearchOptions } from '@/lib/distribution/types';

async function collectDiscoveredPosts(runs: RunRefPayload[]): Promise<{ posts: DiscoveredPost[]; failures: number }> {
  let failures = 0;
  const batches = await Promise.all(
    runs.map(async (run) => {
      try {
        return await getDiscoveredPosts(run.runId, run.term, run.kind);
      } catch {
        failures += 1;
        return [] as DiscoveredPost[];
      }
    }),
  );
  return { posts: batches.flat(), failures };
}

async function finishWithResults(
  globalMatched: MatchedPost[],
  profiles: Map<string, PageProfile>,
  identity: ArtistIdentity,
  options: SearchOptions,
  extraMeta: Record<string, unknown>,
) {
  const key = artistKey(identity);
  // The index half: cached recent posts of known pages, matched through the
  // same deterministic matcher. Merged pre-dedupe so a post found both ways
  // still marks its page as source 'both'.
  const corpus = await corpusMatchesFor(identity, options.windowDays, new Date());
  const merged = [...corpus.posts, ...globalMatched];
  const deduped = dedupePosts(merged);
  const withProfiles = new Map(profiles);
  const missing = [...new Set(corpus.posts.map((p) => p.ownerUsername))].filter((u) => !withProfiles.has(u));
  for (const [username, profile] of await readProfiles(missing)) withProfiles.set(username, profile);

  // Persist ALL matched observations (not only in-window ones): the
  // artist-to-page graph compounds, and the window is a read-time filter.
  await upsertMentions(key, identity.handle, deduped);
  const assembled = assembleResults(deduped, withProfiles, identity, options, pageSources(merged));
  return NextResponse.json({
    phase: 'done',
    source: 'live',
    observedAt: new Date().toISOString(),
    results: assembled.results,
    meta: {
      postsFound: deduped.length,
      indexedMatches: corpus.posts.length,
      totalMatchedPages: assembled.totalMatchedPages,
      unenrichedAuthors: assembled.unenrichedAuthors,
      belowThresholdCount: assembled.belowThresholdCount,
      ...extraMeta,
    },
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  if (!isApifyConfigured()) return NextResponse.json({ phase: 'not_configured' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;

  const now = new Date();
  const parsed = parseSearchParams(body, now);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { identity, options } = parsed;

  const phase = raw.phase === 'enrichment' ? 'enrichment' : 'discovery';

  if (phase === 'discovery') {
    const runs = parseRunRefs(raw.runs);
    if (!runs) return NextResponse.json({ error: 'Invalid run references' }, { status: 400 });

    const statuses = await Promise.all(
      runs.map(async (run) => {
        try {
          return await getRunStatus(run.runId);
        } catch {
          return 'FAILED' as const;
        }
      }),
    );
    if (statuses.some((s) => !isTerminalStatus(s))) {
      return NextResponse.json({ phase: 'discovery', pending: true });
    }

    const succeeded = runs.filter((_, i) => statuses[i] === 'SUCCEEDED');
    const failedRuns = runs.length - succeeded.length;
    if (succeeded.length === 0) {
      return NextResponse.json({ error: 'Every provider search failed. Check the Apify account, then retry.' }, { status: 502 });
    }

    const { posts, failures } = await collectDiscoveredPosts(succeeded);
    const matched = dedupePosts(toMatchedPosts(posts, identity));
    const partial = failedRuns + failures > 0;

    if (matched.length === 0) {
      // No GLOBAL matches; the index may still answer.
      return finishWithResults([], new Map(), identity, options, { partialProviderFailure: partial });
    }

    const candidates = selectEnrichmentCandidates(matched, identity);
    const freshProfiles = await readFreshProfiles(candidates, now);
    const stale = candidates.filter((u) => !freshProfiles.has(u));

    if (stale.length === 0) {
      return finishWithResults(matched, freshProfiles, identity, options, { partialProviderFailure: partial });
    }

    let enrichRunId: string;
    try {
      ({ runId: enrichRunId } = await startProfileRun(stale));
    } catch {
      // Enrichment could not start: return what is usable rather than failing.
      return finishWithResults(matched, freshProfiles, identity, options, {
        partialProviderFailure: true,
        enrichmentFailed: true,
      });
    }

    return NextResponse.json({
      phase: 'enrichment',
      enrichRunId,
      discoveryRuns: succeeded,
      postsFound: matched.length,
      partialProviderFailure: partial,
    });
  }

  // Enrichment phase.
  const enrichRunId = typeof raw.enrichRunId === 'string' && /^[A-Za-z0-9]{5,40}$/.test(raw.enrichRunId) ? raw.enrichRunId : null;
  const discoveryRuns = parseRunRefs(raw.discoveryRuns);
  if (!enrichRunId || !discoveryRuns) {
    return NextResponse.json({ error: 'Invalid run references' }, { status: 400 });
  }

  let enrichStatus: string;
  try {
    enrichStatus = await getRunStatus(enrichRunId);
  } catch {
    enrichStatus = 'FAILED';
  }
  if (!isTerminalStatus(enrichStatus as Parameters<typeof isTerminalStatus>[0])) {
    return NextResponse.json({ phase: 'enrichment', pending: true });
  }

  let enriched: PageProfile[] = [];
  let enrichmentFailed = false;
  if (enrichStatus === 'SUCCEEDED') {
    try {
      enriched = await getProfiles(enrichRunId);
    } catch {
      enrichmentFailed = true;
    }
  } else {
    enrichmentFailed = true;
  }

  const { posts, failures } = await collectDiscoveredPosts(discoveryRuns);
  const matched = dedupePosts(toMatchedPosts(posts, identity));
  const candidates = selectEnrichmentCandidates(matched, identity);
  const profiles = await readFreshProfiles(candidates, now);
  for (const profile of enriched) profiles.set(profile.username, profile);
  // Automatic index promotion: qualifying pages join the Big Page Index here.
  await upsertPages(enriched, 'global_search');

  return finishWithResults(matched, profiles, identity, options, {
    partialProviderFailure: enrichmentFailed || failures > 0,
    enrichmentFailed,
  });
}
