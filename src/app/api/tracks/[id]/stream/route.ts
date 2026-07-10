import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { signAudioValue, SIGNED_URL_TTL_SECONDS } from '@/lib/storage/signedAudio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tracks/[id]/stream  ->  { url, expiresIn }
 *
 * Mints a short-lived signed URL for a track the CALLER is entitled to.
 *
 * The gate is the database, not this route. A REQUEST-SCOPED client (the
 * caller's cookies, anon key, RLS on) reads `tracks_public`, whose CASE
 * redaction runs `can_play_track(id, auth.uid())` and returns NULL for anyone
 * who is not the owner, a purchaser, or subscribed on an allowed tier. A NULL
 * url therefore IS the 403 -- this route never re-derives entitlement, because
 * a second, hand-written copy of that logic is exactly how the original leak
 * happened.
 *
 * Using the admin client to read the track here would bypass RLS and re-open
 * the hole, the same way /api/explore once did. The admin client appears only
 * inside signAudioValue(), after entitlement has been proven, to sign a path.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabaseAsCaller = await createServerSupabaseClient();

  const { data: track, error } = await supabaseAsCaller
    .from('tracks_public')
    .select('id, audio_url_128, is_active')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !track) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // NULL audio means the view refused this reader. That is the entitlement check.
  if (!track.audio_url_128) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = await signAudioValue(track.audio_url_128);
  if (!url) {
    return NextResponse.json({ error: 'unavailable' }, { status: 502 });
  }

  return NextResponse.json(
    { url, expiresIn: SIGNED_URL_TTL_SECONDS },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
