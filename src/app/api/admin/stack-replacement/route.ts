// GET /api/admin/stack-replacement?artistId=... — the Stack Replacement audit for one artist.
//
// ADMIN ONLY (`requireAdmin`). This returns another person's commercial position: which platforms
// they run on, what they say they spend, and what they earn directly. It is operator delivery
// material for the First Revenue Launch audit call, not artist-facing, and it is deliberately not
// exposed on any artist route.
//
// READ ONLY. It computes nothing new and stores nothing: the arithmetic is `stackReplacement.ts`
// (pure, versioned `stackReplacement@1`) and the facts are seeded from the artist's OWN Fan Stack
// Calculator answers, so CRWN keeps one model of the stack rather than two.
//
// It cannot cancel, modify or even see an external subscription. Nothing here touches Patreon,
// Stripe, Shopify or any other account the artist holds elsewhere.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { buildStackReplacementReport, renderStackReplacementReport } from '@/lib/stackReplacement';
import { stackSeedFromCalculator } from '@/lib/stackReplacementSource';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const FAN_STACK_TOOL = 'fan-stack-calculator';

export async function GET(req: NextRequest) {
  // requireAdmin resolves the caller from their SESSION and returns null for anyone who is not an
  // admin. There is no way to pass an identity in: the only client-supplied value is which artist
  // to audit, and that is checked against a real row below.
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ error: 'artistId required' }, { status: 400 });

  try {
    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, user_id, slug')
      .eq('id', artistId)
      .maybeSingle();
    if (!artist) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

    // The artist's own Fan Stack Calculator answers, newest first. Claimed results are bound to the
    // account at signup, so this is their declaration, not a guess made on their behalf.
    const { data: rows } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('input_data, created_at')
      .eq('tool_slug', FAN_STACK_TOOL)
      .or(`artist_id.eq.${artistId},user_id.eq.${artist.user_id}`)
      .order('created_at', { ascending: false })
      .limit(1);

    const source = rows?.[0] ?? null;
    const seed = stackSeedFromCalculator((source?.input_data ?? null) as Record<string, unknown> | null);

    // No calculator answers means no audit. Say so rather than rendering a confident empty report.
    if (!seed.usable) {
      return NextResponse.json({
        available: false,
        reason: 'This artist has not completed the Fan Stack Calculator, so CRWN has no declared stack to audit.',
        limitations: seed.limitations,
        evidence: seed.evidence,
      });
    }

    const report = buildStackReplacementReport(seed.input);
    return NextResponse.json({
      available: true,
      answeredAt: source?.created_at ?? null,
      report,
      text: renderStackReplacementReport(seed.input, artist.slug),
      unallocatedToolSpendCents: seed.unallocatedToolSpendCents,
      evidence: seed.evidence,
      limitations: seed.limitations,
    });
  } catch (err) {
    console.error('stack replacement audit failed:', err);
    return NextResponse.json({ error: 'Could not build the report' }, { status: 500 });
  }
}
