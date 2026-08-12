import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isProducerSessionsEnabled, ownsSession } from '@/lib/producer/access';
import { hasPaidLiveTicket, hasTierAccess } from '@/lib/live/access';
import type { PollOption } from '@/types/producer';

// In-session polls. ADVISORY: a poll never binds the artist, it is a temperature
// check they can ignore, which is what keeps "full creative control" true.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * May this user READ this session's polls? Free session, an allowed tier, or a paid ticket, which
 * is the same entitlement the watch gate and the submission gate resolve through src/lib/live/access.
 *
 * Deliberately NOT canSubmitToSession: that helper answers "may they submit", and it returns
 * 'not_accepting' / 'closed' BEFORE it evaluates access. A caller that tolerates those reasons (so
 * results stay readable once the submission window shuts, which polls need) would skip the access
 * check entirely on exactly the sessions where submissions are closed. Reading is not submitting,
 * so it gets the access rule and nothing else.
 */
async function canReadSessionPolls(sessionId: string, userId: string): Promise<'ok' | 'not_found' | 'no_access'> {
  const { data: session } = await supabaseAdmin
    .from('live_sessions')
    .select('id, artist_id, is_active, is_free, allowed_tier_ids')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session || !session.is_active) return 'not_found';
  if (session.is_free) return 'ok';

  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('tier_id')
    .eq('fan_id', userId)
    .eq('artist_id', session.artist_id)
    .eq('status', 'active')
    .maybeSingle();
  if (hasTierAccess(session.allowed_tier_ids, sub?.tier_id || null)) return 'ok';
  if (await hasPaidLiveTicket(supabaseAdmin, session.id, userId)) return 'ok';
  return 'no_access';
}

// GET /api/producer/polls?sessionId=...  → polls + aggregate tallies + my vote.
//
// READING A POLL IS AN ENTITLED ACT. This used to call auth.getUser() only to mark `myVote`, with
// no 401 and no access check, so anyone could read the questions, the options, the artist_id and
// the full tallies of a PAID or tier-restricted Executive Producer Session by passing its id. The
// poll IS the session's private creative direction. It now needs a session, and either the artist
// who owns it or a fan who can actually get in.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  if (!(await isProducerSessionsEnabled(supabaseAdmin))) {
    return NextResponse.json({ enabled: false, polls: [] });
  }

  // The owner always reads their own session; everyone else clears the entitlement resolver.
  const owner = await ownsSession(supabaseAdmin, sessionId, user.id);
  if (!owner) {
    const access = await canReadSessionPolls(sessionId, user.id);
    if (access !== 'ok') {
      // 404 for a session that does not exist or is inactive, so this endpoint cannot be used to
      // confirm that a private session id is real.
      return NextResponse.json({ error: access }, { status: access === 'no_access' ? 403 : 404 });
    }
  }

  // Scoped to this session's polls only, so a poll id from another session is unreachable here.
  const { data: polls } = await supabaseAdmin
    .from('session_polls')
    .select('id, session_id, artist_id, question, options, status, created_at, closed_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  const pollIds = (polls || []).map((p) => p.id);
  const tallyByPoll: Record<string, Record<string, number>> = {};
  const myVoteByPoll: Record<string, string | null> = {};

  if (pollIds.length) {
    const { data: votes } = await supabaseAdmin
      .from('session_poll_votes')
      .select('poll_id, option_id, fan_id')
      .in('poll_id', pollIds);
    for (const v of votes || []) {
      (tallyByPoll[v.poll_id] ||= {});
      tallyByPoll[v.poll_id][v.option_id] = (tallyByPoll[v.poll_id][v.option_id] || 0) + 1;
      if (user && v.fan_id === user.id) myVoteByPoll[v.poll_id] = v.option_id;
    }
  }

  const enriched = (polls || []).map((p) => {
    const tally = tallyByPoll[p.id] || {};
    return {
      ...p,
      tally,
      totalVotes: Object.values(tally).reduce((s, n) => s + n, 0),
      myVote: myVoteByPoll[p.id] || null,
    };
  });

  return NextResponse.json({ enabled: true, polls: enriched });
}

// POST /api/producer/polls  → create a poll (owner only).
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isProducerSessionsEnabled(supabaseAdmin))) {
    return NextResponse.json({ error: 'disabled' }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const { sessionId } = body;
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 200) : '';
  const rawOptions = Array.isArray(body.options) ? body.options : [];
  if (!sessionId || !question || rawOptions.length < 2) {
    return NextResponse.json({ error: 'Need a question and at least two options' }, { status: 400 });
  }

  const owner = await ownsSession(supabaseAdmin, sessionId, user.id);
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Stable option ids (a, b, c…) so a vote survives a label edit.
  const options: PollOption[] = rawOptions.slice(0, 8).map((o: unknown, i: number) => ({
    id: String.fromCharCode(97 + i),
    label: String(o).trim().slice(0, 120),
  }));

  const { data, error } = await supabaseAdmin
    .from('session_polls')
    .insert({ session_id: sessionId, artist_id: owner.artistId, question, options, status: 'open' })
    .select('id, session_id, artist_id, question, options, status, created_at, closed_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ poll: { ...data, tally: {}, totalVotes: 0, myVote: null } });
}

// PATCH /api/producer/polls  → close a poll (owner only).
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { pollId } = await req.json().catch(() => ({}));
  if (!pollId) return NextResponse.json({ error: 'Missing pollId' }, { status: 400 });

  const { data: poll } = await supabaseAdmin
    .from('session_polls')
    .select('id, session_id')
    .eq('id', pollId)
    .maybeSingle();
  if (!poll) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const owner = await ownsSession(supabaseAdmin, poll.session_id, user.id);
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await supabaseAdmin
    .from('session_polls')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', pollId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
