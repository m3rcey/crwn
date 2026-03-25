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

/**
 * Record an activation milestone timestamp for an artist.
 * Idempotent — only writes if the milestone hasn't been recorded yet.
 * Uses admin client to bypass RLS.
 */
export async function recordActivationMilestone(
  artistProfileId: string,
  milestone: ActivationMilestone
) {
  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('activation_milestones')
    .eq('id', artistProfileId)
    .single();

  const milestones = (data?.activation_milestones || {}) as Record<string, string>;
  if (milestones[milestone]) return; // Already recorded

  milestones[milestone] = new Date().toISOString();

  await supabaseAdmin
    .from('artist_profiles')
    .update({ activation_milestones: milestones })
    .eq('id', artistProfileId);
}
