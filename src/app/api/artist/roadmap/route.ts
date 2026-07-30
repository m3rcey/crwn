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

async function evalFact(artistId: string, fact: RoadmapFact): Promise<RoadmapStepResult> {
  try {
    if (fact === 'promises_scheduled') {
      const { count } = await supabaseAdmin
        .from('fulfillment_obligations')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'active');
      const n = count || 0;
      return { done: n >= 1, current: n, target: 1 };
    }
    if (fact === 'promises_completed') {
      const { count } = await supabaseAdmin
        .from('fulfillment_events')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'completed');
      const n = count || 0;
      return { done: n >= 1, current: n, target: 1 };
    }
    // promises_on_track: promises exist AND nothing is overdue or missed.
    const [{ count: active }, { count: overdue }, { count: missed }] = await Promise.all([
      supabaseAdmin
        .from('fulfillment_obligations')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'active'),
      supabaseAdmin
        .from('fulfillment_events')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'pending')
        .lt('due_at', new Date().toISOString()),
      supabaseAdmin
        .from('fulfillment_events')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId)
        .eq('status', 'missed'),
    ]);
    const ok = (active || 0) >= 1 && (overdue || 0) === 0 && (missed || 0) === 0;
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

  // The monthly goal THEIR calculator modeled personalizes the Expand milestone.
  const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id, artistId: artist.id });
  const goalMonthlyCents = seed?.estimatedMonthlyCents ?? null;

  const defs = buildRoadmapDefs({ slug: artist.slug, goalMonthlyCents });
  const steps = defs.flatMap((s) => s.steps);

  const evaluated = await Promise.all(
    steps.map(async (step): Promise<[string, RoadmapStepResult]> => {
      if (step.source.kind === 'fact') {
        return [step.key, await evalFact(artist.id, step.source.fact)];
      }
      try {
        // Minimal synthetic instance: evaluateCondition only reads artist_id,
        // user_id, completion_condition (and status/progress for manual, which
        // roadmap steps never are).
        const instance = {
          id: `roadmap:${step.key}`,
          user_id: user.id,
          artist_id: artist.id,
          status: 'active',
          progress_percent: 0,
          completion_condition: { kind: 'domain', check: step.source.check, count: step.source.count },
        } as unknown as QuestInstance;
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
