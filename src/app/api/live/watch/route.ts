import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/r2/client';

// Gated playback for PRERECORDED sessions. Mirrors the access logic of the live
// token route, but returns a short-lived signed video URL instead of a LiveKit
// token. Live sessions must use /api/live/token (real-time room) — not this.
//
// Access: private -> owner only. public -> owner, free, or an allowed-tier sub.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = await req.json().catch(() => ({ sessionId: null }));
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const { data: session } = await supabaseAdmin
    .from('live_sessions')
    .select('id, artist_id, source_type, visibility, is_free, allowed_tier_ids, vod_status, vod_key, is_active')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || !session.is_active) {
    return NextResponse.json({ error: 'not_found', reason: 'Session not found' }, { status: 404 });
  }
  if (session.source_type !== 'prerecorded') {
    return NextResponse.json({ error: 'not_prerecorded', reason: 'Use the live join flow' }, { status: 400 });
  }
  if (session.vod_status !== 'ready' || !session.vod_key) {
    return NextResponse.json({ error: 'not_ready', reason: 'Video is not ready yet' }, { status: 409 });
  }

  // Owner always allowed.
  const { data: ownedArtist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', session.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();
  const isOwner = !!ownedArtist;

  if (!isOwner) {
    if (session.visibility === 'private') {
      return NextResponse.json({ error: 'locked', reason: 'This video is private' }, { status: 403 });
    }
    if (!session.is_free) {
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('tier_id')
        .eq('fan_id', user.id)
        .eq('artist_id', session.artist_id)
        .eq('status', 'active')
        .maybeSingle();
      const allowed: string[] = Array.isArray(session.allowed_tier_ids) ? session.allowed_tier_ids : [];
      const tierId = sub?.tier_id || null;
      if (!tierId || !allowed.includes(tierId)) {
        return NextResponse.json(
          { error: 'locked', reason: 'Your tier does not have access to this video' },
          { status: 403 }
        );
      }
    }
  }

  const url = await getSignedDownloadUrl(session.vod_key, 3600);
  return NextResponse.json({ url });
}
