import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getArtistCalendar } from '@/lib/calendarProjection';
import { sortCalendarItems } from '@/lib/calendar';

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

  const items = sortCalendarItems(await getArtistCalendar(supabaseAdmin, artist.id));
  return NextResponse.json({ items });
}
