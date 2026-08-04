import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getClaimedResults } from '@/lib/leadResults/handoffSeed';
import { deriveAcquisitionAvatar, evidenceFromInputs } from '@/lib/avatars/assignment';
import { buildStarterOffer } from '@/lib/leadResults/starterOffer';
import { getConnectAccountByArtistId } from '@/lib/stripe/connectAccount';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * The starter-offer recommendation for the AUTHENTICATED artist: what to launch, what to
 * charge, who it is for, and the next three moves. Deterministic and read-only; the
 * heavy lifting is buildStarterOffer, derived from the artist's own claimed calculator
 * results plus what their account already has.
 *
 * SECURITY: the artist is resolved from artist_profiles WHERE user_id = session user.id.
 * No client-supplied ids. Stripe connect status is read only through connectAccount.ts
 * (service role); the id itself never leaves the server.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, slug, platform_tier')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!artist) {
    return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  }

  const artistId = artist.id as string;

  const [paidTiersRes, freeTiersRes, tracksRes, productsRes, seeds, connectId] = await Promise.all([
    // The canonical Option-2 paid count: active tiers with price > 0.
    supabaseAdmin
      .from('subscription_tiers')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .not('is_active', 'is', false)
      .gt('price', 0),
    supabaseAdmin
      .from('subscription_tiers')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .not('is_active', 'is', false)
      .eq('price', 0),
    supabaseAdmin
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId),
    supabaseAdmin
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('is_active', true),
    getClaimedResults(supabaseAdmin, { userId: user.id, artistId }),
    getConnectAccountByArtistId(artistId).catch(() => null),
  ]);

  // The artist's sub-avatar funnel (docs/SUB_AVATARS.md), derived from the entry context stored
  // beside their own answers. Reframes the SAME recommended offer; never changes what it is.
  let subAvatar: string | null = null;
  try {
    const { data: inputRows } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('input_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(10);
    const contexts = (inputRows ?? []).flatMap(
      (r) => evidenceFromInputs(r.input_data as Record<string, unknown>).entryContexts ?? [],
    );
    subAvatar = deriveAcquisitionAvatar(contexts);
  } catch {
    /* framing is additive; without it the copy is the neutral default */
  }

  const offer = buildStarterOffer({
    subAvatar,
    seeds,
    platformTier: (artist.platform_tier as string | null) ?? null,
    paidTierCount: paidTiersRes.count ?? 0,
    hasFreeTier: (freeTiersRes.count ?? 0) > 0,
    hasTrack: (tracksRes.count ?? 0) > 0,
    productCount: productsRes.count ?? 0,
    stripeConnected: connectId ? true : false,
    artistSlug: (artist.slug as string | null) ?? null,
  });

  return NextResponse.json({ offer, artistSlug: artist.slug ?? null });
}
