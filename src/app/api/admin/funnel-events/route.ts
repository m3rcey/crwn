// Admin rollup over funnel_events: the lead-magnet acquisition funnel, page view -> mission
// completed. Distinct from /api/admin/funnel, which reports the artist activation-milestone funnel
// off artist_profiles. This one reads the deduped, dimensioned funnel_events store this feature
// writes, and is the shape a future funnel dashboard renders.
//
// Server-side admin authorization (the client /admin check is cosmetic). AGGREGATES only, never a
// raw event row. Query params: ?since=YYYY-MM-DD (default 30 days back), ?calculator=<slug>,
// ?campaign=<utm>.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FUNNEL_STAGES } from '@/lib/analytics/funnelEvents';
import { requireAdmin } from '@/lib/auth/requireAdmin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function emptyFunnel(): Record<string, number> {
  return Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0]));
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });


  const since =
    req.nextUrl.searchParams.get('since') ||
    new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const calculator = req.nextUrl.searchParams.get('calculator');
  const campaign = req.nextUrl.searchParams.get('campaign');

  let query = supabaseAdmin
    .from('funnel_events')
    .select('stage, calculator, campaign, referrer, video')
    .gte('occurred_at', since)
    .limit(100_000);
  if (calculator) query = query.eq('calculator', calculator);
  if (campaign) query = query.eq('campaign', campaign);

  const { data, error } = await query;
  if (error) {
    // Pre-migration or a transient error: an empty funnel, never a 500 to the dashboard.
    return NextResponse.json({
      since,
      stages: FUNNEL_STAGES,
      funnel: emptyFunnel(),
      byCalculator: {},
      byCampaign: {},
      byReferrer: {},
      byVideo: {},
    });
  }

  const funnel = emptyFunnel();
  const byCalculator: Record<string, Record<string, number>> = {};
  const byCampaign: Record<string, Record<string, number>> = {};
  const byReferrer: Record<string, Record<string, number>> = {};
  // The specific video/creative. Now that every stage below signup carries it, this breakdown runs
  // the whole spine instead of stopping at the calculator.
  const byVideo: Record<string, Record<string, number>> = {};

  const bump = (bucket: Record<string, Record<string, number>>, key: string | null, stage: string) => {
    const k = key || 'unknown';
    (bucket[k] ??= emptyFunnel())[stage] += 1;
  };

  for (const row of data || []) {
    const stage = String(row.stage);
    if (!(stage in funnel)) continue;
    funnel[stage] += 1;
    bump(byCalculator, (row.calculator as string) ?? null, stage);
    bump(byCampaign, (row.campaign as string) ?? null, stage);
    bump(byReferrer, (row.referrer as string) ?? null, stage);
    bump(byVideo, (row.video as string) ?? null, stage);
  }

  return NextResponse.json({ since, stages: FUNNEL_STAGES, funnel, byCalculator, byCampaign, byReferrer, byVideo });
}
