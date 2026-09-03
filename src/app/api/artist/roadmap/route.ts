// GET /api/artist/roadmap — the personalized artist roadmap (Launch Wizard
// Stage 6). Derived on read, stored nowhere:
//  - step structure + personalization from buildRoadmapDefs (slug + the monthly
//    goal from the artist's own claimed calculator),
//  - 'check' steps evaluated by the Quest Engine's OWN evaluateCondition via a
//    minimal synthetic instance, so the roadmap can never drift from the quests
//    (and XP keeps flowing through the Quest Engine, never from here),
//  - 'fact' steps are the three Promise Calendar reads the evaluator lacks.
//
// Middleware skips /api/, so this authenticates itself. The evaluator wants the
// service-role client (it reads cross-table aggregates like subscriptions);
// ownership is derived from the SESSION, never the request.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { evaluateCondition } from '@/lib/quests/evaluator';
import type { QuestInstance } from '@/lib/quests/types';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';
import { reconcileStripeConnect } from '@/lib/stripe/connectReconcile';
import { assessFunnel } from '@/lib/funnelReadiness';
import { loadFunnelFacts } from '@/lib/funnelReadinessFacts';
import { FUNNEL_TEST_QUEST_KEY } from '@/lib/guidedSetup/testQuest';
import {
  buildRoadmapDefs,
  assembleRoadmap,
  type RoadmapFact,
  type RoadmapStepResult,
} from '@/lib/artistRoadmap';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// The Revenue Ramp writes the artist's PRIVATE growth plan into the promise tables
// (`src/lib/revenueRampSeed.ts`). Those rows are not promises to fans, so no roadmap step about
// promises may count them: seeding the ramp used to mark "you have scheduled a promise" as done
// before the artist had promised a supporter anything, and one stale personal to-do made
// `promises_on_track` permanently false.
//
// Obligations carry `benefit_type = 'ramp_step'`; events carry `metadata.ramp_step_key`. The
// obligation filter is written as an OR rather than `.neq(...)` on purpose: in SQL,
// `benefit_type <> 'ramp_step'` is NULL for a NULL benefit_type, which would silently drop every
// ordinary obligation that has no benefit type.
const RAMP_STEP = 'ramp_step';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fanObligations = (q: any) => q.or(`benefit_type.is.null,benefit_type.neq.${RAMP_STEP}`);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fanPromiseEvents = (q: any) => q.is('metadata->>ramp_step_key', null);

/** The synthetic instance the roadmap hands the Quest Engine's evaluator. Nothing is written. */
function syntheticInstance(userId: string, artistId: string, key: string, condition: unknown): QuestInstance {
  return {
    id: `roadmap:${key}`,
    user_id: userId,
    artist_id: artistId,
    status: 'active',
    progress_percent: 0,
    completion_condition: condition,
  } as unknown as QuestInstance;
}

