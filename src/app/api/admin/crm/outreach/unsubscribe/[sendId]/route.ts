import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sendId: string }> }
) {
  const { sendId } = await params;

  // Look up the send to get the email
  const { data: send } = await supabaseAdmin
    .from('crm_outreach_sends')
    .select('email')
    .eq('id', sendId)
    .single();

  if (!send) {
    return new NextResponse(unsubscribePage('Invalid link.', false), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Record unsubscribe
  const { error } = await supabaseAdmin
    .from('crm_outreach_unsubscribes')
    .upsert(
      { email: send.email.toLowerCase(), unsubscribed_at: new Date().toISOString() },
      { onConflict: 'email' }
    );

  if (error) {
    return new NextResponse(unsubscribePage('Something went wrong. Please try again.', false), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  return new NextResponse(unsubscribePage("You've been unsubscribed. You won't receive any more emails from CRWN.", true), {
    headers: { 'Content-Type': 'text/html' },
  });
}

function unsubscribePage(message: string, success: boolean): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - CRWN</title>
</head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;max-width:400px;">
    <h1 style="color:#D4AF37;font-size:32px;margin:0 0 24px;">CRWN</h1>
    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <p style="color:${success ? '#FFFFFF' : '#ef4444'};font-size:16px;line-height:1.6;margin:0;">
        ${message}
      </p>
    </div>
    <p style="color:#666;font-size:12px;margin:24px 0 0;">
      <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">Back to CRWN</a>
    </p>
  </div>
</body>
</html>`;
}
