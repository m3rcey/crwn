import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { capTimeline, resolveClipperRateTimeline } from '@/lib/clipperRate';
import { buildLeadMagnetMissions } from '@/lib/leadResults/leadMagnetMissions';

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

  // ---- Rule 0: PERSONALIZED CALCULATOR MISSIONS (high, first) -------------
  // A calculator the artist completed becomes their first, personalized mission ("Build
  // Membership", not "launch a mission"), carrying the dollar they saw. One mission per completed
  // calculator, ranked by opportunity, so the biggest one leads Rise Mode. These come from the
  // shared mission generator, so the Action Plan and Rise Mode never drift into two systems.
  try {
    const missions = await buildLeadMagnetMissions(supabaseAdmin, { userId: user.id, artistId });
    missions.forEach((m, i) => {
      const value = m.monthlyValue ? ` (${m.monthlyValue})` : '';
      const rec: ActionPlanRecommendation = {
        id: `lead-magnet-mission-${m.toolSlug}`,
        // The top mission leads the whole plan; the rest are still surfaced, one step down.
        priority: i === 0 ? 'high' : 'medium',
        title: `${m.title}${value}`,
        why: m.monthlyValue
          ? `You ran the ${m.toolName} and saw ${m.monthlyValue}. Until you build it here, that stays a screenshot, not income.`
          : `You did the work in the ${m.toolName}. Building it here is the one step between the plan and the payout.`,
        ctaLabel: 'Start this mission',
        href: m.href,
        icon: m.icon,
      };
      if (i === 0) high.push(rec);
      else medium.push(rec);
    });
  } catch {
    // Fail open — skip this rule.
  }

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
          why: 'Clips convert best while the rate is high. Rally your clippers before the step-down.',
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
        why: 'Fans took the time to pitch you a mission. A fast review keeps them engaged.',
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
          why: 'Fans proved they want this. Turn it into an offer while the signal is hot.',
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
              why: 'Keep the momentum. Reward them or post an update before it cools off.',
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

  // ---- Z5: THE THREE STANDING-GAP RULES WERE REMOVED HERE -----------------
  //
  // `no-offer-yet`, `promotion-off` and `no-demand-test` all fired on a STANDING STATE ("you have
  // no tiers", "promotion is off", "you have never run a demand test") rather than on something
  // that happened or is due. That made them strategic recommendations, and strategy is no longer
  // this surface's job:
  //
  //   - `no-offer-yet` re-derived launch readiness from tier and product counts, which the ROADMAP
  //     already owns through the Quest Engine's DomainChecks and which gates the Constraint Engine.
  //     Two places deciding whether an artist has an offer is exactly the duplicate the roadmap
  //     delegation exists to prevent.
  //   - `promotion-off` and `no-demand-test` were evidence-free growth advice. They could, and did,
  //     appear while the Constraint Engine had diagnosed FULFILLMENT, telling an artist who is
  //     failing the supporters they already have to go recruit promoters.
  //
  // Nothing was moved anywhere: the Constraint Engine already covers these from evidence, and it
  // stays silent rather than guessing when the evidence is thin. Every EVENT and DEADLINE rule
  // above is untouched, because "a fan pitched you a mission" and "your clip window closes in two
  // days" are facts about what happened, not opinions about what matters most.

  return NextResponse.json({ recommendations: [...high, ...medium, ...low] });
}
