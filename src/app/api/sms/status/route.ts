import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/**
 * Twilio delivery status webhook.
 * Called by Twilio when message status changes (queued, sent, delivered, failed, etc.)
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const messageSid = formData.get('MessageSid') as string | null;
  const messageStatus = formData.get('MessageStatus') as string | null;

  if (!messageSid || !messageStatus) {
    return new NextResponse('', { status: 200 });
  }

  // Map Twilio statuses to campaign_sends statuses
  let mappedStatus: string | null = null;
  if (messageStatus === 'delivered') {
    mappedStatus = 'delivered';
  } else if (messageStatus === 'failed' || messageStatus === 'undelivered') {
    mappedStatus = 'failed';
  }

  // Only update for terminal statuses we care about
  if (mappedStatus) {
    await supabaseAdmin
      .from('campaign_sends')
      .update({ status: mappedStatus })
      .eq('twilio_message_sid', messageSid);
  }

  return new NextResponse('', { status: 200 });
}
