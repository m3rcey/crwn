import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import {
  publishCarousel,
  redactSecrets,
  GraphError,
  type InstagramConfig,
} from '@/lib/social/instagramPublish';
import { isDue, MISSED_SLOT_GRACE_MINUTES } from '@/lib/social/schedule';

/**
 * The publishing tick.
 *
 * A dumb "is anything due" heartbeat. It holds no schedule of its own: the schedule is
 * social_posts.scheduled_for, an absolute UTC instant written at queue time from the founder's
 * local wall clock. That separation is what makes daylight saving a non-event, and it is why
 * there are many cron entries pointing here rather than one clever one.
 *
 * PUBLISHING TWICE IS THE FAILURE THAT MATTERS. It produces a real, public, duplicate post that
 * only a human can delete. Guarded three ways: a conditional UPDATE claims each row so a second
 * concurrent tick matches nothing, a row carrying ig_media_id is never eligible again, and the
 * database has a partial unique index preventing two pending rows for one carousel.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/**
 * At most two posts per tick. One carousel is five container creations plus polling, so a bigger
 * batch risks the function timeout, and a timeout mid-publish is the exact condition the claim
 * guard exists to survive. Ticks are frequent enough that a backlog drains quickly.
 */
const MAX_POSTS_PER_TICK = 2;

/** After this many failed attempts a row stops retrying and waits for a human. */
const MAX_ATTEMPTS = 3;

export const maxDuration = 60;

interface SocialPostRow {
  id: string;
  slug: string;
  caption: string;
  media_keys: string[];
  scheduled_for: string;
  attempt_count: number;
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TRIM EVERY ONE OF THESE. A value pasted into the Vercel dashboard keeps whatever whitespace
  // came with it, and process.env hands it back verbatim; only the local .env.local parser
  // trimmed. A single trailing space on IG_USER_ID sends Meta "<id> /media", which it cannot
  // resolve, and it answers code 100/33 with an EMPTY message. That reads like a permissions
  // problem or a wrong account and is neither, so it costs an hour to diagnose. It cost one here.
  const igUserId = (process.env.IG_USER_ID || '').trim();
  const accessToken = (process.env.IG_ACCESS_TOKEN || '').trim();
  const host = (process.env.GRAPH_HOST || 'graph.instagram.com').trim().replace(/^https?:\/\//, '');
  const version = (process.env.GRAPH_API_VERSION || 'v26.0').trim();

  const now = new Date();

  // Retire anything too stale to publish honestly. A post whose slot passed hours ago is no
  // longer the post the founder scheduled, and quietly publishing yesterday's queue at 3am is
  // worse than skipping it. Done before the due query so an expired row cannot be claimed.
  const staleBefore = new Date(now.getTime() - MISSED_SLOT_GRACE_MINUTES * 60000).toISOString();
  const { data: expired } = await supabaseAdmin
    .from('social_posts')
    .update({ status: 'expired', last_error: 'slot passed before any tick could publish it' })
    .eq('status', 'queued')
    .lt('scheduled_for', staleBefore)
    .select('id');

  // If credentials are absent the queue must NOT be drained. Leaving rows queued means the
  // founder can fix the environment and the backlog still goes out; marking them failed would
  // silently throw away a scheduled batch because of a missing variable.
  //
  // But it must not be SILENT either. A row sitting at 'queued' past its slot is ambiguous: it
  // looks identical whether the tick ran and bailed or the tick never ran at all. Stamping
  // last_error (without touching status, so nothing is consumed) turns that silence into a
  // readable answer, which is the only way to tell those two apart without the CRON_SECRET.
  if (!igUserId || !accessToken) {
    const missing = [!igUserId && 'IG_USER_ID', !accessToken && 'IG_ACCESS_TOKEN']
      .filter(Boolean)
      .join(' and ');
    await supabaseAdmin
      .from('social_posts')
      .update({
        last_error: `tick ran at ${now.toISOString()} but ${missing} is not readable on this deployment; left queued on purpose`,
      })
      .eq('status', 'queued')
      .lte('scheduled_for', now.toISOString());

    return NextResponse.json({
      ok: false,
      reason: 'instagram_credentials_missing',
      missing,
      expired: expired?.length ?? 0,
      published: 0,
      note: 'Queue left intact. Due rows were stamped with the reason.',
    });
  }

  const { data: due, error: dueError } = await supabaseAdmin
    .from('social_posts')
    .select('id, slug, caption, media_keys, scheduled_for, attempt_count')
    .eq('status', 'queued')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(MAX_POSTS_PER_TICK);

  if (dueError) {
    return NextResponse.json({ ok: false, error: 'query_failed' }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, due: 0, published: 0, expired: expired?.length ?? 0 });
  }

  const cfg: InstagramConfig = { igUserId, accessToken, host, version };
  const results: Array<Record<string, unknown>> = [];

  for (const row of due as SocialPostRow[]) {
    // Re-check the window. A row can sit in this loop while the previous post publishes.
    if (!isDue(new Date(row.scheduled_for), new Date()).due) continue;

    // CLAIM. A concurrent tick's identical update matches no row, so it does no work. This is
    // the same shape as the insert-as-claim used elsewhere in the repo.
    const { data: claimed } = await supabaseAdmin
      .from('social_posts')
      .update({ status: 'publishing', attempt_count: row.attempt_count + 1 })
      .eq('id', row.id)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle();

    if (!claimed) continue;

    try {
      const keys = Array.isArray(row.media_keys) ? row.media_keys : [];
      if (keys.length < 2) throw new Error(`row has ${keys.length} media keys; a carousel needs at least 2`);

      // Signed fresh at publish time, never stored: a URL minted at queue time would have
      // expired long before its slot arrived.
      const imageUrls: string[] = [];
      for (const key of keys) imageUrls.push(await getSignedDownloadUrl(String(key), 3600));

      const out = await publishCarousel(cfg, imageUrls, row.caption);

      await supabaseAdmin
        .from('social_posts')
        .update({
          status: 'published',
          ig_media_id: out.mediaId,
          permalink: out.permalink,
          carousel_container_id: out.carouselContainerId,
          child_container_ids: out.childContainerIds,
          published_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', row.id);

      results.push({ slug: row.slug, status: 'published', mediaId: out.mediaId, permalink: out.permalink });
    } catch (err) {
      const classification = err instanceof GraphError ? err.classification : null;
      const retryable = classification?.retryable ?? false;
      const attempts = row.attempt_count + 1;
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;

      const message = redactSecrets(err instanceof Error ? err.message : String(err), [accessToken]);

      await supabaseAdmin
        .from('social_posts')
        .update({
          // Retryable and under the cap goes back into the queue for the next tick. Anything
          // else stops and waits for a person, rather than burning the daily publish budget.
          status: giveUp ? 'failed' : 'queued',
          last_error: message.slice(0, 2000),
        })
        .eq('id', row.id);

      results.push({
        slug: row.slug,
        status: giveUp ? 'failed' : 'retrying',
        kind: classification?.kind ?? 'unknown',
        attempts,
        error: message.slice(0, 300),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    due: due.length,
    expired: expired?.length ?? 0,
    published: results.filter((r) => r.status === 'published').length,
    results,
  });
}
