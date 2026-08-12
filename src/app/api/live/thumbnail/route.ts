import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignedDownloadUrl } from '@/lib/r2/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Serves a recording's cover image. VOD thumbnails live in the same PRIVATE R2
// bucket as the videos, so a constructed public URL doesn't resolve — we mint a
// short-lived signed URL and redirect to it. The image is a teaser (like YouTube
// showing a thumbnail for gated content), so no auth is required to view it.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const { data: session } = await supabaseAdmin
    .from('live_sessions')
    .select('vod_thumbnail_key, visibility, artist_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session?.vod_thumbnail_key) {
    // No cover, let the card fall back to its placeholder.
    return NextResponse.json({ error: 'no_thumbnail' }, { status: 404 });
  }

  // SEC-015: this route used to select only the thumbnail key, so it served the
  // cover art of a PRIVATE recording to anyone holding the session UUID. The
  // unauthenticated teaser is deliberate for a PUBLIC session (that is the point
  // of a cover image), but private means private: live/vod and live/watch both
  // treat it as owner-only, and this surface has to agree with them.
  if (session.visibility === 'private') {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const { data: owned } = await supabaseAdmin
      .from('artist_profiles')
      .select('id')
      .eq('id', session.artist_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!owned) {
      // 404 rather than 403: a private session should not confirm it exists.
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  const url = await getSignedDownloadUrl(session.vod_thumbnail_key, 3600);
  return NextResponse.redirect(url, 302);
}
