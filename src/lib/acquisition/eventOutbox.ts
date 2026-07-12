// Idempotency claim + transactional outbox + analytics, over one table.
//
// IDEMPOTENCY IS INSERT-AS-CLAIM, NOT CHECK-THEN-INSERT.
//
// The Stripe webhook in this repo learned this the hard way and documents it at
// src/app/api/stripe/webhook/route.ts:59. Two concurrent deliveries of the same event can
// BOTH pass a prior SELECT and both proceed. Letting the INSERT be the claim, and treating a
// 23505 unique violation as "someone else already has this", closes the race with the
// database rather than with hope.
//
// ManyChat retries. Instagram is flaky. Duplicate deliveries are not an edge case here, they
// are Tuesday. Getting this wrong means an artist gets two result DMs and two result rows.

import { supabaseAdmin } from './db';

export interface ClaimResult {
  /** False when this event was already processed. */
  fresh: boolean;
  /** The response we sent the first time. Replay it verbatim so a retry is byte-identical. */
  cachedResponse: unknown | null;
  eventRowId: string | null;
}

/**
 * Claim an inbound event. Call this BEFORE doing any work.
 *
 * A replay returns fresh=false plus the original response, which the route returns as-is.
 * ManyChat sees the same answer it saw the first time and its flow continues correctly,
 * while CRWN does exactly zero additional work.
 */
export async function claimEvent(
  idempotencyKey: string,
  eventName: string,
  meta: { leadIdentityId?: string | null; sessionId?: string | null } = {},
): Promise<ClaimResult> {
  const { data, error } = await supabaseAdmin
    .from('acquisition_events')
    .insert({
      event_name: eventName,
      idempotency_key: idempotencyKey,
      lead_identity_id: meta.leadIdentityId ?? null,
      session_id: meta.sessionId ?? null,
      status: 'recorded',
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Already claimed. Fetch what we answered last time.
      const { data: prior } = await supabaseAdmin
        .from('acquisition_events')
        .select('id, response_snapshot')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      return {
        fresh: false,
        cachedResponse: prior?.response_snapshot ?? null,
        eventRowId: prior?.id ? String(prior.id) : null,
      };
    }
    // Any other failure (e.g. the migration has not been applied yet): log and proceed.
    // Dropping a real inbound event is worse than processing it twice, and every downstream
    // write has its own uniqueness guard (one open session per tool, one result per session).
    console.error('[acquisition] idempotency claim failed, continuing:', error.code);
    return { fresh: true, cachedResponse: null, eventRowId: null };
  }

  return { fresh: true, cachedResponse: null, eventRowId: String(data.id) };
}

/** Store what we told ManyChat, so a retry of this event replays the same answer. */
export async function cacheResponse(eventRowId: string | null, response: unknown): Promise<void> {
  if (!eventRowId) return;
  await supabaseAdmin
    .from('acquisition_events')
    .update({ response_snapshot: response, status: 'processed', processed_at: new Date().toISOString() })
    .eq('id', eventRowId);
}

/**
 * Record an analytics event. Fire and forget: NEVER throws.
 *
 * Same discipline as recordFanEvent in src/lib/fanEvents.ts. Analytics must not be able to
 * break a money flow or a live conversation.
 */
export async function recordEvent(
  eventName: string,
  meta: {
    leadIdentityId?: string | null;
    sessionId?: string | null;
    resultId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await supabaseAdmin.from('acquisition_events').insert({
      event_name: eventName,
      lead_identity_id: meta.leadIdentityId ?? null,
      session_id: meta.sessionId ?? null,
      result_id: meta.resultId ?? null,
      metadata: meta.metadata ?? {},
      status: 'recorded',
    });
  } catch {
    // Swallowed on purpose.
  }
}

/**
 * Enqueue an asynchronous side effect (an email, a nurture step, a sales task).
 *
 * These are drained by the daily dispatcher. They do NOT run inline, because the inbound
 * webhook is in the latency path of a live Instagram DM and must not wait on an email
 * provider.
 */
export async function enqueue(
  eventName: string,
  meta: {
    leadIdentityId?: string | null;
    sessionId?: string | null;
    resultId?: string | null;
    metadata?: Record<string, unknown>;
    /** Delay before first attempt. Defaults to immediate (next dispatcher run). */
    delaySeconds?: number;
    /** Dedupe key. Prevents two "your result is ready" emails for the same result. */
    idempotencyKey?: string;
  } = {},
): Promise<void> {
  try {
    const nextAttempt = new Date(Date.now() + (meta.delaySeconds ?? 0) * 1000).toISOString();
    const { error } = await supabaseAdmin.from('acquisition_events').insert({
      event_name: eventName,
      lead_identity_id: meta.leadIdentityId ?? null,
      session_id: meta.sessionId ?? null,
      result_id: meta.resultId ?? null,
      metadata: meta.metadata ?? {},
      idempotency_key: meta.idempotencyKey ?? null,
      status: 'pending',
      next_attempt_at: nextAttempt,
    });
    // 23505 here means this side effect is already queued. That is a SUCCESS, not a failure:
    // the dedupe key did its job and the artist will not get two emails.
    if (error && error.code !== '23505') {
      console.error('[acquisition] enqueue failed:', error.code);
    }
  } catch {
    // Never break the caller.
  }
}
