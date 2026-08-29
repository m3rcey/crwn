import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import { isDue, MISSED_SLOT_GRACE_MINUTES } from '@/lib/social/schedule';
import { canPublish, type Platform, type PostKind } from '@/lib/social/capabilities';
import { adapterFor } from '@/lib/social/adapters';
import { PublishError, redactSecrets } from '@/lib/social/adapter';

/**
 * The publishing tick.
 *
 * A dumb "is anything due" heartbeat. It holds no schedule of its own: the schedule is
 * social_posts.scheduled_for, an absolute UTC instant written at queue time from the founder's
 * local wall clock. That separation is what makes daylight saving a non-event, and it is why
 * there are many cron entries pointing here rather than one clever one.
 *
 * ONE POST, MANY TARGETS. A post is content; a target is that content on one platform. The tick
 * fans out per target so Instagram can succeed while X fails and each carries its own state.
 *
 * PUBLISHING TWICE IS THE FAILURE THAT MATTERS. It produces a real, public, duplicate post that
 * only a human can delete. Guarded three ways: a conditional UPDATE claims each target so a
 * second concurrent tick matches nothing, a target carrying provider_post_id is never eligible
 * again, and the database has a partial unique index preventing two pending targets per
 * (post, platform).
 *
 * PUBLISHING PRIVATELY IS THE FAILURE THAT LOOKS LIKE SUCCESS. TikTok and YouTube force posts
 * from an unaudited client to private and still report success. The capability matrix refuses
 * those until their audit is recorded, and the refusal is written to the row as 'refused' so it
 * is visible rather than a silent skip.
 *
 * NATIVE SCHEDULING. Facebook and YouTube can publish on their own clock. When a target's slot is
 * still in the future the tick hands it over immediately and records 'handed_off'; CRWN's own
 * downtime can then no longer miss that post.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/** Targets per tick. A video upload can take most of a minute, so the batch stays small. */
const MAX_TARGETS_PER_TICK = 3;
/** After this many failed attempts a target stops retrying and waits for a human. */
const MAX_ATTEMPTS = 3;
/** How far ahead a natively-scheduling platform is handed its post. */
const HANDOFF_HORIZON_MS = 24 * 60 * 60 * 1000;

export const maxDuration = 60;

interface TargetRow {
  id: string;
  post_id: string;
  platform: Platform;
  caption: string;
  payload: Record<string, unknown>;
  attempt_count: number;
  social_posts: {
    slug: string;
    kind: PostKind;
    media_keys: string[];
    payload: Record<string, unknown>;
    scheduled_for: string;
  };
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const env = process.env as Record<string, string | undefined>;
  const now = new Date();

  // Retire anything too stale to publish honestly. A post whose slot passed hours ago is no
  // longer the post the founder scheduled. Done before the due query so a stale row is never
  // claimed. Only targets still waiting on US expire; a handed-off one belongs to its platform.
  const staleBefore = new Date(now.getTime() - MISSED_SLOT_GRACE_MINUTES * 60000).toISOString();
  const { data: stalePosts } = await supabaseAdmin
    .from('social_posts')
    .select('id')
    .lt('scheduled_for', staleBefore);
  const staleIds = (stalePosts ?? []).map((p) => p.id);
  let expired = 0;
  if (staleIds.length) {
    const { data } = await supabaseAdmin
      .from('social_post_targets')
      .update({ status: 'expired', last_error: 'slot passed before any tick could publish it' })
      .in('post_id', staleIds)
      .eq('status', 'queued')
      .select('id');
    expired = data?.length ?? 0;
  }

  // Due now, OR due within the handoff horizon on a platform that can schedule itself.
  const horizon = new Date(now.getTime() + HANDOFF_HORIZON_MS).toISOString();
  const { data: candidates, error: dueError } = await supabaseAdmin
    .from('social_post_targets')
    .select('id, post_id, platform, caption, payload, attempt_count, social_posts!inner(slug, kind, media_keys, payload, scheduled_for)')
    .eq('status', 'queued')
    .lte('social_posts.scheduled_for', horizon)
    .order('created_at', { ascending: true })
    .limit(MAX_TARGETS_PER_TICK * 4);

  if (dueError) {
    return NextResponse.json({ ok: false, error: 'query_failed', detail: dueError.message }, { status: 500 });
  }

  const rows = (candidates ?? []) as unknown as TargetRow[];
  const results: Array<Record<string, unknown>> = [];
  let handled = 0;

