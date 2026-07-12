// The dispatcher. Drains the outbox, sweeps stale sessions, enforces retention.
//
// WHERE THIS RUNS: piggybacked on /api/cron/platform-crm (0 5 * * *). NOT its own cron.
// vercel.json already has 25 entries and nearly every hour slot 0-23 is taken, and the house
// pattern (cron/sequences/route.ts:20, calendar reminders) is to piggyback. platform-crm is
// the semantically correct host: it already IS CRWN's artist-acquisition pipeline.
//
// IT MUST NEVER BREAK ITS HOST. Every entry point here is wrapped, returns a report instead
// of throwing, and a failure in acquisition follow-up must not stop the platform CRM from
// running. That is why runAcquisitionDispatcher() cannot throw.
//
// RETRY POLICY, and why it is not "retry until it works":
//   transient (network, 5xx)     -> exponential backoff, up to max_attempts, then dead_letter
//   terminal  (no consent, outside Meta's window, capped, no email)
//                                -> STOP IMMEDIATELY. status='skipped'.
//
// That second line is the important one. Retrying a "Meta closed the 24-hour window"
// rejection every night forever is not persistence, it is a good way to get an app flagged.
// The window reopens when the artist messages us, not on a timer, so there is nothing to
// wait for.

import { supabaseAdmin } from './db';
import { send, type Channel } from './channels';
import { ABANDON_AFTER_HOURS } from './stateMachine';
import * as copy from '../emails/acquisitionFollowUp';
import { resend, FROM_EMAIL } from '../resend';
import { buildResultUrl, mintToken, expiresAt, RESULT_TTL_SECONDS } from '../leadResults/resultToken';
import type { LeadIdentity } from './types';

const BATCH_SIZE = 50;
const FOUNDER_EMAIL = 'joshn.wms@gmail.com';

/** Outcomes that are FINAL. Never retried, because nothing about them will change on a timer. */
const TERMINAL_REASONS = new Set([
  'opted_out',
  'no_dm_consent',
  'no_email_consent',
  'no_sms_consent',
  'no_manychat_contact',
  'no_email',
  'suppressed',
  'lifetime_cap_reached',
  'already_sent',
  'outside_messaging_window',
  'sms_channel_disabled',
  'manychat_outbound_not_configured',
]);

export interface DispatchReport {
  swept: number;
  drained: number;
  sent: number;
  skipped: number;
  deadLettered: number;
  redacted: number;
  errors: number;
}

/**
 * The single entry point. CANNOT THROW.
 *
 * Its host cron calls it inside a try/catch anyway, but belt and braces: an exception here
 * must never be able to take down the platform CRM run that hosts it.
 */
export async function runAcquisitionDispatcher(): Promise<DispatchReport> {
  const report: DispatchReport = {
    swept: 0,
    drained: 0,
    sent: 0,
    skipped: 0,
    deadLettered: 0,
    redacted: 0,
    errors: 0,
  };

  for (const step of [sweepAbandoned, drainOutbox, enforceRetention, cleanupExpiredTokens]) {
    try {
      await step(report);
    } catch (err) {
      report.errors++;
      console.error('[acquisition] dispatcher step failed:', err instanceof Error ? err.message : 'unknown');
    }
  }

  return report;
}

// ---------------------------------------------------------------------------
// 1. Sweep sessions the artist walked away from
// ---------------------------------------------------------------------------

