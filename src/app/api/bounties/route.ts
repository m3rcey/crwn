import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { notifyClippersOfNewBounty } from '@/lib/bountyNotify';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getUserAndArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, artistId: null };
  const { data: artist } = await supabase.from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { user, artistId: artist?.id ?? null };
}

// GET /api/bounties?scope=artist|fan
export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get('scope') || 'artist';
  const { user, artistId } = await getUserAndArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (scope === 'fan') {
    // Active bounties from artists the fan subscribes to + any they've submitted to
    const [{ data: subs }, { data: mySubs }] = await Promise.all([
      supabaseAdmin.from('subscriptions').select('artist_id').eq('fan_id', user.id).eq('status', 'active'),
      supabaseAdmin.from('clip_bounty_submissions').select('bounty_id, status').eq('clipper_id', user.id),
    ]);
    const artistIds = Array.from(new Set((subs || []).map((s: any) => s.artist_id)));
    const submittedBountyIds = new Set((mySubs || []).map((s: any) => s.bounty_id));

    let bounties: any[] = [];
    if (artistIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('clip_bounties').select('*').in('artist_id', artistIds).eq('status', 'active')
        .order('deadline', { ascending: true });
      bounties = data || [];
    }
    // Include artist display names
    const aIds = Array.from(new Set(bounties.map(b => b.artist_id)));
    const nameMap: Record<string, string> = {};
    if (aIds.length > 0) {
      const { data: aps } = await supabaseAdmin.from('artist_profiles').select('id, user_id').in('id', aIds);
      const userIds = (aps || []).map((a: any) => a.user_id);
      const { data: profs } = await supabaseAdmin.from('profiles').select('id, display_name').in('id', userIds);
      const pByUser: Record<string, string> = {};
      (profs || []).forEach((p: any) => { pByUser[p.id] = p.display_name || 'Artist'; });
      (aps || []).forEach((a: any) => { nameMap[a.id] = pByUser[a.user_id] || 'Artist'; });
    }
    return NextResponse.json({
      bounties: bounties.map(b => ({ ...b, artistName: nameMap[b.artist_id] || 'Artist', alreadySubmitted: submittedBountyIds.has(b.id) })),
    });
  }

  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  const { data: bounties } = await supabaseAdmin
    .from('clip_bounties').select('*').eq('artist_id', artistId).order('created_at', { ascending: false });

  // Submission counts
  const ids = (bounties || []).map(b => b.id);
  const counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: subs } = await supabaseAdmin.from('clip_bounty_submissions').select('bounty_id').in('bounty_id', ids);
    (subs || []).forEach((s: any) => { counts[s.bounty_id] = (counts[s.bounty_id] || 0) + 1; });
  }
  return NextResponse.json({ bounties: (bounties || []).map(b => ({ ...b, submissionCount: counts[b.id] || 0 })) });
}

// POST /api/bounties  (create) — non-cash rewards only
export async function POST(req: NextRequest) {
  const { user, artistId } = await getUserAndArtist();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const b = await req.json();
  if (!b.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const rewardType = ['points', 'badge', 'access', 'commission_boost', 'custom'].includes(b.rewardType) ? b.rewardType : 'badge';

  const { data, error } = await supabaseAdmin.from('clip_bounties').insert({
    artist_id: artistId,
    live_session_id: b.liveSessionId || null,
    title: b.title.trim(),
    description: b.description || null,
    bounty_type: b.bountyType || 'artist_pick',
    reward_type: rewardType,
    reward_detail: b.rewardDetail || null,
    reward_badge_key: rewardType === 'badge' ? (b.rewardBadgeKey || 'bounty_winner') : null,
    reward_metadata: b.rewardMetadata || {},
    deadline: b.deadline || null,
    status: b.status === 'draft' ? 'draft' : 'active',
    stacks_with_commission: b.stacksWithCommission !== false,
    approval_required: b.approvalRequired !== false,
    eligibility: ['all', 'clippers', 'subscribers'].includes(b.eligibility) ? b.eligibility : 'all',
    created_by: user.id,
  }).select('*').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Live bounty → ping proven clippers (skipped for drafts).
  if (data.status === 'active') {
    try {
      await notifyClippersOfNewBounty(supabaseAdmin, artistId, data.title);
    } catch (e) {
      console.error('new-bounty clipper notify failed:', e);
    }
  }

  return NextResponse.json({ bounty: data });
}
