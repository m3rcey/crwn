// The funnel beacon: the server side of the client-only funnel moments.
//
// A few stages are pure UI actions with no natural server route (Setup Started, Builder Published).
// The client posts them here and THIS route records them, so the event store stays server-side.
// Identity (user, artist) is derived from the SESSION, never the body, so a forged body cannot
// attribute an event to someone else. Dedup is by the client-supplied key, collapsed at the DB.
//
// Middleware excludes /api/, so this route authenticates itself.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordFunnelEvent, isFunnelStage } from '@/lib/analytics/funnelEvents';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  let body: {
    stage?: string;
    calculator?: string;
    campaign?: string;
    referrer?: string;
    resultId?: string;
    anonId?: string;
    dedupeKey?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!isFunnelStage(body.stage)) {
    return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
  }

  // Identity from the session, not the body.
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const allowed = await checkRateLimit(user.id, 'funnel-track', 3600, 120);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  await recordFunnelEvent(supabaseAdmin, {
    stage: body.stage,
    calculator: body.calculator ?? null,
    campaign: body.campaign ?? null,
    referrer: body.referrer ?? null,
    artistId: (artist?.id as string) ?? null,
    userId: user.id,
    resultId: body.resultId ?? null,
    anonId: body.anonId ?? null,
    // Default to once-per-user for this stage when the client sends no explicit key (e.g. Setup
    // Started). A stage that can legitimately repeat (Builder Published) sends its own key.
    dedupeKey: body.dedupeKey ?? user.id,
    metadata: body.metadata,
  });

  return NextResponse.json({ ok: true });
}
