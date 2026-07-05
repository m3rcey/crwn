import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Fan Impact aggregation — surfaces the impact a fan has driven for artists:
 * revenue generated (gross), fans referred, artists supported, and a timeline.
 *
 * SECURITY: scoped strictly to the AUTHENTICATED session user. No client-supplied
 * fan/user id is ever read; every query filters on the session user.id.
 * Read-only — surfaces existing referral/subscription data, no new money logic.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fanId = user.id;

  // Earnings rows — gross_amount is the revenue this fan drove for artists,
  // commission_amount is the fan's cut. Fail open if gross_amount is absent
  // (older schema): fall back to commission-only rows with gross treated as 0.
  let earnings: {
    commission_amount: number;
    gross_amount: number;
    artist_id: string;
    created_at: string;
  }[] = [];
  const withGross = await supabaseAdmin
    .from('referral_earnings')
    .select('commission_amount, gross_amount, artist_id, created_at')
    .eq('referrer_fan_id', fanId)
    .order('created_at', { ascending: false });
  if (!withGross.error) {
    earnings = withGross.data || [];
  } else {
    const fallback = await supabaseAdmin
      .from('referral_earnings')
      .select('commission_amount, artist_id, created_at')
      .eq('referrer_fan_id', fanId)
      .order('created_at', { ascending: false });
    earnings = (fallback.data || []).map(e => ({ ...e, gross_amount: 0 }));
  }

  const revenueGeneratedCents = earnings.reduce((sum, e) => sum + (e.gross_amount || 0), 0);
  const lifetimeEarnedCents = earnings.reduce((sum, e) => sum + (e.commission_amount || 0), 0);

  // Referrals — distinct fans this fan brought in, plus per-artist active counts
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('id, artist_id, referred_fan_id, status')
    .eq('referrer_fan_id', fanId);

  const fansReferred = new Set(
    (referrals || []).map(r => r.referred_fan_id).filter(Boolean)
  ).size;

  // Artists supported = artists this fan actively subscribes to ∪ artists they referred fans to
  const { data: ownSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('artist_id, status')
    .eq('fan_id', fanId)
    .eq('status', 'active');

  const supportedIds = new Set([
    ...(ownSubs || []).map(s => s.artist_id),
    ...(referrals || []).map(r => r.artist_id),
  ].filter(Boolean));
  const artistsSupported = supportedIds.size;

  // Artist names + slugs for per-artist rows and the timeline
  const artistIds = Array.from(new Set([
    ...(referrals || []).map(r => r.artist_id),
    ...earnings.map(e => e.artist_id),
  ].filter(Boolean)));

  const artistMeta: Record<string, { name: string; slug: string | null }> = {};
  if (artistIds.length > 0) {
    const { data: artistRows } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, user_id')
      .in('id', artistIds);

    const userIds = (artistRows || []).map(a => a.user_id).filter(Boolean);
    const names: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);
      (profiles || []).forEach(p => { names[p.id] = p.display_name || 'Artist'; });
    }

    (artistRows || []).forEach(a => {
      artistMeta[a.id] = { name: names[a.user_id] || 'Artist', slug: a.slug || null };
    });
  }

  // Per-artist impact: revenue driven, earned, subscribers referred
  const perArtist = artistIds.map(artistId => ({
    artistId,
    artistName: artistMeta[artistId]?.name || 'Artist',
    slug: artistMeta[artistId]?.slug || null,
    revenueCents: earnings
      .filter(e => e.artist_id === artistId)
      .reduce((sum, e) => sum + (e.gross_amount || 0), 0),
    earnedCents: earnings
      .filter(e => e.artist_id === artistId)
      .reduce((sum, e) => sum + (e.commission_amount || 0), 0),
    subscribersReferred: (referrals || []).filter(
      r => r.artist_id === artistId && r.status === 'active'
    ).length,
  })).sort((a, b) => b.revenueCents - a.revenueCents);

  // Timeline: most recent revenue events (earnings are already newest-first)
  const timeline = earnings.slice(0, 15).map(e => ({
    artistName: artistMeta[e.artist_id]?.name || 'Artist',
    commissionCents: e.commission_amount || 0,
    grossCents: e.gross_amount || 0,
    createdAt: e.created_at,
  }));

  return NextResponse.json({
    revenueGeneratedCents,
    fansReferred,
    artistsSupported,
    lifetimeEarnedCents,
    perArtist,
    timeline,
  });
}
