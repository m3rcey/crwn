import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getFanCalendar } from '@/lib/calendarProjection';
import { sortCalendarItems } from '@/lib/calendar';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

// GET /api/my-calendar — My CRWN Calendar for the authenticated fan: upcoming
// events/drops/missions/earning windows/renewals from artists they actively
// support, eligibility-filtered in the projection layer.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = sortCalendarItems(await getFanCalendar(supabaseAdmin, user.id));
  return NextResponse.json({ items });
}
