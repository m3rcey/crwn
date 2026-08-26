// GET /api/admin/scorecard — the 90-day experiment scorecard, in one admin-gated call.
//
// The experiment: 3 qualified artists -> first paid member, documented. This route answers
// exactly that and nothing else, reading the CANONICAL stores every number already lives in
// (funnel_events, lead_magnet_results, artist_profiles.activation_milestones + setup_completed,
// fan_contacts, campaigns, earnings, frl_work_entries). No new table, no new event, no snapshot.
//
// Rules inherited from Money Model (doc 21): a FAILED read is null and renders as an em-dash-free
// "not measured", NEVER as zero — at this sample size a fabricated 0 reads as "the experiment is
// failing" when the truth is "a query broke". Counts are absolute, never rates: n <= 10 makes
// every percentage a lie with a confident face.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { founderTestArtists } from '@/lib/analytics/founderTestExclusion';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Wrap a read so one broken query nulls ONE tile instead of the screen. */
async function tile<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error('[scorecard] tile read failed:', err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const days = Math.min(365, Math.max(1, parseInt(req.nextUrl.searchParams.get('days') || '30', 10) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  // Founder test accounts are not the experiment (fail-soft: empty until the migration runs).
  const founderTest = await founderTestArtists(supabaseAdmin);

  const [
    qualifiedLeads,
    signupsFromClaims,
    activation,
    contactsImportedArtists,
    launchCampaignsSent,
    firstPaid,
    economics,
    founderMinutes,
  ] = await Promise.all([
    // 1. Qualified leads: hand-raisers the canonical server-side scorer qualified. The band is
    // stamped by decideCallRequest into the call_requested funnel event; a client-sent band is
    // never trusted anywhere, including here.
    tile(async () => {
      const { data, error } = await supabaseAdmin
        .from('funnel_events')
        .select('metadata')
        .eq('stage', 'call_requested')
        .gte('occurred_at', since);
      if (error) throw error;
      return (data || []).filter((r) => (r.metadata as Record<string, unknown> | null)?.qualified === true).length;
    }),

    // 2. Signups that arrived through a claimed calculator result (the funnel working end to end).
    tile(async () => {
      const { data, error } = await supabaseAdmin
        .from('lead_magnet_results')
        .select('user_id')
        .not('user_id', 'is', null);
      if (error) throw error;
      return new Set((data || []).map((r) => r.user_id as string).filter((id) => !founderTest.userIds.has(id))).size;
    }),

    // 3-5. Setup progress, from the same activation_milestones the Funnel tab reads. ALL-TIME on
    // purpose: nine artists is a roster, not a cohort, and windowing it hides the roster.
    tile(async () => {
      const { data, error } = await supabaseAdmin
        .from('artist_profiles')
        .select('id, created_at, setup_completed, activation_milestones');
      if (error) throw error;
      const rows = (data || []).filter((a) => !founderTest.artistIds.has(a.id));
      const ms = (a: (typeof rows)[number]) => (a.activation_milestones || {}) as Record<string, string>;
      return {
        artists: rows.length,
        setupCompleted: rows.filter((a) => ms(a).onboarding_completed).length,
        stripeConnected: rows.filter((a) => ms(a).stripe_connected).length,
        launched: rows.filter((a) => a.setup_completed === true).length,
        createdAt: Object.fromEntries(rows.map((a) => [a.id, a.created_at as string])),
      };
    }),

    // 5. Artists who imported contacts/proven buyers (distinct artists with any fan_contacts row).
    tile(async () => {
      const { data, error } = await supabaseAdmin.from('fan_contacts').select('artist_id');
      if (error) throw error;
      return new Set((data || []).map((r) => r.artist_id as string).filter((id) => !founderTest.artistIds.has(id))).size;
    }),

    // 6. Launch campaigns actually SENT (a draft costs nothing and proves nothing).
    tile(async () => {
      const { data, error } = await supabaseAdmin.from('campaigns').select('artist_id').eq('status', 'sent');
      if (error) throw error;
      return (data || []).filter((r) => !founderTest.artistIds.has(r.artist_id as string)).length;
    }),

    // 8-9. THE metric: first paid conversions (deduped stage covering all six paid rails), plus
    // each artist's timestamp so the median signup->first-paid time derives from real rows.
    tile(async () => {
      const { data, error } = await supabaseAdmin
        .from('funnel_events')
        .select('artist_id, occurred_at')
        .eq('stage', 'first_paid_conversion')
        .not('artist_id', 'is', null);
      if (error) throw error;
      const firstByArtist = new Map<string, string>();
      for (const r of (data || []).filter((x) => !founderTest.artistIds.has(x.artist_id as string))) {
        const prev = firstByArtist.get(r.artist_id as string);
        if (!prev || (r.occurred_at as string) < prev) firstByArtist.set(r.artist_id as string, r.occurred_at as string);
      }
      return firstByArtist;
    }),

    // 11-12. Money, from the one earnings ledger. GMV is what fans paid (gross); CRWN revenue is
    // the platform fee actually taken on it. Windowed: money is a flow, not a roster.
    tile(async () => {
      const { data, error } = await supabaseAdmin
        .from('earnings')
        .select('gross_amount, platform_fee')
        .gte('created_at', since);
      if (error) throw error;
      let gmv = 0;
      let fees = 0;
      for (const r of data || []) {
        gmv += r.gross_amount ?? 0;
        fees += r.platform_fee ?? 0;
      }
      return { gmvCents: gmv, crwnRevenueCents: fees };
    }),

    // 10. Founder labor, from the Money Model work log (manual entries; the only honest source).
    tile(async () => {
      const { data, error } = await supabaseAdmin.from('frl_work_entries').select('minutes');
      if (error) throw error;
      return (data || []).reduce((sum, r) => sum + (r.minutes ?? 0), 0);
    }),
  ]);

  // Median days signup -> first paid, only from artists that actually converted.
  let medianDaysToFirstPaid: number | null = null;
  if (firstPaid && activation) {
    const day = 86_400_000;
    const spans = [...firstPaid.entries()]
      .map(([artistId, paidAt]) => {
        const created = activation.createdAt[artistId];
        return created ? (new Date(paidAt).getTime() - new Date(created).getTime()) / day : null;
      })
      .filter((d): d is number => d !== null && d >= 0)
      .sort((a, b) => a - b);
    if (spans.length > 0) {
      const mid = Math.floor(spans.length / 2);
      medianDaysToFirstPaid =
        Math.round((spans.length % 2 ? spans[mid] : (spans[mid - 1] + spans[mid]) / 2) * 10) / 10;
    }
  }

  return NextResponse.json({
    windowDays: days,
    generatedAt: new Date().toISOString(),
    acquisition: {
      qualifiedLeads,
      signupsFromClaimedResults: signupsFromClaims,
    },
    activation: {
      artists: activation?.artists ?? null,
      setupCompleted: activation?.setupCompleted ?? null,
      stripeConnected: activation?.stripeConnected ?? null,
      contactsImportedArtists,
      launchCampaignsSent,
      launched: activation?.launched ?? null,
      firstPaidConversions: firstPaid ? firstPaid.size : null,
      medianDaysToFirstPaid,
    },
    economics: {
      founderMinutes,
      artistGmvCents: economics?.gmvCents ?? null,
      crwnRevenueCents: economics?.crwnRevenueCents ?? null,
    },
  });
}
