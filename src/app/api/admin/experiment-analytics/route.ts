import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { EXPERIENCES, getExperimentConfig } from '@/lib/experiments/registry';
import { METRIC_DEFINITIONS } from '@/lib/experiments/metrics';
import { buildInsights, compareRate, distinctAidByVariant, type ExperienceStats } from '@/lib/experiments/insights';
import { getFunnels } from '@/lib/opportunityFunnels/registry';

// Admin-only. Aggregates the five experience/funnel/tool/video-campaign/opportunity views from the
// EXISTING event tables (funnel_events, lead_magnet_events, opportunity_ledger) plus experiment_events
// when an experiment runs. Server-side aggregation only, capped reads, AGGREGATES not raw rows, and
// every table is fail-safe: a missing table (pre-migration) yields an empty section, never a 500.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const CAP = 100_000;
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const since = p.get('since') || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const experienceFilter = p.get('experience');
  const campaignFilter = p.get('campaign');

  const quality = { funnelEvents: false, leadMagnetEvents: false, opportunityLedger: false, experimentEvents: false };

  // ---- funnel_events (stages by calculator/campaign/referrer/video) ----
  const fRows: { stage: string; calculator: string | null; campaign: string | null; referrer: string | null; video: string | null }[] = [];
  try {
    let q = supabaseAdmin.from('funnel_events').select('stage, calculator, campaign, referrer, video').gte('occurred_at', since).limit(CAP);
    if (campaignFilter) q = q.eq('campaign', campaignFilter);
    const { data, error } = await q;
    if (!error && Array.isArray(data)) {
      fRows.push(...(data as typeof fRows));
      quality.funnelEvents = true;
    }
  } catch {
    /* pre-migration */
  }

  // ---- lead_magnet_events (journey events by tool_slug) ----
  const lmRows: { event_type: string; tool_slug: string | null }[] = [];
  try {
    const { data, error } = await supabaseAdmin.from('lead_magnet_events').select('event_type, tool_slug').gte('created_at', since).limit(CAP);
    if (!error && Array.isArray(data)) {
      lmRows.push(...(data as typeof lmRows));
      quality.leadMagnetEvents = true;
    }
  } catch {
    /* pre-migration */
  }

  // ---- opportunity_ledger (revealed=projection / activated / captured=actual) ----
  const olRows: { feature: string; revealed_cents: number; captured_cents: number; activated: boolean }[] = [];
  try {
    const { data, error } = await supabaseAdmin.from('opportunity_ledger').select('feature, revealed_cents, captured_cents, activated').limit(CAP);
    if (!error && Array.isArray(data)) {
      olRows.push(...(data as typeof olRows));
      quality.opportunityLedger = true;
    }
  } catch {
    /* pre-migration */
  }

  // ---- experiment_events (variant-level; the only reliable per-experience artist link) ----
  const eeRows: { experiment_key: string; experience_key: string; variant_key: string | null; event_name: string; aid: string; value_cents: number | null }[] = [];
  try {
    const { data, error } = await supabaseAdmin.from('experiment_events').select('experiment_key, experience_key, variant_key, event_name, aid, value_cents').gte('occurred_at', since).limit(CAP);
    if (!error && Array.isArray(data)) {
      eeRows.push(...(data as typeof eeRows));
      quality.experimentEvents = true;
    }
  } catch {
    /* pre-migration */
  }

  // Helpers to count funnel/lm events for a given tool (experience).
  const fCount = (calculator: string, stage: string) => fRows.filter((r) => r.calculator === calculator && r.stage === stage).length;
  const lmCount = (tool: string, ev: string) => lmRows.filter((r) => r.tool_slug === tool && r.event_type === ev).length;
  const eeDistinctAid = (experience: string, ev: string) =>
    new Set(eeRows.filter((r) => r.experience_key === experience && r.event_name === ev).map((r) => r.aid)).size;

  // ---- 1. Experience Performance ----
  const experiences = EXPERIENCES.filter((e) => !experienceFilter || e.key === experienceFilter).map((e): ExperienceStats & {
    resultViews: number;
    previews: number;
    signupStarts: number;
    onboardingCompletions: number;
    firstDollarsAvailable: boolean;
  } => {
    const tool = e.toolKey;
    return {
      key: e.key,
      title: e.title,
      eligible: eeDistinctAid(e.key, 'assigned'),
      exposed: eeDistinctAid(e.key, 'exposed'),
      toolCompletions: fCount(tool, 'calculator_completed') || fCount(tool, 'result_revealed'),
      resultViews: fCount(tool, 'result_revealed'),
      builderStarts: lmCount(tool, 'pre_signup_builder_started'),
      previews: lmCount(tool, 'pre_signup_preview_viewed'),
      signupStarts: fCount(tool, 'signup_clicked'),
      signupCompletions: fCount(tool, 'account_created'),
      onboardingCompletions: fCount(tool, 'setup_completed'),
      featurePublications: fCount(tool, 'builder_published'),
      // First fan action / first dollar are only reliably attributable per experience via
      // experiment_events (which carries the experience + artist link). Marked partial otherwise.
      firstDollars: eeRows.filter((r) => r.experience_key === e.key && r.event_name === 'first_dollar').length,
      firstDollarsAvailable: quality.experimentEvents,
    };
  });

  // Insights: only between the two primary experiences when both are present.
  let insights: ReturnType<typeof buildInsights> = [];
  if (experiences.length >= 2) {
    insights = buildInsights(experiences[0], experiences[1], `since ${since}`);
  }

  // ---- 2. Funnel Performance (stage counts + stage-to-stage conversion) ----
  const STAGES = ['page_viewed', 'calculator_started', 'calculator_completed', 'result_revealed', 'signup_clicked', 'account_created', 'setup_completed', 'builder_published'];
  const stageCounts = STAGES.map((stage) => ({ stage, count: fRows.filter((r) => r.stage === stage).length }));
  const conversions = stageCounts.slice(1).map((s, i) => ({
    from: stageCounts[i].stage,
    to: s.stage,
    rate: stageCounts[i].count ? s.count / stageCounts[i].count : null,
  }));

  // ---- 3. Tool Performance (promotion status is visible here) ----
  const tools = getFunnels().map((f) => ({
    toolKey: f.toolKey,
    title: f.publicTitle,
    lifecycle: f.lifecycle,
    promotion: f.promotion,
    completions: fCount(f.toolKey, 'calculator_completed') || fCount(f.toolKey, 'result_revealed'),
    activations: fCount(f.toolKey, 'builder_published'),
  }));

  // ---- 4. Video / Campaign Performance ----
  const byDim = (key: 'video' | 'campaign' | 'referrer') => {
    const map = new Map<string, { visits: number; completions: number; signups: number; published: number }>();
    for (const r of fRows) {
      const k = (r[key] || 'unknown') as string;
      const b = map.get(k) || { visits: 0, completions: 0, signups: 0, published: 0 };
      if (r.stage === 'page_viewed') b.visits++;
      if (r.stage === 'calculator_completed' || r.stage === 'result_revealed') b.completions++;
      if (r.stage === 'account_created') b.signups++;
      if (r.stage === 'builder_published') b.published++;
      map.set(k, b);
    }
    return Array.from(map.entries()).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.visits - a.visits).slice(0, 50);
  };

  // ---- 5. Opportunity Performance (projected vs actual, clearly separated) ----
  const opp = olRows.reduce(
    (acc, r) => {
      acc.revealedCents += num(r.revealed_cents);
      acc.capturedCents += num(r.captured_cents);
      if (r.activated) acc.activatedCount++;
      return acc;
    },
    { revealedCents: 0, capturedCents: 0, activatedCount: 0 },
  );

  // ---- Per-variant breakdown for each experiment that has recorded events. Exposure vs the
  // signup_completed outcome, per arm, with the honest compareRate insight (sample sizes,
  // no winner below MIN_SAMPLE, no fake confidence). This is the save-vs-preview readout. ----
  const experimentKeys = Array.from(new Set(eeRows.map((r) => r.experiment_key).filter(Boolean)));
  const experimentBreakdowns = experimentKeys.map((key) => {
    const rows = eeRows.filter((r) => r.experiment_key === key);
    const exposed = distinctAidByVariant(rows, 'exposed');
    const converted = distinctAidByVariant(rows, 'signup_completed');
    const cfg = getExperimentConfig(key);
    const variantKeys = cfg ? cfg.variants.map((v) => v.key) : Array.from(new Set(rows.map((r) => r.variant_key ?? 'holdout')));
    const variants = variantKeys.map((vk) => ({
      variantKey: vk,
      exposed: exposed[vk] || 0,
      converted: converted[vk] || 0,
      rate: exposed[vk] ? (converted[vk] || 0) / exposed[vk] : null,
    }));
    const insight =
      variants.length === 2
        ? compareRate(
            { title: variants[0].variantKey, num: variants[0].converted, den: variants[0].exposed },
            { title: variants[1].variantKey, num: variants[1].converted, den: variants[1].exposed },
            'signup + onboarding conversion',
            `since ${since}`,
          )
        : null;
    return { experimentKey: key, title: cfg?.title ?? key, primaryMetric: cfg?.primaryMetric ?? null, variants, insight };
  });

  return NextResponse.json({
    period: { since },
    experiences,
    insights,
    experimentBreakdowns,
    funnel: { stages: stageCounts, conversions },
    tools,
    videoCampaign: { byVideo: byDim('video'), byCampaign: byDim('campaign'), byReferrer: byDim('referrer') },
    opportunity: {
      projected: { revealedCents: opp.revealedCents },
      actual: { capturedCents: opp.capturedCents, activatedCount: opp.activatedCount },
      note: 'Revealed is a PROJECTION (modeled). Captured is ACTUAL, refund-netted revenue. They are never combined.',
    },
    metricDefinitions: METRIC_DEFINITIONS,
    dataQuality: {
      ...quality,
      notes: [
        !quality.funnelEvents ? 'funnel_events not available (migration may be unapplied): acquisition/funnel stages are empty.' : null,
        !quality.opportunityLedger ? 'opportunity_ledger not available: opportunity view is empty.' : null,
        !quality.experimentEvents ? 'experiment_events not available or no experiment running: eligible/exposed and per-experience first-dollar are 0.' : null,
        'Per-experience first fan action / first dollar are reliable only via experiment_events; otherwise shown as unavailable.',
        'Anonymous visitors who never authenticate cannot be linked to outcomes; those journeys end at signup.',
      ].filter(Boolean),
    },
  });
}
