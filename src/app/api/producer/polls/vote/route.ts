import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { canSubmitToSession, isProducerSessionsEnabled } from '@/lib/producer/access';

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

  // Same access gate as submitting. (Deadline does not apply to live voting, but
  // the session/access/flag checks do; a closed session's poll is already 'closed'.)
  const gate = await canSubmitToSession(supabaseAdmin, poll.session_id, user.id);
  if (!gate.ok && gate.reason !== 'closed' && gate.reason !== 'not_accepting') {
    const status = gate.reason === 'no_access' ? 403 : gate.reason === 'not_found' ? 404 : 409;
    return NextResponse.json({ error: gate.reason }, { status });
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