  for (const row of rows) {
    if (handled >= MAX_TARGETS_PER_TICK) break;
    const post = row.social_posts;
    const slot = new Date(post.scheduled_for);
    const due = isDue(slot, new Date());

    // Decide whether this target is actionable right now.
    let native = false;
    if (!due.due) {
      if (due.reason !== 'future') continue;
      // Not due yet. Only proceed if the platform can take it early and own the clock.
      let adapterSupportsNative = false;
      try {
        adapterSupportsNative = adapterFor(row.platform, env).supportsNativeScheduling;
      } catch {
        adapterSupportsNative = false;
      }
      if (!adapterSupportsNative) continue;
      native = true;
    }

    // THE GATE. Refuse before claiming so a refused target stays readable and never burns an
    // attempt. Written as 'refused', never silently skipped.
    const gate = canPublish(row.platform, post.kind, env);
    if (!gate.ok) {
      await supabaseAdmin
        .from('social_post_targets')
        .update({ status: 'refused', last_error: gate.message ?? gate.reason ?? 'refused by capability matrix' })
        .eq('id', row.id)
        .eq('status', 'queued');
      results.push({ slug: post.slug, platform: row.platform, status: 'refused', reason: gate.reason });
      continue;
    }

    // CLAIM. A concurrent tick's identical update matches no row, so it does no work.
    const { data: claimed } = await supabaseAdmin
      .from('social_post_targets')
      .update({ status: 'publishing', attempt_count: row.attempt_count + 1 })
      .eq('id', row.id)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle();
    if (!claimed) continue;
    handled++;

    try {
      const keys = Array.isArray(post.media_keys) ? post.media_keys : [];
      // Signed fresh at publish time, never stored: a URL minted at queue time would have
      // expired long before its slot. Long TTL because a video upload can take a while.
      const mediaUrls: string[] = [];
      for (const key of keys) mediaUrls.push(await getSignedDownloadUrl(String(key), 3 * 3600));

      const adapter = adapterFor(row.platform, env);
      const out = await adapter.publish({
        kind: post.kind,
        caption: row.caption,
        mediaUrls,
        payload: { ...(post.payload ?? {}), ...(row.payload ?? {}) },
        scheduledFor: native ? slot : undefined,
      });

      const providerResponse = out.providerResponse
        ? JSON.parse(redactSecrets(JSON.stringify(out.providerResponse), [env.IG_ACCESS_TOKEN, env.FB_PAGE_ACCESS_TOKEN, env.THREADS_ACCESS_TOKEN, env.TIKTOK_ACCESS_TOKEN, env.X_ACCESS_SECRET]))
        : null;

      await supabaseAdmin
        .from('social_post_targets')
        .update(
          out.handedOff
            ? {
                status: 'handed_off',
                provider_post_id: out.providerPostId,
                permalink: out.permalink,
                provider_response: providerResponse,
                last_error: null,
              }
            : {
                status: 'published',
                provider_post_id: out.providerPostId,
                permalink: out.permalink,
                provider_response: providerResponse,
                published_at: new Date().toISOString(),
                last_error: null,
              }
        )
        .eq('id', row.id);

      results.push({
        slug: post.slug,
        platform: row.platform,
        status: out.handedOff ? 'handed_off' : 'published',
        providerPostId: out.providerPostId,
        permalink: out.permalink,
      });
    } catch (err) {
      const classification = err instanceof PublishError ? err.classification : null;
      const retryable = classification?.retryable ?? false;
      const attempts = row.attempt_count + 1;
      const giveUp = !retryable || attempts >= MAX_ATTEMPTS;
      const message = redactSecrets(err instanceof Error ? err.message : String(err), [
        env.IG_ACCESS_TOKEN,
        env.FB_PAGE_ACCESS_TOKEN,
        env.THREADS_ACCESS_TOKEN,
        env.TIKTOK_ACCESS_TOKEN,
        env.X_ACCESS_SECRET,
        env.YOUTUBE_REFRESH_TOKEN,
      ]);

      await supabaseAdmin
        .from('social_post_targets')
        .update({
          // An audit refusal from inside an adapter is a refusal, not a failure to retry.
          status: classification?.kind === 'audit_required' ? 'refused' : giveUp ? 'failed' : 'queued',
          last_error: message.slice(0, 2000),
        })
        .eq('id', row.id);

      results.push({
        slug: post.slug,
        platform: row.platform,
        status: classification?.kind === 'audit_required' ? 'refused' : giveUp ? 'failed' : 'retrying',
        kind: classification?.kind ?? 'unknown',
        attempts,
        error: message.slice(0, 300),
      });
    }
  }

  // Roll the post-level status up from its targets, so a reader of social_posts alone gets an
  // honest summary: published only when EVERY target is published or handed off.
  const touchedPosts = [...new Set(rows.map((r) => r.post_id))];
  for (const postId of touchedPosts) {
    const { data: ts } = await supabaseAdmin.from('social_post_targets').select('status').eq('post_id', postId);
    const statuses = (ts ?? []).map((t) => t.status as string);
    if (!statuses.length) continue;
    const rollup = statuses.every((s) => s === 'published' || s === 'handed_off')
      ? 'published'
      : statuses.some((s) => s === 'queued' || s === 'publishing')
        ? 'queued'
        : statuses.every((s) => s === 'expired')
          ? 'expired'
          : 'failed';
    // social_posts.published_has_id requires an id when published; carry the first one across.
    const patch: Record<string, unknown> = { status: rollup };
    if (rollup === 'published') {
      const { data: first } = await supabaseAdmin
        .from('social_post_targets')
        .select('provider_post_id, permalink, published_at')
        .eq('post_id', postId)
        .not('provider_post_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (first) {
        patch.ig_media_id = first.provider_post_id;
        patch.permalink = first.permalink;
        patch.published_at = first.published_at ?? new Date().toISOString();
      }
    }
    await supabaseAdmin.from('social_posts').update(patch).eq('id', postId);
  }

  return NextResponse.json({
    ok: true,
    candidates: rows.length,
    handled,
    expired,
    published: results.filter((r) => r.status === 'published' || r.status === 'handed_off').length,
    results,
  });
}
