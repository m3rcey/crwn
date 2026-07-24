import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { ownsSession } from '@/lib/producer/access';
import type { SubmissionStatus } from '@/types/producer';

// Per-session numbers for one Executive Producer Session. Owner-only. Everything
// here is DERIVED from existing rows (no new tracking): ticket revenue from
// live_ticket_purchases, tips from live_tips, attendance from
// live_session_participants, submissions from session_submissions, poll
// engagement from session_polls/votes. Money is integer cents; net = gross - fee,
// consistent with the rest of the platform. Replay views are intentionally absent
// (nothing tracks them; a fake number would be worse than none).

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });

  const owner = await ownsSession(supabaseAdmin, sessionId, user.id);
  if (!owner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [tickets, tips, participants, submissions, polls] = await Promise.all([
    supabaseAdmin.from('live_ticket_purchases').select('amount, platform_fee').eq('session_id', sessionId).eq('status', 'paid'),
    supabaseAdmin.from('live_tips').select('amount, platform_fee').eq('session_id', sessionId).eq('status', 'paid'),
    supabaseAdmin.from('live_session_participants').select('user_id, left_at, role').eq('session_id', sessionId).eq('role', 'viewer'),
    supabaseAdmin.from('session_submissions').select('status').eq('session_id', sessionId),
    supabaseAdmin.from('session_polls').select('id').eq('session_id', sessionId),
  ]);

  const sumCents = (rows: { amount: number; platform_fee: number }[] | null) => {
    const gross = (rows || []).reduce((s, r) => s + (r.amount || 0), 0);
    const fee = (rows || []).reduce((s, r) => s + (r.platform_fee || 0), 0);
    return { count: (rows || []).length, grossCents: gross, feeCents: fee, netCents: gross - fee };
  };

  const ticketAgg = sumCents(tickets.data as { amount: number; platform_fee: number }[] | null);
  const tipAgg = sumCents(tips.data as { amount: number; platform_fee: number }[] | null);

  // Attendance: unique viewers who ever joined, plus those still connected.
  const viewerRows = participants.data || [];
  const uniqueViewers = new Set(viewerRows.map((r) => r.user_id)).size;
  const activeNow = viewerRows.filter((r) => r.left_at === null).length;

  // Submissions by status.
  const byStatus: Record<SubmissionStatus, number> = {
    pending: 0, shortlisted: 0, featured: 0, rejected: 0, archived: 0,
  };
  for (const s of submissions.data || []) {
    const k = s.status as SubmissionStatus;
    if (k in byStatus) byStatus[k] += 1;
  }
  const submissionTotal = (submissions.data || []).length;

  // Poll engagement: total votes across this session's polls.
  const pollIds = (polls.data || []).map((p) => p.id);
  let pollVotes = 0;
  if (pollIds.length) {
    const { count } = await supabaseAdmin
      .from('session_poll_votes')
      .select('id', { count: 'exact', head: true })
      .in('poll_id', pollIds);
    pollVotes = count ?? 0;
  }

  return NextResponse.json({
    tickets: ticketAgg,
    tips: tipAgg,
    totalNetCents: ticketAgg.netCents + tipAgg.netCents,
    attendance: { uniqueViewers, activeNow },
    submissions: { total: submissionTotal, byStatus },
    polls: { count: pollIds.length, votes: pollVotes },
  });
}
