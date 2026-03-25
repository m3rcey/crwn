import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

async function verifyAdmin() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return null;
  return user;
}

export async function GET() {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [
    { data: applications },
    { data: recruiters },
    { data: referrals },
    { data: payouts },
    { data: codes },
  ] = await Promise.all([
    supabaseAdmin.from('partner_applications').select('*').order('created_at', { ascending: false }),
    supabaseAdmin.from('recruiters').select('id, user_id, tier, total_artists_referred, total_earned, referral_code, is_partner, partner_flat_fee, partner_recurring_rate, created_at').eq('is_partner', true),
    supabaseAdmin.from('artist_referrals').select('id, recruiter_id, artist_id, status, created_at, qualified_at, flat_fee_amount, flat_fee_paid'),
    supabaseAdmin.from('recruiter_payouts').select('id, recruiter_id, type, amount, status, created_at'),
    supabaseAdmin.from('partner_codes').select('id, code, recruiter_id, is_active'),
  ]);

  const partnerRecruiters = recruiters || [];
  const partnerIds = partnerRecruiters.map(r => r.id);

  // Get display names for partners
  const userIds = partnerRecruiters.map(r => r.user_id);
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from('profiles').select('id, display_name, email').in('id', userIds)
    : { data: [] };

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // Build partner performance data
  const allReferrals = referrals || [];
  const allPayouts = payouts || [];
  const allCodes = codes || [];

  const partners = partnerRecruiters.map(r => {
    const rReferrals = allReferrals.filter(ref => ref.recruiter_id === r.id);
    const qualified = rReferrals.filter(ref => ref.status === 'qualified').length;
    const pending = rReferrals.filter(ref => ref.status === 'pending').length;
    const churned = rReferrals.filter(ref => ref.status === 'churned').length;
    const rPayouts = allPayouts.filter(p => p.recruiter_id === r.id);
    const totalPaid = rPayouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const profile = profileMap.get(r.user_id);
    const rCodes = allCodes.filter(c => c.recruiter_id === r.id);

    return {
      id: r.id,
      userId: r.user_id,
      displayName: profile?.display_name || 'Unknown',
      email: profile?.email || '',
      referralCode: r.referral_code,
      flatFee: r.partner_flat_fee,
      recurringRate: r.partner_recurring_rate,
      totalReferred: rReferrals.length,
      qualified,
      pending,
      churned,
      conversionRate: rReferrals.length > 0 ? Math.round((qualified / rReferrals.length) * 100) : 0,
      totalEarned: r.total_earned || 0,
      totalPaid,
      codes: rCodes,
      joinedAt: r.created_at,
    };
  });

  // Enrich codes with partner name
  const partnerCodes = allCodes.map(c => {
    const recruiter = partnerRecruiters.find(r => r.id === c.recruiter_id);
    const profile = recruiter ? profileMap.get(recruiter.user_id) : null;
    return {
      ...c,
      partnerName: profile?.display_name || 'Unknown',
    };
  });

  // Summary stats
  const apps = applications || [];
  const pendingApps = apps.filter(a => a.status === 'pending').length;
  const approvedApps = apps.filter(a => a.status === 'approved').length;
  const rejectedApps = apps.filter(a => a.status === 'rejected').length;

  const summary = {
    totalApplications: apps.length,
    pendingCount: pendingApps,
    approvedCount: approvedApps,
    rejectedCount: rejectedApps,
    approvalRate: apps.length > 0 ? Math.round((approvedApps / apps.length) * 100) : 0,
    activePartners: partnerRecruiters.length,
    totalPartnerSignups: allReferrals.filter(ref => partnerIds.includes(ref.recruiter_id)).length,
    totalPartnerEarnings: partners.reduce((sum, p) => sum + p.totalPaid, 0),
  };

  return NextResponse.json({ applications: apps, partners, partnerCodes, summary });
}

export async function PATCH(req: NextRequest) {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { applicationId, status, notes } = await req.json();
  if (!applicationId || !['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('partner_applications')
    .update({
      status,
      notes: notes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', applicationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
