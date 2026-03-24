import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface ResendInboundPayload {
  type: string;
  created_at: string;
  data: {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html: string;
    headers: Array<{ name: string; value: string }>;
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload: ResendInboundPayload = await req.json();

    if (payload.type !== 'email.received') {
      return NextResponse.json({ status: 'ignored', reason: 'not email.received' }, { status: 200 });
    }

    const { from, subject, text, headers } = payload.data;

    const senderEmail = extractEmail(from);
    if (!senderEmail) {
      console.error('Could not extract sender email from:', from);
      return NextResponse.json({ status: 'error', reason: 'no sender email' }, { status: 400 });
    }

    const inReplyTo = headers?.find(h => h.name.toLowerCase() === 'in-reply-to')?.value;

    const { data: lead } = await supabase
      .from('outreach_leads')
      .select('id, instagram_handle, display_name, qualification_score')
      .eq('public_email', senderEmail.toLowerCase())
      .maybeSingle();

    let emailId = null;
    if (inReplyTo) {
      const { data: originalEmail } = await supabase
        .from('outreach_emails')
        .select('id')
        .eq('resend_message_id', inReplyTo.replace(/[<>]/g, ''))
        .maybeSingle();
      emailId = originalEmail?.id || null;
    }

    const { data: reply, error } = await supabase
      .from('outreach_replies')
      .insert({
        lead_id: lead?.id || null,
        email_id: emailId,
        sender_email: senderEmail.toLowerCase(),
        subject: subject || '',
        body_text: text || '',
        channel: 'email',
        status: 'new',
        received_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to insert reply:', error);
      return NextResponse.json({ status: 'error', reason: error.message }, { status: 500 });
    }

    if (lead?.id) {
      await supabase
        .from('outreach_leads')
        .update({
          status: 'replied',
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
        .in('status', ['contacted', 'no_response']);
    }

    console.log(`Inbound reply from ${senderEmail}, lead: ${lead?.instagram_handle || 'unknown'}, reply_id: ${reply.id}`);

    return NextResponse.json({ status: 'ok', reply_id: reply.id, lead_matched: !!lead }, { status: 200 });

  } catch (err) {
    console.error('Inbound webhook error:', err);
    return NextResponse.json({ status: 'error', reason: 'internal error' }, { status: 500 });
  }
}

function extractEmail(from: string): string | null {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(from.trim())) return from.trim();
  return null;
}
