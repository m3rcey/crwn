import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { WebhookReceiver, EgressStatus } from 'livekit-server-sdk';

// LiveKit posts egress lifecycle events here. We verify the signature with the
// same API key/secret used to start the egress, then flip the session's VOD
// state once the recording finishes uploading to R2.
//
// This route is unauthenticated by design (no user session) — authenticity is
// proven by the LiveKit-signed Authorization header. The middleware matcher
// excludes /api/, so no auth redirect interferes.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY || '',
  process.env.LIVEKIT_API_SECRET || ''
);

export async function POST(req: NextRequest) {
  // WebhookReceiver verifies the signature against the raw body — read as text.
  const body = await req.text();
  const authHeader = req.headers.get('Authorization') || '';

  let event;
  try {
    event = await receiver.receive(body, authHeader);
  } catch (e) {
    console.error('Egress webhook signature verification failed:', e);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  // We only care about terminal egress states.
  if (event.event !== 'egress_ended' && event.event !== 'egress_updated') {
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const info = event.egressInfo;
  if (!info?.egressId) {
    return NextResponse.json({ ok: true, ignored: 'no egress info' });
  }

  const isComplete = info.status === EgressStatus.EGRESS_COMPLETE;
  const isFailed =
    info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED;

  // Still in progress (e.g. EGRESS_ACTIVE update) — nothing to persist yet.
  if (!isComplete && !isFailed) {
    return NextResponse.json({ ok: true, status: info.status });
  }

  if (isFailed) {
    await supabaseAdmin
      .from('live_sessions')
      .update({ vod_status: 'failed', updated_at: new Date().toISOString() })
      .eq('vod_egress_id', info.egressId);
    return NextResponse.json({ ok: true, status: 'failed' });
  }

  // Complete: pull the resulting file. filename is the R2 object key we set.
  const file = info.fileResults?.[0];
  const key = file?.filename || null;
  const publicBase = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://crwn-media.r2.dev';
  const vodUrl = key ? `${publicBase}/${key}` : null;
  const sizeBytes = file?.size != null ? Number(file.size) : null;
  // startedAt/endedAt are unix nanoseconds (bigint); derive whole seconds.
  let durationSeconds: number | null = null;
  if (file?.startedAt != null && file?.endedAt != null) {
    const secs = Math.round((Number(file.endedAt) - Number(file.startedAt)) / 1e9);
    durationSeconds = secs > 0 ? secs : null;
  }

  const { error } = await supabaseAdmin
    .from('live_sessions')
    .update({
      vod_status: 'ready',
      vod_key: key,
      vod_url: vodUrl,
      vod_size_bytes: sizeBytes,
      vod_duration_seconds: durationSeconds,
      vod_ready_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('vod_egress_id', info.egressId);

  if (error) {
    console.error('Egress webhook DB update failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: 'ready' });
}
