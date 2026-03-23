import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // Get all artists with pipeline data
  const { data: artists } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, slug, platform_tier, platform_subscription_status, pipeline_stage, platform_lead_score, stripe_connect_id, created_at')
    .order('platform_lead_score', { ascending: false });

  if (!artists || artists.length === 0) {
    return NextResponse.json({ artists: [], stages: {}, totalArtists: 0 });
  }

  const userIds = artists.map(a => a.user_id);

  // Get display names + emails
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, avatar_url, last_active_at')
    .in('id', userIds);

  const profileMap: Record<string, { display_name: string; avatar_url: string | null; last_active_at: string | null }> = {};
  (profiles || []).forEach(p => {
    profileMap[p.id] = { display_name: p.display_name || 'Artist', avatar_url: p.avatar_url, last_active_at: p.last_active_at };
  });

  // Get emails
  const emailMap: Record<string, string> = {};
  const batchSize = 20;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(id =>
        supabaseAdmin.auth.admin.getUserById(id)
          .then(r => ({ id, email: r.data.user?.email || '' }))
          .catch(() => ({ id, email: '' }))
      )
    );
    results.forEach(r => { emailMap[r.id] = r.email; });
  }

  // Get revenue per artist
  const { data: earnings } = await supabaseAdmin
    .from('earnings')
    .select('artist_id, net_amount');

  const revenueMap: Record<string, number> = {};
  (earnings || []).forEach(e => {
    revenueMap[e.artist_id] = (revenueMap[e.artist_id] || 0) + (e.net_amount || 0);
  });

  // Get subscriber counts
  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('artist_id')
    .eq('status', 'active');

  const subMap: Record<string, number> = {};
  (subs || []).forEach(s => {
    subMap[s.artist_id] = (subMap[s.artist_id] || 0) + 1;
  });

  // Get track counts
  const { data: tracks } = await supabaseAdmin
    .from('tracks')
    .select('artist_id')
    .eq('is_active', true);

  const trackMap: Record<string, number> = {};
  (tracks || []).forEach(t => {
    trackMap[t.artist_id] = (trackMap[t.artist_id] || 0) + 1;
  });

  // Get notes count per artist
  const { data: notes } = await supabaseAdmin
    .from('artist_notes')
    .select('artist_id');

  const noteMap: Record<string, number> = {};
  (notes || []).forEach(n => {
    noteMap[n.artist_id] = (noteMap[n.artist_id] || 0) + 1;
  });

  // Get active enrollments count
  const { data: enrollments } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .select('artist_user_id')
    .eq('status', 'active');

  const enrollmentMap: Record<string, boolean> = {};
  (enrollments || []).forEach(e => {
    enrollmentMap[e.artist_user_id] = true;
  });

  // Build enriched artist list
  const enrichedArtists = artists.map(a => ({
    id: a.id,
    user_id: a.user_id,
    slug: a.slug,
    display_name: profileMap[a.user_id]?.display_name || 'Artist',
    avatar_url: profileMap[a.user_id]?.avatar_url || null,
    email: emailMap[a.user_id] || '',
    platform_tier: a.platform_tier || 'starter',
    pipeline_stage: a.pipeline_stage || 'onboarding',
    lead_score: a.platform_lead_score || 0,
    has_stripe: !!a.stripe_connect_id,
    revenue: revenueMap[a.id] || 0,
    subscribers: subMap[a.id] || 0,
    tracks: trackMap[a.id] || 0,
    notes_count: noteMap[a.id] || 0,
    in_sequence: !!enrollmentMap[a.user_id],
    last_active: profileMap[a.user_id]?.last_active_at || null,
    joined: a.created_at,
  }));

  // Stage counts
  const stages: Record<string, number> = {
    signed_up: 0, onboarding: 0, free: 0, paid: 0, at_risk: 0, churned: 0,
  };
  enrichedArtists.forEach(a => {
    stages[a.pipeline_stage] = (stages[a.pipeline_stage] || 0) + 1;
  });

  return NextResponse.json({
    artists: enrichedArtists,
    stages,
    totalArtists: artists.length,
  });
}
