// Admin rollup over opportunity_ledger: revealed / activated / captured / remaining money, grouped
// by the requested dimensions (calculator, artist, feature, month, year). The shape a future
// opportunity dashboard renders.
//
// Server-side admin authorization (the client /admin check is cosmetic). AGGREGATES only. When a
// single ?artistId is requested we recompute that artist first, so a drill-down is always fresh;
// the all-artists view reads what the daily refresh keeps current.
//
// Accuracy notes carried from opportunity.ts: reveals are deduped per feature (max), and the three
// features' captured come from DISJOINT ledgers (artist net subscription / live earnings / referral
// commission), so summing captured across features never double-counts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recomputeArtistOpportunity } from '@/lib/analytics/opportunityLedger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface Bucket {
  revealedCents: number;
  capturedCents: number;
  remainingCents: number;
  activatedCount: number;
  count: number;
}
const zero = (): Bucket => ({ revealedCents: 0, capturedCents: 0, remainingCents: 0, activatedCount: 0, count: 0 });

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const p = req.nextUrl.searchParams;
  const artistId = p.get('artistId');
  const year = p.get('year');
  const month = p.get('month');
  const feature = p.get('feature');
  const calculator = p.get('calculator');

  // A single-artist drill-down is recomputed on read so it is always current.
  if (artistId) {
    await recomputeArtistOpportunity(supabaseAdmin, artistId);
  }

  let query = supabaseAdmin
    .from('opportunity_ledger')
    .select('artist_id, feature, calculator, revealed_cents, captured_cents, remaining_cents, activated, period_month, period_year')
    .limit(100_000);
  if (artistId) query = query.eq('artist_id', artistId);
  if (year) query = query.eq('period_year', Number(year));
  if (month) query = query.eq('period_month', Number(month));
  if (feature) query = query.eq('feature', feature);
  if (calculator) query = query.eq('calculator', calculator);

  const { data, error } = await query;
  if (error) {
    // Pre-migration or transient: an empty rollup, never a 500 to the dashboard.
    return NextResponse.json({ total: zero(), byFeature: {}, byCalculator: {}, byMonth: {}, byYear: {}, byArtist: {} });
  }

  const total = zero();
  const byFeature: Record<string, Bucket> = {};
  const byCalculator: Record<string, Bucket> = {};
  const byMonth: Record<string, Bucket> = {};
  const byYear: Record<string, Bucket> = {};
  const byArtist: Record<string, Bucket> = {};

  const add = (b: Bucket, r: { revealed_cents: number; captured_cents: number; remaining_cents: number; activated: boolean }) => {
    b.revealedCents += Number(r.revealed_cents) || 0;
    b.capturedCents += Number(r.captured_cents) || 0;
    b.remainingCents += Number(r.remaining_cents) || 0;
    b.activatedCount += r.activated ? 1 : 0;
    b.count += 1;
  };
  const into = (bucket: Record<string, Bucket>, key: string, r: Parameters<typeof add>[1]) => {
    add((bucket[key] ??= zero()), r);
  };

  for (const r of data || []) {
    add(total, r);
    into(byFeature, String(r.feature), r);
    into(byCalculator, r.calculator ? String(r.calculator) : 'unknown', r);
    into(byMonth, `${r.period_year}-${String(r.period_month).padStart(2, '0')}`, r);
    into(byYear, String(r.period_year), r);
    into(byArtist, String(r.artist_id), r);
  }

  return NextResponse.json({ total, byFeature, byCalculator, byMonth, byYear, byArtist });
}
