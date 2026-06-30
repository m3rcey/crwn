import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { TIER_LIMITS } from '@/lib/platformTier';

// CRWN's platform fee % for the artist's tier (Free 12 / Pro 8 / $99-tier 5).
function crwnFeePercent(tier: string | null): number {
  const key = tier && tier !== 'starter' ? tier : 'starter';
  return TIER_LIMITS[key]?.platformFeePercent ?? TIER_LIMITS.starter.platformFeePercent;
}

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

  // All payouts (for accurate window totals + per-artist attribution); display uses the recent 20.
  const { data: allPayouts } = await supabaseAdmin
    .from('recruiter_payouts')
    .select('*')
    .eq('recruiter_id', recruiter.id)
    .order('created_at', { ascending: false });

  const payoutsAll = allPayouts || [];
  const payouts = payoutsAll.slice(0, 20);

  const qualified = (referrals || []).filter(r => r.status === 'qualified').length;
  const pending = (referrals || []).filter(r => r.status === 'pending').length;
  const paid = payoutsAll.filter(p => p.status === 'paid');
  const totalEarned = paid.reduce((sum, p) => sum + p.amount, 0);
  const pendingEarnings = payoutsAll.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0);

  // ---- Time-windowed payout totals (paid only) ----
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const sumPaidSince = (since: Date) =>
    paid.filter(p => new Date(p.created_at) >= since).reduce((s, p) => s + p.amount, 0);
  const paidLast24h = sumPaidSince(dayAgo);
  const paidThisMonth = sumPaidSince(monthStart);
  const paidThisYear = sumPaidSince(yearStart);
  const flatTotal = paid.filter(p => p.type === 'flat_fee').reduce((s, p) => s + p.amount, 0);
  const recurringTotal = paid.filter(p => p.type === 'recurring').reduce((s, p) => s + p.amount, 0);

  // Earned (paid) per referral, all-time and this-month
  const earnedByReferral = new Map<string, number>();
  const earnedByReferralMonth = new Map<string, number>();
  for (const p of paid) {
    earnedByReferral.set(p.artist_referral_id, (earnedByReferral.get(p.artist_referral_id) || 0) + p.amount);
    if (new Date(p.created_at) >= monthStart) {
      earnedByReferralMonth.set(p.artist_referral_id, (earnedByReferralMonth.get(p.artist_referral_id) || 0) + p.amount);
    }
  }

  // Funnel stats: clicks, signups, and activation milestones for this recruiter's referrals
  const { data: clicks } = await supabaseAdmin
    .from('referral_clicks')
    .select('id')
    .eq('referral_code', recruiter.referral_code);

  const totalClicks = clicks?.length || 0;
  const totalSignups = (referrals || []).length;

  // Get activation milestones + tier for referred artists
  const artistIds = (referrals || []).map(r => r.artist_id).filter(Boolean);
  const artistUserIds = (referrals || []).map(r => r.artist_user_id).filter(Boolean);
  let funnelCounts = { onboarded: 0, first_track: 0, tiers_created: 0, stripe_connected: 0, paid_tier: 0, first_subscriber: 0 };
  const tierById = new Map<string, string | null>();
  const gmvById = new Map<string, number>();     // artist GMV this month (cents)
  const nameByUserId = new Map<string, string>();

  if (artistIds.length > 0) {
    const { data: artistProfiles } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, activation_milestones, platform_tier')
      .in('id', artistIds);

    for (const ap of artistProfiles || []) {
      tierById.set(ap.id, ap.platform_tier ?? null);
      const m = (ap.activation_milestones || {}) as Record<string, string>;
      if (m.onboarding_completed) funnelCounts.onboarded++;
      if (m.first_track_uploaded) funnelCounts.first_track++;
      if (m.tiers_created) funnelCounts.tiers_created++;
      if (m.stripe_connected) funnelCounts.stripe_connected++;
      if (ap.platform_tier && ap.platform_tier !== 'starter') funnelCounts.paid_tier++;
      if (m.first_subscriber) funnelCounts.first_subscriber++;
    }

    // Artist GMV (gross fan revenue on CRWN) for the current month, per artist
    const { data: monthEarnings } = await supabaseAdmin
      .from('earnings')
      .select('artist_id, gross_amount')
      .in('artist_id', artistIds)
      .gte('created_at', monthStart.toISOString());
    for (const e of monthEarnings || []) {
      gmvById.set(e.artist_id, (gmvById.get(e.artist_id) || 0) + (e.gross_amount || 0));
    }
  }

  if (artistUserIds.length > 0) {
    const { data: artistNames } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .in('id', artistUserIds);
    for (const p of artistNames || []) nameByUserId.set(p.id, p.display_name || 'Artist');
  }

  // Per-referred-artist financial breakdown (the influencer may have many artists)
  const perArtist = (referrals || []).map(r => {
    const tier = tierById.get(r.artist_id) ?? null;
    return {
      referralId: r.id,
      artistName: nameByUserId.get(r.artist_user_id) || 'Artist',
      status: r.status,
      tier: tier || 'starter',
      crwnFeePercent: crwnFeePercent(tier),       // % CRWN takes of this artist's sales
      gmvThisMonth: gmvById.get(r.artist_id) || 0, // what the artist made this month (cents)
      earnedTotal: earnedByReferral.get(r.id) || 0,       // what the influencer earned from them (all-time)
      earnedThisMonth: earnedByReferralMonth.get(r.id) || 0,
    };
  });

  return NextResponse.json({
    recruiter,
    referrals: referrals || [],
    payouts,
    perArtist,
    stats: {
      qualified,
      pending,
      totalEarned,
      pendingEarnings,
      paidLast24h,
      paidThisMonth,
      paidThisYear,
      flatTotal,
      recurringTotal,
    },
    funnel: {
      clicks: totalClicks,
      signups: totalSignups,
      ...funnelCounts,
    },
  });
}
