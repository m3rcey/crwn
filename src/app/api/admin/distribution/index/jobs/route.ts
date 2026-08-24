// Big Page Index: founder-triggered maintenance jobs (admin-only).
//
// POST { action: ... } where action is one of:
//   'add_start'          { handles: string[] }      -> start profile enrichment
//   'add_poll'           { runId }                  -> ingest enriched pages
//   'refresh_start'      {}                         -> plan stale-page batches, start first
//   'refresh_poll'       { job }                    -> ingest batch, start next
//   'estimate_bootstrap' { artists: string[] }      -> provider-run estimate only
//
// Same stateless pattern as the search/poll pair: the server holds no job
// state, the admin UI carries the job descriptor between polls, and Apify
// keeps each run's dataset. Reference-artist BOOTSTRAP deliberately has no
// server machinery at all: the admin UI drives the EXISTING search/poll
// endpoints once per artist (promotion to the index happens automatically in
// the normal finish path), so this route only provides the estimate.
//
// There is NO cron here on purpose (Vercel Hobby, and refresh is a founder
// decision). One failed page or batch never kills a refresh: the batch is
// marked failed, progress continues, and the summary reports partial failure.
//
// SECURITY: requireAdmin() (session-derived); APIFY_API_TOKEN never leaves
// the server-side adapter; no caller-supplied identity is trusted.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import {
  CORPUS_WINDOW_DAYS,
  POSTS_PER_PAGE_REFRESH,
  REFRESH_BATCH_SIZE,
  batchUsernames,
  estimateBootstrapRuns,
  parseHandleList,
} from '@/lib/distribution/corpus';
import {
  markPagesRefreshed,
  readStaleEligiblePages,
  upsertPagePosts,
  upsertPages,
} from '@/lib/distribution/store';
import {
  getPagePosts,
  getProfiles,
  getRunStatus,
  isApifyConfigured,
  isTerminalStatus,
  startPostsRun,
  startProfileRun,
} from '@/lib/distribution/apifyProvider';

const RUN_ID = /^[A-Za-z0-9]{5,40}$/;
const USERNAME = /^[a-z0-9._]{2,30}$/;

interface RefreshJob {
  batches: string[][];
  batchIndex: number;
  runId: string;
  done: number;
  total: number;
  failedBatches: number;
}

function parseRefreshJob(value: unknown): RefreshJob | null {
  const raw = value as Record<string, unknown>;
  if (!raw || !Array.isArray(raw.batches) || raw.batches.length === 0 || raw.batches.length > 100) return null;
  const batches: string[][] = [];
  for (const batch of raw.batches) {
    if (!Array.isArray(batch) || batch.length === 0 || batch.length > REFRESH_BATCH_SIZE) return null;
    if (!batch.every((u) => typeof u === 'string' && USERNAME.test(u))) return null;
    batches.push(batch as string[]);
  }
  const batchIndex = Number(raw.batchIndex);
  const done = Number(raw.done);
  const total = Number(raw.total);
  const failedBatches = Number(raw.failedBatches);
  const runId = typeof raw.runId === 'string' && RUN_ID.test(raw.runId) ? raw.runId : null;
  if (!runId || !Number.isInteger(batchIndex) || batchIndex < 0 || batchIndex >= batches.length) return null;
  if (!Number.isFinite(done) || !Number.isFinite(total) || !Number.isFinite(failedBatches)) return null;
  return { batches, batchIndex, runId, done, total, failedBatches };
}

