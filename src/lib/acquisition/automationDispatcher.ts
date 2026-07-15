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
import { LEAD_MAGNETS } from '../leadMagnets/registry';
import type { LeadIdentity } from './types';

const BATCH_SIZE = 50;
const FOUNDER_EMAIL = 'joshn.wms@gmail.com';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';

/** The tool education drip: one CRWN tool introduced per email, this many days apart, after the
 *  main sequence. Several days so it reads as a slow nurture, not a blast. */
const SPOTLIGHT_INTERVAL_DAYS = 5;

/**
 * Where she books the 15 minutes.
 *
 * It MUST be the event page (/15min), not the profile page (/jnwcreative). The profile page is
 * a LIST of event types, and clicking through to the event drops the query string. So a link to
 * the profile would strip the `metadata[crwn]` param below, and every booking that came from a
 * DM would arrive unattributed: no cancellation of her nurture, no confirmation, nothing.
 * A link that looks right and silently loses its payload is the worst kind.
 */
const BOOKING_URL = process.env.CRWN_BOOKING_URL || 'https://cal.com/jnwcreative/15min';

/**
 * The booking link MUST carry the lead id, or Cal.com's webhook cannot tell us who booked.
 *
 * Email is not a usable join key here: an Instagram lead has no email, and she may well type a
 * brand new one into Cal.com that CRWN has never seen. Without the id in the link, a booking
 * arrives unattributed, her nurture is never cancelled, and she gets "you never opened your
 * numbers" while sitting in a Zoom with Josh. Which is the exact failure this whole webhook
 * exists to prevent.
 */
function bookingUrlFor(identityId: string): string {
  const sep = BOOKING_URL.includes('?') ? '&' : '?';
  return `${BOOKING_URL}${sep}metadata[crwn]=${encodeURIComponent(identityId)}`;
}

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

  // ---- THE CANCELLATION RULE. Check this before EVERY outbound message. ----
  //
  // She booked a call. She must not then receive "you never opened your numbers" while she is
  // sitting in a Zoom with Josh. One automated message landing after a conversion undoes the
  // entire impression the conversation just built.
  //
  // A converted lead exits the nurture funnel completely. Not "gets fewer messages": exits.
  if (identity && (await hasConverted(identity.id)) && isNurtureEvent(row.event_name)) {
    return { done: true, sent: false };
  }

  switch (row.event_name) {
    case 'result_not_viewed_check':
      return handleResultNotViewed(row, identity);
    case 'result_viewed_not_claimed':
      return handleViewedNotClaimed(row, identity);
    case 'session_abandoned_nudge':
      return handleAbandoned(row, identity);
    case 'personal_nudge':
      return handlePersonalNudge(row, identity);
    case 'offer_call':
      return handleOfferCall(row, identity);
    case 'call_booked':
      return handleCallBooked(row, identity);
    case 'call_no_show':
      return handleCallNoShow(row, identity);
    case 'call_no_show_second':
      return handleCallNoShowSecond(row, identity);
    case 'call_no_show_final':
      return handleCallNoShowFinal(row, identity);
    case 'tool_spotlight':
      return handleToolSpotlight(row, identity);
    case 'high_intent_alert':
      return handleHighIntentAlert(row);
    default:
      // An event we do not know how to handle is not a crash and not a retry. Mark it done
      // and move on, so a stray row cannot wedge the queue forever.
      return { done: true, sent: false };
  }
}

/** Nurture messages stop the moment she converts. Confirmations and reminders do not. */
function isNurtureEvent(name: string): boolean {
  return [
    'result_not_viewed_check',
    'result_viewed_not_claimed',
    'session_abandoned_nudge',
    'personal_nudge',
    'offer_call',
    'tool_spotlight',
  ].includes(name);
}

/**
 * Has she converted? Booked a call, or claimed an account.
 *
 * Either one means a human is now involved (or she is inside the product), and an automated
 * "why haven't you looked at your numbers" message would be actively damaging.
 */
