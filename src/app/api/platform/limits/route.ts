import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTierLimitsV2 } from '@/lib/platformTier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
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

  // Fan-tier usage counts PAID tiers only (price > 0). The free front-door tier
  // does not consume the plan's fan-tier allowance (founder-approved rule). This
  // predicate MUST stay identical to checkArtistLimit() in platformTier.ts.
  // is_active NULL means active, so match TRUE-or-NULL and exclude only FALSE.
  const { count: tierCount } = await supabaseAdmin
    .from('subscription_tiers')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .not('is_active', 'is', false)
    .gt('price', 0);

  return NextResponse.json({
    tier,
    limits,
    usage: {
      tracks: trackCount || 0,
      fanTiers: tierCount || 0,
    },
  });
}
