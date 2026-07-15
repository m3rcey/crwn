// Outbound channels, and the rules that govern them.
//
// This is a CHOKE POINT on purpose. Every outbound acquisition message goes through send()
// and nowhere else, so there is exactly one place to audit for "did we have consent, did we
// already message them today, are they suppressed".
//
// The rules, and why each one exists:
//
//   CONSENT PER CHANNEL   - consent to a DM is not consent to an email. A cold IG lead who
//                           tapped "Yes, ask me questions" did not sign up for a mailing list.
//   FREQUENCY CAP         - at most 1 outbound message per lead per 24h, 4 per lead ever.
//                           A stranger who ignored you three times has told you something.
//   SUPPRESSION           - honors the EXISTING email_suppressions table, so a bounce or a
//                           complaint from any CRWN system stops acquisition email too.
//   NO EMAIL, NO PROBLEM  - most IG leads have no email. That is expected, not a failure.

import { supabaseAdmin } from './db';
import { isManyChatOutboundConfigured, sendManyChatMessage, type SendOutcome } from '../manychat/client';
import { resend, FROM_EMAIL } from '../resend';
import { buildUnsubscribeUrl } from './unsubscribe';
import type { LeadIdentity } from './types';

// A real mailing address is legally required in the footer of every commercial email (CAN-SPAM).
// A PO box is fine. Set BUSINESS_POSTAL_ADDRESS in the environment; the placeholder is obvious on
// purpose so an un-set value cannot ship silently.
const POSTAL_ADDRESS =
  process.env.BUSINESS_POSTAL_ADDRESS || '[SET BUSINESS_POSTAL_ADDRESS: a real CRWN mailing address]';

export type Channel = 'instagram_dm' | 'email' | 'sms';

export interface SendRequest {
  identity: LeadIdentity;
  channel: Channel;
  /** Plain text, for the DM. */
  text: string;
  /** Email only. */
  subject?: string;
  html?: string;
  /** Dedupe key. The same key never sends twice. */
  idempotencyKey: string;
}

export type ChannelResult =
  | { sent: true; providerId: string | null }
  | { sent: false; reason: string };

/** At most one outbound acquisition message per lead per day. This is the real anti-annoyance
 *  guard: whatever the sequence queues, she never hears from us more than once in 24h. */
const MIN_HOURS_BETWEEN = 24;
/**
 * And at most this many, ever. This used to be 4 ("three ignored messages is an answer"), which
 * was right for the short funnel but silently suppressed the tool education drip. The sequence is
 * now the main nurture (up to 4) plus one email per CRWN tool (4 today), so the ceiling has to
 * clear both. Every email carries a one-click unsubscribe, so a lead who is done can end it
 * herself; the lifetime cap is the backstop, not the primary control. The per-24h cap above is.
 */
const MAX_LIFETIME_MESSAGES = 10;

export async function send(req: SendRequest): Promise<ChannelResult> {
  const { identity, channel } = req;

  // ---- Opted out or disqualified? Nothing, ever, on any channel. ----
  if (identity.status === 'opted_out' || identity.status === 'disqualified') {
    return { sent: false, reason: 'opted_out' };
  }

  // ---- Consent, per channel. ----
  if (channel === 'instagram_dm' && !identity.consentDm) return { sent: false, reason: 'no_dm_consent' };
  if (channel === 'email' && !identity.consentEmail) return { sent: false, reason: 'no_email_consent' };
  if (channel === 'sms' && !identity.consentSms) return { sent: false, reason: 'no_sms_consent' };

  // ---- Frequency caps. ----
  const cap = await checkCaps(identity.id);
  if (!cap.ok) return { sent: false, reason: cap.reason };

  // ---- Dedupe. The same message never sends twice, however many times we are asked. ----
  const claimed = await claimSend(identity.id, req.idempotencyKey, channel);
  if (!claimed) return { sent: false, reason: 'already_sent' };

  // ---- Dispatch. ----
  let outcome: ChannelResult;

  switch (channel) {
    case 'instagram_dm':
      outcome = await sendDm(identity, req.text);
      break;
    case 'email':
      outcome = await sendEmail(identity, req.subject ?? '', req.html ?? '');
      break;
    case 'sms':
      // DISABLED SAFE ADAPTER, deliberately.
      //
      // The SMS infrastructure exists (twilio.ts, quiet hours, sms_consent_log) but a cold
      // Instagram lead has no phone and no SMS consent, so this channel would reach nobody
      // while adding a live compliance surface. The interface is here so a future phase can
      // enable it without restructuring anything. It is not wired, and it does not pretend
      // to be.
      outcome = { sent: false, reason: 'sms_channel_disabled' };
      break;
  }

  await recordOutcome(identity.id, req.idempotencyKey, outcome);
  return outcome;
}

// ---------------------------------------------------------------------------

