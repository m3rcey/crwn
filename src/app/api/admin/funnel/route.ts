import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
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

  const source = req.nextUrl.searchParams.get('source') || 'all';
  const period = req.nextUrl.searchParams.get('period') || '90';

  // Calculate date filter
  let dateFilter: string | null = null;
  if (period !== 'all') {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(period));
    dateFilter = d.toISOString();
  }

  // Fetch all artists with funnel-relevant data
  let artistQuery = supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, created_at, acquisition_source, activation_milestones, platform_tier, pipeline_stage, recruited_by');

  if (dateFilter) {
    artistQuery = artistQuery.gte('created_at', dateFilter);
  }

  const { data: artists } = await artistQuery;
  const allArtists = artists || [];

  // Filter by source
  const filtered = source === 'all'
    ? allArtists
    : allArtists.filter(a => a.acquisition_source === source);

  // Fetch referral clicks
  let clickQuery = supabaseAdmin.from('referral_clicks').select('referral_code, clicked_at, converted, source_type');
  if (dateFilter) {
    clickQuery = clickQuery.gte('clicked_at', dateFilter);
  }
  const { data: clicks } = await clickQuery;
  const allClicks = clicks || [];

  // Filter clicks by source type if needed
  const filteredClicks = source === 'all'
    ? allClicks
    : source === 'partner'
      ? allClicks.filter(c => c.source_type === 'partner')
      : source === 'recruiter'
        ? allClicks.filter(c => c.source_type === 'recruiter')
        : []; // organic/founding have no clicks

  // Compute funnel stages
  const milestones = (a: { activation_milestones?: Record<string, string> | null }) =>
    (a.activation_milestones || {}) as Record<string, string>;

  const funnel = {
    clicks: filteredClicks.length,
    signups: filtered.length,
    onboarded: filtered.filter(a => milestones(a).onboarding_completed).length,
    first_track: filtered.filter(a => milestones(a).first_track_uploaded).length,
    tiers_created: filtered.filter(a => milestones(a).tiers_created).length,
    stripe_connected: filtered.filter(a => milestones(a).stripe_connected).length,
    paid_tier: filtered.filter(a => a.platform_tier && a.platform_tier !== 'starter').length,
    first_subscriber: filtered.filter(a => milestones(a).first_subscriber).length,
  };

  // Compute time-to-milestone averages (in days)
  const timeToMilestone: Record<string, number | null> = {};
  const milestoneKeys = ['onboarding_completed', 'first_track_uploaded', 'tiers_created', 'stripe_connected', 'first_subscriber'];

  for (const key of milestoneKeys) {
    const deltas: number[] = [];
    for (const a of filtered) {
      const m = milestones(a);
      if (m[key]) {
        const created = new Date(a.created_at).getTime();
        const achieved = new Date(m[key]).getTime();
        const days = (achieved - created) / (1000 * 60 * 60 * 24);
        if (days >= 0) deltas.push(days);
      }
    }
    timeToMilestone[key] = deltas.length > 0
      ? Math.round((deltas.reduce((s, d) => s + d, 0) / deltas.length) * 10) / 10
      : null;
  }

  // Source breakdown (for the "all" view)
  const sourceBreakdown: Record<string, number> = {};
  for (const a of allArtists) {
    const src = a.acquisition_source || 'organic';
    sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
  }

  // Weekly trend data (signups + activated per week for last 12 weeks)
  const weeklyTrend: { week: string; signups: number; activated: number }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i * 7 + weekStart.getDay()));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekArtists = filtered.filter(a => {
      const c = new Date(a.created_at);
      return c >= weekStart && c < weekEnd;
    });

    // "Activated" = has at least 3 of 5 milestones
    const activated = weekArtists.filter(a => {
      const m = milestones(a);
      const count = milestoneKeys.filter(k => m[k]).length;
      return count >= 3;
    }).length;

    weeklyTrend.push({
      week: weekStart.toISOString().split('T')[0],
      signups: weekArtists.length,
      activated,
    });
  }

  return NextResponse.json({
    funnel,
    timeToMilestone,
    sourceBreakdown,
    weeklyTrend,
    totalArtists: allArtists.length,
    filteredArtists: filtered.length,
  });
}
