import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

  // Fetch all artists with activation_milestones
  const { data: artists } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, created_at, activation_milestones, pipeline_stage')
    .not('pipeline_stage', 'in', '("churned")');

  if (!artists || artists.length === 0) {
    return NextResponse.json({ checked: 0, enrolled: 0 });
  }

  // Fetch all active activation sequences
  const { data: sequences } = await supabaseAdmin
    .from('platform_sequences')
    .select('id, trigger_type')
    .in('trigger_type', NUDGE_RULES.map(r => r.triggerType))
    .eq('is_active', true);

  if (!sequences || sequences.length === 0) {
    return NextResponse.json({ checked: artists.length, enrolled: 0, reason: 'no active sequences' });
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

      // Check if the missing milestone is truly missing
      if (milestones[rule.missingMilestone]) continue;

      // Determine the anchor date (when the prerequisite was achieved)
      let anchorDate: Date;
      if (rule.requiresMilestone) {
        const prereqTimestamp = milestones[rule.requiresMilestone];
        if (!prereqTimestamp) continue; // Prerequisite not met yet — not stalled, just early
        anchorDate = new Date(prereqTimestamp);
      } else {
        anchorDate = new Date(artist.created_at);
      }

      // Check if enough time has passed
      const daysSinceAnchor = (now.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAnchor < rule.stallDays) continue;

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

  return NextResponse.json({ checked, enrolled });
}
