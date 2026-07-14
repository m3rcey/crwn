import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifySvixSignature } from '@/lib/webhookSignatures';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    bounce?: {
      type: string;
      message: string;
    };
  };
}

/**
 * Resend delivery events (bounce, complaint, delivered).
 *
 * SIGNED, and fails closed. Unauthenticated, this route let anyone add ANY email address
 * to `outreach_suppression` by POSTing a fake `email.complained`, which permanently stops
 * CRWN from mailing that artist. A stranger could have quietly switched off outreach, one
 * address at a time, and the only symptom would have been silence.
 */
export async function POST(req: NextRequest) {
  try {
    // The digest is over the RAW body. Re-serialising the parsed object reorders keys and
    // the signature stops matching, so the text is read first and parsed after.
    const rawBody = await req.text();

    const signed = verifySvixSignature(
      rawBody,
      {
        id: req.headers.get('svix-id'),
        timestamp: req.headers.get('svix-timestamp'),
        signature: req.headers.get('svix-signature'),
      },
      process.env.RESEND_OUTREACH_SECRET
    );

    if (!signed) {
      // Rejecting is deliberate even when the secret is simply missing. Resend retries a
      // failed webhook for hours, so a gap here delays events; accepting unsigned POSTs
      // would instead mean anyone on the internet can suppress an artist's email forever.
      console.error('Outreach webhook: bad, missing, or unconfigured Resend signature. Rejected.');
      return NextResponse.json({ status: 'error', reason: 'invalid_signature' }, { status: 403 });
    }

    const payload: ResendWebhookPayload = JSON.parse(rawBody);
    const { type, data } = payload;

    const recipientEmail = data.to?.[0]?.toLowerCase();
    if (!recipientEmail) {
      return NextResponse.json({ status: 'ignored', reason: 'no recipient' }, { status: 200 });
    }

    if (type === 'email.bounced') {
      const bounceType = data.bounce?.type === 'hard' ? 'hard_bounce' : 'soft_bounce';
      const bounceReason = data.bounce?.message || 'unknown';

      if (data.email_id) {
        await supabase
          .from('outreach_send_log')
          .update({ bounce_status: bounceType, bounce_reason: bounceReason })
          .eq('resend_message_id', data.email_id);
      }

      if (bounceType === 'hard_bounce') {
        await supabase
          .from('outreach_suppression')
          .upsert({
            email: recipientEmail,
            reason: 'bounce',
            suppressed_at: new Date().toISOString(),
          }, { onConflict: 'email' });

        await supabase
          .from('outreach_leads')
          .update({ status: 'bounced', last_activity_at: new Date().toISOString() })
          .eq('public_email', recipientEmail);
      }

      console.log(`Bounce (${bounceType}) for ${recipientEmail}: ${bounceReason}`);
    }

    if (type === 'email.complained') {
      await supabase
        .from('outreach_suppression')
        .upsert({
          email: recipientEmail,
          reason: 'complaint',
          suppressed_at: new Date().toISOString(),
        }, { onConflict: 'email' });

      await supabase
        .from('outreach_leads')
        .update({ status: 'suppressed', last_activity_at: new Date().toISOString() })
        .eq('public_email', recipientEmail);

      console.log(`Spam complaint from ${recipientEmail}. Added to suppression.`);
    }

    if (type === 'email.delivered') {
      console.log(`Delivered to ${recipientEmail}`);
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });

  } catch (err) {
    console.error('Outreach webhook error:', err);
    return NextResponse.json({ status: 'error', reason: 'internal error' }, { status: 500 });
  }
}