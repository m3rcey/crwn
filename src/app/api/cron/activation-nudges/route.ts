import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { reconcileAllActivationMilestones } from '@/lib/milestoneReconcile';
import { ACTIVATION_GAPS, shouldEnrollForGap, type ArtistEmailFacts } from '@/lib/lifecycle/artistEmailGate';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// The activation chain (music, a paid tier, payouts, the first paid fan) is defined ONCE, in
// `lifecycle/artistEmailGate.ts`, and read by this cron AND by the send cron. Enrolling on the
// same rule the sender re-checks is what stops an email describing a gap that is not the artist's
// current one (2026-10-02: a Stripe nudge kept going after Stripe connected, and a "you've
// uploaded music" email reached artists with no music).

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
    .in('trigger_type', ACTIVATION_GAPS.map(g => g.triggerType))
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

  // Which artists have a PAID tier live. The free Bronze rung the wizard always creates never
  // closes the paid-tier gap. One read for every artist. A failed read leaves the set empty, which
  // only ever holds back the later emails (Stripe, first fan): it can never send one early.
  const { data: paidTierRows } = await supabaseAdmin
    .from('subscription_tiers')
    .select('artist_id')
    .eq('is_active', true)
    .gt('price', 0);
  const hasPaidTier = new Set((paidTierRows || []).map((t: { artist_id: string }) => t.artist_id));

  for (const artist of artists) {
    checked++;
    const facts: ArtistEmailFacts = {
      milestones: (artist.activation_milestones || {}) as Record<string, string>,
      hasPaidTier: hasPaidTier.has(artist.id),
      // Enrollment never sells a plan, so the plan facts are not needed here.
      platformTier: null,
      gmv30dCents: null,
    };

    for (const rule of ACTIVATION_GAPS) {
      const sequenceId = sequenceMap.get(rule.triggerType);
      if (!sequenceId) continue;

      // Check if already enrolled
      if (enrolledSet.has(`${sequenceId}:${artist.user_id}`)) continue;

      // One shared, tested rule (artistEmailGate.ts): this gap is the artist's CURRENT one, it has
      // been current for at least stallDays, and the stall is inside the freshness window. The
      // window is what keeps reconciled history from becoming a fresh email (Decision D).
      if (!shouldEnrollForGap(rule, facts, now)) continue;

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
