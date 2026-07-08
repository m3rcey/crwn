import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * A fan joins (or leaves) an active mission. Money-FREE and HONEST: joining is
 * a commitment only — we never mark 'completed' here (no event source exists
 * for that yet). The fan id always comes from the session; writes go through
 * the service-role client only (no client INSERT policy) so dedupe stays
 * authoritative, and a fan can only ever write their own row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: missionId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await checkRateLimit(user.id, 'mission-join', 60, 20);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  let body: { action?: 'join' | 'leave' } = {};
  try {
    body = await req.json();
  } catch {
    // No/invalid body → default action 'join'.
  }
  const action = body.action === 'leave' ? 'leave' : 'join';

  // Load the mission with the admin client (source of truth, RLS-free).
  const { data: mission } = await supabaseAdmin
    .from('missions')
    .select('id, status, audience, artist_id')
    .eq('id', missionId)
    .maybeSingle();

  if (!mission || mission.status !== 'active') {
    return NextResponse.json({ error: 'Mission not found' }, { status: 404 });
  }

  // L6: enforce the mission's audience on join ('all' is open). Previously the
  // audience field was stored but never checked, so a 'subscribers'-only mission
  // was joinable by anyone. 'subscribers' => needs an active sub to this artist;
  // 'free' => for non-subscribers only.
  if (action === 'join' && mission.audience && mission.audience !== 'all') {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('fan_id', user.id)
      .eq('artist_id', mission.artist_id)
      .eq('status', 'active')
      .maybeSingle();
    const isSubscriber = !!sub;
    if (mission.audience === 'subscribers' && !isSubscriber) {
      return NextResponse.json({ error: 'This mission is for subscribers only.' }, { status: 403 });
    }
    if (mission.audience === 'free' && isSubscriber) {
      return NextResponse.json({ error: 'This mission is for non-subscribers.' }, { status: 403 });
    }
  }

  let joined: boolean;
  if (action === 'join') {
    const { error: insertError } = await supabaseAdmin
      .from('mission_participants')
      .insert({ mission_id: missionId, fan_id: user.id, status: 'joined' });

    // UNIQUE (mission_id, fan_id) — already joined; not an error for the fan.
    if (insertError && insertError.code !== '23505') {
      console.error('Mission join error:', insertError);
      return NextResponse.json({ error: 'Could not join the mission' }, { status: 500 });
    }
    joined = true;
  } else {
    const { error: deleteError } = await supabaseAdmin
      .from('mission_participants')
      .delete()
      .eq('mission_id', missionId)
      .eq('fan_id', user.id);

    if (deleteError) {
      console.error('Mission leave error:', deleteError);
      return NextResponse.json({ error: 'Could not leave the mission' }, { status: 500 });
    }
    joined = false;
  }

  // Recount participants accurately (count(*), not atomic increments — no races).
  const { count } = await supabaseAdmin
    .from('mission_participants')
    .select('id', { count: 'exact', head: true })
    .eq('mission_id', missionId);

  return NextResponse.json({ ok: true, joined, participantCount: count ?? 0 });
}
