import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Stripe fee calculation (2.9% + 30¢)
function stripeFee(amountCents: number): number {
  return Math.round(amountCents * 0.029) + 30;
}

function getTrailingRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start, end };
}

function getDailyBuckets(days: number): { label: string; start: Date; end: Date }[] {
  const buckets: { label: string; start: Date; end: Date }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    buckets.push({ label, start: d, end });
  }
  return buckets;
}

export async function GET(req: NextRequest) {
  // Auth check — only admin role
  const authHeader = req.headers.get('authorization');
  const userId = req.nextUrl.searchParams.get('userId');
  const period = req.nextUrl.searchParams.get('period') || '30d';
  const forceRefresh = req.nextUrl.searchParams.get('refresh') === 'true';

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // Verify admin role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Check cache (1 hour TTL)
  if (!forceRefresh) {
    const { data: cached } = await supabaseAdmin
      .from('admin_metrics_cache')
      .select('metrics, computed_at')
      .eq('period', period)
      .single();

    if (cached) {
      const age = Date.now() - new Date(cached.computed_at).getTime();
      if (age < 60 * 60 * 1000) { // 1 hour
        return NextResponse.json(cached.metrics);
      }
    }
  }

  // Compute fresh metrics
  const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : 365;
  const { start } = getTrailingRange(days);
  const buckets = getDailyBuckets(days);

  // ---- FETCH ALL DATA ----
  const [
    { data: allEarnings },
    { data: allArtists },
    { data: allSubs },
    { data: allReferrals },
    { data: allRecruiters },
    { data: allPayouts },
    { data: allVisits },
    { data: settingsData },
    { data: allProfiles },
  ] = await Promise.all([
    supabaseAdmin.from('earnings').select('*').order('created_at', { ascending: true }),
    supabaseAdmin.from('artist_profiles').select('id, user_id, platform_tier, platform_subscription_status, platform_billing_interval, stripe_connect_id, created_at'),
    supabaseAdmin.from('subscriptions').select('id, fan_id, artist_id, tier_id, status, created_at, canceled_at, current_period_end'),
    supabaseAdmin.from('artist_referrals').select('id, recruiter_id, artist_id, artist_user_id, status, created_at, qualified_at, flat_fee_amount, flat_fee_paid, recurring_rate'),
    supabaseAdmin.from('recruiters').select('id, user_id, tier, total_artists_referred, total_earned, referral_code, is_partner, created_at'),
    supabaseAdmin.from('recruiter_payouts').select('id, recruiter_id, artist_referral_id, type, amount, status, created_at'),
    supabaseAdmin.from('site_visits').select('visit_date, visitor_hash, is_authenticated').gte('visit_date', start.toISOString().split('T')[0]),
    supabaseAdmin.from('admin_settings').select('key, value').eq('key', 'fixed_costs').single(),
    supabaseAdmin.from('profiles').select('id, role, last_active_at, created_at'),
  ]);

  const earnings = allEarnings || [];
  const artists = allArtists || [];
  const subs = allSubs || [];
  const referrals = allReferrals || [];
  const recruiters = allRecruiters || [];
  const payouts = allPayouts || [];
  const visits = allVisits || [];
  const profiles = allProfiles || [];

  // Fixed costs (in cents per month)
  const fixedCosts = settingsData?.value || {};
  const totalFixedCostsCents = Object.values(fixedCosts).reduce((s: number, v) => s + (Number(v) || 0), 0);

  // ---- PLATFORM REVENUE (Artist SaaS Tiers) ----
  const TIER_PRICES: Record<string, number> = { pro: 5000, label: 15000, empire: 35000 };
  const ANNUAL_PRICES: Record<string, number> = { pro: 3700, label: 11200, empire: 26200 }; // monthly equivalent

  const paidArtists = artists.filter(a => a.platform_subscription_status === 'active' && a.platform_tier && a.platform_tier !== 'starter');
  const starterArtists = artists.filter(a => !a.platform_tier || a.platform_tier === 'starter');

  const platformMRR = paidArtists.reduce((sum, a) => {
    const isAnnual = a.platform_billing_interval === 'annual' || a.platform_billing_interval === 'year';
    const price = isAnnual ? (ANNUAL_PRICES[a.platform_tier] || 0) : (TIER_PRICES[a.platform_tier] || 0);
    return sum + price;
  }, 0);

  // ---- TRANSACTION FEE REVENUE ----
  const periodEarnings = earnings.filter(e => new Date(e.created_at) >= start);
  const totalPlatformFees = periodEarnings.reduce((s, e) => s + (e.platform_fee || 0), 0);
  const totalGrossRevenue = periodEarnings.reduce((s, e) => s + (e.gross_amount || 0), 0);

  // ---- MRR / ARR ----
  const transactionFeeMRR = days >= 30
    ? Math.round(totalPlatformFees / (days / 30))
    : totalPlatformFees;
  const totalMRR = platformMRR + transactionFeeMRR;
  const totalARR = totalMRR * 12;

  // ---- GROSS MARGIN ----
  // Revenue: platform tier fees + transaction fees
  // Costs: Stripe fees on each transaction + fixed costs + recruiter payouts
  const periodPayouts = payouts.filter(p => new Date(p.created_at) >= start && p.status === 'paid');
  const totalRecruiterCost = periodPayouts.reduce((s, p) => s + p.amount, 0);
  const totalStripeFees = periodEarnings.reduce((s, e) => s + stripeFee(e.gross_amount || 0), 0);
  const platformStripeFeesMonthly = paidArtists.reduce((s, a) => {
    const isAnnual = a.platform_billing_interval === 'annual' || a.platform_billing_interval === 'year';
    const price = isAnnual ? (ANNUAL_PRICES[a.platform_tier] || 0) : (TIER_PRICES[a.platform_tier] || 0);
    return s + stripeFee(price);
  }, 0);

  const periodRevenue = totalPlatformFees + (platformMRR * (days / 30));
  const periodCosts = totalStripeFees + (platformStripeFeesMonthly * (days / 30)) + totalRecruiterCost + (totalFixedCostsCents * (days / 30));
  const grossProfit = periodRevenue - periodCosts;
  const grossMarginPct = periodRevenue > 0 ? (grossProfit / periodRevenue) * 100 : 0;

  // ---- CHURN (Artist Platform Tiers) ----
  // Artists who had paid tiers at start of period but no longer do
  const artistsAtStart = artists.filter(a => new Date(a.created_at) < start);
  const paidAtStart = artistsAtStart.filter(a =>
    a.platform_subscription_status === 'active' && a.platform_tier && a.platform_tier !== 'starter'
  );
  // For churn, we look at who was paid and is now not
  const churnedArtists = artistsAtStart.filter(a => {
    const wasPaid = a.platform_tier && a.platform_tier !== 'starter';
    const isNowInactive = a.platform_subscription_status !== 'active';
    return wasPaid && isNowInactive;
  });

  const artistChurnRate = paidAtStart.length > 0
    ? (churnedArtists.length / paidAtStart.length) * 100
    : 0;
  const avgLifespanMonths = artistChurnRate > 0 ? (100 / artistChurnRate) : 24; // cap at 24 if no churn

  // ---- LGP (Lifetime Gross Profit per Artist) ----
  const avgMonthlyRevenuePerArtist = paidArtists.length > 0 ? platformMRR / paidArtists.length : 0;
  const avgMonthlyStripeFeePerArtist = paidArtists.length > 0 ? platformStripeFeesMonthly / paidArtists.length : 0;
  const avgFixedCostPerArtist = (paidArtists.length + starterArtists.length) > 0
    ? totalFixedCostsCents / (paidArtists.length + starterArtists.length)
    : 0;
  const monthlyGrossProfitPerArtist = avgMonthlyRevenuePerArtist - avgMonthlyStripeFeePerArtist - avgFixedCostPerArtist;
  const lgp = Math.round(monthlyGrossProfitPerArtist * avgLifespanMonths);

  // ---- CAC ----
  const totalArtistsAcquired = artists.filter(a => new Date(a.created_at) >= start).length;
  const periodRecruiterSpend = totalRecruiterCost;
  const cac = totalArtistsAcquired > 0 ? Math.round(periodRecruiterSpend / totalArtistsAcquired) : 0;

  // ---- LGP:CAC RATIO ----
  const lgpCacRatio = cac > 0 ? Number((lgp / cac).toFixed(1)) : lgp > 0 ? Infinity : 0;

  // ---- PAYBACK PERIOD ----
  const paybackMonths = avgMonthlyRevenuePerArtist > 0 && cac > 0
    ? Number((cac / monthlyGrossProfitPerArtist).toFixed(1))
    : 0;

  // ---- 30-DAY CASH ----
  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);
  const thirtyDayCash = earnings
    .filter(e => new Date(e.created_at) >= last30)
    .reduce((s, e) => s + (e.platform_fee || 0), 0) + platformMRR;

  // ---- REVENUE PER VISITOR ----
  const uniqueVisitorsInPeriod = new Set(visits.map(v => v.visitor_hash)).size;
  const revenuePerVisitor = uniqueVisitorsInPeriod > 0
    ? Math.round(periodRevenue / uniqueVisitorsInPeriod)
    : 0;

  // Visitor trend (daily)
  const visitorTrend = buckets.map(b => {
    const dateStr = b.start.toISOString().split('T')[0];
    const dayVisitors = new Set(visits.filter(v => v.visit_date === dateStr).map(v => v.visitor_hash)).size;
    const dayRevenue = periodEarnings
      .filter(e => {
        const d = new Date(e.created_at);
        return d >= b.start && d <= b.end;
      })
      .reduce((s, e) => s + (e.platform_fee || 0), 0);
    return {
      label: b.label,
      visitors: dayVisitors,
      revenue: dayRevenue,
      revenuePerVisitor: dayVisitors > 0 ? Math.round(dayRevenue / dayVisitors) : 0,
    };
  });

  // ---- REVENUE TREND ----
  const revenueTrend = buckets.map(b => {
    const dayEarnings = periodEarnings.filter(e => {
      const d = new Date(e.created_at);
      return d >= b.start && d <= b.end;
    });
    const platformFees = dayEarnings.reduce((s, e) => s + (e.platform_fee || 0), 0);
    return {
      label: b.label,
      platformFees,
      totalGross: dayEarnings.reduce((s, e) => s + (e.gross_amount || 0), 0),
    };
  });

  // ---- TIER DISTRIBUTION ----
  const tierDistribution = [
    { name: 'Starter', count: starterArtists.length, color: '#666' },
    { name: 'Pro', count: paidArtists.filter(a => a.platform_tier === 'pro').length, color: '#D4AF37' },
    { name: 'Label', count: paidArtists.filter(a => a.platform_tier === 'label').length, color: '#3B82F6' },
    { name: 'Empire', count: paidArtists.filter(a => a.platform_tier === 'empire').length, color: '#8B5CF6' },
  ];

  // ---- ANNUAL vs MONTHLY MIX ----
  const annualArtists = paidArtists.filter(a => a.platform_billing_interval === 'annual' || a.platform_billing_interval === 'year').length;
  const monthlyArtists = paidArtists.length - annualArtists;
  const billingMix = [
    { name: 'Monthly', count: monthlyArtists, color: '#D4AF37' },
    { name: 'Annual', count: annualArtists, color: '#10B981' },
  ];

  // ---- RECRUITER PERFORMANCE ----
  const recruiterPerformance = recruiters.map(r => {
    const rReferrals = referrals.filter(ref => ref.recruiter_id === r.id);
    const qualified = rReferrals.filter(ref => ref.status === 'qualified').length;
    const churned = rReferrals.filter(ref => ref.status === 'churned').length;
    const pending = rReferrals.filter(ref => ref.status === 'pending').length;
    const rPayouts = payouts.filter(p => p.recruiter_id === r.id && p.status === 'paid');
    const totalPaid = rPayouts.reduce((s, p) => s + p.amount, 0);

    // Calculate LGP of artists they brought in
    const referredArtistIds = rReferrals.map(ref => ref.artist_id);
    const referredArtists = artists.filter(a => referredArtistIds.includes(a.id));
    const referredPaidArtists = referredArtists.filter(a =>
      a.platform_subscription_status === 'active' && a.platform_tier && a.platform_tier !== 'starter'
    );
    const referredMRR = referredPaidArtists.reduce((sum, a) => {
      const isAnnual = a.platform_billing_interval === 'annual' || a.platform_billing_interval === 'year';
      return sum + (isAnnual ? (ANNUAL_PRICES[a.platform_tier] || 0) : (TIER_PRICES[a.platform_tier] || 0));
    }, 0);

    return {
      id: r.id,
      code: r.referral_code,
      tier: r.tier || 'starter',
      isPartner: r.is_partner,
      totalReferred: r.total_artists_referred || rReferrals.length,
      qualified,
      churned,
      pending,
      qualificationRate: rReferrals.length > 0 ? Math.round((qualified / rReferrals.length) * 100) : 0,
      totalPaid,
      referredMRR,
      roi: totalPaid > 0 ? Number(((referredMRR * avgLifespanMonths - totalPaid) / totalPaid).toFixed(1)) : 0,
    };
  }).sort((a, b) => b.referredMRR - a.referredMRR);

  // ---- RECRUITER TIER COST BREAKDOWN ----
  const recruiterCostByTier = ['starter', 'connector', 'ambassador', 'partner'].map(tier => {
    const tierPayouts = payouts.filter(p => {
      const rec = recruiters.find(r => r.id === p.recruiter_id);
      return rec && ((rec.tier || 'starter') === tier || (tier === 'partner' && rec.is_partner));
    });
    return {
      name: tier.charAt(0).toUpperCase() + tier.slice(1),
      cost: tierPayouts.reduce((s, p) => s + p.amount, 0),
    };
  });

  // ---- PROJECTIONS ----
  // Sales velocity: new paid artists per month
  const recentMonths = Math.min(days / 30, 6);
  const recentPaidArtists = artists.filter(a => {
    const created = new Date(a.created_at);
    return created >= start && a.platform_tier && a.platform_tier !== 'starter';
  });
  const salesVelocity = recentMonths > 0 ? recentPaidArtists.length / recentMonths : 0;

  // Hypothetical max revenue = sales velocity * LGP
  const hypotheticalMaxMonthlyRevenue = artistChurnRate > 0
    ? Math.round((salesVelocity / (artistChurnRate / 100)) * avgMonthlyRevenuePerArtist)
    : Math.round(salesVelocity * 12 * avgMonthlyRevenuePerArtist);

  // Hypothetical max customers = sales velocity / churn rate
  const hypotheticalMaxCustomers = artistChurnRate > 0
    ? Math.round(salesVelocity / (artistChurnRate / 100))
    : Math.round(salesVelocity * 12);

  // ---- CHURN RISK (artists by last_active_at) ----
  const artistProfiles = profiles.filter(p => {
    return artists.some(a => a.user_id === p.id);
  });
  const now = new Date();
  const churnRisk = {
    active: artistProfiles.filter(p => {
      const last = p.last_active_at ? new Date(p.last_active_at) : null;
      return last && (now.getTime() - last.getTime()) < 7 * 24 * 60 * 60 * 1000;
    }).length,
    atRisk: artistProfiles.filter(p => {
      const last = p.last_active_at ? new Date(p.last_active_at) : null;
      if (!last) return false;
      const diff = now.getTime() - last.getTime();
      return diff >= 7 * 24 * 60 * 60 * 1000 && diff < 21 * 24 * 60 * 60 * 1000;
    }).length,
    churning: artistProfiles.filter(p => {
      const last = p.last_active_at ? new Date(p.last_active_at) : null;
      if (!last) return true;
      return (now.getTime() - last.getTime()) >= 21 * 24 * 60 * 60 * 1000;
    }).length,
  };

  // ---- ASSEMBLE METRICS ----
  const metrics = {
    // Hero
    lgpCacRatio,
    lgp,
    cac,

    // Financial health
    totalMRR,
    totalARR,
    platformMRR,
    transactionFeeMRR,
    grossMarginPct: Number(grossMarginPct.toFixed(1)),
    grossProfit,
    thirtyDayCash,
    totalFixedCostsCents,
    paybackMonths,

    // Revenue per visitor
    revenuePerVisitor,
    uniqueVisitorsInPeriod,
    visitorTrend,

    // Revenue trend
    revenueTrend,
    periodRevenue,
    periodCosts,

    // Retention
    artistChurnRate: Number(artistChurnRate.toFixed(1)),
    avgLifespanMonths: Number(avgLifespanMonths.toFixed(1)),
    billingMix,
    churnRisk,

    // Artists
    totalArtists: artists.length,
    paidArtists: paidArtists.length,
    starterArtists: starterArtists.length,
    tierDistribution,

    // Acquisition
    totalArtistsAcquired,
    totalRecruiterCost,
    recruiterPerformance,
    recruiterCostByTier,

    // Projections
    salesVelocity: Number(salesVelocity.toFixed(1)),
    hypotheticalMaxMonthlyRevenue,
    hypotheticalMaxCustomers,

    // Meta
    period,
    computedAt: new Date().toISOString(),
  };

  // Cache metrics
  await supabaseAdmin
    .from('admin_metrics_cache')
    .upsert(
      { period, metrics, computed_at: new Date().toISOString() },
      { onConflict: 'period' }
    );

  return NextResponse.json(metrics);
}