async function sweepAbandoned(report: DispatchReport): Promise<void> {
  const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 3_600_000).toISOString();

  const { data: stale } = await supabaseAdmin
    .from('lead_sessions')
    .select('id, lead_identity_id, state')
    .eq('status', 'open')
    .lt('last_activity_at', cutoff)
    .limit(BATCH_SIZE);

  for (const s of stale ?? []) {
    // A session that already produced a result is not "abandoned", it is DONE. The artist got
    // what they came for. Close it quietly and do not nag them about finishing a conversation
    // they finished.
    const gotResult = ['result_generated', 'result_sent', 'result_viewed', 'account_claim_started', 'account_claimed'].includes(
      String(s.state),
    );

    await supabaseAdmin
      .from('lead_sessions')
      .update({
        status: gotResult ? 'completed' : 'abandoned',
        state: gotResult ? s.state : 'abandoned',
        abandoned_at: gotResult ? null : new Date().toISOString(),
        completed_at: gotResult ? new Date().toISOString() : null,
      })
      .eq('id', s.id)
      .eq('status', 'open'); // do not clobber a session that just came back to life

    report.swept++;

    // Only nudge someone who dropped out BEFORE getting anything of value.
    if (!gotResult) {
      await supabaseAdmin.from('acquisition_events').insert({
        event_name: 'session_abandoned_nudge',
        lead_identity_id: s.lead_identity_id,
        session_id: s.id,
        idempotency_key: `abandoned:${s.id}`,
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Drain the outbox
// ---------------------------------------------------------------------------

async function drainOutbox(report: DispatchReport): Promise<void> {
  const { data: due } = await supabaseAdmin
    .from('acquisition_events')
    .select('id, event_name, lead_identity_id, session_id, result_id, attempt_count, max_attempts')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(BATCH_SIZE);

  for (const row of due ?? []) {
    // Claim it, so two overlapping dispatcher runs cannot both process the same row.
    const { data: claimed } = await supabaseAdmin
      .from('acquisition_events')
      .update({ status: 'processing', attempt_count: (row.attempt_count ?? 0) + 1 })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (!claimed) continue; // someone else got it

    report.drained++;

    try {
      const outcome = await handle(row as OutboxRow);

      if (outcome.done) {
        await finish(String(row.id), 'processed');
        if (outcome.sent) report.sent++;
        else report.skipped++;
      } else {
        await retryOrDeadLetter(row as OutboxRow, outcome.reason, report);
      }
    } catch (err) {
      await retryOrDeadLetter(
        row as OutboxRow,
        err instanceof Error ? err.name : 'unknown',
        report,
      );
    }
  }
}

interface OutboxRow {
  id: string;
  event_name: string;
  lead_identity_id: string | null;
  session_id: string | null;
  result_id: string | null;
  attempt_count: number;
  max_attempts: number;
}

type HandleOutcome =
  | { done: true; sent: boolean }
  | { done: false; reason: string };

async function handle(row: OutboxRow): Promise<HandleOutcome> {
  const identity = row.lead_identity_id ? await loadIdentity(row.lead_identity_id) : null;

  switch (row.event_name) {
    case 'result_not_viewed_check':
      return handleResultNotViewed(row, identity);
    case 'result_viewed_not_claimed':
      return handleViewedNotClaimed(row, identity);
    case 'session_abandoned_nudge':
      return handleAbandoned(row, identity);
    case 'high_intent_alert':
      return handleHighIntentAlert(row);
    default:
      // An event we do not know how to handle is not a crash and not a retry. Mark it done
      // and move on, so a stray row cannot wedge the queue forever.
      return { done: true, sent: false };
  }
}

async function handleResultNotViewed(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity || !row.result_id) return { done: true, sent: false };

  const { data: result } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('viewed_at, tool_slug, result_data')
    .eq('id', row.result_id)
    .maybeSingle();

  // They opened it. Nothing to nudge. Instead, queue the NEXT step: they looked and did not
  // act, which is a different (and warmer) problem.
  if (!result || result.viewed_at) {
    if (result && !(await hasEvent(`viewed_unclaimed:${row.result_id}`))) {
      await supabaseAdmin.from('acquisition_events').insert({
        event_name: 'result_viewed_not_claimed',
        lead_identity_id: identity.id,
        session_id: row.session_id,
        result_id: row.result_id,
        idempotency_key: `viewed_unclaimed:${row.result_id}`,
        status: 'pending',
        next_attempt_at: new Date(Date.now() + 2 * 24 * 3_600_000).toISOString(),
      });
    }
    return { done: true, sent: false };
  }

  // The old link may be near expiry, and we cannot recover the raw token (only the hash is
  // stored). Rotate, so the nudge always carries a link that actually works.
  const url = await rotateLink(row.result_id, String(result.tool_slug));
  if (!url) return { done: true, sent: false };

  const headline = String((result.result_data as { headline?: string })?.headline ?? 'Your number');
  const c = copy.resultNotViewed({ headline, resultUrl: url });

  return dispatchToBestChannel(identity, c, `not_viewed:${row.result_id}`);
}

async function handleViewedNotClaimed(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity || !row.result_id) return { done: true, sent: false };

  const { data: result } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('claimed_at, tool_slug')
    .eq('id', row.result_id)
    .maybeSingle();

  // They claimed it. The funnel worked. Stop talking.
  if (!result || result.claimed_at) return { done: true, sent: false };

  const url = await rotateLink(row.result_id, String(result.tool_slug));
  if (!url) return { done: true, sent: false };

  const c = copy.resultViewedNotClaimed({ resultUrl: url });
  return dispatchToBestChannel(identity, c, `viewed_unclaimed:${row.result_id}`);
}

async function handleAbandoned(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };

  // Came back on their own between the sweep and now? Leave them alone.
  const { data: session } = await supabaseAdmin
    .from('lead_sessions')
    .select('status')
    .eq('id', row.session_id ?? '')
    .maybeSingle();

  if (session?.status === 'open') return { done: true, sent: false };

  const c = copy.sessionAbandoned();
  return dispatchToBestChannel(identity, c, `abandoned:${row.session_id}`);
}

/** Not to the artist. To Josh. */
async function handleHighIntentAlert(row: OutboxRow): Promise<HandleOutcome> {
  if (!row.lead_identity_id) return { done: true, sent: false };

  const { data: profile } = await supabaseAdmin
    .from('lead_profiles')
    .select('lead_score, score_band')
    .eq('lead_identity_id', row.lead_identity_id)
    .maybeSingle();

  const { data: identity } = await supabaseAdmin
    .from('lead_identities')
    .select('instagram_username')
    .eq('id', row.lead_identity_id)
    .maybeSingle();

  const { data: history } = await supabaseAdmin
    .from('lead_score_history')
    .select('reason_codes')
    .eq('lead_identity_id', row.lead_identity_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const mail = copy.highIntentAlert({
    score: Number(profile?.lead_score ?? 0),
    band: String(profile?.score_band ?? 'unknown'),
    instagramUsername: (identity?.instagram_username as string) ?? null,
    reasonCodes: (history?.reason_codes as string[]) ?? [],
  });

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FOUNDER_EMAIL,
      subject: mail.subject,
      html: mail.html,
    });
    return { done: true, sent: true };
  } catch {
    return { done: false, reason: 'founder_email_failed' };
  }
}

