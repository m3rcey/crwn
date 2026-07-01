import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedUploadUrl, generateFileKey } from '@/lib/r2/client';

// Mints a signed PUT URL so the artist's browser uploads a recording cover image
// straight to R2 (bytes never pass through our server). Owner-only. Mirrors
// /api/live/upload-url but for images. The client stores the returned
// key/publicUrl on the live_sessions row as vod_thumbnail_key/vod_thumbnail_url.

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { artistId, filename, contentType } = await req.json().catch(() => ({}));
  if (!artistId || !filename || !contentType) {
    return NextResponse.json({ error: 'Missing artistId, filename, or contentType' }, { status: 400 });
  }
  if (!String(contentType).startsWith('image/')) {
    return NextResponse.json({ error: 'Only image uploads are allowed' }, { status: 400 });
  }

  // Verify caller owns the artist profile (RLS-respecting client).
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!artist) {
    return NextResponse.json({ error: 'Not your artist profile' }, { status: 403 });
  }

  const key = generateFileKey(artist.slug || artistId, 'vod-thumbnail', filename);
  const uploadUrl = await getSignedUploadUrl(key, contentType, 600);
  const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://crwn-media.r2.dev'}/${key}`;

  return NextResponse.json({ uploadUrl, key, publicUrl });
}
