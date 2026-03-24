import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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

export async function POST(req: NextRequest) {
  try {
    const payload: ResendWebhookPayload = await req.json();
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