import { createClient } from '@supabase/supabase-js';

interface MilestoneDefinition {
  key: string;
  name: string;
  emoji: string;
  check: (ctx: MilestoneContext) => boolean;
}

interface MilestoneContext {
  lifetimeNet: number;
  thisMonthNet: number;
  activeSubscribers: number;
  totalEarnings: number;
}

const MILESTONES: MilestoneDefinition[] = [
  {
    key: 'first_sale',
    name: 'First Sale',
    emoji: '🎉',
    check: (ctx) => ctx.totalEarnings >= 1,
  },
  {
    key: 'earnings_100',
    name: '$100 Club',
    emoji: '💯',
    check: (ctx) => ctx.lifetimeNet >= 10000,
  },
  {
    key: 'earnings_500',
    name: '$500 Earned',
    emoji: '🔥',
    check: (ctx) => ctx.lifetimeNet >= 50000,
  },
  {
    key: 'earnings_1k',
    name: '$1K Earned',
    emoji: '💰',
    check: (ctx) => ctx.lifetimeNet >= 100000,
  },
  {
    key: 'earnings_5k',
    name: '$5K Earned',
    emoji: '👑',
    check: (ctx) => ctx.lifetimeNet >= 500000,
  },
  {
    key: 'earnings_10k',
    name: '$10K Earned',
    emoji: '💎',
    check: (ctx) => ctx.lifetimeNet >= 1000000,
  },
  {
    key: 'supporters_10',
    name: '10 Supporters',
    emoji: '🙌',
    check: (ctx) => ctx.activeSubscribers >= 10,
  },
  {
    key: 'supporters_50',
    name: '50 Supporters',
    emoji: '⭐',
    check: (ctx) => ctx.activeSubscribers >= 50,
  },
  {
    key: 'supporters_100',
    name: '100 Supporters',
    emoji: '🏆',
    check: (ctx) => ctx.activeSubscribers >= 100,
  },
  {
    key: 'month_1k',
    name: '$1K Month',
    emoji: '🚀',
    check: (ctx) => ctx.thisMonthNet >= 100000,
  },
];

/**
 * Check and award any new milestones for an artist.
 * Called after every earning write.
 * Returns array of newly unlocked milestones.
 */
export async function checkAndAwardMilestones(
  artistId: string,
  artistUserId: string,
): Promise<{ key: string; name: string; emoji: string }[]> {
  const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
  );

  // Get already unlocked milestones
  const { data: existing } = await supabaseAdmin
    .from('milestones')
    .select('milestone_key')
    .eq('artist_id', artistId);

  const unlockedKeys = new Set((existing || []).map(m => m.milestone_key));

  // Get context data
  const { data: allEarnings } = await supabaseAdmin
    .from('earnings')
    .select('net_amount, created_at')
    .eq('artist_id', artistId);

  const earnings = allEarnings || [];
  const lifetimeNet = earnings.reduce((sum, e) => sum + e.net_amount, 0);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthNet = earnings
    .filter(e => e.created_at >= thisMonthStart)
    .reduce((sum, e) => sum + e.net_amount, 0);

  const { count: activeSubscribers } = await supabaseAdmin
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('status', 'active');

  const ctx: MilestoneContext = {
    lifetimeNet,
    thisMonthNet,
    activeSubscribers: activeSubscribers || 0,
    totalEarnings: earnings.length,
  };

  // Check each milestone
  const newlyUnlocked: { key: string; name: string; emoji: string }[] = [];

  for (const milestone of MILESTONES) {
    if (unlockedKeys.has(milestone.key)) continue;
    if (!milestone.check(ctx)) continue;

    // Unlock it
    const { error } = await supabaseAdmin
      .from('milestones')
      .insert({
        artist_id: artistId,
        milestone_key: milestone.key,
        milestone_name: milestone.name,
        milestone_emoji: milestone.emoji,
      });

    if (!error) {
      newlyUnlocked.push({ key: milestone.key, name: milestone.name, emoji: milestone.emoji });

      // Send celebratory notification
      await supabaseAdmin.from('notifications').insert({
        user_id: artistUserId,
        type: 'milestone',
        title: `${milestone.emoji} ${milestone.name}!`,
        message: `Congratulations! You just unlocked the "${milestone.name}" milestone on CRWN.`,
        link: '/profile/artist?tab=analytics',
      });
    }
  }

  return newlyUnlocked;
}
