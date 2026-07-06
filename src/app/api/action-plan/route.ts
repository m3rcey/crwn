import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { capTimeline, resolveClipperRateTimeline } from '@/lib/clipperRate';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export type ActionPlanPriority = 'high' | 'medium' | 'low';

export interface ActionPlanRecommendation {
  id: string;
  priority: ActionPlanPriority;
  title: string;
  why: string;
  ctaLabel: string;
  href: string;
  icon?: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * AI Artist Action Plan — connector-aware, ADVISORY-ONLY next moves.
 *
 * Deterministic rules over data that already exists: no LLM call, no new
 * tables, no writes. Every recommendation only explains why and deep-links to
 * the surface where the artist acts MANUALLY. This deliberately does NOT touch
 * the DeepSeek AI Manager pipeline (generateActions / artist_agent_actions /
 * execute) — nothing here can auto-execute or change money/prices.
 *
 * SECURITY: scoped strictly to the AUTHENTICATED session user's artist row.
 * No client-supplied artist/user id is ever read; the artist is resolved from
 * artist_profiles WHERE user_id = session user.id, and every query filters on
 * that artist_id.
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
  const high: ActionPlanRecommendation[] = [];
  const medium: ActionPlanRecommendation[] = [];
  const low: ActionPlanRecommendation[] = [];

  // ---- Rule 1: CLIP WINDOW CLOSING (high) --------------------------------
  // A clipper rate step-down lands within 3 days — the high-cut window is the
  // best time for clips to circulate, so surface the deadline.
  try {
    const timeline = capTimeline(
      resolveClipperRateTimeline({
        schedule: artist.clipper_rate_schedule,
        campaignStartedAt: artist.clipper_campaign_started_at,
        standardRate: artist.clipper_commission_rate || 0,
      }),
      artist.platform_tier
    );
    const next = timeline.nextChange;
    if (next && next.to < next.from) {
      const daysUntil = Math.ceil((new Date(next.date).getTime() - Date.now()) / MS_PER_DAY);
      if (daysUntil >= 0 && daysUntil <= 3) {
        const n = Math.max(1, daysUntil);
        high.push({
          id: 'clip-window-closing',
          priority: 'high',
          title: `Your ${next.from}% clip window drops to ${next.to}% in ${n} day${n === 1 ? '' : 's'}`,
          why: 'Clips convert best while the rate is high — rally your clippers before the step-down.',
          ctaLabel: 'Open Clip Controls',
          href: '/clip-controls',
          icon: 'scissors',
        });
      }
    }
  } catch {
    // Fail open — skip this rule.
  }

  // ---- Rule 2: PENDING FAN SUGGESTIONS (high) ----------------------------
  try {
    const { count, error } = await supabaseAdmin
      .from('mission_suggestions')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('status', 'pending');
    if (!error && (count ?? 0) > 0) {
      const n = count as number;
      high.push({
        id: 'pending-fan-suggestions',
        priority: 'high',
        title: `You have ${n} fan mission suggestion${n === 1 ? '' : 's'} to review`,
        why: 'Fans took the time to pitch you a mission — a fast review keeps them engaged.',
        ctaLabel: 'Review suggestions',
        href: '/missions/suggestions',
        icon: 'lightbulb',
      });
    }
  } catch {
    // Fail open — skip this rule.
  }

  // ---- Rule 3: PROOF OF DEMAND MET (high) --------------------------------
  try {
    const { data: pods, error } = await supabaseAdmin
      .from('proof_of_demand')
      .select('id, title, response_count, goal_count')
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .order('created_at', { ascending: true });
    if (!error) {
      const met = (pods || []).find(p => (p.response_count ?? 0) >= Math.max(1, p.goal_count ?? 0));
      if (met) {
        high.push({
          id: 'proof-of-demand-met',
          priority: 'high',
          title: `'${met.title}' hit its demand goal`,
          why: 'Fans proved they want this — turn it into an offer while the signal is hot.',
          ctaLabel: 'Build the offer',
          href: '/offers/new',
          icon: 'trophy',
        });
      }
    }
  } catch {
    // Fail open — skip this rule.
  }

