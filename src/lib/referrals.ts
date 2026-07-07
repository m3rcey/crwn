import { fanReferralEarningEmail } from "@/lib/emails/fanReferralEarning";
import { insertHeldReferralEarning } from "@/lib/attribution";
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
  attributionSource?: string;
  clipperRate?: number;
}): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
  );

  const { artistId, referredFanId, subscriptionId, referralCode, earningId, grossAmount, attributionSource, clipperRate } = params;
  // 'clipper' links carry ?src=clipper; everything else is an ordinary fan referral.
  const source = attributionSource === 'clipper' ? 'clipper' : 'fan';

  // Referral codes are lowercased usernames or hex UUID fragments, so a legitimate
  // code is always [a-zA-Z0-9_-]. Reject anything else BEFORE interpolating it into
  // the PostgREST .or() filter below — a crafted code with commas/parens/dots could
  // otherwise inject extra filter clauses (filter injection).
  if (!/^[a-zA-Z0-9_-]+$/.test(referralCode)) {
    console.log('Referral code has invalid characters, ignoring:', referralCode);
    return;
  }

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

  // Get artist's commission rate — clippers get the clipper cut, fans the referral cut.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('referral_commission_rate, clipper_commission_rate, user_id')
    .eq('id', artistId)
    .single();

  // For clippers, prefer the rate locked at checkout (which also set the matching
  // application_fee_percent) so the commission paid equals the fee the artist was
  // charged. Fall back to the column only if the lock is absent.
  const commissionRate =
    source === 'clipper'
      ? (clipperRate ?? artist?.clipper_commission_rate ?? 10)
      : (artist?.referral_commission_rate || 10);
  const commissionAmount = Math.round(grossAmount * (commissionRate / 100));

  // Overwrite guard: if a referral already exists for (artist_id, referred_fan_id),
  // the ORIGINAL referrer keeps the attribution: referrer_fan_id / referral_code /
  // source / commission_rate are NEVER reassigned. Only the subscription linkage
  // is refreshed (e.g. resubscribe). The commission below is credited to whoever
  // actually holds the referral row.
  const { data: existingReferral } = await supabaseAdmin
    .from('referrals')
    .select('id, referrer_fan_id, commission_rate')
    .eq('artist_id', artistId)
    .eq('referred_fan_id', referredFanId)
    .maybeSingle();

  let referralId: string;
  let creditReferrerId: string;
  let creditCommissionAmount: number;

  if (existingReferral) {
    const { error: refUpdateError } = await supabaseAdmin
      .from('referrals')
      .update({
        subscription_id: subscriptionId,
        status: 'active',
      })
      .eq('id', existingReferral.id);

    if (refUpdateError) {
      console.error('Failed to update referral:', refUpdateError);
      return;
    }

    referralId = existingReferral.id;
    creditReferrerId = existingReferral.referrer_fan_id;
    creditCommissionAmount = Math.round(
      grossAmount * ((existingReferral.commission_rate ?? commissionRate) / 100)
    );
  } else {
    const { data: referral, error: refError } = await supabaseAdmin
      .from('referrals')
      .insert({
        artist_id: artistId,
        referrer_fan_id: referrer.id,
        referred_fan_id: referredFanId,
        subscription_id: subscriptionId,
        referral_code: referralCode,
        commission_rate: commissionRate,
        source,
        status: 'active',
      })
      .select('id')
      .single();

    if (refError || !referral) {
      console.error('Failed to create referral:', refError);
      return;
    }

    referralId = referral.id;
    creditReferrerId = referrer.id;
    creditCommissionAmount = commissionAmount;
  }

  // Create referral earning (held for PAYOUT_HOLD_DAYS before it is cashout-eligible;
  // column-tolerant so it still records even before the hold migration is applied).
  await insertHeldReferralEarning(supabaseAdmin, {
    referral_id: referralId,
    artist_id: artistId,
    referrer_fan_id: creditReferrerId,
    earning_id: earningId,
    gross_amount: grossAmount,
    commission_amount: creditCommissionAmount,
  });

  // Notify the referrer
  const { data: referredProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', referredFanId)
    .single();

  const referredName = referredProfile?.display_name || 'Someone';

  await supabaseAdmin.from('notifications').insert({
    user_id: creditReferrerId,
    type: 'referral_earning',
    title: `💸 +$${(creditCommissionAmount / 100).toFixed(2)} referral commission`,
    message: `${referredName} subscribed through your link!`,
    link: '/library?tab=referrals',
  });

  // Send referral earning email
  try {
    const { resend, FROM_EMAIL } = await import('@/lib/resend');
    const referrerEmail = (await supabaseAdmin.auth.admin.getUserById(creditReferrerId)).data?.user?.email;
    const { data: referrerProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', creditReferrerId)
      .single();
    const { data: artistData } = await supabaseAdmin
      .from('artist_profiles')
      .select('slug, profile:profiles(display_name)')
      .eq('id', artistId)
      .single();
    if (referrerEmail) {
      const firstName = (referrerProfile?.display_name || '').split(' ')[0] || 'there';
      const artName = (artistData?.profile as any)?.display_name || 'an artist';
      const emailContent = fanReferralEarningEmail({ fanName: firstName, artistName: artName, amount: creditCommissionAmount, referredName });
      await resend.emails.send({ from: FROM_EMAIL, to: referrerEmail, subject: emailContent.subject, html: emailContent.html });
    }
  } catch (emailErr) {
    console.error('Fan referral email failed:', emailErr);
  }
}