// ---------------------------------------------------------------------------

/**
 * Instagram DM first, email as a fallback.
 *
 * This ordering is not a preference, it is arithmetic: a cold Instagram lead almost never
 * gave us an email, because we never asked for one. The DM is the channel that exists. Email
 * is the bonus when they happen to have signed up.
 */
async function dispatchToBestChannel(
  identity: LeadIdentity,
  c: copy.FollowUpCopy,
  key: string,
): Promise<HandleOutcome> {
  const channels: Channel[] = ['instagram_dm', 'email'];

  for (const channel of channels) {
    const res = await send({
      identity,
      channel,
      text: c.dm,
      subject: c.subject,
      html: c.html,
      idempotencyKey: `${key}:${channel}`,
    });

    if (res.sent) return { done: true, sent: true };

    // A TRANSIENT failure is worth retrying, so bail out now and let the backoff handle it.
    // A TERMINAL one (no consent, no email, Meta's window shut) rules out this channel only,
    // so fall through and try the next.
    if (!TERMINAL_REASONS.has(res.reason)) {
      return { done: false, reason: res.reason };
    }
  }

  // Every channel gave a terminal answer. There is nothing here that a retry would fix, and
  // an unreachable lead is a normal outcome, not an error. Stop cleanly.
  return { done: true, sent: false };
}

/**
 * Mint a fresh link for a stored result.
 *
 * We only keep the token hash, so the original URL is unrecoverable by design. Any outbound
 * message that carries a link therefore has to rotate. The alternative was storing raw
 * tokens, and a database read must never yield a working link.
 */
