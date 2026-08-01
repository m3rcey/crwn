// GET /api/artist/strategy — the artist's membership strategy, derived on read.
// POST — save (or clear) the artist's explicit override.
//
// Mirrors /api/artist/roadmap: facts come from the real database, the pick is
// the deterministic brain in src/lib/membershipStrategy.ts, and nothing derived
// is stored. The only persistence is the artist's override, which fails soft
// while its migration (schema-phase2-membership-strategy.sql) has not run.
//
// Middleware skips /api/, so this route authenticates itself; ownership comes
// from the session, never a query param.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  MEMBERSHIP_STRATEGIES,
  isMembershipStrategyKey,
  recommendStrategy,
  type StrategyFacts,
} from '@/lib/membershipStrategy';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function missingColumn(err: { code?: string } | null): boolean {
  return err?.code === '42703';
}

async function requireArtist(userId: string) {
  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, slug, platform_tier')
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artist = await requireArtist(user.id);
  if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

  // Facts, all observed. Declared facts (unreleased count, release cadence) are
  // not collected anywhere yet, so they stay null and the brain treats them as
  // unknown; when a builder asks those questions, they flow in here.
  const [{ count: trackCount }, { count: liveCount }] = await Promise.all([
    supabaseAdmin
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artist.id)
      .not('is_active', 'is', false),
    supabaseAdmin
      .from('live_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artist.id)
      .eq('status', 'ended'),
  ]);

  let projected: number | null = null;
  try {
    const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id, artistId: artist.id });
    projected = seed?.estimatedMonthlyCents ?? null;
  } catch {
    // The strategy stands without a calculator seed.
  }

  const facts: StrategyFacts = {
    catalogTracks: trackCount ?? 0,
    hasRunLiveSession: (liveCount ?? 0) > 0,
    projectedMonthlyGmvCents: projected,
  };
  const recommendation = recommendStrategy(facts);

  // The artist's override, if its column exists yet.
  let override: string | null = null;
  const { data: row, error } = await supabaseAdmin
    .from('artist_profiles')
    .select('membership_strategy')
    .eq('id', artist.id)
    .maybeSingle();
  if (!error) override = (row?.membership_strategy as string | null) ?? null;
  else if (!missingColumn(error)) console.error('[strategy] override read failed:', error);

  const active = isMembershipStrategyKey(override) ? override : recommendation.strategy;

  return NextResponse.json({
    recommendation,
    override: isMembershipStrategyKey(override) ? override : null,
    active,
    strategy: MEMBERSHIP_STRATEGIES[active],
    facts,
    // Which monthly promise applies (spec section 4 scales it by platform plan).
    platformPlan: (artist as { platform_tier?: string | null }).platform_tier || 'starter',
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artist = await requireArtist(user.id);
  if (!artist) return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });

  let body: { strategy?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // null clears the override (back to the recommendation); otherwise it must be
  // a real strategy key.
  const value = body.strategy === null ? null : body.strategy;
  if (value !== null && !isMembershipStrategyKey(value)) {
    return NextResponse.json({ error: 'Unknown strategy' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ membership_strategy: value })
    .eq('id', artist.id);

  if (missingColumn(error)) {
    return NextResponse.json(
      { error: 'Strategy choice cannot be saved yet (migration pending). The recommendation still applies.' },
      { status: 503 },
    );
  }
  if (error) {
    console.error('[strategy] override write failed:', error);
    return NextResponse.json({ error: 'Could not save your choice' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, override: value });
}