  // ---- Rule 4: MISSION MOMENTUM (medium) ---------------------------------
  try {
    const { data: activeMissions, error } = await supabaseAdmin
      .from('missions')
      .select('id, title')
      .eq('artist_id', artistId)
      .eq('status', 'active');
    if (!error && (activeMissions || []).length > 0) {
      const missionIds = (activeMissions || []).map(m => m.id);
      const { data: joins, error: joinsError } = await supabaseAdmin
        .from('mission_participants')
        .select('mission_id')
        .in('mission_id', missionIds)
        .eq('status', 'joined');
      if (!joinsError) {
        const counts: Record<string, number> = {};
        (joins || []).forEach(j => { counts[j.mission_id] = (counts[j.mission_id] || 0) + 1; });
        for (const m of activeMissions || []) {
          const n = counts[m.id] || 0;
          if (n >= 3) {
            medium.push({
              id: `mission-momentum-${m.id}`,
              priority: 'medium',
              title: `${n} fans joined '${m.title}'`,
              why: 'Keep the momentum — reward them or post an update before it cools off.',
              ctaLabel: 'Open mission',
              href: `/missions/${m.id}`,
              icon: 'users',
            });
          }
        }
      }
    }
  } catch {
    // Fail open — skip this rule.
  }

  // ---- Rule 5: NO OFFER YET (medium) -------------------------------------
  try {
    const [tiersRes, productsRes] = await Promise.all([
      supabaseAdmin
        .from('subscription_tiers')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('is_active', true),
      supabaseAdmin
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('is_active', true),
    ]);
    if (!tiersRes.error && !productsRes.error &&
        (tiersRes.count ?? 0) === 0 && (productsRes.count ?? 0) === 0) {
      medium.push({
        id: 'no-offer-yet',
        priority: 'medium',
        title: "You haven't built an offer yet",
        why: 'Fans who want to support you have nothing to buy — one tier or product changes that.',
        ctaLabel: 'Build your first offer',
        href: '/offers/new',
        icon: 'shopping-bag',
      });
    }
  } catch {
    // Fail open — skip this rule.
  }

  // ---- Rule 6: PROMOTION OFF (medium) ------------------------------------
  try {
    const referralOff = !artist.referral_commission_rate || artist.referral_commission_rate <= 0;
    const clipperOff = !artist.clipper_commission_rate || artist.clipper_commission_rate <= 0;
    const noLadder = !Array.isArray(artist.clipper_rate_schedule) ||
      artist.clipper_rate_schedule.length === 0 ||
      !artist.clipper_campaign_started_at;
    if (referralOff && clipperOff && noLadder) {
      medium.push({
        id: 'promotion-off',
        priority: 'medium',
        title: 'Turn on fan promotion',
        why: 'Let fans earn by promoting you — a share of what they bring in costs nothing up front.',
        ctaLabel: 'Set it up',
        href: '/offers/new',
        icon: 'megaphone',
      });
    }
  } catch {
    // Fail open — skip this rule.
  }

  // ---- Rule 7: NO DEMAND TEST (low) ---------------------------------------
  try {
    const { count, error } = await supabaseAdmin
      .from('proof_of_demand')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId);
    if (!error && (count ?? 0) === 0) {
      low.push({
        id: 'no-demand-test',
        priority: 'low',
        title: 'Test an idea before you build it',
        why: 'A demand test proves fans want something before you spend time making it.',
        ctaLabel: 'Run a demand test',
        href: '/proof-of-demand/new',
        icon: 'flask',
      });
    }
  } catch {
    // Fail open — skip this rule.
  }

  return NextResponse.json({ recommendations: [...high, ...medium, ...low] });
}
