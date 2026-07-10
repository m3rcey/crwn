import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/**
 * Verify Twilio's X-Twilio-Signature.
 *
 * Twilio signs the full request URL with every POST parameter appended in
 * key-sorted order, HMAC-SHA1 with the account auth token, base64 encoded.
 * Without this, anyone who guesses a MessageSid can mark a campaign send
 * delivered or failed. The `twilio` package is not a dependency here, so this
 * implements the documented scheme directly.
 */
function isValidTwilioSignature(req: NextRequest, params: Record<string, string>): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = req.headers.get('x-twilio-signature');
  if (!authToken || !signature) return false;

  // Twilio signs the PUBLIC url it called, which is behind Vercel's proxy.
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const url = `${proto}://${host}${new URL(req.url).pathname}`;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(payload, 'utf-8')).digest('base64');

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Twilio delivery status webhook.
 * Called by Twilio when message status changes (queued, sent, delivered, failed, etc.)
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') params[key] = value;
  });

  if (!isValidTwilioSignature(req, params)) {
    return new NextResponse('', { status: 403 });
  }

  const messageSid = params.MessageSid || null;
  const messageStatus = params.MessageStatus || null;

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
