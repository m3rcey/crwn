import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { liveProvider } from '@/lib/livekit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Artist-only lifecycle actions with server-side side effects.
// 'start' -> status=live (+started_at). 'end' -> status=ended (+ended_at) + tear down the LiveKit room.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId, action } = await req.json().catch(() => ({ sessionId: null, action: null }));
  if (!sessionId || (action !== 'start' && action !== 'end')) {
    return NextResponse.json({ error: 'Missing sessionId or invalid action' }, { status: 400 });
  }

  // Load session + verify caller owns the artist profile.
  const { data: session } = await supabaseAdmin
    .from('live_sessions')
    .select('id, artist_id, room_name, status')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: ownedArtist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', session.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!ownedArtist) {
    return NextResponse.json({ error: 'Not your session' }, { status: 403 });
  }

  if (action === 'start') {
    const { error } = await supabaseAdmin
      .from('live_sessions')
      .update({ status: 'live', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: 'live' });
  }

  // action === 'end'
  const { error } = await supabaseAdmin
    .from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Free all active slots + tear down the room.
  await supabaseAdmin
    .from('live_session_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .is('left_at', null);

  await liveProvider.endRoom(session.room_name);

  return NextResponse.json({ ok: true, status: 'ended' });
}