async function startNextBatchOrFinish(job: Omit<RefreshJob, 'runId'>): Promise<NextResponse> {
  const nextIndex = job.batchIndex + 1;
  if (nextIndex >= job.batches.length) {
    return NextResponse.json({
      phase: 'complete',
      refreshed: job.done,
      total: job.total,
      failedBatches: job.failedBatches,
    });
  }
  try {
    const { runId } = await startPostsRun(job.batches[nextIndex], POSTS_PER_PAGE_REFRESH, CORPUS_WINDOW_DAYS);
    return NextResponse.json({
      phase: 'refreshing',
      job: { ...job, batchIndex: nextIndex, runId },
    });
  } catch {
    // Could not start the next batch: report partial completion honestly.
    return NextResponse.json({
      phase: 'complete',
      refreshed: job.done,
      total: job.total,
      failedBatches: job.failedBatches + (job.batches.length - nextIndex),
      stoppedEarly: true,
    });
  }
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
  const raw = body as Record<string, unknown>;
  const action = typeof raw.action === 'string' ? raw.action : '';

  if (action === 'estimate_bootstrap') {
    const artists = Array.isArray(raw.artists)
      ? raw.artists.filter((a): a is string => typeof a === 'string').slice(0, 25)
      : [];
    return NextResponse.json({ estimate: estimateBootstrapRuns(artists) });
  }

  if (!isApifyConfigured()) return NextResponse.json({ phase: 'not_configured' });

  if (action === 'add_start') {
    const handles = parseHandleList(
      Array.isArray(raw.handles) ? raw.handles.filter((h): h is string => typeof h === 'string').slice(0, 50) : [],
    );
    if (handles.length === 0) return NextResponse.json({ error: 'No valid Instagram handles found.' }, { status: 400 });
    try {
      const { runId } = await startProfileRun(handles);
      return NextResponse.json({ phase: 'adding', runId, count: handles.length });
    } catch {
      return NextResponse.json({ error: 'The provider rejected the profile lookup. Try again shortly.' }, { status: 502 });
    }
  }

  if (action === 'add_poll') {
    const runId = typeof raw.runId === 'string' && RUN_ID.test(raw.runId) ? raw.runId : null;
    if (!runId) return NextResponse.json({ error: 'Invalid run reference' }, { status: 400 });
    let status;
    try {
      status = await getRunStatus(runId);
    } catch {
      return NextResponse.json({ error: 'The provider lookup failed. Try again.' }, { status: 502 });
    }
    if (!isTerminalStatus(status)) return NextResponse.json({ phase: 'adding', pending: true });
    if (status !== 'SUCCEEDED') {
      return NextResponse.json({ error: 'The profile lookup failed at the provider. Try again shortly.' }, { status: 502 });
    }
    const profiles = await getProfiles(runId);
    const publicProfiles = profiles.filter((p) => p.isPrivate !== true);
    // Founder-curated: manual additions are indexed regardless of size.
    await upsertPages(publicProfiles, 'manual');
    return NextResponse.json({
      phase: 'complete',
      added: publicProfiles.length,
      skippedPrivate: profiles.length - publicProfiles.length,
    });
  }

  if (action === 'refresh_start') {
    const now = new Date();
    const { stale, total, migrationPending } = await readStaleEligiblePages(now);
    if (migrationPending) {
      return NextResponse.json({ phase: 'migration_pending' });
    }
    if (stale.length === 0) {
      return NextResponse.json({ phase: 'complete', refreshed: 0, total, failedBatches: 0, nothingStale: true });
    }
    const batches = batchUsernames(stale);
    try {
      const { runId } = await startPostsRun(batches[0], POSTS_PER_PAGE_REFRESH, CORPUS_WINDOW_DAYS);
      return NextResponse.json({
        phase: 'refreshing',
        job: { batches, batchIndex: 0, runId, done: 0, total: stale.length, failedBatches: 0 },
      });
    } catch {
      return NextResponse.json({ error: 'The provider rejected the refresh. Try again shortly.' }, { status: 502 });
    }
  }

  if (action === 'refresh_poll') {
    const job = parseRefreshJob(raw.job);
    if (!job) return NextResponse.json({ error: 'Invalid refresh job' }, { status: 400 });

    let status;
    try {
      status = await getRunStatus(job.runId);
    } catch {
      status = 'FAILED' as const;
    }
    if (!isTerminalStatus(status)) {
      return NextResponse.json({ phase: 'refreshing', pending: true, job, progress: { done: job.done, total: job.total } });
    }

    const batch = job.batches[job.batchIndex];
    if (status === 'SUCCEEDED') {
      try {
        const posts = await getPagePosts(job.runId);
        await upsertPagePosts(posts);
        // The whole batch was checked, posts or none.
        await markPagesRefreshed(batch, new Date());
        return startNextBatchOrFinish({ ...job, done: job.done + batch.length });
      } catch {
        return startNextBatchOrFinish({ ...job, failedBatches: job.failedBatches + 1 });
      }
    }
    // A failed batch never kills the refresh.
    return startNextBatchOrFinish({ ...job, failedBatches: job.failedBatches + 1 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