async function evalFact(artistId: string, userId: string, fact: RoadmapFact): Promise<RoadmapStepResult> {
  try {
    if (fact === 'funnel_tested') {
      // Two halves, both required: every launch and truth check CRWN can see passes, AND the
      // artist acknowledged the two observations only they can make (the manual
      // artist_funnel_tested quest, completable only through /api/quests/complete). The
      // acknowledgement never stands in for state: a funnel that breaks later reopens this step
      // on the next read even though the quest instance stays completed.
      const [facts, ack] = await Promise.all([
        loadFunnelFacts(supabaseAdmin, artistId),
        supabaseAdmin
          .from('quest_instances')
          .select('id')
          .eq('user_id', userId)
          .eq('artist_id', artistId)
          .eq('template_key', FUNNEL_TEST_QUEST_KEY)
          .eq('status', 'completed')
          .limit(1)
          .maybeSingle(),
      ]);
      const machine = assessFunnel(facts).readyForTraffic;
      const acked = !!ack.data;
      const n = (machine ? 1 : 0) + (acked ? 1 : 0);
      return { done: machine && acked, current: n, target: 2 };
    }
    if (fact === 'funnel_launched') {
      // A distribution action on the funnel link, recorded as the EXISTING fan_invited funnel
      // event with a funnel_* method (the Launch flow writes it). Nothing new is stored.
      const { count } = await supabaseAdmin
        .from('funnel_events')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('stage', 'fan_invited')
        .like('metadata->>method', 'funnel_%');
      const n = count || 0;
      return { done: n >= 1, current: n >= 1 ? 1 : 0, target: 1 };
    }
    if (fact === 'first_paid') {
      // The canonical first paid conversion (src/lib/analytics/paidConversion.ts, six rails,
      // one row per artist). Artists paid before that event existed carry real net revenue
      // through the same rails, which the evaluator's revenue milestone already reads.
      const { count } = await supabaseAdmin
        .from('funnel_events')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('stage', 'first_paid_conversion');
      if ((count || 0) >= 1) return { done: true, current: 1, target: 1 };
      const res = await evaluateCondition(
        supabaseAdmin,
        syntheticInstance(userId, artistId, 'first-paid', { kind: 'domain', check: 'artist_revenue_milestone', count: 100 }),
      );
      return { done: res.done, current: res.done ? 1 : 0, target: 1 };
    }
    if (fact === 'promises_scheduled') {
      const { count } = await fanObligations(
        supabaseAdmin
          .from('fulfillment_obligations')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'active'),
      );
      const n = count || 0;
      return { done: n >= 1, current: n, target: 1 };
    }
    if (fact === 'promises_completed') {
      const { count } = await fanPromiseEvents(
        supabaseAdmin
          .from('fulfillment_events')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'completed'),
      );
      const n = count || 0;
      return { done: n >= 1, current: n, target: 1 };
    }
    // promises_on_track: nothing is overdue or missed. It used to also require at least one
    // active obligation, which could never be true for an artist who chose "No fixed schedule"
    // for every benefit (the default since 2026-09-03), so the step was uncompletable for
    // exactly the artists keeping their promises on demand.
    const [{ count: overdue }, { count: missed }] = await Promise.all([
      fanPromiseEvents(
        supabaseAdmin
          .from('fulfillment_events')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'pending')
          .lt('due_at', new Date().toISOString()),
      ),
      fanPromiseEvents(
        supabaseAdmin
          .from('fulfillment_events')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artistId)
          .eq('status', 'missed'),
      ),
    ]);
    const ok = (overdue || 0) === 0 && (missed || 0) === 0;
    return { done: ok, current: ok ? 1 : 0, target: 1 };
  } catch {
    return { done: false, current: 0, target: 1 };
  }
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) {
    return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  }

  // Stripe self-heal: Connect verification finishes ASYNCHRONOUSLY, and the
  // stripe_connected milestone (which the evaluator's check reads) is only
  // written when someone verifies against Stripe. This route is the post-launch
  // landing, so reconcile here whenever an account exists without the milestone:
  // one Stripe call, only in that transitional state, then never again.
  try {
    const { data: ap } = await supabaseAdmin
      .from('artist_profiles')
      .select('stripe_connect_id, activation_milestones')
      .eq('id', artist.id)
      .maybeSingle();
    const milestones = (ap?.activation_milestones || {}) as Record<string, unknown>;
    if (ap?.stripe_connect_id && !milestones.stripe_connected) {
      await reconcileStripeConnect(supabaseAdmin, {
        artistId: artist.id,
        userId: user.id,
        connectAccountId: ap.stripe_connect_id as string,
      });
    }
  } catch {
    // Best-effort: a Stripe hiccup must never break the roadmap.
  }

  // The monthly goal THEIR calculator modeled personalizes the Expand milestone.
  const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id, artistId: artist.id });
  const goalMonthlyCents = seed?.estimatedMonthlyCents ?? null;

  const defs = buildRoadmapDefs({ slug: artist.slug, goalMonthlyCents });
  const steps = defs.flatMap((s) => s.steps);

  const evaluated = await Promise.all(
    steps.map(async (step): Promise<[string, RoadmapStepResult]> => {
      if (step.source.kind === 'fact') {
        return [step.key, await evalFact(artist.id, user.id, step.source.fact)];
      }
      try {
        // Minimal synthetic instance: evaluateCondition only reads artist_id,
        // user_id, completion_condition (and status/progress for manual, which
        // roadmap steps never are).
        const instance = syntheticInstance(user.id, artist.id, step.key, {
          kind: 'domain',
          check: step.source.check,
          count: step.source.count,
        });
        const res = await evaluateCondition(supabaseAdmin, instance);
        return [step.key, { done: res.done, current: res.current, target: res.target }];
      } catch {
        return [step.key, { done: false, current: 0, target: step.source.count ?? 1 }];
      }
    }),
  );

  const roadmap = assembleRoadmap(defs, Object.fromEntries(evaluated), goalMonthlyCents);

  // Launch-command extras (Stage 9): the next promises due and the real
  // numbers. Derived the same way as everything else; no stored copies.
  const [promisesRes, subsRes] = await Promise.all([
    supabaseAdmin
      .from('fulfillment_events')
      .select('id, title, due_at')
      .eq('artist_id', artist.id)
      .eq('status', 'pending')
      .gte('due_at', new Date().toISOString())
      .order('due_at', { ascending: true })
      .limit(3),
    supabaseAdmin
      .from('subscriptions')
      .select('tier_id')
      .eq('artist_id', artist.id)
      .eq('status', 'active'),
  ]);
  const subs = subsRes.data ?? [];
  const tierIds = [...new Set(subs.map((s: { tier_id: string | null }) => s.tier_id).filter(Boolean))] as string[];
  let mrrCents = 0;
  let paidMembers = 0;
  if (tierIds.length) {
    const { data: tiers } = await supabaseAdmin
      .from('subscription_tiers')
      .select('id, price')
      .in('id', tierIds);
    const priceById = new Map((tiers ?? []).map((t: { id: string; price: number | null }) => [t.id, Number(t.price) || 0]));
    for (const s of subs) {
      const price = priceById.get(s.tier_id as string) ?? 0;
      mrrCents += price;
      if (price > 0) paidMembers += 1;
    }
  }

  return NextResponse.json({
    roadmap,
    upcomingPromises: (promisesRes.data ?? []).map((e: { title: string; due_at: string }) => ({
      title: e.title,
      dueAt: e.due_at,
    })),
    stats: {
      members: subs.length,
      paidMembers,
      mrrCents,
      goalMonthlyCents: roadmap.goalMonthlyCents,
    },
  });
}
