import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fanScore, toPublicLeaderboardEntry, type FanScoreInput } from '@/lib/leaderboardPrivacy';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
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
    .select('fan_id, tier_id, subscription_tiers!subscriptions_tier_id_fkey(name)')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  // Get artist_community_id for this artist
  const { data: community } = await supabaseAdmin
    .from('posts')
    .select('artist_community_id')
    .eq('artist_community_id', artistId)
    .limit(1)
    .maybeSingle();

  const communityId = community?.artist_community_id || artistId;

  // Get all post IDs for this artist's community
  const { data: posts } = await supabaseAdmin
    .from('posts')
    .select('id, author_id')
    .eq('artist_community_id', communityId);

  const postIds = (posts || []).map(p => p.id);

  // Get comments on artist's posts (fan engagement)
  let commentCounts: Record<string, number> = {};
  if (postIds.length > 0) {
    const { data: comments } = await supabaseAdmin
      .from('comments')
      .select('user_id')
      .in('post_id', postIds);

    (comments || []).forEach(c => {
      if (c.user_id) {
        commentCounts[c.user_id] = (commentCounts[c.user_id] || 0) + 1;
      }
    });
  }

  // Get likes on artist's posts (fan engagement)
  let likeCounts: Record<string, number> = {};
  if (postIds.length > 0) {
    const { data: likes } = await supabaseAdmin
      .from('likes')
      .select('user_id')
      .in('post_id', postIds);

    (likes || []).forEach(l => {
      if (l.user_id) {
        likeCounts[l.user_id] = (likeCounts[l.user_id] || 0) + 1;
      }
    });
  }

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

  (subs || []).forEach((s: any) => {
    if (s.fan_id) {
      fanTier[s.fan_id] = s.subscription_tiers?.name || 'Subscriber';
      allFanIds.add(s.fan_id);
    }
  });

  // Add engagement fans
  Object.keys(commentCounts).forEach(id => allFanIds.add(id));
  Object.keys(likeCounts).forEach(id => allFanIds.add(id));

  // Scoring lives in src/lib/leaderboardPrivacy.ts, together with the public projection, so the
  // "spend is not recoverable" property is covered by a test instead of a comment.
  const fanScores: (FanScoreInput & { score: number })[] = [];

  allFanIds.forEach(fanId => {
    const entry: FanScoreInput = {
      fanId,
      spentCents: fanSpend[fanId] || 0,
      referralCount: fanReferrals[fanId] || 0,
      commentCount: commentCounts[fanId] || 0,
      likeCount: likeCounts[fanId] || 0,
      tier: fanTier[fanId] || '',
    };
    const score = fanScore(entry);
    if (score > 0) fanScores.push({ ...entry, score });
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

  // This endpoint is deliberately public: the fan leaderboard renders on the
  // public artist page. So it must ship only what that page shows.
  //
  // `spent` (a fan's lifetime spend on this artist, in cents) is NOT rendered
  // anywhere and used to be returned to anyone holding an artist UUID. Fans did
  // not agree to publish what they spend. It stays server-side, where it still
  // feeds `score` and therefore the ORDER below.
  //
  // `score` IS NOT SHIPPED EITHER, and that is the fix rather than an omission.
  // Redacting `spent` alone did not work: the formula above is
  //   score = round(spent/100) + referralCount*50 + commentCount*5 + likeCount*2
  // and referralCount, commentCount and likeCount were all returned in the same
  // response, so
  //   spent = (score - referralCount*50 - commentCount*5 - likeCount*2) * 100
  // recovered a fan's lifetime spend to the nearest dollar for anyone who could
  // load the public artist page. A redaction defeated by the fields shipped
  // beside it is not a redaction.
  //
  // Ranking is unchanged: the ORDER still comes from the full score, spend
  // included, computed and kept server-side. Only the invertible number is gone.
  // The richer options (a bucketed score, or dropping the spend term from a
  // public score) change what the leaderboard MEANS and stay a founder decision.
  const leaderboard = top25.map((f, i) =>
    toPublicLeaderboardEntry(
      f,
      i + 1,
      fanProfiles[f.fanId]?.name || 'Fan',
      fanProfiles[f.fanId]?.avatar || null,
    ),
  );

  return NextResponse.json({ leaderboard });
}
