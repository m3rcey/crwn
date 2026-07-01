import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSignedDownloadUrl } from '@/lib/r2/client';

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
    .select('vod_thumbnail_key')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session?.vod_thumbnail_key) {
    // No cover — let the card fall back to its placeholder.
    return NextResponse.json({ error: 'no_thumbnail' }, { status: 404 });
  }

  const url = await getSignedDownloadUrl(session.vod_thumbnail_key, 3600);
  return NextResponse.redirect(url, 302);
}
