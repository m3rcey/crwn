import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  });
}