async function rotateLink(resultId: string, toolSlug: string): Promise<string | null> {
  const { raw, hash } = mintToken();
  const { error } = await supabaseAdmin
    .from('lead_magnet_results')
    .update({
      public_token_hash: hash,
      public_token_expires_at: expiresAt(RESULT_TTL_SECONDS),
      revoked_at: null,
      sent_at: new Date().toISOString(),
    })
    .eq('id', resultId);

  if (error) return null;
  return buildResultUrl(toolSlug, raw);
}

async function retryOrDeadLetter(row: OutboxRow, reason: string, report: DispatchReport): Promise<void> {
  // Terminal. Nothing about this changes on a timer, so retrying is pure noise.
  if (TERMINAL_REASONS.has(reason)) {
    await finish(row.id, 'skipped', reason);
    report.skipped++;
    return;
  }

  const attempts = (row.attempt_count ?? 0) + 1;

  if (attempts >= (row.max_attempts ?? 5)) {
    await finish(row.id, 'dead_letter', reason);
    report.deadLettered++;
    return;
  }

  // Exponential backoff, in days, because the host cron only runs daily. Retrying sooner than
  // the next run would be pointless.
  const delayDays = Math.min(2 ** (attempts - 1), 8);
  await supabaseAdmin
    .from('acquisition_events')
    .update({
      status: 'pending',
      next_attempt_at: new Date(Date.now() + delayDays * 24 * 3_600_000).toISOString(),
      last_error_code: reason,
      last_error_at: new Date().toISOString(),
    })
    .eq('id', row.id);
}

async function finish(id: string, status: string, reason?: string): Promise<void> {
  await supabaseAdmin
    .from('acquisition_events')
    .update({
      status,
      processed_at: new Date().toISOString(),
      ...(reason ? { last_error_code: reason, last_error_at: new Date().toISOString() } : {}),
    })
    .eq('id', id);
}

async function hasEvent(idempotencyKey: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('acquisition_events')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  return !!data;
}

async function loadIdentity(id: string): Promise<LeadIdentity | null> {
  const { data } = await supabaseAdmin.from('lead_identities').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  return {
    id: String(data.id),
    manychatContactId: (data.manychat_contact_id as string) ?? null,
    instagramUserId: (data.instagram_user_id as string) ?? null,
    instagramUsername: (data.instagram_username as string) ?? null,
    email: (data.email as string) ?? null,
    emailVerifiedAt: (data.email_verified_at as string) ?? null,
    phone: (data.phone as string) ?? null,
    userId: (data.user_id as string) ?? null,
    artistId: (data.artist_id as string) ?? null,
    claimedAt: (data.claimed_at as string) ?? null,
    consentDm: data.consent_dm === true,
    consentEmail: data.consent_email === true,
    consentSms: data.consent_sms === true,
    status: (data.status as LeadIdentity['status']) ?? 'active',
  };
}

// ---------------------------------------------------------------------------
// 3. Retention. The thing the privacy doc says to fix before volume.
// ---------------------------------------------------------------------------

/** How long we keep the literal text of someone's Instagram DMs. */
const TRANSCRIPT_RETENTION_DAYS = 90;

async function enforceRetention(report: DispatchReport): Promise<void> {
  const cutoff = new Date(Date.now() - TRANSCRIPT_RETENTION_DAYS * 24 * 3_600_000).toISOString();

  // Blank the CONTENT, keep the skeleton. Analytics still knows a message happened, when, and
  // in which direction. It no longer holds what a stranger typed into Instagram three months
  // ago, which we have no continuing reason to store.
  const { data } = await supabaseAdmin
    .from('lead_conversation_messages')
    .update({ content: null, redacted_at: new Date().toISOString() })
    .lt('created_at', cutoff)
    .is('redacted_at', null)
    .select('id');

  report.redacted += (data ?? []).length;
}

// ---------------------------------------------------------------------------
// 4. Expired token hygiene
// ---------------------------------------------------------------------------

async function cleanupExpiredTokens(_report: DispatchReport): Promise<void> {
  // An expired token is already rejected at read time, so this is hygiene, not security:
  // it stops us holding a hash we will never validate again.
  await supabaseAdmin
    .from('lead_magnet_results')
    .update({ public_token_hash: null })
    .lt('public_token_expires_at', new Date().toISOString())
    .not('public_token_hash', 'is', null);
}
