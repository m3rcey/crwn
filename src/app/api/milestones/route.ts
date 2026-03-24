import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface MilestoneDef {
  key: string;
  name: string;
  emoji: string;
  type: 'earnings' | 'subscribers' | 'monthly';
  threshold: number;
}

const ALL_MILESTONES: MilestoneDef[] = [
  { key: 'first_sale', name: 'First Sale', emoji: '🎉', type: 'earnings', threshold: 1 },
  { key: 'earnings_100', name: '$100 Club', emoji: '💯', type: 'earnings', threshold: 10000 },
  { key: 'earnings_500', name: '$500 Earned', emoji: '🔥', type: 'earnings', threshold: 50000 },
  { key: 'earnings_1k', name: '$1K Earned', emoji: '💰', type: 'earnings', threshold: 100000 },
  { key: 'earnings_5k', name: '$5K Earned', emoji: '👑', type: 'earnings', threshold: 500000 },
  { key: 'earnings_10k', name: '$10K Earned', emoji: '💎', type: 'earnings', threshold: 1000000 },
  { key: 'supporters_10', name: '10 Supporters', emoji: '🙌', type: 'subscribers', threshold: 10 },
  { key: 'supporters_50', name: '50 Supporters', emoji: '⭐', type: 'subscribers', threshold: 50 },
  { key: 'supporters_100', name: '100 Supporters', emoji: '🏆', type: 'subscribers', threshold: 100 },
  { key: 'month_1k', name: '$1K Month', emoji: '🚀', type: 'monthly', threshold: 100000 },
];

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  // Get unlocked milestones
  const { data: unlocked } = await supabaseAdmin
    .from('milestones')
    .select('milestone_key, unlocked_at')
    .eq('artist_id', artistId);

  const unlockedMap: Record<string, string> = {};
  (unlocked || []).forEach(m => { unlockedMap[m.milestone_key] = m.unlocked_at; });

  // Get current progress
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

  // Build response with progress
  const milestones = ALL_MILESTONES.map(m => {
    const isUnlocked = !!unlockedMap[m.key];
    let current = 0;
    let target = m.threshold;

    if (m.key === 'first_sale') {
      current = earnings.length;
      target = 1;
    } else if (m.type === 'earnings') {
      current = lifetimeNet;
    } else if (m.type === 'subscribers') {
      current = activeSubscribers || 0;
    } else if (m.type === 'monthly') {
      current = thisMonthNet;
    }

    const progress = target > 0 ? Math.min((current / target) * 100, 100) : 0;

    return {
      key: m.key,
      name: m.name,
      emoji: m.emoji,
      unlocked: isUnlocked,
      unlockedAt: unlockedMap[m.key] || null,
      progress: Math.round(progress),
      current,
      target,
    };
  });

  return NextResponse.json({ milestones });
}
