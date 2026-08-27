// Song Lab vote — the one write path for fan votes. Server-authorized end to end:
// session identity, rate limit, gate on the DECISION'S artist (never a client artist id),
// open-window check, option validation, and tier eligibility re-derived from the
// subscriptions table. Upsert on UNIQUE(decision_id, fan_id): a re-vote CHANGES the
// choice, it never double-counts (same semantics as Executive Producer polls).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { isSongLabEnabled } from '@/lib/songLab/access';
import { recordLabVote } from '@/lib/songLab/server';
import { checkVote, tally, type DecisionOption, type SongLabDecisionCore } from '@/lib/songLab/core';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DENIAL_MESSAGES: Record<string, { message: string; status: number }> = {
  not_open: { message: 'This vote is not open right now', status: 409 },
  invalid_option: { message: 'That option does not exist', status: 400 },
  not_eligible: { message: 'This vote is for members. Join free to take part.', status: 403 },
  owner: { message: 'This is your own poll. Your fans decide this one, and you pick the winner when it closes.', status: 403 },
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const allowed = await checkRateLimit(user.id, 'song-lab-vote', 60, 30);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const decisionId = typeof body.decisionId === 'string' ? body.decisionId : '';
    const optionId = typeof body.optionId === 'string' ? body.optionId : '';
    if (!decisionId || !optionId) {
      return NextResponse.json({ error: 'Missing decisionId or optionId' }, { status: 400 });
    }

    const { data: decision } = await supabaseAdmin
      .from('song_lab_decisions')
      .select('id, artist_id, project_id, options, status, is_free, allowed_tier_ids, opens_at, closes_at, winning_option_id')
      .eq('id', decisionId)
      .maybeSingle();
    // 404 for missing AND for a non-enabled artist's decision: no enumeration signal.
    if (!decision) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!(await isSongLabEnabled(supabaseAdmin, decision.artist_id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // The fan's active tier for THIS artist, server-derived. Never from the request.
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('tier_id')
      .eq('fan_id', user.id)
      .eq('artist_id', decision.artist_id)
      .eq('status', 'active')
      .maybeSingle();

    // Does this caller OWN the artist whose poll this is? Session-derived, never from the
    // body. An artist voting in their own poll would inflate the very tally they weigh
    // when picking a winner.
    const { data: ownerRow } = await supabaseAdmin
      .from('artist_profiles')
      .select('id')
      .eq('id', decision.artist_id)
      .eq('user_id', user.id)
      .maybeSingle();

    const verdict = checkVote({
      decision: decision as unknown as SongLabDecisionCore,
      now: new Date(),
      optionId,
      fanTierId: sub?.tier_id ?? null,
      isOwner: !!ownerRow,
    });
    if (!verdict.ok) {
      const d = DENIAL_MESSAGES[verdict.reason];
      return NextResponse.json({ error: d.message, reason: verdict.reason }, { status: d.status });
    }

    // Shared writer: vote upsert + the idempotent Day One A&R badge (recognition only).
    const recorded = await recordLabVote(supabaseAdmin, decision, user.id, optionId);
    if (!recorded) {
      return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
    }

    const { data: votes } = await supabaseAdmin
      .from('song_lab_votes')
      .select('option_id')
      .eq('decision_id', decision.id);
    const t = tally((decision.options || []) as DecisionOption[], votes || []);

    return NextResponse.json({ success: true, myVote: optionId, totalVotes: t.total });
  } catch (err) {
    console.error('[song-lab] vote route error:', err);
    return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
  }
}
