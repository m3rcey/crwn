import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { seedRevenueRamp } from '@/lib/revenueRampSeed';
import { getLeadMagnetSeed } from '@/lib/leadResults/handoffSeed';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/promise-calendar/ramp — lay the 12-month revenue ramp into this artist's
// Promise Calendar on demand.
//
// New artists get this automatically when they finish setup. Every artist who signed up
// BEFORE the ramp existed would otherwise never see it, so this is the door for them, and
// it doubles as the top-up if a step was deleted. Seeding is idempotent per step key.
//
// The admin client bypasses RLS and middleware skips /api, so authorization is explicit
// here: we resolve the artist row FROM the session, never from the request body.
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!artist?.id) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const artistId = String(artist.id);
  const seed = await getLeadMagnetSeed(supabaseAdmin, { userId: user.id, artistId });
  const result = await seedRevenueRamp(supabaseAdmin, {
    artistId,
    targetMonthlyCents: seed?.estimatedMonthlyCents ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: 'Could not lay out the roadmap' }, { status: 500 });
  }
  return NextResponse.json({ seeded: result.seeded, skipped: result.skipped });
}
