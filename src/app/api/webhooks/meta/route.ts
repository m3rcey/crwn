// The ONE Meta webhook door for artist Fan Automations (Instagram + Facebook Pages).
//
// GET  = Meta's subscription handshake: echo hub.challenge only when hub.verify_token
//        matches META_WEBHOOK_VERIFY_TOKEN. Fails closed when the env var is unset.
// POST = event delivery. Authority is the X-Hub-Signature-256 provider signature over the
//        RAW body (verifyMetaSignature, keyed by the IG/FB app secrets), same class as
//        Stripe's constructEvent. Fails closed: no configured secret, no header, or a wrong
//        digest is a 403. Events are deduped by UNIQUE(provider, comment_id) inside
//        processCommentEvent, so Meta's 36-hour redelivery can never send a second DM.
//
// This route serves ARTIST-owned connections only. It shares nothing with the founder
// ManyChat acquisition webhook (/api/integrations/manychat/webhook), which stays untouched.
//
// Response discipline: after signature verification this route answers 200 for everything,
// including events it chooses to skip. A non-200 makes Meta retry, and a retry of a
// permanent condition (no connection, no match, send refused) does not become more correct
// the second time; the receipt row is the durable record instead.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMetaSignature } from '@/lib/webhookSignatures';
import { metaAppSecrets, metaWebhookVerifyToken } from '@/lib/fanAutomations/config';
import { parseMetaWebhookEvents } from '@/lib/fanAutomations/webhookEvents';
import { processCommentEvent } from '@/lib/fanAutomations/processComment';

export const maxDuration = 30;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const MAX_BODY_BYTES = 128 * 1024;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const verifyToken = metaWebhookVerifyToken();
  if (
    verifyToken &&
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === verifyToken &&
    params.get('hub.challenge')
  ) {
    return new NextResponse(params.get('hub.challenge'), { status: 200 });
  }
  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const signature = req.headers.get('x-hub-signature-256');
    if (!verifyMetaSignature(rawBody, signature, metaAppSecrets())) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }

    let body: unknown = null;
    try { body = JSON.parse(rawBody); } catch { /* handled below */ }
    const events = parseMetaWebhookEvents(body);

    for (const event of events) {
      try {
        await processCommentEvent(supabaseAdmin, event);
      } catch (err) {
        // One bad event must not fail the whole delivery batch into a retry loop.
        console.error('[meta-webhook] event processing error:', err);
      }
    }

    return NextResponse.json({ received: true, events: events.length });
  } catch (err) {
    console.error('[meta-webhook] error:', err);
    // Signature already verified when we can reach here with a parse-adjacent failure;
    // a 200 stops a retry storm on a body we will never parse differently.
    return NextResponse.json({ received: true });
  }
}
