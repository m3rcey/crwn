// Claim a result. THE security-critical route in this feature.
//
// Identity comes from the SESSION COOKIE. It is never read from the request body. A body
// that carries a `userId` is ignored entirely, because accepting one would mean anyone with
// a result link could claim it into anyone else's account by typing their id.
//
// Middleware excludes /api/, so this route authenticates itself, right here, first thing.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { claimResult } from '@/lib/leadResults/resultAccess';
import { resolveDestination, getDestination } from '@/lib/quests/destinationRegistry';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  // ---- The whole ballgame: a verified Supabase session, or nothing. ----
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // The client redirects to /signup?next=/claim/<token> and comes back. We do not leak
    // whether the token is even valid to an unauthenticated caller.
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const allowed = await checkRateLimit(user.id, 'lead-claim', 3600, 20);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const outcome = await claimResult(token, user.id);

  if (!outcome.ok) {
    // 'invalid' and 'already_claimed' return the SAME shape and the same status. An attacker
    // holding a guessed token learns nothing about whether it exists or who owns it.
    return NextResponse.json(
      { error: 'This link cannot be claimed.' },
      { status: 400 },
    );
  }

  // Resolve a DESTINATION ID to a route. Claude never picks a URL; it picks an id from an
  // allowlist, and this is where that id becomes a path.
  const dest = getDestination(outcome.destinationId);
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('setup_completed')
    .eq('user_id', user.id)
    .maybeSingle();

  const route = resolveDestination({
    destinationId: dest?.id ?? 'setup',
    isArtist: !!artist,
    // Rise Mode is dark-launched. We do NOT enable it here; if the flag is off the registry
    // falls back to the dashboard.
    questEngineEnabled: false,
    setupComplete: artist?.setup_completed === true,
  });

  return NextResponse.json({ ok: true, redirect: route });
}
