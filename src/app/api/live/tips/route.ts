import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isLiveTipsEnabled } from '@/lib/live/tips';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// The tip board for one live session: the dark-launch flag, the goals, the paid
// running total, the recent tip feed and the leaderboard.
//
// Public on purpose, but not equally public to everyone. The goal bar and the tip
// alert are what the stream already shows every viewer, so they stay open: the goal
// has to load for logged-out visitors on the countdown page, and "X tipped $Y" is
// an announcement the tipper chose to make in that moment.
//
// WHAT IS NOT PUBLIC: a per-fan CUMULATIVE total keyed to a raw fan UUID. That is
// lifetime spend, which a fan never agreed to publish. src/lib/leaderboardPrivacy.ts
// settled the same question for the artist-page leaderboard (rank and name ship,
// the money does not) and this route contradicted it. The artist still receives the
// full figures, because an artist needs real payment reporting on their own session.
//
// Nothing pending is exposed: an abandoned checkout must never show up as a tip.
// See schema-phase2-live-tips.sql.
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
  }

  const enabled = await isLiveTipsEnabled(supabaseAdmin);
  if (!enabled) {
    // Shape-stable so the client can render nothing without special-casing.
    return NextResponse.json({ enabled: false, goals: [], totalCents: 0, tips: [], leaderboard: [] });
  }

  const [{ data: goals }, { data: paidTips }] = await Promise.all([
    supabaseAdmin
      .from('live_goals')
      .select('id, session_id, artist_id, title, metric, target_amount, sort_order, reached_at, is_active, created_at, updated_at')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .order('target_amount', { ascending: true }),
    supabaseAdmin
      .from('live_tips')
      .select('id, fan_id, amount, message, is_hidden, paid_at')
      .eq('session_id', sessionId)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false })
      .limit(500),
  ]);

  const tips = paidTips || [];
  // The total counts hidden tips: moderating a message must not claw back money
  // the fan already gave, or the goal bar would move backwards on stream.
  const totalCents = tips.reduce((sum, t) => sum + (t.amount || 0), 0);

  // Resolve names in one query rather than per row.
  const fanIds = Array.from(new Set(tips.map((t) => t.fan_id)));
  const names = new Map<string, string>();
  if (fanIds.length) {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .in('id', fanIds);
    for (const p of profiles || []) names.set(p.id, p.display_name || 'Fan');
  }

  // Is the caller the artist who owns this session? Anonymous callers skip straight
  // past this; the session lookup only runs when somebody is signed in.
  let isOwner = false;
  {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: session } = await supabaseAdmin
        .from('live_sessions')
        .select('artist_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (session?.artist_id) {
        const { data: owned } = await supabaseAdmin
          .from('artist_profiles')
          .select('id')
          .eq('id', session.artist_id)
          .eq('user_id', user.id)
          .maybeSingle();
        isOwner = !!owned;
      }
    }
  }

  const byFan = new Map<string, number>();
  for (const t of tips) byFan.set(t.fan_id, (byFan.get(t.fan_id) || 0) + (t.amount || 0));
  const ranked = Array.from(byFan.entries())
    .map(([fanId, amount]) => ({ fanId, name: names.get(fanId) || 'Fan', amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Ranking is unchanged (the order still comes from the real totals). Only the
  // invertible numbers leave: a non-owner gets rank and name, never `amount` and
  // never `fanId`, so a viewer cannot read off what any named fan has spent or
  // correlate that fan across the platform by id.
  const leaderboard = isOwner
    ? ranked.map((r, i) => ({ rank: i + 1, ...r }))
    : ranked.map((r, i) => ({ rank: i + 1, name: r.name }));

  return NextResponse.json({
    enabled: true,
    goals: goals || [],
    totalCents,
    leaderboard,
    tips: tips.slice(0, 25).map((t) => ({
      id: t.id,
      name: names.get(t.fan_id) || 'Fan',
      amount: t.amount,
      message: t.is_hidden ? null : t.message,
      paidAt: t.paid_at,
    })),
  });
}
