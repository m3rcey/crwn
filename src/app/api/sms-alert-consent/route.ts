import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { resend, FROM_EMAIL } from '@/lib/resend';
import {
  ALERT_CONSENT_TEXT,
  ALERT_CONSENT_VERSION,
  alertConsentError,
  buildAlertConsentRecord,
  decideAlertConsent,
  maskPhone,
} from '@/lib/sms/alertConsent';

// PUBLIC endpoint (middleware excludes /api/). It backs the form at /sms-alert-consent, where
// JNW Creative Enterprises, Inc.'s own authorized personnel consent to receive internal
// operational lead alerts by SMS. It is public because a Twilio reviewer has no CRWN account and
// must be able to see the opt-in experience end to end.
//
// THIS ROUTE SENDS NO SMS, AND CANNOT. It holds no Twilio client, no Twilio credentials, no
// message body and no destination number other than the one being consented. The worst a
// determined caller achieves is writing a consent row for a number they control into a table
// nothing but the service role can read. There is deliberately no generic "SMS consent API"
// here: the purpose, the disclosure and the version are all server constants, so this endpoint
// can only ever record THIS consent for THIS campaign.
//
// The one email it sends is to the founder, and it is the internal recipient's own copy of their
// own consent record. It is also the reason a consent is never lost: until
// supabase/schema-phase2-internal-sms-alert-consent.sql is applied the table does not exist, and
// a consent form that silently stores nothing while saying "recorded" would be the worst
// possible outcome for a compliance page.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Server-only. The internal recipient of record.
const FOUNDER_EMAIL = 'joshn.wms@gmail.com';

/** Bigger than any honest submission of two fields. */
const MAX_BODY_BYTES = 2_000;

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

  // Abuse control. Deliberately rate limiting rather than adding a CAPTCHA: this endpoint sends
  // nothing, spends nothing, and writes to a table no one can read, so a challenge on a page
  // that a handful of people use once would be theatre. Volume is the only real risk.
  const allowed = await checkRateLimit(`ip:${ip}`, 'sms-alert-consent', 3600, 5);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  let body: { phone?: unknown; consent?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // The whole gate, server-side: consent must be explicitly true and the number must normalize.
  // A client-sent consent string is never read; only the boolean the checkbox produced.
  const decision = decideAlertConsent(body);
  if (!decision.ok || !decision.phone) {
    return NextResponse.json({ error: alertConsentError(decision.reason!) }, { status: 400 });
  }
  const phone = decision.phone;

  // One number cannot flood the log either, even from many addresses.
  const phoneOk = await checkRateLimit(`phone:${phone}`, 'sms-alert-consent-phone', 86400, 3);
  if (!phoneOk) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 });
  }

  const record = buildAlertConsentRecord(phone, ip, req.headers.get('user-agent'));
  const consentedAt = new Date().toISOString();

  let stored = false;
  try {
    const { error } = await supabaseAdmin.from('internal_sms_alert_consents').insert(record);
    if (error) throw new Error(error.message);
    stored = true;
  } catch (err) {
    // Never log the number. Masked tail only, which is enough to correlate with the email copy.
    console.error(
      `[sms-alert-consent] DB write failed for ${maskPhone(phone)}:`,
      err instanceof Error ? err.message : 'unknown',
    );
  }

  // The founder's copy. Sent on every accepted consent, not only on failure: at this volume it
  // costs nothing, and a timestamped record in the company mailbox is durable evidence in its
  // own right, which is exactly what a carrier audit asks to see.
  let emailed = false;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: FOUNDER_EMAIL,
      subject: 'CRWN internal SMS alert consent recorded',
      text: [
        'An authorized representative consented to receive internal CRWN operational lead alerts by SMS.',
        '',
        `Number: ${phone}`,
        `Consented at: ${consentedAt}`,
        `Consent version: ${ALERT_CONSENT_VERSION}`,
        `Source: ${record.source}`,
        `IP: ${record.ip_address ?? 'unknown'}`,
        `Stored in database: ${stored ? 'yes' : 'NO (run supabase/schema-phase2-internal-sms-alert-consent.sql, then keep this email as the record)'}`,
        '',
        'Exact language agreed to:',
        ALERT_CONSENT_TEXT,
      ].join('\n'),
    });
    emailed = true;
  } catch (err) {
    console.error(
      '[sms-alert-consent] founder copy failed:',
      err instanceof Error ? err.message : 'unknown',
    );
  }

  // Only claim the consent was recorded if it actually landed somewhere durable.
  if (!stored && !emailed) {
    return NextResponse.json(
      { error: 'We could not record your consent. Try again, or contact support@thecrwn.app.' },
      { status: 503 },
    );
  }

  // Nothing about existing records is ever returned, and no SMS is sent.
  return NextResponse.json({ ok: true, consentedAt });
}

/** A consent log is never publicly readable. Nothing is served here. */
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
