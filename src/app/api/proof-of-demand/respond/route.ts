import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * Records a fan's demand-signal response (RSVP / vote / waitlist) to a Proof of
 * Demand test. Money-FREE: nothing is ever charged. Responses are written with
 * the service-role client only (no client INSERT policy) so dedupe + the
 * denormalized counters stay authoritative.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allowed = await checkRateLimit(user.id, 'pod-respond', 60, 20);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  let body: { testId?: string; wouldPromote?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const { testId, wouldPromote } = body;
  if (!testId || typeof testId !== 'string') {
    return NextResponse.json({ error: 'Missing testId' }, { status: 400 });
  }

  // Load the test with the admin client (source of truth, RLS-free).
  const { data: test } = await supabaseAdmin
    .from('proof_of_demand')
    .select('id, status, goal_count, test_promoter_interest, deadline')
    .eq('id', testId)
    .maybeSingle();

  if (!test || test.status !== 'active') {
    return NextResponse.json({ error: 'Test not found' }, { status: 404 });
  }

  if (test.deadline && new Date(test.deadline) < new Date()) {
    return NextResponse.json({ error: 'This test has ended' }, { status: 400 });
  }

  const { error: insertError } = await supabaseAdmin
    .from('proof_of_demand_responses')
    .insert({
      test_id: testId,
      fan_id: user.id,
      would_promote: test.test_promoter_interest ? !!wouldPromote : false,
    });

  let already = false;
  if (insertError) {
    // UNIQUE (test_id, fan_id) — already responded; not an error for the fan.
    if (insertError.code === '23505') {
      already = true;
    } else {
      console.error('Proof of demand respond error:', insertError);
      return NextResponse.json({ error: 'Could not save your response' }, { status: 500 });
    }
  }

  // Recompute counts accurately (count(*), not atomic increments — no races).
  const [totalRes, promoterRes] = await Promise.all([
    supabaseAdmin
      .from('proof_of_demand_responses')
      .select('id', { count: 'exact', head: true })
      .eq('test_id', testId),
    supabaseAdmin
      .from('proof_of_demand_responses')
      .select('id', { count: 'exact', head: true })
      .eq('test_id', testId)
      .eq('would_promote', true),
  ]);

  const responseCount = totalRes.count ?? 0;
  const promoterYesCount = promoterRes.count ?? 0;

  // Denormalized counters power the public progress bar. Status stays 'active'
  // even past the goal — the artist decides when to mark it succeeded.
  const { error: updateError } = await supabaseAdmin
    .from('proof_of_demand')
    .update({ response_count: responseCount, promoter_yes_count: promoterYesCount })
    .eq('id', testId);

  if (updateError) {
    console.error('Proof of demand count update error:', updateError);
  }

  return NextResponse.json({
    ok: true,
    ...(already ? { already: true } : {}),
    responseCount,
    goalMet: responseCount >= test.goal_count,
  });
}
