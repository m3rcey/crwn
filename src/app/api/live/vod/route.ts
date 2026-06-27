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
    .select('id, artist_id, vod_status, vod_key')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Verify caller owns the artist profile (RLS-respecting client).
  const { data: ownedArtist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', session.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!ownedArtist) {
    return NextResponse.json({ error: 'Not your session' }, { status: 403 });
  }

  if (session.vod_status !== 'ready' || !session.vod_key) {
    return NextResponse.json({ error: 'not_ready', vod_status: session.vod_status }, { status: 409 });
  }

  const url = await getSignedDownloadUrl(session.vod_key, 3600);
  return NextResponse.json({ url });
}
