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

  // Look up the send record to identify the fan
  const { data: send } = await supabaseAdmin
    .from('campaign_sends')
    .select('fan_id')
    .eq('id', sendId)
    .single();

  if (!send) {
    return new NextResponse(unsubscribeAllPage('Invalid link', false), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  const fanId = send.fan_id;

  // Gather all artist relationships for this fan
  const [{ data: subs }, { data: earnings }, { data: smsSubs }] = await Promise.all([
    supabaseAdmin.from('subscriptions').select('artist_id').eq('fan_id', fanId),
    supabaseAdmin.from('earnings').select('artist_id').eq('fan_id', fanId),
    supabaseAdmin.from('sms_subscribers').select('artist_id').eq('fan_id', fanId).eq('status', 'active'),
  ]);

  const artistIds = new Set<string>();
  (subs || []).forEach(s => artistIds.add(s.artist_id));
  (earnings || []).forEach(e => artistIds.add(e.artist_id));
  (smsSubs || []).forEach(s => artistIds.add(s.artist_id));

  if (artistIds.size === 0) {
    return new NextResponse(unsubscribeAllPage("You've been unsubscribed from all marketing.", true), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Opt out of email + SMS marketing for every artist
  const upserts = Array.from(artistIds).map(artist_id => ({
    fan_id: fanId,
    artist_id,
    email_marketing: false,
    sms_marketing: false,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('fan_communication_prefs')
    .upsert(upserts, { onConflict: 'fan_id,artist_id' });

  if (error) {
    return new NextResponse(unsubscribeAllPage('Something went wrong. Please try again.', false), {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Unsubscribe all active SMS subscriptions
  await supabaseAdmin
    .from('sms_subscribers')
    .update({ status: 'unsubscribed', opted_out_at: new Date().toISOString() })
    .eq('fan_id', fanId)
    .eq('status', 'active');

  return new NextResponse(unsubscribeAllPage("You've been unsubscribed from all marketing on CRWN.", true), {
    headers: { 'Content-Type': 'text/html' },
  });
}

function unsubscribeAllPage(message: string, success: boolean): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe All - CRWN</title>
</head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;max-width:400px;">
    <h1 style="color:#D4AF37;font-size:32px;margin:0 0 24px;">CRWN</h1>
    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <p style="color:${success ? '#FFFFFF' : '#ef4444'};font-size:16px;line-height:1.6;margin:0 0 16px;">
        ${message}
      </p>
      ${success ? '<p style="color:#A0A0A0;font-size:14px;margin:0;">You will still receive transactional emails (receipts, subscription confirmations). You can re-enable marketing from your profile settings.</p>' : ''}
    </div>
    <p style="color:#666;font-size:12px;margin:24px 0 0;">
      <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">Back to CRWN</a>
    </p>
  </div>
</body>
</html>`;
}
