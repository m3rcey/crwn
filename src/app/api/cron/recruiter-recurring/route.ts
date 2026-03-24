import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { recruiterRecurringEmail } from '@/lib/emails/recruiterRecurring';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const TIER_PRICES: Record<string, number> = {
  pro: 5000,
  label: 17500,
  empire: 35000,
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Idempotency: prevent double-run in the same month
  const periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { error: lockError } = await supabaseAdmin
    .from('cron_run_log')
    .insert({ job_name: 'recruiter-recurring', period_key: periodKey });

  if (lockError) {
    console.log('Recruiter recurring already ran for', periodKey);
    return NextResponse.json({ message: `Already ran for ${periodKey}` });
  }

  // Find all qualified referrals with active recurring that haven't expired
  const { data: activeReferrals } = await supabaseAdmin
    .from('artist_referrals')
    .select('id, recruiter_id, artist_id, recurring_rate, recurring_expires_at')
    .eq('status', 'qualified')
    .gt('recurring_rate', 0)
    .gt('recurring_expires_at', now.toISOString());

  if (!activeReferrals || activeReferrals.length === 0) {
    return NextResponse.json({ message: 'No recurring payouts due', processed: 0 });
  }

  let processed = 0;
  let totalPaid = 0;

  for (const referral of activeReferrals) {
    // Get artist's current platform tier
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('platform_tier, platform_subscription_status')
      .eq('id', referral.artist_id)
      .single();

    if (!artist || artist.platform_subscription_status !== 'active' || !artist.platform_tier || artist.platform_tier === 'starter') {
      continue;
    }

    // Skip Pro-tier artists for partner referrals — recurring only on Label+
    const { data: refRecruiter } = await supabaseAdmin
      .from('recruiters')
      .select('is_partner')
      .eq('id', referral.recruiter_id)
      .single();

    if (refRecruiter?.is_partner && artist.platform_tier === 'pro') {
      continue;
    }

    const monthlyFee = TIER_PRICES[artist.platform_tier] || 0;
    if (monthlyFee === 0) continue;

    const payoutAmount = Math.round(monthlyFee * (referral.recurring_rate / 100));
    if (payoutAmount === 0) continue;

    // Get recruiter Stripe info
    const { data: recruiter } = await supabaseAdmin
      .from('recruiters')
      .select('id, stripe_connect_id, total_earned')
      .eq('id', referral.recruiter_id)
      .single();

    if (!recruiter) continue;

    // Create payout record
    const tierLabel = artist.platform_tier.charAt(0).toUpperCase() + artist.platform_tier.slice(1);
    const { data: payout } = await supabaseAdmin
      .from('recruiter_payouts')
      .insert({
        recruiter_id: recruiter.id,
        artist_referral_id: referral.id,
        type: 'recurring',
        amount: payoutAmount,
        description: `${referral.recurring_rate}% of ${tierLabel} ($${(monthlyFee / 100).toFixed(2)}/mo)`,
        status: 'pending',
      })
      .select('id')
      .single();

    // Transfer via Stripe if connected
    if (recruiter.stripe_connect_id && payout) {
      try {
        const transfer = await stripe.transfers.create({
          amount: payoutAmount,
          currency: 'usd',
          destination: recruiter.stripe_connect_id,
          description: `CRWN Recruiter recurring - ${referral.recurring_rate}% of ${tierLabel}`,
        });

        await supabaseAdmin
          .from('recruiter_payouts')
          .update({
            status: 'paid',
            stripe_transfer_id: transfer.id,
          })
          .eq('id', payout.id);

        // Update total earned
        await supabaseAdmin
          .from('recruiters')
          .update({
            total_earned: (recruiter.total_earned || 0) + payoutAmount,
          })
          .eq('id', recruiter.id);

        totalPaid += payoutAmount;
      } catch (err) {
        console.error('Recurring transfer failed:', err);
      }
    }

    processed++;
  }

  // Send monthly summary emails to recruiters who got paid
  try {
    const paidRecruiters = new Map<string, number>();
    const paidCounts = new Map<string, number>();

    for (const referral of activeReferrals) {
      const monthlyFee = TIER_PRICES[(await supabaseAdmin.from('artist_profiles').select('platform_tier').eq('id', referral.artist_id).single()).data?.platform_tier || ''] || 0;
      const amount = Math.round(monthlyFee * (referral.recurring_rate / 100));
      if (amount > 0) {
        paidRecruiters.set(referral.recruiter_id, (paidRecruiters.get(referral.recruiter_id) || 0) + amount);
        paidCounts.set(referral.recruiter_id, (paidCounts.get(referral.recruiter_id) || 0) + 1);
      }
    }

    for (const [recruiterId, totalAmount] of paidRecruiters) {
      const recruiterUserId = (await supabaseAdmin.from('recruiters').select('user_id').eq('id', recruiterId).single()).data?.user_id;
      if (!recruiterUserId) continue;
      const profile = (await supabaseAdmin.from('profiles').select('full_name').eq('id', recruiterUserId).single()).data;
      const email = recruiterUserId ? (await supabaseAdmin.auth.admin.getUserById(recruiterUserId)).data?.user?.email : null;
      if (email) {
        const firstName = (profile?.full_name || '').split(' ')[0] || 'there';
        const emailContent = recruiterRecurringEmail({ recruiterName: firstName, totalAmount, referralCount: paidCounts.get(recruiterId) || 0 });
        await resend.emails.send({ from: FROM_EMAIL, to: email, subject: emailContent.subject, html: emailContent.html });
      }
    }
  } catch (emailErr) {
    console.error('Recurring email failed:', emailErr);
  }

  return NextResponse.json({
    message: 'Recurring payouts complete',
    processed,
    totalPaid: `$${(totalPaid / 100).toFixed(2)}`,
  });
}
