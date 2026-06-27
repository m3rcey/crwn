import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSignedUploadUrl, generateFileKey } from '@/lib/r2/client';

// Mints a signed PUT URL so the artist's browser uploads a prerecorded video
// straight to R2 (bytes never pass through our server). Owner-only. The client
// then creates the live_sessions row with source_type='prerecorded' and the
// returned key/publicUrl. The uploaded file IS the VOD.

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
  if (!String(contentType).startsWith('video/')) {
    return NextResponse.json({ error: 'Only video uploads are allowed' }, { status: 400 });
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

  const key = generateFileKey(artist.slug || artistId, 'vod', filename);
  const uploadUrl = await getSignedUploadUrl(key, contentType, 600);
  const publicUrl = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL || 'https://crwn-media.r2.dev'}/${key}`;

  return NextResponse.json({ uploadUrl, key, publicUrl });
}
