import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Public "Proof of Movement" aggregates for the artist page Movement tab.
 *
 * SAFE BY DESIGN: this route returns ONLY anonymous aggregates —
 * two counts and a city name. No revenue, no fan ids, no names, no
 * per-row data ever leaves this route. Public on purpose (the artist
 * page itself is public), so there is no auth gate.
 */
export async function GET(request: NextRequest) {
  const artistId = request.nextUrl.searchParams.get('artistId');
  if (!artistId || artistId.trim() === '') {
    return NextResponse.json({ error: 'artistId is required' }, { status: 400 });
  }

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [supportersRes, newWeekRes, cityRes] = await Promise.all([
    // Active supporters — count only, no rows returned (head: true).
    supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('status', 'active'),
    // New active supporters in the last 7 days — count only.
    supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .gte('created_at', weekAgo),
    // Top city — we read ONLY the fan_city column (recent 500 rows to bound
    // the scan), tally it server-side, and return just the winning name.
    supabaseAdmin
      .from('earnings')
      .select('fan_city')
      .eq('artist_id', artistId)
      .not('fan_city', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  const tally: Record<string, number> = {};
  for (const row of ((cityRes.data as { fan_city: string | null }[] | null) || [])) {
    if (!row.fan_city) continue;
    tally[row.fan_city] = (tally[row.fan_city] || 0) + 1;
  }
  let topCity: string | null = null;
  let best = 0;
  for (const [city, n] of Object.entries(tally)) {
    if (n > best) {
      best = n;
      topCity = city;
    }
  }

  return NextResponse.json({
    supporters: supportersRes.count ?? 0,
    newThisWeek: newWeekRes.count ?? 0,
    topCity,
  });
}
