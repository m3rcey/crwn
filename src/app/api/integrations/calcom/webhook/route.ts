// Cal.com webhook. This is what closes the loop on the most damaging failure mode in the
// funnel: an artist books a call, and then receives an automated "you never opened your
// numbers" DM while she is sitting in a Zoom with Josh.
//
// The cancellation rule in automationDispatcher looks for a `sales_call_booked` event. Until
// this route existed, nothing emitted one, so the rule never fired.
//
// SECURITY: Cal.com CAN HMAC-sign (unlike ManyChat), so this verifies a real signature against
// the RAW body. Fail closed. Middleware excludes /api/, so this route authenticates itself.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  MAX_CAL_BODY_BYTES,
  parseCalBooking,
  verifyCalcomRequest,
} from '@/lib/calcom/verifyWebhook';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (raw.length > MAX_CAL_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  // Verify against the RAW bytes. Re-serializing would break the MAC for reasons that look
  // exactly like an attack.
  const verified = verifyCalcomRequest(raw, req.headers.get('x-cal-signature-256'));
  if (!verified.ok) {
    console.warn('[calcom] rejected:', verified.reason);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const booking = parseCalBooking(body);
  if (!booking) {
    return NextResponse.json({ error: 'Unrecognized payload' }, { status: 400 });
  }

  // Which CRWN lead is this? The id rides through the booking URL, because an Instagram lead
  // has no email and may type a brand new one into Cal.com that CRWN has never seen.
  const identityId = await resolveLead(booking.leadIdentityId, booking.attendeeEmail, booking.uid);

  // A booking we cannot attribute is still worth recording. Josh can link it by hand in admin
  // rather than it vanishing.
  if (!identityId) {
    await supabaseAdmin.from('acquisition_events').insert({
      event_name: 'sales_call_unattributed',
      idempotency_key: booking.uid ? `cal_unattributed:${booking.uid}` : null,
      metadata: {
        trigger: booking.triggerEvent,
        uid: booking.uid,
        startTime: booking.startTime,
        // Deliberately no email in metadata: acquisition_events is a general log and this is
        // the one place a stray address could leak into it.
      },
      status: 'recorded',
    });
    return NextResponse.json({ ok: true, attributed: false });
  }

  switch (booking.triggerEvent) {
    case 'BOOKING_CREATED':
      await onBooked(identityId, booking.uid, booking.startTime, booking.endTime, booking.attendeeEmail);
      break;

    case 'BOOKING_CANCELLED':
      await onCancelled(identityId, booking.uid);
      break;

    case 'BOOKING_RESCHEDULED':
      // A reschedule is still a live intent. Keep her converted, refresh the timing.
      await onBooked(identityId, booking.uid, booking.startTime, booking.endTime, booking.attendeeEmail);
      break;

    case 'BOOKING_NO_SHOW_UPDATED':
      // Josh ticked (or un-ticked) "no-show" in Cal.com. This is a HUMAN's verdict relayed
      // through Cal.com, which is exactly the confirmation the ladder requires. It is NOT
      // Cal.com guessing from "guest hasn't joined the video yet".
      //
      // `null` means the payload carried no flag we recognise. That is not a no-show, and we
      // do nothing: an unsent message costs nothing, a wrong one costs the artist.
      if (booking.noShow === true) await onNoShow(identityId);
      else if (booking.noShow === false) await onAttended(identityId);
      break;

    default:
      // Unknown trigger. Record it and move on rather than 400ing at Cal.com forever.
      break;
  }

  return NextResponse.json({ ok: true, attributed: true });
}

// ---------------------------------------------------------------------------

async function onBooked(
  identityId: string,
  uid: string | null,
  startTime: string | null,
  endTime: string | null,
  email: string | null,
): Promise<void> {
  const now = new Date().toISOString();

  // THE EVENT THE CANCELLATION RULE LOOKS FOR. Everything else hangs off this.
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'sales_call_booked',
    lead_identity_id: identityId,
    idempotency_key: uid ? `cal_booked:${uid}` : `cal_booked:${identityId}`,
    metadata: { uid, startTime, endTime },
    status: 'recorded',
    occurred_at: now,
  });

  // KILL THE NURTURE. Not "fewer messages": all of it, immediately.
  //
  // The dispatcher also checks hasConverted() before every send, so this is belt and braces.
  // But a pending row that will never send is noise in the admin queue, so retire it properly.
  //
  // The no-show ladder is cancelled here too, and that one is NOT belt and braces: it is the
  // only thing stopping an artist who missed the first call, rebooked from the "want to try
  // again?" link, and is now sitting in the rescheduled Zoom, from receiving "you booked and
  // did not turn up" while Josh is talking to her.
  await supabaseAdmin
    .from('acquisition_events')
    .update({ status: 'skipped', last_error_code: 'converted_booked_call' })
    .eq('lead_identity_id', identityId)
    .eq('status', 'pending')
    .in('event_name', [
      'result_not_viewed_check',
      'result_viewed_not_claimed',
      'session_abandoned_nudge',
      'personal_nudge',
      'offer_call',
      'call_no_show',
      'call_no_show_second',
      'call_no_show_final',
    ]);

  // Cal.com gave us an email we very likely did not have (an Instagram lead has none). Store
  // it, but do NOT mark it verified: she typed it into a third-party form, which is a claim,
  // not a verification. Only Supabase auth can verify an email, and only a verified email may
  // ever resolve an identity to an account.
  if (email) {
    await supabaseAdmin
      .from('lead_identities')
      .update({ email, consent_email: true, consent_source: 'calcom_booking' })
      .eq('id', identityId)
      .is('email', null);
  }

  // Confirmation DM, plus the one thing that makes the call actually useful.
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'call_booked',
    lead_identity_id: identityId,
    idempotency_key: uid ? `call_booked_dm:${uid}` : `call_booked_dm:${identityId}`,
    status: 'pending',
    next_attempt_at: now,
  });

  // Session state, and a score bump. A booked call is a hard sales signal regardless of what
  // her follower count says.
  await supabaseAdmin
    .from('lead_sessions')
    .update({ state: 'booked_call', last_activity_at: now })
    .eq('lead_identity_id', identityId)
    .eq('status', 'open');

  const { recomputeScore } = await import('@/lib/acquisition/rescore');
  await recomputeScore(identityId, { sourceEvent: 'sales_call_booked' });
}

