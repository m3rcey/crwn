import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTierLimitsV2 } from '@/lib/platformTier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get('artistId');

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier')
    .eq('id', artistId)
    .single();

  const tier = artist?.platform_tier || 'starter';
  const limits = getTierLimitsV2(tier);

  // Count current usage
  const { count: trackCount } = await supabaseAdmin
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId);

  const { count: tierCount } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .eq('is_active', true);

  return NextResponse.json({
    tier,
    limits,
    usage: {
      tracks: trackCount || 0,
      fanTiers: tierCount || 0,
    },
  });
}
