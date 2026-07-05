import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PAYOUT_HOLD_DAYS } from '@/lib/attribution';
import { generateReferralCode } from '@/lib/referrals';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Earn Center aggregation — consolidates the fan's referral/clipper earnings.
 *
 * SECURITY: scoped strictly to the AUTHENTICATED session user. No client-supplied
 * fan/user id is ever read; every query filters on the session user.id.
 * Read-only — cash-out stays on the existing /api/stripe/fan-cashout rail.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fanId = user.id;

  // Earnings — try with cleared_at (payout-hold column); fall back without it if
  // the migration isn't applied (rows then count as cleared, today's behavior).
  let earnings: { commission_amount: number; artist_id: string; cleared_at: string | null }[] = [];
  const withHold = await supabaseAdmin
    .from('referral_earnings')
    .select('commission_amount, artist_id, cleared_at')
    .eq('referrer_fan_id', fanId);
  if (!withHold.error) {
    earnings = withHold.data || [];
  } else {
    const fallback = await supabaseAdmin
      .from('referral_earnings')
      .select('commission_amount, artist_id')
      .eq('referrer_fan_id', fanId);
    earnings = (fallback.data || []).map(e => ({ ...e, cleared_at: null }));
  }

  const now = Date.now();
  const isHeld = (e: { cleared_at: string | null }) =>
    !!e.cleared_at && new Date(e.cleared_at).getTime() > now;

  const lifetimeEarnedCents = earnings.reduce((sum, e) => sum + (e.commission_amount || 0), 0);
  const heldCents = earnings.filter(isHeld).reduce((sum, e) => sum + (e.commission_amount || 0), 0);
  const clearedCents = lifetimeEarnedCents - heldCents;

  // Payouts — pending counts against the balance too (a cashout in flight is not
  // available), matching atomic_fan_cashout's balance math.
  const { data: allPayouts } = await supabaseAdmin
    .from('fan_payouts')
    .select('id, amount, status, created_at')
    .eq('fan_id', fanId)
    .order('created_at', { ascending: false });

  const paidCents = (allPayouts || [])
    .filter(p => p.status === 'completed' || p.status === 'pending')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const availableCents = Math.max(0, clearedCents - paidCents);

  // Referrals — for active-subscriber count + per-artist grouping
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('id, artist_id, status')
    .eq('referrer_fan_id', fanId);

  const activeSubscribers = (referrals || []).filter(r => r.status === 'active').length;

  // Per-artist breakdown: subscribers + earned, with artist name + slug
  const artistIds = Array.from(new Set([
    ...(referrals || []).map(r => r.artist_id),
    ...earnings.map(e => e.artist_id),
  ].filter(Boolean)));

  let perArtist: {
    artistId: string;
    artistName: string;
    slug: string | null;
    subscriberCount: number;
    earnedCents: number;
  }[] = [];

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

    const artistMeta: Record<string, { name: string; slug: string | null }> = {};
    (artistRows || []).forEach(a => {
      artistMeta[a.id] = { name: names[a.user_id] || 'Artist', slug: a.slug || null };
    });

    perArtist = artistIds.map(artistId => ({
      artistId,
      artistName: artistMeta[artistId]?.name || 'Artist',
      slug: artistMeta[artistId]?.slug || null,
      subscriberCount: (referrals || []).filter(r => r.artist_id === artistId && r.status === 'active').length,
      earnedCents: earnings
        .filter(e => e.artist_id === artistId)
        .reduce((sum, e) => sum + (e.commission_amount || 0), 0),
    })).sort((a, b) => b.earnedCents - a.earnedCents);
  }

  // Stripe connect status + referral code (for share links)
  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('username, stripe_connect_id')
    .eq('id', fanId)
    .single();

  return NextResponse.json({
    lifetimeEarnedCents,
    heldCents,
    availableCents,
    paidCents,
    activeSubscribers,
    holdDays: PAYOUT_HOLD_DAYS,
    stripeConnected: !!fanProfile?.stripe_connect_id,
    referralCode: generateReferralCode(fanProfile?.username || null, fanId),
    perArtist,
    payouts: (allPayouts || []).slice(0, 10).map(p => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      created_at: p.created_at,
    })),
  });
}
