import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateReferralCode } from '@/lib/referrals';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Fan Command Center aggregation — "what should I do now" in one payload:
 * the fan's joined missions, their earning opportunities (connected artists
 * with a referral commission), and a money snapshot. SURFACING ONLY: reads
 * existing rows, no new tables, no new money logic.
 *
 * SECURITY: scoped strictly to the AUTHENTICATED session user. No client-supplied
 * fan/user id is ever read; every query filters on the session user.id.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const fanId = user.id;

  // ---- Joined missions (newest join first) -------------------------------
  const { data: joins } = await supabaseAdmin
    .from('mission_participants')
    .select('mission_id, created_at')
    .eq('fan_id', fanId)
    .eq('status', 'joined')
    .order('created_at', { ascending: false })
    .limit(20);

  const joinRows = (joins || []) as { mission_id: string; created_at: string }[];

  let joinedMissions: {
    missionId: string;
    title: string;
    cta: string | null;
    type: string;
    targetKind: string;
    targetId: string | null;
    artistSlug: string | null;
    artistName: string;
    goalCount: number;
    manualCount: number;
    demandResponseCount: number | null;
    joinedAt: string;
  }[] = [];

  if (joinRows.length > 0) {
    // Only ACTIVE missions surface — archived/completed drop off, matching /my-missions.
    const { data: missionRows } = await supabaseAdmin
      .from('missions')
      .select('id, title, cta, type, target_kind, target_id, goal_count, manual_count, artist_id')
      .in('id', joinRows.map(j => j.mission_id))
      .eq('status', 'active');

    const missions = (missionRows || []) as {
      id: string; title: string; cta: string | null; type: string;
      target_kind: string; target_id: string | null;
      goal_count: number; manual_count: number; artist_id: string;
    }[];

    // Artist slug (artist_profiles) + display name (profiles) — column locations per CLAUDE.md.
    const missionArtistIds = [...new Set(missions.map(m => m.artist_id))];
    const artistMeta: Record<string, { name: string; slug: string | null }> = {};
    if (missionArtistIds.length > 0) {
      const { data: artistRows } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, slug, user_id')
        .in('id', missionArtistIds);

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

    // Live demand-test counts (the v1 progress rule for demand_test targets).
    const demandIds = [...new Set(
      missions.filter(m => m.target_kind === 'demand_test' && m.target_id).map(m => m.target_id as string)
    )];
    const demandCounts: Record<string, number> = {};
    if (demandIds.length > 0) {
      const { data: pods } = await supabaseAdmin
        .from('proof_of_demand')
        .select('id, response_count')
        .in('id', demandIds);
      (pods || []).forEach(p => { demandCounts[p.id] = p.response_count ?? 0; });
    }

    // Preserve newest-join-first order from joinRows.
    joinedMissions = joinRows
      .map(j => {
        const m = missions.find(x => x.id === j.mission_id);
        if (!m) return null;
        return {
          missionId: m.id,
          title: m.title,
          cta: m.cta,
          type: m.type,
          targetKind: m.target_kind,
          targetId: m.target_id,
          artistSlug: artistMeta[m.artist_id]?.slug || null,
          artistName: artistMeta[m.artist_id]?.name || 'Artist',
          goalCount: m.goal_count,
          manualCount: m.manual_count,
          demandResponseCount:
            m.target_kind === 'demand_test' && m.target_id
              ? (demandCounts[m.target_id] ?? 0)
              : null,
          joinedAt: j.created_at,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }

  // ---- Earning opportunities: artists the fan is connected to ------------
  // Union of active subscriptions + prior referrals, filtered to artists that
  // actually pay a referral commission.
  const [{ data: ownSubs }, { data: referrals }] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .select('artist_id, status')
      .eq('fan_id', fanId)
      .eq('status', 'active'),
    supabaseAdmin
      .from('referrals')
      .select('artist_id')
      .eq('referrer_fan_id', fanId),
  ]);

  const connectedArtistIds = [...new Set([
    ...(ownSubs || []).map(s => s.artist_id),
    ...(referrals || []).map(r => r.artist_id),
  ].filter(Boolean))];

  let earningOpportunities: {
    artistId: string;
    artistName: string;
    slug: string | null;
    referralCommissionRate: number;
  }[] = [];

  if (connectedArtistIds.length > 0) {
    const { data: artistRows } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, user_id, referral_commission_rate')
      .in('id', connectedArtistIds);

    const rows = (artistRows || []).filter(a => (a.referral_commission_rate ?? 0) > 0);
    const userIds = rows.map(a => a.user_id).filter(Boolean);
    const names: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds);
      (profiles || []).forEach(p => { names[p.id] = p.display_name || 'Artist'; });
    }

    earningOpportunities = rows
      .map(a => ({
        artistId: a.id,
        artistName: names[a.user_id] || 'Artist',
        slug: a.slug || null,
        referralCommissionRate: a.referral_commission_rate as number,
      }))
      .sort((a, b) => b.referralCommissionRate - a.referralCommissionRate);
  }

  // ---- Week snapshot: same math as /api/earn + /api/impact ---------------
  // Fail open if cleared_at / gross_amount columns are absent (pre-migration):
  // rows then count as cleared, gross treated as 0 — mirroring those routes.
  let earnings: { commission_amount: number; gross_amount: number; cleared_at: string | null }[] = [];
  const full = await supabaseAdmin
    .from('referral_earnings')
    .select('commission_amount, gross_amount, cleared_at')
    .eq('referrer_fan_id', fanId);
  if (!full.error) {
    earnings = full.data || [];
  } else {
    const withHold = await supabaseAdmin
      .from('referral_earnings')
      .select('commission_amount, cleared_at')
      .eq('referrer_fan_id', fanId);
    if (!withHold.error) {
      earnings = (withHold.data || []).map(e => ({ ...e, gross_amount: 0 }));
    } else {
      const bare = await supabaseAdmin
        .from('referral_earnings')
        .select('commission_amount')
        .eq('referrer_fan_id', fanId);
      earnings = (bare.data || []).map(e => ({ ...e, gross_amount: 0, cleared_at: null }));
    }
  }

  const now = Date.now();
  const isHeld = (e: { cleared_at: string | null }) =>
    !!e.cleared_at && new Date(e.cleared_at).getTime() > now;

  const lifetimeEarnedCents = earnings.reduce((sum, e) => sum + (e.commission_amount || 0), 0);
  const heldCents = earnings.filter(isHeld).reduce((sum, e) => sum + (e.commission_amount || 0), 0);
  const clearedCents = lifetimeEarnedCents - heldCents;
  const revenueGeneratedCents = earnings.reduce((sum, e) => sum + (e.gross_amount || 0), 0);

  // Pending payouts count against the balance too (a cashout in flight is not
  // available) — same as atomic_fan_cashout and /api/earn.
  const { data: allPayouts } = await supabaseAdmin
    .from('fan_payouts')
    .select('amount, status')
    .eq('fan_id', fanId);

  const paidCents = (allPayouts || [])
    .filter(p => p.status === 'completed' || p.status === 'pending')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const availableCents = Math.max(0, clearedCents - paidCents);

  // ---- Referral code (for share links, built client-side) ----------------
  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('username')
    .eq('id', fanId)
    .single();

  return NextResponse.json({
    referralCode: generateReferralCode(fanProfile?.username || null, fanId),
    joinedMissions,
    earningOpportunities,
    weekSnapshot: {
      availableCents,
      lifetimeEarnedCents,
      revenueGeneratedCents,
    },
  });
}
