import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordFanEvent, type FanEventType, type FanEventRefKind } from '@/lib/fanEvents';
import { refreshQuests, isQuestEngineEnabled } from '@/lib/quests';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Client-originated engagement events only. Money/attribution signals (subscribe,
// purchase, referral) are DERIVED server-side from authoritative tables and must
// NEVER be accepted from the client — accepting them here would let a fan mint XP.
const ALLOWED: FanEventType[] = ['share', 'like', 'vote', 'live_join', 'comment'];

// POST /api/quests/event — record a low-stakes fan engagement event for the
// signed-in user, then re-evaluate their quests so completions surface immediately.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const eventType = body?.eventType as FanEventType;
  const artistId = body?.artistId as string | undefined;
  if (!eventType || !ALLOWED.includes(eventType)) {
    return NextResponse.json({ error: 'Unsupported event type' }, { status: 400 });
  }
  if (!artistId || typeof artistId !== 'string') {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  // Dark-launch guard: silently no-op when the engine is off.
  if (!(await isQuestEngineEnabled(supabaseAdmin))) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  // Validate the artist scope is real (prevents junk fan_events rows).
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Unknown artist' }, { status: 404 });

  await recordFanEvent(supabaseAdmin, {
    artistId,
    fanId: user.id,
    eventType,
    source: 'quest_intake',
    refKind: (body?.refKind as FanEventRefKind) ?? undefined,
    refId: (body?.refId as string) ?? null,
  });

  const { completions } = await refreshQuests(supabaseAdmin, { userId: user.id, role: 'fan' });
  return NextResponse.json({ ok: true, completions });
}
