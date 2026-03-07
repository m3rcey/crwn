import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  // Get referrals for this artist
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('id, referrer_fan_id, referred_fan_id, commission_rate, status, created_at')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  // Get referral earnings
  const { data: earnings } = await supabaseAdmin
    .from('referral_earnings')
    .select('referrer_fan_id, commission_amount, created_at')
    .eq('artist_id', artistId);

  const totalCommissionPaid = (earnings || []).reduce((sum, e) => sum + e.commission_amount, 0);

  // Top referrers
  const referrerEarnings: Record<string, number> = {};
  const referrerCounts: Record<string, number> = {};
  (referrals || []).forEach(r => {
    referrerCounts[r.referrer_fan_id] = (referrerCounts[r.referrer_fan_id] || 0) + 1;
  });
  (earnings || []).forEach(e => {
    referrerEarnings[e.referrer_fan_id] = (referrerEarnings[e.referrer_fan_id] || 0) + e.commission_amount;
  });

  const referrerIds = [...new Set((referrals || []).map(r => r.referrer_fan_id))];
  let referrerNames: Record<string, string> = {};
  if (referrerIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, username')
      .in('id', referrerIds);
    (profiles || []).forEach(p => {
      referrerNames[p.id] = p.display_name || p.username || 'Fan';
    });
  }

  const topReferrers = referrerIds
    .map(id => ({
      fanId: id,
      name: referrerNames[id] || 'Fan',
      referralCount: referrerCounts[id] || 0,
      totalEarned: referrerEarnings[id] || 0,
    }))
    .sort((a, b) => b.referralCount - a.referralCount)
    .slice(0, 10);

  // Get current commission rate
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('referral_commission_rate')
    .eq('id', artistId)
    .single();

  return NextResponse.json({
    totalReferrals: (referrals || []).length,
    activeReferrals: (referrals || []).filter(r => r.status === 'active').length,
    totalCommissionPaid,
    commissionRate: artist?.referral_commission_rate || 10,
    topReferrers,
  });
}
