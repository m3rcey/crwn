import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ALLOWED_REWARD_TYPES = new Set(['points', 'badge', 'credits', 'access', 'commission', 'custom']);
const ALLOWED_AUDIENCES = new Set(['all', 'subscribers', 'free']);

/**
 * The artist reviews a fan mission suggestion: approve (converts it into a REAL
 * mission with an ARTIST-set reward) or reject (with an optional reason). The
 * fan never sets reward_type or commission — only this endpoint does, and only
 * the owning artist can call it. Every decision stamps status + reviewed_at +
 * review_note + converted_mission_id on the suggestion row (the audit trail).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: suggestion } = await supabaseAdmin
    .from('mission_suggestions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!suggestion) {
    return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
  }

  // OWNERSHIP: only the artist this was suggested to can review it.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id')
    .eq('id', suggestion.artist_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!artist) {
    return NextResponse.json({ error: 'Not your artist profile' }, { status: 403 });
  }

  if (suggestion.status !== 'pending') {
    return NextResponse.json({ error: 'This suggestion was already reviewed.' }, { status: 409 });
  }

  let body: {
    action?: string;
    reviewNote?: string;
    rewardType?: string;
    rewardDetail?: string;
    goalCount?: number;
    audience?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const reviewNote = typeof body.reviewNote === 'string' ? body.reviewNote.trim().slice(0, 500) : '';

  // Fan name for the artist-facing message; artist name for the fan-facing one.
  const { data: artistProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', artist.user_id)
    .maybeSingle();
  const artistName = artistProfile?.display_name || 'The artist';

  if (action === 'approve') {
    // The ARTIST sets the real reward here — the fan's suggested_reward was
    // aspirational free text and is never written to the mission.
    const rewardType = body.rewardType && ALLOWED_REWARD_TYPES.has(body.rewardType) ? body.rewardType : 'points';
    const rewardDetail = typeof body.rewardDetail === 'string' && body.rewardDetail.trim() !== ''
      ? body.rewardDetail.trim().slice(0, 200)
      : null;
    const audience = body.audience && ALLOWED_AUDIENCES.has(body.audience) ? body.audience : 'all';
    const rawGoal = Number(body.goalCount);
    const goalCount = Number.isFinite(rawGoal) && Number.isInteger(rawGoal) && rawGoal >= 1
      ? Math.min(100000, rawGoal)
      : suggestion.goal_count;

    const { data: mission, error: missionError } = await supabaseAdmin
      .from('missions')
      .insert({
        artist_id: suggestion.artist_id,
        type: suggestion.type,
        target_kind: suggestion.target_kind,
        target_id: suggestion.target_id,
        target_label: suggestion.target_label,
        goal_count: goalCount,
        reward_type: rewardType,
        reward_detail: rewardDetail,
        audience,
        title: suggestion.title,
        description: suggestion.note,
        cta: 'Join the mission',
        status: 'active',
      })
      .select('id')
      .single();

    if (missionError || !mission) {
      console.error('Suggestion approve — mission insert error:', missionError);
      return NextResponse.json({ error: 'Could not create the mission' }, { status: 500 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('mission_suggestions')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        converted_mission_id: mission.id,
        review_note: reviewNote || null,
      })
      .eq('id', suggestion.id);

    if (updateError) {
      console.error('Suggestion approve — status update error:', updateError);
      return NextResponse.json({ error: 'Mission created, but the suggestion could not be updated' }, { status: 500 });
    }

    // Notify the fan — best-effort.
    try {
      await createNotification(
        supabaseAdmin,
        suggestion.suggested_by,
        'mission_suggestion',
        'Your mission suggestion was approved 🎉',
        `${artistName} turned "${suggestion.title}" into a live mission`,
        '/home'
      );
    } catch (e) {
      console.error('Suggestion approve notify error:', e);
    }

    return NextResponse.json({ ok: true, missionId: mission.id });
  }

  // REJECT
  const { error: rejectError } = await supabaseAdmin
    .from('mission_suggestions')
    .update({
      status: 'rejected',
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote || null,
    })
    .eq('id', suggestion.id);

  if (rejectError) {
    console.error('Suggestion reject error:', rejectError);
    return NextResponse.json({ error: 'Could not update the suggestion' }, { status: 500 });
  }

  // Softer copy on a pass — best-effort.
  try {
    await createNotification(
      supabaseAdmin,
      suggestion.suggested_by,
      'mission_suggestion',
      'Update on your mission suggestion',
      `${artistName} passed on "${suggestion.title}" this time — keep the ideas coming`,
      '/home'
    );
  } catch (e) {
    console.error('Suggestion reject notify error:', e);
  }

  return NextResponse.json({ ok: true });
}
