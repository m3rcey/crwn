import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';
import { recordFunnelEvent } from '@/lib/analytics/funnelEvents';
import { seedRevenueRamp } from '@/lib/revenueRampSeed';

// Marks the artist's setup wizard as finished (artist_profiles.setup_completed).
// This is the ONE write the wizard makes to artist_profiles, and it gates the
// whole app: (main)/layout.tsx bounces any artist with setup_completed === false
// back into /setup. Doing it client-side was silently failing for some artists
// (the first and only artist_profiles UPDATE in the flow), which set local state
// true, navigated to the dashboard, and then got bounced straight back to the
// wizard. Writing it with the service-role client removes RLS from the equation
// so the flag always persists. Auth is enforced explicitly below — the admin
// client bypasses RLS, and middleware skips /api routes.
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Only flip the caller's own artist row. select() confirms a row actually
  // matched — if the user has no artist_profiles row, data is empty and we say so
  // instead of reporting a false success.
  const { data, error } = await supabaseAdmin
    .from('artist_profiles')
    .update({ setup_completed: true })
    .eq('user_id', user.id)
    .select('id');

  if (error) {
    return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'No artist profile found' }, { status: 404 });
  }

  // Funnel: Setup Completed. Once per artist (dedup on artist id), tagged with the calculator they
  // came in on so activation can be measured per acquisition source.
  const artistId = String(data[0].id);
  const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id, artistId });
  await recordFunnelEvent(supabaseAdmin, {
    stage: 'setup_completed',
    artistId,
    userId: user.id,
    calculator: seed?.toolSlug ?? null,
    dedupeKey: artistId,
  });

  // Lay the 12-month revenue ramp into their Promise Calendar, aimed at the number THEY
  // calculated. The calculator hands an artist a steady-state figure and says nothing about
  // when, so without this the plan for reaching it lives only in their head. Idempotent and
  // best-effort by design: this route gates the whole app, so a seeding failure must never
  // stop an artist from getting in.
  const ramp = await seedRevenueRamp(supabaseAdmin, {
    artistId,
    targetMonthlyCents: seed?.estimatedMonthlyCents ?? null,
  });
  if (!ramp.ok) console.error('[ramp] seed failed for artist', artistId);

  return NextResponse.json({ success: true });
}
