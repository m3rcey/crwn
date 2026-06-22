import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { liveProvider } from '@/lib/livekit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const LIVEKIT_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';

// Server-side enforcement chokepoint: minting a token is the ONLY way to connect
// to a room, so all gating (tier + slot cap) lives here.
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

  // Load session (admin client bypasses RLS for the gate logic).
  const { data: session } = await supabaseAdmin
    .from('live_sessions')
    .select('id, artist_id, status, is_free, allowed_tier_ids, max_slots, room_name, is_active')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session || !session.is_active) {
    return NextResponse.json({ error: 'not_found', reason: 'Session not found' }, { status: 404 });
  }
  if (session.status !== 'live') {
    return NextResponse.json({ error: 'not_live', reason: 'Session is not live' }, { status: 409 });
  }

  // Display name for the room tile.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  const displayName = profile?.display_name || 'Guest';

  // --- Broadcaster branch: artist who owns this session's profile ---
  const { data: ownedArtist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', session.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (ownedArtist) {
    await supabaseAdmin
      .from('live_session_participants')
      .upsert(
        { session_id: session.id, user_id: user.id, role: 'broadcaster', left_at: null },
        { onConflict: 'session_id,user_id' }
      );
    const token = await liveProvider.mintToken({
      room: session.room_name,
      identity: user.id,
      name: displayName,
      role: 'broadcaster',
    });
    return NextResponse.json({ token, url: LIVEKIT_URL, role: 'broadcaster' });
  }

  // --- Viewer branch: tier gate ---
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
        { error: 'locked', reason: 'Your tier does not have access to this session' },
        { status: 403 }
      );
    }
  }

  // --- Slot cap (viewers only; broadcaster does not consume a slot) ---
  // Reconnect: if the user already holds an active row, reuse it (no double count).
  const { data: existing } = await supabaseAdmin
    .from('live_session_participants')
    .select('id')
    .eq('session_id', session.id)
    .eq('user_id', user.id)
    .is('left_at', null)
    .maybeSingle();

  if (!existing) {
    const { count } = await supabaseAdmin
      .from('live_session_participants')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('role', 'viewer')
      .is('left_at', null);

    if ((count ?? 0) >= session.max_slots) {
      return NextResponse.json(
        { error: 'full', reason: 'Session is at capacity' },
        { status: 409 }
      );
    }
  }

  await supabaseAdmin
    .from('live_session_participants')
    .upsert(
      { session_id: session.id, user_id: user.id, role: 'viewer', left_at: null },
      { onConflict: 'session_id,user_id' }
    );

  const token = await liveProvider.mintToken({
    room: session.room_name,
    identity: user.id,
    name: displayName,
    role: 'viewer',
  });

  return NextResponse.json({ token, url: LIVEKIT_URL, role: 'viewer' });
}
