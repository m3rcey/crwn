import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { liveProvider } from '@/lib/livekit';
import { generateFileKey } from '@/lib/r2/client';
import { getEffectiveLimits } from '@/lib/platformTier';
import { LIVE_AGREEMENT_VERSION } from '@/lib/liveAgreement';

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
    .select('id, artist_id, room_name, status, vod_egress_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: ownedArtist } = await supabase
    .from('artist_profiles')
    .select('id, slug, platform_tier')
    .eq('id', session.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!ownedArtist) {
    return NextResponse.json({ error: 'Not your session' }, { status: 403 });
  }

  if (action === 'start') {
    // Live + VOD is a Pro-only capability. Free artists can't go live.
    // ('end' is always allowed so a downgraded artist can still close an open session.)
    // Effective limits: the plan, plus anything the founder has comped to this artist.
    // Additive only, so this can grant live to a Launch artist and can never take it from
    // a Pro one.
    //
    // Read with the SERVICE-ROLE client, never added to the ownedArtist select above.
    // That select uses the caller's own session, and plan_feature_overrides has no grant
    // to authenticated: naming it there would fail the WHOLE statement with 42501 and the
    // route would read it as "not your session". A missing column (pre-migration) reads as
    // no override, so the plan answer stands and nothing breaks before the founder runs it.
    const { data: comped } = await supabaseAdmin
      .from('artist_profiles')
      .select('plan_feature_overrides')
      .eq('id', ownedArtist.id)
      .maybeSingle();

    if (!getEffectiveLimits(ownedArtist.platform_tier, comped?.plan_feature_overrides).allowsLive) {
      return NextResponse.json(
        { error: 'Livestreaming is a Pro feature. Upgrade to go live.', reason: 'tier_locked' },
        { status: 403 }
      );
    }

    // Mandatory Live-Streaming Agreement gate (server-side enforcement).
    // Going live is blocked unless a PERSISTED acceptance of the CURRENT
    // agreement version exists for this user — a client that skips the
    // pre-stream UI is still rejected here. Bumping LIVE_AGREEMENT_VERSION
    // invalidates old acceptances and forces a re-prompt.
    const { data: acceptance } = await supabaseAdmin
      .from('live_agreement_acceptances')
      .select('id')
      .eq('fan_id', user.id)
      .eq('version', LIVE_AGREEMENT_VERSION)
      .maybeSingle();
    if (!acceptance) {
      return NextResponse.json(
        {
          error: 'You must accept the CRWN Live-Streaming Agreement before going live.',
          reason: 'agreement_required',
          version: LIVE_AGREEMENT_VERSION,
        },
        { status: 403 }
      );
    }

    // Best-effort recording: start egress to R2, but never block go-live if it fails.
    const vodFields: Record<string, unknown> = {};
    try {
      const key = generateFileKey(ownedArtist.slug || session.artist_id, 'vod', `${session.room_name}.mp4`);
      const rec = await liveProvider.startRecording({ room: session.room_name, key });
      if (rec) {
        vodFields.vod_egress_id = rec.egressId;
        vodFields.vod_status = 'recording';
      }
    } catch (e) {
      console.error('VOD egress start failed (continuing live):', e);
    }

    const { error } = await supabaseAdmin
      .from('live_sessions')
      .update({ status: 'live', started_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...vodFields })
      .eq('id', sessionId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: 'live' });
  }

  // action === 'end'
  // Stop the recording (if any). Egress finalizes the upload async, then the
  // egress webhook flips vod_status -> 'ready'. Mark 'processing' meanwhile.
  const vodFields: Record<string, unknown> = {};
  if (session.vod_egress_id) {
    await liveProvider.stopRecording(session.vod_egress_id);
    vodFields.vod_status = 'processing';
  }

  const { error } = await supabaseAdmin
    .from('live_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...vodFields })
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
