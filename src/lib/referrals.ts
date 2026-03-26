import { fanReferralEarningEmail } from "@/lib/emails/fanReferralEarning";
/**
 * Referral system utilities for CRWN
 */

/**
 * Get or generate a referral code for a fan.
 * Uses the fan's username if available, otherwise generates a short code.
 */
export function generateReferralCode(username: string | null, fanId: string): string {
  if (username && username.length >= 3) {
    return username.toLowerCase();
  }
  // Fallback: first 8 chars of fan UUID
  return fanId.replace(/-/g, '').substring(0, 8);
}

/**
 * Build a referral URL for a specific artist.
 */
export function buildReferralUrl(artistSlug: string, referralCode: string): string {
  return `https://thecrwn.app/${artistSlug}/r/${referralCode}`;
}

/**
 * Process a referral after successful subscription.
 * Called from the webhook after a subscription is created.
 */
export async function processReferral(params: {
  artistId: string;
  referredFanId: string;
  subscriptionId: string;
  referralCode: string;
  earningId: string;
  grossAmount: number;
}): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
  );

  const { artistId, referredFanId, subscriptionId, referralCode, earningId, grossAmount } = params;

  // Find the referrer by code (username match)
  const { data: referrer } = await supabaseAdmin
    .from('profiles')
    .select('id, username')
    .or(`username.eq.${referralCode},id.ilike.${referralCode}%`)
    .limit(1)
    .single();

  if (!referrer) {
    console.log('Referral code not found:', referralCode);
    return;
  }

  // Don't allow self-referral
  if (referrer.id === referredFanId) {
    console.log('Self-referral blocked');
    return;
  }

  // Get artist's commission rate
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('referral_commission_rate, user_id')
    .eq('id', artistId)
    .single();

  const commissionRate = artist?.referral_commission_rate || 10;
  const commissionAmount = Math.round(grossAmount * (commissionRate / 100));

  // Create referral record (upsert in case referred fan already exists)
  const { data: referral, error: refError } = await supabaseAdmin
    .from('referrals')
    .upsert({
      artist_id: artistId,
      referrer_fan_id: referrer.id,
      referred_fan_id: referredFanId,
      subscription_id: subscriptionId,
      referral_code: referralCode,
      commission_rate: commissionRate,
      status: 'active',
    }, { onConflict: 'artist_id,referred_fan_id' })
    .select('id')
    .single();

  if (refError) {
    console.error('Failed to create referral:', refError);
    return;
  }

  // Create referral earning
  await supabaseAdmin
    .from('referral_earnings')
    .insert({
      referral_id: referral.id,
      artist_id: artistId,
      referrer_fan_id: referrer.id,
      earning_id: earningId,
      gross_amount: grossAmount,
      commission_amount: commissionAmount,
    });

  // Notify the referrer
  const { data: referredProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', referredFanId)
    .single();

  const referredName = referredProfile?.display_name || 'Someone';

  await supabaseAdmin.from('notifications').insert({
    user_id: referrer.id,
    type: 'referral_earning',
    title: `💸 +$${(commissionAmount / 100).toFixed(2)} referral commission`,
    message: `${referredName} subscribed through your link!`,
    link: '/library?tab=referrals',
  });

  // Send referral earning email
  try {
    const { resend, FROM_EMAIL } = await import('@/lib/resend');
    const referrerEmail = (await supabaseAdmin.auth.admin.getUserById(referrer.id)).data?.user?.email;
    const { data: referrerProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', referrer.id)
      .single();
    const { data: artistData } = await supabaseAdmin
      .from('artist_profiles')
      .select('slug, profile:profiles(display_name)')
      .eq('id', artistId)
      .single();
    if (referrerEmail) {
      const firstName = (referrerProfile?.display_name || '').split(' ')[0] || 'there';
      const artName = (artistData?.profile as any)?.display_name || 'an artist';
      const emailContent = fanReferralEarningEmail({ fanName: firstName, artistName: artName, amount: commissionAmount, referredName });
      await resend.emails.send({ from: FROM_EMAIL, to: referrerEmail, subject: emailContent.subject, html: emailContent.html });
    }
  } catch (emailErr) {
    console.error('Fan referral email failed:', emailErr);
  }
}
