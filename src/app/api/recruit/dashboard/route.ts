import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const { data: recruiter } = await supabaseAdmin
    .from('recruiters')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!recruiter) {
    return NextResponse.json({ error: 'Not a recruiter' }, { status: 404 });
  }

  const { data: referrals } = await supabaseAdmin
    .from('artist_referrals')
    .select('*')
    .eq('recruiter_id', recruiter.id)
    .order('created_at', { ascending: false });

  const { data: payouts } = await supabaseAdmin
    .from('recruiter_payouts')
    .select('*')
    .eq('recruiter_id', recruiter.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const qualified = (referrals || []).filter(r => r.status === 'qualified').length;
  const pending = (referrals || []).filter(r => r.status === 'pending').length;
  const totalEarned = (payouts || []).filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
  const pendingEarnings = (payouts || []).filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

  // Funnel stats: clicks, signups, and activation milestones for this recruiter's referrals
  const { data: clicks } = await supabaseAdmin
    .from('referral_clicks')
    .select('id')
    .eq('referral_code', recruiter.referral_code);

  const totalClicks = clicks?.length || 0;
  const totalSignups = (referrals || []).length;

  // Get activation milestones for referred artists
  const artistIds = (referrals || []).map(r => r.artist_id).filter(Boolean);
  let funnelCounts = { onboarded: 0, first_track: 0, tiers_created: 0, stripe_connected: 0, paid_tier: 0, first_subscriber: 0 };

  if (artistIds.length > 0) {
    const { data: artistProfiles } = await supabaseAdmin
      .from('artist_profiles')
      .select('activation_milestones, platform_tier')
      .in('id', artistIds);

    for (const ap of artistProfiles || []) {
      const m = (ap.activation_milestones || {}) as Record<string, string>;
      if (m.onboarding_completed) funnelCounts.onboarded++;
      if (m.first_track_uploaded) funnelCounts.first_track++;
      if (m.tiers_created) funnelCounts.tiers_created++;
      if (m.stripe_connected) funnelCounts.stripe_connected++;
      if (ap.platform_tier && ap.platform_tier !== 'starter') funnelCounts.paid_tier++;
      if (m.first_subscriber) funnelCounts.first_subscriber++;
    }
  }

  return NextResponse.json({
    recruiter,
    referrals: referrals || [],
    payouts: payouts || [],
    stats: {
      qualified,
      pending,
      totalEarned,
      pendingEarnings,
    },
    funnel: {
      clicks: totalClicks,
      signups: totalSignups,
      ...funnelCounts,
    },
  });
}
