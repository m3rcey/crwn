import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { completeQuest, isQuestEngineEnabled } from '@/lib/quests';
import type { QuestInstance } from '@/lib/quests/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/quests/complete — mark a MANUAL (coaching) quest done.
//
// SECURITY: this is the ONLY client-initiated completion path, and it will complete
// a quest ONLY when its completion_condition.kind === 'manual'. Any quest whose
// condition is 'domain' or 'fan_event' (every financial, supporter, subscription,
// Stripe, catalog, or entitlement milestone) is REFUSED here and can only be
// completed by the server-side evaluator from authoritative state. The instance is
// also ownership-checked (user_id === the authenticated caller). XP is granted
// idempotently by completeQuest (xp_ledger), so repeat calls award nothing.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await isQuestEngineEnabled(supabaseAdmin))) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  let questId: string | null = null;
  try {
    const body = await req.json();
    questId = body?.questId ?? null;
  } catch {
    /* ignore */
  }
  if (!questId) return NextResponse.json({ error: 'Missing questId' }, { status: 400 });

  const { data: instance } = await supabaseAdmin
    .from('quest_instances')
    .select('*')
    .eq('id', questId)
    .maybeSingle();

  if (!instance) return NextResponse.json({ error: 'Quest not found' }, { status: 404 });

  // Ownership: the caller must own this instance.
  if (instance.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // HARD GUARD: only manual coaching quests may be client-completed.
  const kind = instance.completion_condition?.kind;
  if (kind !== 'manual') {
    return NextResponse.json(
      { error: 'This quest completes automatically from your account activity, not manually.' },
      { status: 422 },
    );
  }

  const result = await completeQuest(supabaseAdmin, instance as QuestInstance);
  return NextResponse.json({ ok: true, result });
}
