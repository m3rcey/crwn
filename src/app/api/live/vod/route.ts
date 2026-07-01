import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedDownloadUrl } from '@/lib/r2/client';

// Mints a short-lived signed download URL for a session's recorded VOD.
// Owner-only: the artist who owns the session can retrieve the file. This is the
// canonical retrieval path (works even if the R2 bucket is private) and the rail
// the Phase 1 "VOD handoff" will reuse to grant a clipper file access.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const { data: session } = await supabaseAdmin
    .from('live_sessions')
    .select('id, artist_id, title, vod_status, vod_key, visibility, is_free, allowed_tier_ids')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Authorize the caller. Allowed in any of these cases:
  //   1. the artist who owns the session,
  //   2. a clipper who has driven a clipper-attributed subscription for this
  //      artist (the VOD handoff — a clipper downloads raw footage to chop;
  //      works even for private footage),
  //   3. on a PUBLIC session, any fan with access (free, or a tier in
  //      allowed_tier_ids) — they can download the recording too.
  const { data: ownedArtist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', session.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  let authorized = !!ownedArtist;

  if (!authorized) {
    const { data: clipperRow } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('artist_id', session.artist_id)
      .eq('referrer_fan_id', user.id)
      .eq('source', 'clipper')
      .limit(1)
      .maybeSingle();
    if (clipperRow) authorized = true;
  }

  // Public-session fans: free, or holding a tier in allowed_tier_ids.
  if (!authorized && session.visibility !== 'private') {
    if (session.is_free) {
      authorized = true;
    } else {
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('tier_id')
        .eq('fan_id', user.id)
        .eq('artist_id', session.artist_id)
        .eq('status', 'active')
        .maybeSingle();
      const allowed: string[] = Array.isArray(session.allowed_tier_ids) ? session.allowed_tier_ids : [];
      if (sub?.tier_id && allowed.includes(sub.tier_id)) authorized = true;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Not your session' }, { status: 403 });
  }

  if (session.vod_status !== 'ready' || !session.vod_key) {
    return NextResponse.json({ error: 'not_ready', vod_status: session.vod_status }, { status: 409 });
  }

  // ?download=1 forces a file download; without it the URL plays inline (used by
  // the in-card player). Derive a friendly filename from the session title.
  const wantsDownload = req.nextUrl.searchParams.get('download') === '1';
  const filename = wantsDownload
    ? `${String(session.title || 'recording').replace(/[^a-zA-Z0-9 ._-]/g, '_').trim() || 'recording'}.mp4`
    : undefined;

  const url = await getSignedDownloadUrl(session.vod_key, 3600, filename);
  return NextResponse.json({ url });
}