/**
 * She cancelled. She is NOT a no-show, and she must not get the "Missed you" ladder.
 *
 * Cancelling is a considered act: she looked at her calendar and chose not to. Treating that
 * like a forgotten invite would be tone-deaf. Put her back into the normal nurture and let the
 * call offer come round again on its own.
 */
async function onCancelled(identityId: string, uid: string | null): Promise<void> {
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'sales_call_cancelled',
    lead_identity_id: identityId,
    idempotency_key: uid ? `cal_cancelled:${uid}` : null,
    metadata: { uid },
    status: 'recorded',
  });

  // Un-book her, so hasConverted() stops suppressing her nurture.
  await supabaseAdmin
    .from('acquisition_events')
    .update({ status: 'skipped', last_error_code: 'booking_cancelled' })
    .eq('lead_identity_id', identityId)
    .eq('event_name', 'sales_call_booked')
    .eq('status', 'recorded');

  // Offer again in a week. Not tomorrow. She just said no to a specific time; chasing her
  // immediately reads as not listening.
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'offer_call',
    lead_identity_id: identityId,
    idempotency_key: `offer_call_recancel:${identityId}`,
    status: 'pending',
    next_attempt_at: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString(),
  });
}

/**
 * She did not turn up, and a human said so. Start the ladder.
 *
 * Identical in effect to the "No-show" button in /admin, and it writes the SAME idempotency
 * key, so marking it in both places cannot send her the sequence twice.
 */
async function onNoShow(identityId: string): Promise<void> {
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'call_no_show',
    lead_identity_id: identityId,
    idempotency_key: `no_show_start:${identityId}`,
    status: 'pending',
    next_attempt_at: new Date().toISOString(),
  });
}

/**
 * She DID turn up (or Josh un-ticked a no-show he set by mistake).
 *
 * This is the undo, and it has to be fast: it kills every rung of the ladder that has not been
 * sent yet. The dispatcher only runs daily, so an accidental tick corrected the same day sends
 * her nothing at all.
 */
async function onAttended(identityId: string): Promise<void> {
  await supabaseAdmin.from('acquisition_events').insert({
    event_name: 'sales_call_attended',
    lead_identity_id: identityId,
    idempotency_key: `attended:${identityId}`,
    status: 'recorded',
  });

  await supabaseAdmin
    .from('acquisition_events')
    .update({ status: 'skipped', last_error_code: 'call_attended' })
    .eq('lead_identity_id', identityId)
    .eq('status', 'pending')
    .in('event_name', ['call_no_show', 'call_no_show_second', 'call_no_show_final']);
}

/**
 * Which lead is this?
 *
 * The id rides through the booking URL. The booking UID is the second key, and it is the one
 * that carries a no-show or a cancellation: those payloads reference an existing booking and
 * carry none of the original URL metadata. Email is a LAST resort, and only on an exact single
 * match.
 *
 * We never create or merge an identity from a Cal.com booking: anyone could type anyone's
 * address into a booking form, and merging on that is the account-takeover vector the whole
 * identity system exists to avoid.
 */
async function resolveLead(
  leadId: string | null,
  email: string | null,
  uid: string | null,
): Promise<string | null> {
  if (leadId) {
    const { data } = await supabaseAdmin
      .from('lead_identities')
      .select('id')
      .eq('id', leadId)
      .maybeSingle();
    if (data) return String(data.id);
  }

  // The booking we already recorded under this UID tells us who she is.
  if (uid) {
    const { data } = await supabaseAdmin
      .from('acquisition_events')
      .select('lead_identity_id')
      .eq('idempotency_key', `cal_booked:${uid}`)
      .maybeSingle();
    if (data?.lead_identity_id) return String(data.lead_identity_id);
  }

  if (email) {
    const { data } = await supabaseAdmin
      .from('lead_identities')
      .select('id')
      .eq('email', email)
      .limit(2);
    // Exactly one match, or we do not guess.
    if (data && data.length === 1) return String(data[0].id);
  }

  return null;
}
