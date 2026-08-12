import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { capTimeline, resolveClipperRateTimeline } from '@/lib/clipperRate';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * How soon this needs attention, NOT how strategically important it is.
 *
 * "high" here means a deadline is close or something is already overdue. It does NOT mean this is
 * the artist's most important business problem: the Constraint Engine owns that word and that
 * answer. The distinction is the whole point of this surface's boundary, so the type is named for
 * urgency rather than priority even though the wire field keeps its original name.
 */
export type NeedsYouUrgency = 'high' | 'medium' | 'low';

export interface NeedsYouItem {
  id: string;
  /**
   * Wire field name retained deliberately: the page reads `priority` and renaming it would be a
   * compatibility break for terminology alone. Semantics are `NeedsYouUrgency` above.
   */
  priority: NeedsYouUrgency;
  title: string;
  why: string;
  ctaLabel: string;
  href: string;
  icon?: string;
}

const MS_PER_DAY = 86_400_000;

/**
 * NEEDS YOU — the artist's event, deadline and unfinished-attention feed.
 *
 * WHAT THIS OWNS: "what happened, what is due, and what is waiting on me". Every item exists
 * because a FACT occurred (a deadline is closing, a fan pitched a mission, a demand goal was met)
 * or because something the artist started is unresolved.
 *
 * WHAT THIS DOES NOT OWN, and this is the boundary that was violated until 2026-08-11:
 * **strategic prioritization.** It does not decide what matters most about the artist's business.
 * The Constraint Engine owns that, Manager explains it, Rise Mode is where the work happens and
 * remembers progress. Items here are ordered by URGENCY (how soon), never ranked as business
 * opportunities against each other. Ordering deadlines is legitimate; ranking strategy is not.
 *
 * THE ROUTE PATH IS LEGACY AND STAYS. The user-facing concept has been "Needs You" since Z5 (the
 * Studio tile, the hamburger entry and the page heading all say so, pinned by
 * `constraint/ownership.test.ts`). `/action-plan` and `/api/action-plan` are retained purely for
 * compatibility: existing links, bookmarks, analytics and the `action-plan` tour id all resolve
 * through them. Do not "fix" the path; renaming it would reset every artist's tour state and
 * orphan historical analytics for nothing.
 *
 * Deterministic rules over data that already exists: no LLM call, no new tables, no writes. Every
 * item only explains why and deep-links to the surface where the artist acts MANUALLY. This
 * deliberately does NOT touch the DeepSeek AI Manager pipeline (generateActions /
 * artist_agent_actions / execute) — nothing here can auto-execute or change money/prices.
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
  const high: NeedsYouItem[] = [];
  const medium: NeedsYouItem[] = [];
  const low: NeedsYouItem[] = [];

  // ---- REMOVED 2026-08-11: personalized calculator missions ---------------
  //
  // This rule turned a calculator the artist completed before signing up into a ranked
  // recommendation ("Build Membership ($X/mo)") and hardcoded the top one to `high`, with a
  // comment saying it "leads the whole plan". That is strategic prioritization, and this surface
  // does not own it: the Constraint Engine does. An artist diagnosed FULFILLMENT could see
  // "deliver your overdue promise" on Rise Mode and "Build Membership" ranked high here at the
  // same moment, with nothing reconciling the two. Manager is explicitly forbidden from
  // contradicting the canonical priority (Z4); this path had never been given that rule.
  //
  // NOTHING WAS LOST. The calculator commitment is not deleted and the shared generator
  // (`buildLeadMagnetMissions`) is untouched: Rise Mode still calls it in `/api/quests` and leads
  // with the top mission, which is where a long-term commitment belongs because Rise Mode is also
  // what remembers progress against it. Removing the second reader ends the duplication and the
  // ranking conflict in one step, and costs this route a database round trip it no longer needs.

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
