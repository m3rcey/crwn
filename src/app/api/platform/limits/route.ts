import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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

  // Middleware skips /api/, and this route reads with the service role, so it
  // must authorize explicitly. Without this, anyone could enumerate any
  // artist's plan and catalog size by id.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('platform_tier, user_id')
    .eq('id', artistId)
    .single();

  if (!artist || artist.user_id !== user.id) {
    return NextResponse.json({ error: 'Not your profile' }, { status: 403 });
  }

  const tier = artist?.platform_tier || 'starter';
  const limits = getTierLimitsV2(tier);

  // Count current usage. Deleting a track soft-deletes it (is_active false), so
  // counting every row meant a deleted track kept consuming the artist's
  // allowance forever and the usage number never went down.
  const { count: trackCount } = await supabaseAdmin
    .from('tracks')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .not('is_active', 'is', false);

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
