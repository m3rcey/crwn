import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  READINESS_QUESTIONS,
  isRoyaltyReadinessEnabled,
  sanitizeAnswers,
  scoreReadiness,
} from '@/lib/royalty/readiness';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// The admin client bypasses RLS and middleware skips /api/, so EVERY handler here
// authenticates explicitly and scopes every query to the caller's own user id.
// These answers describe an artist's private business affairs.

/**
 * GET /api/royalty-readiness — the question set, the caller's saved answers, and
 * the score recomputed from those answers.
 *
 * Shape-stable when the flag is off so the client can render nothing without
 * special-casing, and so the Studio tile can hide itself with one call.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isRoyaltyReadinessEnabled(supabaseAdmin))) {
    return NextResponse.json({ enabled: false, questions: [], answers: {}, result: null, updatedAt: null });
  }

  const { data } = await supabaseAdmin
    .from('royalty_readiness')
    .select('answers, updated_at, completed_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const answers = sanitizeAnswers(data?.answers);
  const hasAnswers = Object.keys(answers).length > 0;

  return NextResponse.json({
    enabled: true,
    questions: READINESS_QUESTIONS,
    answers,
    // Never score an empty check. A brand new artist is not "0% ready", they
    // simply have not answered yet, and a red zero on arrival is a lie.
    result: hasAnswers ? scoreReadiness(answers) : null,
    updatedAt: data?.updated_at ?? null,
    completedAt: data?.completed_at ?? null,
  });
}

/**
 * POST /api/royalty-readiness — save answers, return the recomputed score.
 * Body: { answers: { [questionKey]: 'yes' | 'no' | 'unsure' } }
 *
 * The full answer map is sent every save (there are twelve questions), so this is
 * a replace, not a merge. Unknown keys and invalid values are dropped rather than
 * rejected: a stale client that still posts a retired question should save the
 * rest of the check, not fail the whole write.
 */
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isRoyaltyReadinessEnabled(supabaseAdmin))) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const answers = sanitizeAnswers((body as { answers?: unknown })?.answers);
  if (Object.keys(answers).length === 0) {
    return NextResponse.json({ error: 'No valid answers' }, { status: 400 });
  }

  const result = scoreReadiness(answers);

  const { error } = await supabaseAdmin
    .from('royalty_readiness')
    .upsert(
      {
        user_id: user.id,
        answers,
        score: result.score,
        // "Completed" means every question that applies to them has an answer.
        completed_at: isComplete(answers) ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id' },
    );

  if (error) {
    console.error('[royalty-readiness] save failed:', error.message);
    return NextResponse.json({ error: 'Could not save your answers' }, { status: 500 });
  }

  return NextResponse.json({ enabled: true, answers, result });
}

/**
 * DELETE /api/royalty-readiness — wipe the caller's saved check so they can start
 * clean. Scoped to their own row, always.
 *
 * Exists because re-running the check from scratch was otherwise a database job
 * (someone with service-role access deleting a row), which is not a thing a user
 * or a founder testing the flow should have to ask for.
 */
export async function DELETE() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabaseAdmin.from('royalty_readiness').delete().eq('user_id', user.id);
  if (error) {
    console.error('[royalty-readiness] reset failed:', error.message);
    return NextResponse.json({ error: 'Could not reset your check' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Every question that applies to this artist has an answer. */
function isComplete(answers: Record<string, string>): boolean {
  const writes = answers.writes_music === 'yes' || answers.writes_music === 'unsure';
  return READINESS_QUESTIONS.every((q) => (q.publishingOnly && !writes ? true : !!answers[q.key]));
}