async function hasConverted(identityId: string): Promise<boolean> {
  const { data: identity } = await supabaseAdmin
    .from('lead_identities')
    .select('claimed_at, user_id, status')
    .eq('id', identityId)
    .maybeSingle();

  if (identity?.claimed_at || identity?.user_id) return true;
  if (identity?.status === 'opted_out' || identity?.status === 'disqualified') return true;

  // status='recorded' is load-bearing, not decoration. When she CANCELS, the Cal.com webhook
  // flips this row to 'skipped'. Without the filter, a cancelled booking would suppress her
  // nurture forever: she would have told us she is not coming, and we would have responded by
  // going silent on her permanently.
  const { data: booked } = await supabaseAdmin
    .from('acquisition_events')
    .select('id')
    .eq('lead_identity_id', identityId)
    .eq('event_name', 'sales_call_booked')
    .eq('status', 'recorded')
    .limit(1)
    .maybeSingle();

  return !!booked;
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
  const outcome = await dispatchToBestChannel(identity, c, `viewed_unclaimed:${row.result_id}`);

  // Chain: the personal one lands 2 days after this. If she converts or opts out first, the
  // cancellation rule at the top of handle() kills it before it sends.
  if (outcome.done) {
    await queueNext('personal_nudge', identity.id, row.session_id, 2);
  }
  return outcome;
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

/**
 * Day 4. The personal one.
 *
 * Automated, and honest about it. This is the highest-leverage message in the sequence: it
 * breaks the automation spell with a first name, a real question, and an invitation to reply.
 * A reply also REOPENS Meta's 24-hour window, which is what keeps the channel alive for the
 * call offer three days later.
 */
async function handlePersonalNudge(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };

  const { data: profile } = await supabaseAdmin
    .from('lead_profiles')
    .select('lead_identity_id')
    .eq('lead_identity_id', identity.id)
    .maybeSingle();
  if (!profile) return { done: true, sent: false };

  // Her actual number, so the message is about HER and not about CRWN.
  const { data: result } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('title')
    .eq('lead_identity_id', identity.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const amount = extractAmount(String(result?.title ?? ''));

  const c = copy.personalNudge({ amount });
  const outcome = await dispatchToBestChannel(identity, c, `personal:${identity.id}`);

  // Queue the call offer for 3 days later. If she replies or converts in the meantime, the
  // cancellation rule at the top of handle() kills it.
  if (outcome.done) {
    await queueNext('offer_call', identity.id, row.session_id, 3);
  }
  return outcome;
}

/** Day 7. Offer BOTH paths and let her choose. The choice she makes is the data. */
async function handleOfferCall(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };

  const { data: result } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('tool_slug')
    .eq('lead_identity_id', identity.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const resultUrl = result ? await rotateLink(row.result_id ?? '', String(result.tool_slug)) : null;

  const c = copy.offerCall({
    bookingUrl: bookingUrlFor(identity.id),
    resultUrl: resultUrl ?? 'https://thecrwn.app/worth',
  });

  const outcome = await dispatchToBestChannel(identity, c, `offer_call:${identity.id}`);

  // The main sequence ends here. Hand off to the tool education drip: one CRWN tool per email,
  // several days apart. If she converts or opts out first, the cancellation rule at the top of
  // handle() kills it (tool_spotlight is a nurture event).
  if (outcome.done) {
    await queueToolSpotlight(identity.id, row.session_id, 0, SPOTLIGHT_INTERVAL_DAYS);
  }
  return outcome;
}

/**
 * The tool education drip. One CRWN tool per email, in registry order, several days apart.
 *
 * She entered through the Worth calculator, so this introduces the OTHER tools she has not seen:
 * each email says what the feature is, why skipping it costs her, how it works, then the tool.
 * When we run past the end of the registry the drip is simply over; going quiet is the right end,
 * not looping the same four tools forever.
 */
async function handleToolSpotlight(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };

  // Which tool is next: count the spotlights already finalized for this lead. That count is the
  // index of the next tool, so a skipped or sent one both advance the drip and it never repeats.
  const index = await countFinalizedToolSpotlights(identity.id);
  const tool = LEAD_MAGNETS[index];
  if (!tool) return { done: true, sent: false }; // every tool introduced, drip complete

  const c = copy.toolSpotlight({
    featureName: tool.featureName,
    headline: tool.hero.headline,
    why: tool.hero.subheadline,
    whatItIs: tool.description,
    howLong: tool.timeToComplete,
    primaryCta: tool.hero.primaryCta,
    toolUrl: `${APP_URL}${tool.publicRoute}?ref=ig-funnel`,
  });

  const outcome = await dispatchToBestChannel(identity, c, `spotlight:${identity.id}:${tool.slug}`);

  // Queue the next tool only once this one is handled, and only if one remains.
  if (outcome.done && index + 1 < LEAD_MAGNETS.length) {
    await queueToolSpotlight(identity.id, row.session_id, index + 1, SPOTLIGHT_INTERVAL_DAYS);
  }
  return outcome;
}

