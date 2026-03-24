import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { recruiterQualifiedEmail } from '@/lib/emails/recruiterQualified';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const TIER_FLAT_FEES: Record<string, (count: number) => number> = {
  starter: (count) => count === 1 ? 5000 : 2500,
  connector: () => 5000,
  ambassador: () => 7500,
  partner: () => 5000,
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find pending referrals where artist has been on a paid plan for 30+ days
  const { data: pendingReferrals } = await supabaseAdmin
    .from('artist_referrals')
    .select('id, recruiter_id, artist_id, artist_user_id, created_at')
    .eq('status', 'pending')
    .lte('created_at', thirtyDaysAgo.toISOString());

  if (!pendingReferrals || pendingReferrals.length === 0) {
    return NextResponse.json({ message: 'No referrals to qualify', processed: 0 });
  }

  let qualified = 0;
  let churned = 0;

  for (const referral of pendingReferrals) {
    // Check if artist still has an active paid platform subscription
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('platform_tier, platform_subscription_status')
      .eq('id', referral.artist_id)
      .single();

    const isActivePaid = artist &&
      artist.platform_subscription_status === 'active' &&
      artist.platform_tier &&
      artist.platform_tier !== 'starter';

    if (isActivePaid) {
      // Qualify the referral
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      // Get recruiter for tier info
      const { data: recruiter } = await supabaseAdmin
        .from('recruiters')
        .select('id, tier, total_artists_referred, stripe_connect_id, is_partner, partner_flat_fee, partner_recurring_rate')
        .eq('id', referral.recruiter_id)
        .single();

      if (!recruiter) continue;

      // Calculate flat fee — partners use override or default $50
      let flatFee: number;
      let recurringRate: number;

      if (recruiter.is_partner) {
        flatFee = recruiter.partner_flat_fee ?? 5000;
        // Partners only earn recurring on Label+ artists — Pro margins are too thin
        const artistTier = artist!.platform_tier;
        recurringRate = (artistTier === 'label' || artistTier === 'empire')
          ? (recruiter.partner_recurring_rate ?? 10)
          : 0;
      } else {
        const tier = recruiter.tier || 'starter';
        const count = recruiter.total_artists_referred || 1;
        flatFee = TIER_FLAT_FEES[tier] ? TIER_FLAT_FEES[tier](count) : 2500;
        recurringRate = 0;
        if (tier === 'connector') recurringRate = 5;
        else if (tier === 'ambassador') recurringRate = 10;
      }

      // Update referral to qualified
      await supabaseAdmin
        .from('artist_referrals')
        .update({
          status: 'qualified',
          qualified_at: now.toISOString(),
          flat_fee_amount: flatFee,
          recurring_rate: recurringRate,
          recurring_expires_at: recurringRate > 0 ? expiresAt.toISOString() : null,
        })
        .eq('id', referral.id);

      // Create flat fee payout record
      await supabaseAdmin
        .from('recruiter_payouts')
        .insert({
          recruiter_id: recruiter.id,
          artist_referral_id: referral.id,
          type: 'flat_fee',
          amount: flatFee,
          description: `Flat fee - artist qualified after 30 days`,
          status: recruiter.stripe_connect_id ? 'pending' : 'pending',
        });

      // Pay out flat fee via Stripe if connected
      if (recruiter.stripe_connect_id) {
        try {
          const transfer = await stripe.transfers.create({
            amount: flatFee,
            currency: 'usd',
            destination: recruiter.stripe_connect_id,
            description: `CRWN Recruiter flat fee - artist referral`,
          });

          await supabaseAdmin
            .from('recruiter_payouts')
            .update({
              status: 'paid',
              stripe_transfer_id: transfer.id,
            })
            .eq('recruiter_id', recruiter.id)
            .eq('artist_referral_id', referral.id)
            .eq('type', 'flat_fee');

          // Update recruiter total earned
          await supabaseAdmin
            .from('recruiters')
            .update({
              total_earned: (recruiter as any).total_earned + flatFee,
            })
            .eq('id', recruiter.id);
        } catch (err) {
          console.error('Flat fee transfer failed:', err);
        }
      }

      // Mark flat fee as paid
      await supabaseAdmin
        .from('artist_referrals')
        .update({ flat_fee_paid: true })
        .eq('id', referral.id);

      // Send qualification email
      try {
        const recruiterUserId = (await supabaseAdmin.from('recruiters').select('user_id').eq('id', recruiter.id).single()).data?.user_id;
        const recruiterProfile = recruiterUserId ? (await supabaseAdmin.from('profiles').select('full_name').eq('id', recruiterUserId).single()).data : null;
        const recruiterEmail = recruiterUserId ? (await supabaseAdmin.auth.admin.getUserById(recruiterUserId)).data?.user?.email : null;
        const artistProfile = (await supabaseAdmin.from('profiles').select('full_name, display_name').eq('id', referral.artist_user_id).single()).data;

        if (recruiterEmail) {
          const firstName = (recruiterProfile?.full_name || '').split(' ')[0] || 'there';
          const artName = artistProfile?.display_name || artistProfile?.full_name || 'An artist';
          const emailContent = recruiterQualifiedEmail({ recruiterName: firstName, artistName: artName, amount: flatFee });
          await resend.emails.send({ from: FROM_EMAIL, to: recruiterEmail, subject: emailContent.subject, html: emailContent.html });
        }
      } catch (emailErr) {
        console.error('Qualification email failed:', emailErr);
      }

      qualified++;
    } else {
      // Artist churned before 30 days
      await supabaseAdmin
        .from('artist_referrals')
        .update({ status: 'churned' })
        .eq('id', referral.id);

      churned++;
    }
  }

  return NextResponse.json({ message: 'Qualification check complete', qualified, churned });
}
