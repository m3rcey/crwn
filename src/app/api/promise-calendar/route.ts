import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getArtistCalendar } from '@/lib/calendarProjection';
import { sortCalendarItems } from '@/lib/calendar';
import { loadRevenueRamp, currentMrrCents } from '@/lib/revenueRampSeed';
import { phaseAt, computeRampProgress } from '@/lib/revenueRamp';
import { reconcileRampSteps } from '@/lib/rampReconcile';

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

  // Ramp steps the artist already did through the real features (the wizard
  // builds the ladder, connects Stripe, schedules promises) complete themselves
  // before projection, so the calendar never nags about finished work.
  await reconcileRampSteps(supabaseAdmin, { artistId: artist.id, userId: user.id });

  // The ramp rides along so the calendar can show WHAT the dated steps are adding up to.
  // A task list without the number it is building is just chores.
  const [items, ramp, mrr] = await Promise.all([
    getArtistCalendar(supabaseAdmin, artist.id).then(sortCalendarItems),
    loadRevenueRamp(supabaseAdmin, artist.id),
    currentMrrCents(supabaseAdmin, artist.id),
  ]);

  // Progress reads the roadmap items already projected above: no second trip for state we hold.
  const progress = ramp
    ? computeRampProgress(ramp, {
        currentMrrCents: mrr,
        steps: items
          .filter((i) => i.type === 'roadmap' && typeof i.meta?.rampStepKey === 'string')
          .map((i) => ({
            key: String(i.meta!.rampStepKey),
            status: i.status as 'completed' | 'missed' | 'overdue' | 'today' | 'upcoming',
            dueAt: i.dueAt,
          })),
      })
    : null;

  return NextResponse.json({
    items,
    ramp: ramp
      ? {
          targetMonthlyCents: ramp.targetMonthlyCents,
          startedAt: ramp.startedAt,
          acceleratedDays: ramp.acceleratedDays,
          totalDays: ramp.totalDays,
          phases: ramp.phases,
          currentPhaseKey: progress?.currentPhaseKey ?? phaseAt(ramp)?.key ?? null,
        }
      : null,
    progress,
  });
}
