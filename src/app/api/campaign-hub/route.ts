import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { capTimeline, resolveClipperRateTimeline } from '@/lib/clipperRate';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export interface CampaignHubPromoter {
  fanId: string;
  name: string;
  earnedCents: number;
  activeSubscribers: number;
  /** 'fan' | 'clipper' when every referral shares one source, else null (mixed/unknown). */
  source: string | null;
}

export interface CampaignHubMission {
  id: string;
  title: string;
  type: string;
  goalCount: number;
  currentCount: number;
  participantCount: number;
  deadline: string | null;
}

/**
 * Campaign Hub aggregation — the artist's whole promotion engine, read-only,
 * in one payload. ARTIST-WIDE v1: no campaign entity, no per-campaign grouping
 * or commission ladders (deferred to a later money phase).
 *
 * SECURITY: scoped strictly to the AUTHENTICATED session user's artist row.
 * No client-supplied artist/user id is ever read; the artist is resolved from
 * artist_profiles WHERE user_id = session user.id, and every query filters on
 * that artist_id.
 *
 * READ-ONLY: zero writes, zero Stripe calls, zero price/rate changes. Each
 * metric fails open (skipped on error) so one bad query never 500s the hub.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Resolve the CALLER's artist row — never a client-supplied id.
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, platform_tier, referral_commission_rate, clipper_commission_rate, clipper_rate_schedule, clipper_campaign_started_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!artist) {
    return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  }

  const artistId = artist.id;

  // ---- Earnings + referrals (shared by several metrics) --------------------
  let earnings: {
    referral_id: string | null;
    referrer_fan_id: string;
    gross_amount: number | null;
    commission_amount: number | null;
  }[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('referral_earnings')
      .select('referral_id, referrer_fan_id, gross_amount, commission_amount')
      .eq('artist_id', artistId);
    if (!error) earnings = data || [];
  } catch {
    // Fail open — money tiles show 0 rather than erroring the whole hub.
  }

  let referrals: { id: string; referrer_fan_id: string; source: string | null; status: string | null }[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('referrals')
      .select('id, referrer_fan_id, source, status')
      .eq('artist_id', artistId);
    if (!error) referrals = data || [];
  } catch {
    // Fail open.
  }

  // ---- Money: gross driven, commissions owed, artist net --------------------
  const grossRevenueCents = earnings.reduce((sum, e) => sum + (e.gross_amount || 0), 0);
  const commissionsOwedCents = earnings.reduce((sum, e) => sum + (e.commission_amount || 0), 0);
  const netCents = grossRevenueCents - commissionsOwedCents;

  // ---- Active residuals ------------------------------------------------------
  const activeResiduals = referrals.filter(r => r.status === 'active').length;

  // ---- Share-to-Earn vs Clip-to-Earn split ----------------------------------
  // Bucket each earning by its referral's source ('fan' = share, 'clipper' = clip).
  const sourceByReferral: Record<string, string> = {};
  referrals.forEach(r => { sourceByReferral[r.id] = r.source || 'fan'; });
  let shareToEarnCents = 0;
  let clipToEarnCents = 0;
  earnings.forEach(e => {
    const source = e.referral_id ? sourceByReferral[e.referral_id] : undefined;
    if (source === 'clipper') clipToEarnCents += e.commission_amount || 0;
    else shareToEarnCents += e.commission_amount || 0;
  });

  // ---- Current commission rates + next clip step-down -----------------------
  let currentCommission: {
    shareRate: number;
    clipRate: number;
    nextClipChange: { date: string; from: number; to: number } | null;
  } = { shareRate: 0, clipRate: 0, nextClipChange: null };
  try {
    const timeline = capTimeline(
      resolveClipperRateTimeline({
        schedule: artist.clipper_rate_schedule,
        campaignStartedAt: artist.clipper_campaign_started_at,
        standardRate: artist.clipper_commission_rate || 0,
      }),
      artist.platform_tier
    );
    currentCommission = {
      shareRate: Math.max(0, Math.round(artist.referral_commission_rate || 0)),
      clipRate: timeline.currentRate,
      nextClipChange: timeline.nextChange,
    };
  } catch {
    // Fail open — the rate card just shows the raw standard rates as 0.
  }

  // ---- Top promoters ---------------------------------------------------------
  let topPromoters: CampaignHubPromoter[] = [];
  try {
    const earnedByFan: Record<string, number> = {};
    earnings.forEach(e => {
      if (!e.referrer_fan_id) return;
      earnedByFan[e.referrer_fan_id] = (earnedByFan[e.referrer_fan_id] || 0) + (e.commission_amount || 0);
    });
    const rankedFanIds = Object.keys(earnedByFan)
      .sort((a, b) => earnedByFan[b] - earnedByFan[a])
      .slice(0, 10);

    const names: Record<string, string> = {};
    if (rankedFanIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, display_name')
        .in('id', rankedFanIds);
      (profiles || []).forEach(p => { names[p.id] = p.display_name || 'Fan'; });
    }

    topPromoters = rankedFanIds.map(fanId => {
      const fanReferrals = referrals.filter(r => r.referrer_fan_id === fanId);
      const sources = Array.from(new Set(fanReferrals.map(r => r.source || 'fan')));
      return {
        fanId,
        name: names[fanId] || 'Fan',
        earnedCents: earnedByFan[fanId],
        activeSubscribers: fanReferrals.filter(r => r.status === 'active').length,
        source: sources.length === 1 ? sources[0] : null,
      };
    });
  } catch {
    // Fail open — empty promoter list.
  }

  // ---- Mission performance ----------------------------------------------------
  let missionPerformance: CampaignHubMission[] = [];
  try {
    const { data: missions, error } = await supabaseAdmin
      .from('missions')
      .select('id, title, type, target_kind, target_id, goal_count, manual_count, deadline, created_at')
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(10);
    if (!error && (missions || []).length > 0) {
      const missionIds = (missions || []).map(m => m.id);

      // Participant counts (joined)
      const participantCounts: Record<string, number> = {};
      const { data: joins, error: joinsError } = await supabaseAdmin
        .from('mission_participants')
        .select('mission_id')
        .in('mission_id', missionIds)
        .eq('status', 'joined');
      if (!joinsError) {
        (joins || []).forEach(j => {
          participantCounts[j.mission_id] = (participantCounts[j.mission_id] || 0) + 1;
        });
      }

      // Live demand-test counts (v1 progress rule: demand_test → live count, else manual)
      const demandIds = Array.from(new Set(
        (missions || [])
          .filter(m => m.target_kind === 'demand_test' && m.target_id)
          .map(m => m.target_id as string)
      ));
      const demandCounts: Record<string, number> = {};
      if (demandIds.length > 0) {
        const { data: pods } = await supabaseAdmin
          .from('proof_of_demand')
          .select('id, response_count')
          .in('id', demandIds);
        (pods || []).forEach(p => { demandCounts[p.id] = p.response_count ?? 0; });
      }

      missionPerformance = (missions || []).map(m => ({
        id: m.id,
        title: m.title,
        type: m.type,
        goalCount: m.goal_count ?? 0,
        currentCount: m.target_kind === 'demand_test' && m.target_id
          ? (demandCounts[m.target_id] ?? 0)
          : (m.manual_count ?? 0),
        participantCount: participantCounts[m.id] || 0,
        deadline: m.deadline || null,
      }));
    }
  } catch {
    // Fail open — empty missions list.
  }

  return NextResponse.json({
    grossRevenueCents,
    commissionsOwedCents,
    netCents,
    activeResiduals,
    revenueSplit: { shareToEarnCents, clipToEarnCents },
    currentCommission,
    topPromoters,
    missionPerformance,
  });
}
