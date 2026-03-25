import { createClient } from '@supabase/supabase-js';

export type ActivationMilestone =
  | 'onboarding_completed'
  | 'first_track_uploaded'
  | 'tiers_created'
  | 'stripe_connected'
  | 'first_subscriber';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Milestone → which nudge sequence trigger it resolves
const MILESTONE_CANCELS_TRIGGER: Partial<Record<ActivationMilestone, string>> = {
  first_track_uploaded: 'activation_no_track',
  tiers_created: 'activation_no_tiers',
  first_subscriber: 'activation_no_subscribers',
};

/**
 * Record an activation milestone timestamp for an artist.
 * Idempotent — only writes if the milestone hasn't been recorded yet.
 * Auto-cancels the corresponding nudge sequence if one is active.
 * Uses admin client to bypass RLS.
 */
export async function recordActivationMilestone(
  artistProfileId: string,
  milestone: ActivationMilestone
) {
  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('activation_milestones, user_id')
    .eq('id', artistProfileId)
    .single();

  if (!data) return;

  const milestones = (data.activation_milestones || {}) as Record<string, string>;
  if (milestones[milestone]) return; // Already recorded

  milestones[milestone] = new Date().toISOString();

  await supabaseAdmin
    .from('artist_profiles')
    .update({ activation_milestones: milestones })
    .eq('id', artistProfileId);

  // Auto-cancel the corresponding nudge sequence so stale emails don't send
  const triggerType = MILESTONE_CANCELS_TRIGGER[milestone];
  if (triggerType && data.user_id) {
    try {
      const { data: sequence } = await supabaseAdmin
        .from('platform_sequences')
        .select('id')
        .eq('trigger_type', triggerType)
        .maybeSingle();

      if (sequence) {
        await supabaseAdmin
          .from('platform_sequence_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('sequence_id', sequence.id)
          .eq('artist_user_id', data.user_id)
          .eq('status', 'active');
      }
    } catch {
      // Silent fail — cancellation is best-effort
    }
  }
}
