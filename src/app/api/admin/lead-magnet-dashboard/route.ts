// The Lead Magnet Performance dashboard's data, in one admin-gated call. Reads the analytics built
// previously — funnel_events (stage counts + dimensions) and opportunity_ledger (revealed/captured)
// — and returns every headline tile and ranking the dashboard renders.
//
// Server-side admin authorization; the client view also gates, but this is the real gate. AGGREGATES
// only, never a raw row. Filters: ?since=YYYY-MM-DD (default 30d), ?campaign, ?calculator, ?artistId.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  computeMetrics,
  conversionByDimension,
  calculatorPerformance,
  topOf,
  type FunnelRow,
} from '@/lib/analytics/leadMagnetDashboard';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const MIN_VIEWS = 5; // volume floor so a 1-view/1-completion row cannot top a conversion ranking

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const since = p.get('since') || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const campaign = p.get('campaign');
  const calculator = p.get('calculator');
  const artistId = p.get('artistId');

  // ---- Funnel events: fetch the date-scoped window ONCE, then filter in memory. This keeps the
  // filter-option universes (campaigns, artists) full even when a filter is applied. ----
  interface RawRow extends FunnelRow {
    artist_id: string | null;
  }
  let all: RawRow[] = [];
  try {
    const { data } = await supabaseAdmin
      .from('funnel_events')
      .select('stage, calculator, campaign, referrer, video, artist_id')
      .gte('occurred_at', since)
      .limit(200_000);
    all = (data ?? []) as RawRow[];
  } catch {
    all = []; // pre-migration: empty dashboard, never a 500
  }

  // Filter-option universes (date-scoped only).
  const campaigns = [...new Set(all.map((r) => r.campaign).filter(Boolean) as string[])].sort().slice(0, 100);
  const artistIdsInWindow = [...new Set(all.map((r) => r.artist_id).filter(Boolean) as string[])].slice(0, 200);
  let artists: { id: string; label: string }[] = [];
  if (artistIdsInWindow.length) {
    try {
      const { data: aps } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, slug')
        .in('id', artistIdsInWindow);
      artists = (aps ?? []).map((a: { id: string; slug: string | null }) => ({ id: a.id, label: a.slug || a.id }));
    } catch {
      /* slugs unavailable -> empty artist filter */
    }
  }

  const rows: FunnelRow[] = all.filter(
    (r) =>
      (!campaign || r.campaign === campaign) &&
      (!calculator || r.calculator === calculator) &&
      (!artistId || r.artist_id === artistId),
  );

  const metrics = computeMetrics(rows);
  const byCalculator = calculatorPerformance(rows);
  const bySource = conversionByDimension(rows, 'referrer', { minViews: MIN_VIEWS });
  const byVideo = conversionByDimension(rows, 'video', { minViews: MIN_VIEWS });
  const byCampaign = conversionByDimension(rows, 'campaign', { minViews: MIN_VIEWS });

  // ---- Opportunity revenue (current standing: the latest month, so reveals are not summed across
  // months). Filtered by calculator/artist where given; campaign is not a ledger dimension. ----
  const now = new Date();
  const periodYear = now.getUTCFullYear();
  const periodMonth = now.getUTCMonth() + 1;
  let oq = supabaseAdmin
    .from('opportunity_ledger')
    .select('revealed_cents, captured_cents, remaining_cents, activated, feature, calculator')
    .eq('period_year', periodYear)
    .eq('period_month', periodMonth)
    .limit(100_000);
  if (calculator) oq = oq.eq('calculator', calculator);
  if (artistId) oq = oq.eq('artist_id', artistId);

  let revealedCents = 0;
  let capturedCents = 0;
  let remainingCents = 0;
  const opportunityByFeature: Record<string, { revealedCents: number; capturedCents: number; remainingCents: number }> = {};
  try {
    const { data: opp } = await oq;
    for (const o of opp ?? []) {
      const rev = Number(o.revealed_cents) || 0;
      const cap = Number(o.captured_cents) || 0;
      const rem = Number(o.remaining_cents) || 0;
      revealedCents += rev;
      capturedCents += cap;
      remainingCents += rem;
      const f = String(o.feature);
      const b = (opportunityByFeature[f] ??= { revealedCents: 0, capturedCents: 0, remainingCents: 0 });
      b.revealedCents += rev;
      b.capturedCents += cap;
      b.remainingCents += rem;
    }
  } catch {
    /* pre-migration: zero revenue */
  }

  return NextResponse.json({
    filters: { since, campaign, calculator, artistId },
    options: { campaigns, artists },
    metrics,
    revenue: {
      revealedCents,
      capturedCents,
      remainingCents,
      captureRate: revealedCents > 0 ? capturedCents / revealedCents : 0,
      byFeature: opportunityByFeature,
      period: { year: periodYear, month: periodMonth },
    },
    topCalculator: topOf(byCalculator),
    highestConvertingSource: topOf(bySource),
    highestConvertingVideo: topOf(byVideo),
    highestConvertingCampaign: topOf(byCampaign),
    byCalculator,
    bySource,
    byVideo,
    byCampaign,
  });
}
