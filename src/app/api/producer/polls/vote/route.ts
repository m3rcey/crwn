import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { canSubmitToSession, ownsSession, isProducerSessionsEnabled } from '@/lib/producer/access';
import { hasTierAccess, hasPaidLiveTicket } from '@/lib/live/access';

// A fan casts one vote in an open poll. Access is the SAME gate as submitting: you
// must be able to get into the session (free, allowed tier, or paid ticket). One
// vote per fan per poll (DB unique constraint); re-voting updates the choice.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isProducerSessionsEnabled(supabaseAdmin))) {
    return NextResponse.json({ error: 'disabled' }, { status: 409 });
  }

  const { pollId, optionId } = await req.json().catch(() => ({}));
  if (!pollId || !optionId) return NextResponse.json({ error: 'Missing pollId or optionId' }, { status: 400 });

  const limited = !(await checkRateLimit(user.id, 'producer-vote', 60, 30));
  if (limited) return NextResponse.json({ error: 'Slow down' }, { status: 429 });

  const { data: poll } = await supabaseAdmin
    .from('session_polls')
    .select('id, session_id, options, status')
    .eq('id', pollId)
    .maybeSingle();
  if (!poll) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (poll.status !== 'open') return NextResponse.json({ error: 'closed' }, { status: 409 });

  const optionIds: string[] = Array.isArray(poll.options) ? poll.options.map((o: { id: string }) => o.id) : [];
  if (!optionIds.includes(optionId)) return NextResponse.json({ error: 'Invalid option' }, { status: 400 });

  // Access gate for live voting. A deadline or a closed submission window must not
  // block a vote, but ACCESS still has to hold.
  //
  // SECURITY: tolerating a reason is not the same as tolerating a stage of the
  // check. canSubmitToSession returns `not_accepting` at
  // src/lib/producer/access.ts:69, BEFORE it evaluates is_free / tier / ticket at
  // :78-91. So the old `gate.reason !== 'not_accepting'` tolerance meant that on any
  // session with accepts_submissions = false the access check was never reached,
  // and any signed-in user could vote in a PAID or tier-restricted session. The
  // same shape does not apply to `closed`, which is returned at :75 after the
  // session is resolved but still before access, so it is tolerated only alongside
  // the explicit access re-check below.
  const gate = await canSubmitToSession(supabaseAdmin, poll.session_id, user.id);
  if (!gate.ok && gate.reason !== 'closed' && gate.reason !== 'not_accepting') {
    const status = gate.reason === 'no_access' ? 403 : gate.reason === 'not_found' ? 404 : 409;
    return NextResponse.json({ error: gate.reason }, { status });
  }

  // Re-derive ACCESS independently for the two tolerated reasons, so a tolerated
  // window state can never double as a tolerated access state. The owner always
  // passes; everyone else needs the session to be free, or their tier, or a ticket.
  if (!gate.ok) {
    const owner = await ownsSession(supabaseAdmin, poll.session_id, user.id);
    if (!owner) {
      const { data: s } = await supabaseAdmin
        .from('producer_sessions')
        .select('id, is_active, is_free, allowed_tier_ids, artist_id')
        .eq('id', poll.session_id)
        .maybeSingle();
      if (!s || !s.is_active) return NextResponse.json({ error: 'not_found' }, { status: 404 });

      let allowed = !!s.is_free;
      if (!allowed) {
        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('tier_id')
          .eq('fan_id', user.id)
          .eq('artist_id', s.artist_id)
          .eq('status', 'active')
          .maybeSingle();
        allowed =
          hasTierAccess(s.allowed_tier_ids, sub?.tier_id || null) ||
          (await hasPaidLiveTicket(supabaseAdmin, s.id, user.id));
      }
      if (!allowed) return NextResponse.json({ error: 'no_access' }, { status: 403 });
    }
  }

  const { error } = await supabaseAdmin
    .from('session_poll_votes')
    .upsert(
      { poll_id: pollId, session_id: poll.session_id, fan_id: user.id, option_id: optionId },
      { onConflict: 'poll_id,fan_id' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, myVote: optionId });
}
