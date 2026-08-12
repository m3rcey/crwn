import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { reconcileAllActivationMilestones, shouldEnrollForRule } from '@/lib/milestoneReconcile';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface NudgeRule {
  triggerType: string;
  /** Milestone that must exist before this nudge applies */
  requiresMilestone: string | null;
  /** Milestone that must NOT exist (this is the stall) */
  missingMilestone: string;
  /** Days after requiresMilestone (or signup if null) before nudging */
  stallDays: number;
}

const NUDGE_RULES: NudgeRule[] = [
  {
    triggerType: 'activation_no_track',
    requiresMilestone: 'onboarding_completed',
    missingMilestone: 'first_track_uploaded',
    stallDays: 3,
  },
  {
    triggerType: 'activation_no_tiers',
    requiresMilestone: 'first_track_uploaded',
    missingMilestone: 'tiers_created',
    stallDays: 2,
  },
  {
    triggerType: 'activation_no_stripe',
    requiresMilestone: 'tiers_created',
    missingMilestone: 'stripe_connected',
    stallDays: 1,
  },
  {
    triggerType: 'activation_no_subscribers',
    requiresMilestone: 'stripe_connected',
    missingMilestone: 'first_subscriber',
    stallDays: 7,
  },
];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  let enrolled = 0;
  let checked = 0;

  // F-04: reconcile milestone TRUTH from canonical rows BEFORE evaluating nudge rules.
  // The milestones used to be browser fire-and-forget writes; one lost write silenced the
  // whole prerequisite chain forever. Reconciliation is idempotent, uses historical evidence
  // timestamps, and the freshness window inside shouldEnrollForRule keeps backfilled truth
  // from firing archaeology emails (Decision D: truth reconciliation is not communication
  // eligibility). Fail-soft: a reconcile error must never stop the nudge pass.
  let reconciled: { artistsChecked: number; artistsUpdated: number } = { artistsChecked: 0, artistsUpdated: 0 };
  try {
    reconciled = await reconcileAllActivationMilestones(supabaseAdmin);
  } catch (err) {
    console.error('[activation-nudges] milestone reconciliation failed:', err);
  }

  // Fetch all artists with activation_milestones (fresh, post-reconciliation)
  const { data: artists } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, created_at, activation_milestones, pipeline_stage')
    .not('pipeline_stage', 'in', '("churned")');

  if (!artists || artists.length === 0) {
    return NextResponse.json({ checked: 0, enrolled: 0, reconciled });
  }

  // Fetch all active activation sequences
  const { data: sequences } = await supabaseAdmin
    .from('platform_sequences')
    .select('id, trigger_type')
    .in('trigger_type', NUDGE_RULES.map(r => r.triggerType))
    .eq('is_active', true);

  if (!sequences || sequences.length === 0) {
    return NextResponse.json({ checked: artists.length, enrolled: 0, reconciled, reason: 'no active sequences' });
  }

  const sequenceMap = new Map(sequences.map(s => [s.trigger_type, s.id]));

  // Fetch existing enrollments to avoid duplicates (batch)
  const sequenceIds = sequences.map(s => s.id);
  const { data: existingEnrollments } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .select('sequence_id, artist_user_id')
    .in('sequence_id', sequenceIds)
    .in('status', ['active', 'completed']);

  const enrolledSet = new Set(
    (existingEnrollments || []).map(e => `${e.sequence_id}:${e.artist_user_id}`)
  );

  for (const artist of artists) {
    checked++;
    const milestones = (artist.activation_milestones || {}) as Record<string, string>;

    for (const rule of NUDGE_RULES) {
      const sequenceId = sequenceMap.get(rule.triggerType);
      if (!sequenceId) continue;

      // Check if already enrolled
      if (enrolledSet.has(`${sequenceId}:${artist.user_id}`)) continue;

      // One shared, tested rule evaluation (milestoneReconcile.ts): prerequisite present,
      // target missing, stalled >= stallDays AND within the freshness window. The window is
      // what makes reconciliation backfill safe — a six-month-old stall is recorded truth,
      // never a fresh lifecycle event (Decision D).
      if (!shouldEnrollForRule(rule, milestones, artist.created_at, now)) continue;

      // Enroll in the sequence
      try {
        const { data: firstStep } = await supabaseAdmin
          .from('platform_sequence_steps')
          .select('delay_days')
          .eq('sequence_id', sequenceId)
          .eq('step_number', 1)
          .single();

        if (!firstStep) continue;

        const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();

        await supabaseAdmin.from('platform_sequence_enrollments').insert({
          sequence_id: sequenceId,
          artist_user_id: artist.user_id,
          current_step: 0,
          status: 'active',
          next_send_at: nextSendAt,
        });

        enrolledSet.add(`${sequenceId}:${artist.user_id}`);
        enrolled++;
      } catch (err) {
        console.error(`Activation nudge enrollment failed for ${artist.id}:`, err);
      }
    }
  }

  return NextResponse.json({ checked, enrolled, reconciled });
}
