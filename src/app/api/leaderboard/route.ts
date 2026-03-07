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

  // Get all earnings for this artist grouped by fan
  const { data: earnings } = await supabaseAdmin
    .from('earnings')
    .select('fan_id, net_amount')
    .eq('artist_id', artistId);

  // Get referral counts per fan for this artist
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('referrer_fan_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  // Get active subscriptions with tier info
  const { data: subs } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id, tier_id, subscription_tiers(name)')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  // Calculate scores
  const fanSpend: Record<string, number> = {};
  const fanReferrals: Record<string, number> = {};
  const fanTier: Record<string, string> = {};
  const allFanIds = new Set<string>();

  (earnings || []).forEach(e => {
    if (e.fan_id) {
      fanSpend[e.fan_id] = (fanSpend[e.fan_id] || 0) + e.net_amount;
      allFanIds.add(e.fan_id);
    }
  });

  (referrals || []).forEach(r => {
    fanReferrals[r.referrer_fan_id] = (fanReferrals[r.referrer_fan_id] || 0) + 1;
    allFanIds.add(r.referrer_fan_id);
  });

  (subs || []).forEach((s: unknown) => {
    const sub = s as { fan_id?: string; subscription_tiers?: { name?: string } };
    if (sub.fan_id) {
      fanTier[sub.fan_id] = sub.subscription_tiers?.name || 'Subscriber';
      allFanIds.add(sub.fan_id);
    }
  });

  // Scoring: $1 spent = 1 point, 1 referral = 50 points
  const fanScores: { fanId: string; score: number; spent: number; referralCount: number; tier: string }[] = [];

  allFanIds.forEach(fanId => {
    const spent = fanSpend[fanId] || 0;
    const refs = fanReferrals[fanId] || 0;
    const spendPoints = Math.round(spent / 100); // cents to dollars
    const referralPoints = refs * 50;
    const score = spendPoints + referralPoints;

    if (score > 0) {
      fanScores.push({
        fanId,
        score,
        spent,
        referralCount: refs,
        tier: fanTier[fanId] || '',
      });
    }
  });

  // Sort by score descending
  fanScores.sort((a, b) => b.score - a.score);
  const top25 = fanScores.slice(0, 25);

  // Get display names and avatars
  const topFanIds = top25.map(f => f.fanId);
  let fanProfiles: Record<string, { name: string; avatar: string | null }> = {};

  if (topFanIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, username, avatar_url')
      .in('id', topFanIds);

    (profiles || []).forEach(p => {
      fanProfiles[p.id] = {
        name: p.display_name || p.username || 'Fan',
        avatar: p.avatar_url,
      };
    });
  }

  const leaderboard = top25.map((f, i) => ({
    rank: i + 1,
    fanId: f.fanId,
    name: fanProfiles[f.fanId]?.name || 'Fan',
    avatar: fanProfiles[f.fanId]?.avatar || null,
    score: f.score,
    spent: f.spent,
    referralCount: f.referralCount,
    tier: f.tier,
  }));

  return NextResponse.json({ leaderboard });
}
