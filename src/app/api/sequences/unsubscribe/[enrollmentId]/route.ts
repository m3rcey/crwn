import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ enrollmentId: string }> }
) {
  const { enrollmentId } = await params;

  const { data: enrollment } = await supabaseAdmin
    .from('sequence_enrollments')
    .select('fan_id, artist_id')
    .eq('id', enrollmentId)
    .single();

  if (!enrollment) {
    return new NextResponse(page('Invalid link', false), { headers: { 'Content-Type': 'text/html' } });
  }

  // Cancel the enrollment
  await supabaseAdmin
    .from('sequence_enrollments')
    .update({ status: 'canceled' })
    .eq('id', enrollmentId);

  // Also update fan_communication_prefs
  await supabaseAdmin
    .from('fan_communication_prefs')
    .upsert(
      {
        fan_id: enrollment.fan_id,
        artist_id: enrollment.artist_id,
        email_marketing: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fan_id,artist_id' }
    );

  // Log unsubscribe event for attribution — find which sequence triggered it
  const { data: enrollmentFull } = await supabaseAdmin
    .from('sequence_enrollments')
    .select('sequence_id')
    .eq('id', enrollmentId)
    .single();

  await supabaseAdmin
    .from('unsubscribe_events')
    .insert({
      fan_id: enrollment.fan_id,
      artist_id: enrollment.artist_id,
      source_type: 'sequence',
      source_id: enrollmentFull?.sequence_id || null,
      campaign_send_id: null,
      scope: 'artist',
    });

  return new NextResponse(page("You've been unsubscribed from marketing emails.", true), {
    headers: { 'Content-Type': 'text/html' },
  });
}

function page(message: string, success: boolean): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Unsubscribe - CRWN</title></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;max-width:400px;">
    <h1 style="color:#D4AF37;font-size:32px;margin:0 0 24px;">CRWN</h1>
    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <p style="color:${success ? '#FFFFFF' : '#ef4444'};font-size:16px;line-height:1.6;margin:0 0 16px;">${message}</p>
      ${success ? '<p style="color:#A0A0A0;font-size:14px;margin:0;">You will still receive transactional emails (receipts, subscription confirmations).</p>' : ''}
    </div>
    <p style="color:#666;font-size:12px;margin:24px 0 0;"><a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">Back to CRWN</a></p>
  </div>
</body>
</html>`;
}
