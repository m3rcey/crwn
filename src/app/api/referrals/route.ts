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

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fanId = user.id;

  // Get all referrals by this fan
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('id, artist_id, referred_fan_id, commission_rate, status, created_at')
    .eq('referrer_fan_id', fanId)
    .order('created_at', { ascending: false });

  // Get referral earnings
  const { data: earnings } = await supabaseAdmin
    .from('referral_earnings')
    .select('id, commission_amount, gross_amount, created_at, artist_id')
    .eq('referrer_fan_id', fanId)
    .order('created_at', { ascending: false });

  const totalEarnings = (earnings || []).reduce((sum, e) => sum + e.commission_amount, 0);
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const thisMonthEarnings = (earnings || []).filter(e => e.created_at >= thisMonthStart).reduce((sum, e) => sum + e.commission_amount, 0);

  // Get referred fan names
  const referredIds = (referrals || []).map(r => r.referred_fan_id);
  let referredNames: Record<string, string> = {};
  if (referredIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .in('id', referredIds);
    (profiles || []).forEach(p => { referredNames[p.id] = p.display_name || 'Fan'; });
  }

  // Get total paid out
  const { data: payouts } = await supabaseAdmin
    .from('fan_payouts')
    .select('amount')
    .eq('fan_id', fanId)
    .eq('status', 'completed');

  const totalPaidOut = (payouts || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const availableBalance = totalEarnings - totalPaidOut;

  // Check if fan has Stripe connected
  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_connect_id')
    .eq('id', fanId)
    .single();

  return NextResponse.json({
    totalReferrals: (referrals || []).length,
    activeReferrals: (referrals || []).filter(r => r.status === 'active').length,
    totalEarnings,
    thisMonthEarnings,
    totalPaidOut,
    availableBalance,
    stripeConnected: !!fanProfile?.stripe_connect_id,
    referrals: (referrals || []).map(r => ({
      ...r,
      referredName: referredNames[r.referred_fan_id] || 'Fan',
    })),
    recentEarnings: (earnings || []).slice(0, 20),
  });
}
