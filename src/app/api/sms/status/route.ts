import { NextRequest, NextResponse } from 'next/server';

/**
 * Twilio delivery status webhook.
 * Called by Twilio when message status changes (queued, sent, delivered, failed, etc.)
 * For now, just acknowledge. Can be extended to update campaign_sends status.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const messageSid = formData.get('MessageSid');
  const messageStatus = formData.get('MessageStatus');

  console.log('[SMS Status]', { messageSid, messageStatus });

  // TODO: Update campaign_sends table with delivery status when SMS campaigns
  // are tracked alongside email campaigns.

  return new NextResponse('', { status: 200 });
}
