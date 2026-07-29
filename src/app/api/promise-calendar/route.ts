import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getArtistCalendar } from '@/lib/calendarProjection';
import { sortCalendarItems } from '@/lib/calendar';
import { loadRevenueRamp } from '@/lib/revenueRampSeed';
import { phaseAt } from '@/lib/revenueRamp';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// GET /api/promise-calendar — the authenticated artist's Promise Calendar:
// their fulfillment tasks + all their own deadline-bearing growth items, projected.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();
  if (!artist?.id) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  // The ramp rides along so the calendar can show WHAT the dated steps are adding up to.
  // A task list without the number it is building is just chores.
  const [items, ramp] = await Promise.all([
    getArtistCalendar(supabaseAdmin, artist.id).then(sortCalendarItems),
    loadRevenueRamp(supabaseAdmin, artist.id),
  ]);

  const currentPhase = ramp ? phaseAt(ramp) : null;
  return NextResponse.json({
    items,
    ramp: ramp
      ? {
          targetMonthlyCents: ramp.targetMonthlyCents,
          startedAt: ramp.startedAt,
          acceleratedDays: ramp.acceleratedDays,
          totalDays: ramp.totalDays,
          phases: ramp.phases,
          currentPhaseKey: currentPhase?.key ?? null,
        }
      : null,
  });
}