async function sendDm(identity: LeadIdentity, text: string): Promise<ChannelResult> {
  if (!identity.manychatContactId) return { sent: false, reason: 'no_manychat_contact' };
  if (!isManyChatOutboundConfigured()) return { sent: false, reason: 'manychat_outbound_not_configured' };

  const outcome: SendOutcome = await sendManyChatMessage(identity.manychatContactId, text);

  if (outcome.ok) return { sent: true, providerId: outcome.providerId };

  // Meta closed the 24h window. Expected, and NOT retryable: the window reopens when the
  // artist messages us, not on a timer. Mark it terminal so we stop trying.
  if (outcome.code === 'outside_window') {
    return { sent: false, reason: 'outside_messaging_window' };
  }

  return { sent: false, reason: `dm_${outcome.code}` };
}

async function sendEmail(identity: LeadIdentity, subject: string, html: string): Promise<ChannelResult> {
  if (!identity.email) return { sent: false, reason: 'no_email' };
  if (!subject || !html) return { sent: false, reason: 'no_email_content' };

  // Honor the EXISTING global suppression list. A bounce or a spam complaint recorded by any
  // other CRWN system stops acquisition email too. Reusing it rather than inventing a second
  // list is the whole point.
  const { data: suppressed } = await supabaseAdmin
    .from('email_suppressions')
    .select('email')
    .eq('email', identity.email)
    .maybeSingle();

  if (suppressed) return { sent: false, reason: 'suppressed' };

  // Every acquisition email is commercial, so it MUST carry a working opt-out and a postal
  // address (CAN-SPAM). We inject both HERE, at the single send choke point, so the copy in
  // acquisitionFollowUp.ts never has to know the recipient's email and every current and future
  // template is compliant by construction. The List-Unsubscribe headers give mail clients the
  // native one-click "Unsubscribe" button, which also lifts inbox placement.
  const unsubscribeUrl = buildUnsubscribeUrl(identity.email);
  const compliantHtml = `${html}${complianceFooter(unsubscribeUrl)}`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: identity.email,
      subject,
      html: compliantHtml,
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (error) return { sent: false, reason: 'resend_error' };
    return { sent: true, providerId: data?.id ?? null };
  } catch {
    return { sent: false, reason: 'resend_throw' };
  }
}

/** The legally required footer: a one-click unsubscribe and a physical postal address. */
function complianceFooter(unsubscribeUrl: string): string {
  return `
    <div style="max-width:460px;margin:24px auto 0;text-align:center;color:#555;font-size:12px;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <p style="margin:0 0 6px;">You are getting this because you asked CRWN for your numbers on Instagram.</p>
      <p style="margin:0 0 6px;"><a href="${unsubscribeUrl}" style="color:#888;text-decoration:underline;">Unsubscribe</a></p>
      <p style="margin:0;">${POSTAL_ADDRESS}</p>
    </div>`;
}

// ---------------------------------------------------------------------------

async function checkCaps(identityId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data } = await supabaseAdmin
    .from('acquisition_events')
    .select('occurred_at')
    .eq('lead_identity_id', identityId)
    .like('event_name', 'outbound_%')
    .eq('status', 'processed')
    .order('occurred_at', { ascending: false })
    .limit(MAX_LIFETIME_MESSAGES);

  const sends = data ?? [];

  if (sends.length >= MAX_LIFETIME_MESSAGES) {
    return { ok: false, reason: 'lifetime_cap_reached' };
  }

  const last = sends[0]?.occurred_at;
  if (last) {
    const hours = (Date.now() - Date.parse(String(last))) / 3_600_000;
    if (hours < MIN_HOURS_BETWEEN) return { ok: false, reason: 'frequency_cap' };
  }

  return { ok: true };
}

/**
 * Claim the send BEFORE dispatching, via the unique idempotency key.
 *
 * Insert-as-claim, same as the inbound webhook. If two dispatcher runs overlap (a retry, a
 * manual trigger, a slow previous run), only one of them gets to send. The artist does not
 * get the same nudge twice.
 */
async function claimSend(identityId: string, key: string, channel: Channel): Promise<boolean> {
  const { error } = await supabaseAdmin.from('acquisition_events').insert({
    event_name: `outbound_${channel}`,
    lead_identity_id: identityId,
    idempotency_key: `send:${key}`,
    status: 'processing',
  });
  // 23505 = someone already claimed this exact send.
  return !error;
}

async function recordOutcome(identityId: string, key: string, outcome: ChannelResult): Promise<void> {
  await supabaseAdmin
    .from('acquisition_events')
    .update(
      outcome.sent
        ? { status: 'processed', processed_at: new Date().toISOString() }
        : { status: 'skipped', last_error_code: outcome.reason, last_error_at: new Date().toISOString() },
    )
    .eq('idempotency_key', `send:${key}`)
    .eq('lead_identity_id', identityId);
}