/** How many tool spotlights have already reached a final state for this lead. Drives which tool
 *  is next; the row being processed right now is still 'processing', so it is not counted. */
async function countFinalizedToolSpotlights(identityId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('acquisition_events')
    .select('id', { count: 'exact', head: true })
    .eq('lead_identity_id', identityId)
    .eq('event_name', 'tool_spotlight')
    .in('status', ['processed', 'skipped', 'dead_letter']);
  return count ?? 0;
}

/** Queue the next tool spotlight. The index is in the idempotency key so each step queues exactly
 *  once even if the dispatcher run overlaps or retries. */
async function queueToolSpotlight(
  identityId: string,
  sessionId: string | null,
  index: number,
  delayDays: number,
): Promise<void> {
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'tool_spotlight',
    lead_identity_id: identityId,
    session_id: sessionId,
    idempotency_key: `tool_spotlight:${identityId}:${index}`,
    status: 'pending',
    next_attempt_at: new Date(Date.now() + delayDays * 24 * 3_600_000).toISOString(),
  });
}

/** She booked. Confirm, and tell her the one thing to bring. */
async function handleCallBooked(_row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };
  const c = copy.callBooked();
  return dispatchToBestChannel(identity, c, `call_booked:${identity.id}`);
}

// ---------------------------------------------------------------------------
// THE NO-SHOW LADDER
//
// A no-show is CONFIRMED, never assumed. Cal.com's no-show webhook support is inconsistent and
// I am not guessing at it. Josh marks it in /admin -> Acquisition, and only then does this
// fire.
//
// The reason is not fastidiousness. Sending "Missed you" to an artist who DID turn up, and had
// a good call with Josh, is humiliating for both of them and it would poison a relationship
// that had just started well. An unsent message costs nothing. A wrong one costs the artist.
// ---------------------------------------------------------------------------

/** No-show, within the hour. Warm, zero guilt. Then queues the second rung. */
async function handleCallNoShow(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };

  const c = copy.callNoShow({ bookingUrl: bookingUrlFor(identity.id) });
  const outcome = await dispatchToBestChannel(identity, c, `no_show:${identity.id}`);

  if (outcome.done) {
    await queueNext('call_no_show_second', identity.id, row.session_id, 2);
  }
  return outcome;
}

/** No-show, +2 days. Names the cost, then a binary question. Queues the breakup. */
async function handleCallNoShowSecond(row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };

  const { data: result } = await supabaseAdmin
    .from('lead_magnet_results')
    .select('title')
    .eq('lead_identity_id', identity.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const c = copy.callNoShowSecond({
    bookingUrl: bookingUrlFor(identity.id),
    amount: extractAmount(String(result?.title ?? '')),
  });

  const outcome = await dispatchToBestChannel(identity, c, `no_show_2:${identity.id}`);

  if (outcome.done) {
    await queueNext('call_no_show_final', identity.id, row.session_id, 3);
  }
  return outcome;
}

/**
 * No-show, +5 days. THE BREAKUP. And the LAST message, whatever happens.
 *
 * After this the lead goes to `nurture` and CRWN stops. A funnel that will not take silence for
 * an answer is not persistent, it is a nuisance, and the artist you annoy today is the one who
 * will not come back in a year when she is finally ready.
 */
async function handleCallNoShowFinal(_row: OutboxRow, identity: LeadIdentity | null): Promise<HandleOutcome> {
  if (!identity) return { done: true, sent: false };

  const c = copy.callNoShowFinal({ bookingUrl: bookingUrlFor(identity.id) });
  const outcome = await dispatchToBestChannel(identity, c, `no_show_final:${identity.id}`);

  // Done chasing. She stays in the database, she keeps her result link, and she never hears
  // from the automation again unless she comes back on her own.
  await supabaseAdmin.from('lead_identities').update({ status: 'nurture' }).eq('id', identity.id);

  return outcome;
}

/** Queue the next step of the sequence. Deduped, so a retry cannot double-queue it. */
async function queueNext(
  eventName: string,
  identityId: string,
  sessionId: string | null,
  delayDays: number,
): Promise<void> {
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: eventName,
    lead_identity_id: identityId,
    session_id: sessionId,
    idempotency_key: `${eventName}:${identityId}`,
    status: 'pending',
    next_attempt_at: new Date(Date.now() + delayDays * 24 * 3_600_000).toISOString(),
  });
}

/** "About $3,892 a month is sitting on the table" -> "$3,892" */
function extractAmount(title: string): string | null {
  const m = title.match(/\$[\d,]+/);
  return m ? m[0] : null;
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
