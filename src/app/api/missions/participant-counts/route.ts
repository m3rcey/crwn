import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Aggregate participant counts for a set of missions. Public and read-only:
 * RLS on mission_participants (rightly) hides other fans' rows from the
 * browser client, so the public "N fans joined" number is served here via the
 * service role. Only anonymous counts leave this route — never fan ids.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids') || '';
  const ids = [
    ...new Set(idsParam.split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s))),
  ].slice(0, 50);

  if (ids.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  const { data, error } = await supabaseAdmin
    .from('mission_participants')
    .select('mission_id')
    .in('mission_id', ids);

  if (error) {
    console.error('Mission participant counts error:', error);
    return NextResponse.json({ error: 'Could not load counts' }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = 0;
  for (const row of (data as { mission_id: string }[]) || []) {
    counts[row.mission_id] = (counts[row.mission_id] ?? 0) + 1;
  }

  return NextResponse.json({ counts });
}
