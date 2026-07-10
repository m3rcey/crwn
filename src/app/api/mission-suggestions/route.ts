import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { createNotification } from '@/lib/notifications';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ALLOWED_TYPES = new Set([
  'share', 'clip', 'referral', 'subscribe', 'rsvp', 'vote', 'live', 'city', 'comment', 'presave', 'custom',
]);

const ALLOWED_TARGET_KINDS = new Set([
  'none', 'offer', 'tier', 'product', 'track', 'album', 'live', 'campaign', 'demand_test', 'smart_link',
]);

/**
 * Fans propose a mission to an artist. Money-FREE and SUGGESTION-only: nothing
 * here publishes a mission — the row lands as status 'pending' and the artist
 * approves/rejects it from their queue. Fans can never set a reward type or a
 * commission; suggested_reward is free text and explicitly non-binding.
 * Writes go through the service-role client only (no client INSERT policy) so
 * rate-limit + dedupe + the self-suggest check stay authoritative.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 5 suggestions per day per user (window is in seconds).
  const allowed = await checkRateLimit(user.id, 'mission-suggest', 86400, 5);
  if (!allowed) {
    return NextResponse.json({ error: 'You’ve hit today’s limit. Try again tomorrow.' }, { status: 429 });
  }

  let body: {
    artistId?: string;
    type?: string;
    targetKind?: string;
    targetId?: string | null;
    targetLabel?: string | null;
    goalCount?: number;
    title?: string;
    note?: string | null;
    suggestedReward?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { artistId, type, targetId } = body;
  const targetKind = body.targetKind || 'none';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const suggestedReward = typeof body.suggestedReward === 'string' ? body.suggestedReward.trim() : '';

  if (!artistId || typeof artistId !== 'string' || !type || !title) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (title.length > 80) {
    return NextResponse.json({ error: 'Title is too long (80 characters max).' }, { status: 400 });
  }
  if (note.length > 500) {
    return NextResponse.json({ error: 'Pitch is too long (500 characters max).' }, { status: 400 });
  }
  if (suggestedReward.length > 120) {
    return NextResponse.json({ error: 'Suggested reward is too long (120 characters max).' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(type)) {
    return NextResponse.json({ error: 'Invalid mission type' }, { status: 400 });
  }
  if (!ALLOWED_TARGET_KINDS.has(targetKind)) {
    return NextResponse.json({ error: 'Invalid target kind' }, { status: 400 });
  }
  const rawGoal = Number(body.goalCount);
  if (!Number.isFinite(rawGoal) || !Number.isInteger(rawGoal) || rawGoal < 1) {
    return NextResponse.json({ error: 'Goal must be a positive whole number.' }, { status: 400 });
  }
  const goalCount = Math.min(100000, Math.max(1, rawGoal));

  // Resolve the artist — and reject self-suggestions (an artist proposing to
  // their own page should just use the Mission Builder).
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id')
    .eq('id', artistId)
    .maybeSingle();

  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }
  if (artist.user_id === user.id) {
    return NextResponse.json({ error: 'This is your own page. Create the mission directly instead.' }, { status: 400 });
  }

  // DEDUPE: one pending suggestion per fan + artist + mission type. A repeat is
  // not an error for the fan — it's already in the artist's queue.
  const { data: existing } = await supabaseAdmin
    .from('mission_suggestions')
    .select('id')
    .eq('suggested_by', user.id)
    .eq('artist_id', artistId)
    .eq('type', type)
    .eq('status', 'pending')
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const { error: insertError } = await supabaseAdmin.from('mission_suggestions').insert({
    artist_id: artistId,
    suggested_by: user.id,
    type,
    target_kind: targetKind,
    target_id: targetKind === 'none' ? null : targetId || null,
    target_label: targetKind === 'none' ? null : (typeof body.targetLabel === 'string' ? body.targetLabel.slice(0, 120) : null),
    goal_count: goalCount,
    title,
    note: note || null,
    suggested_reward: suggestedReward || null,
    status: 'pending',
  });

  if (insertError) {
    console.error('Mission suggestion insert error:', insertError);
    return NextResponse.json({ error: 'Could not save your suggestion' }, { status: 500 });
  }

  // Notify the artist — best-effort; the suggestion is saved either way.
  try {
    const { data: suggester } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    const suggesterName = suggester?.display_name || 'A fan';
    await createNotification(
      supabaseAdmin,
      artist.user_id,
      'mission_suggestion',
      'New mission suggestion',
      `${suggesterName} suggested: ${title}`,
      '/missions/suggestions'
    );
  } catch (e) {
    console.error('Mission suggestion notify error:', e);
  }

  return NextResponse.json({ ok: true });
}
