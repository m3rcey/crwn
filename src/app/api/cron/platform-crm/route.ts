import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const INACTIVE_DAYS = 14;

type PipelineStage = 'signed_up' | 'onboarding' | 'free' | 'paid' | 'at_risk' | 'churned';

// Pipeline stage → sequence trigger mapping
const STAGE_TRIGGERS: Record<PipelineStage, string | null> = {
  signed_up: 'new_signup',
  onboarding: 'onboarding_incomplete',
  free: 'starter_upgrade_nudge',
  paid: null, // no auto-sequence for healthy paid artists
  at_risk: 'paid_at_risk',
  churned: 'paid_churned',
};

function computeLeadScore(artist: {
  has_stripe: boolean;
  track_count: number;
  subscriber_count: number;
  total_revenue: number;
  days_since_active: number;
  community_posts: number;
  days_on_platform: number;
  is_paid: boolean;
}): number {
  let score = 0;

  // Profile completeness
  score += 10; // has artist profile (base)
  if (artist.has_stripe) score += 20;

  // Content
  score += Math.min(artist.track_count * 5, 50); // cap at 50

  // Traction
  score += Math.min(artist.subscriber_count * 10, 100); // cap at 100
  score += Math.min(Math.floor(artist.total_revenue / 1000), 100); // $10 = 1pt, cap 100

  // Engagement
  score += Math.min(artist.community_posts * 3, 30); // cap at 30
  if (artist.days_since_active <= 3) score += 30;
  else if (artist.days_since_active <= 7) score += 20;
  else if (artist.days_since_active <= 14) score += 10;
  // else 0 — inactive

  // Tenure
  score += Math.min(Math.floor(artist.days_on_platform / 7), 20); // 1pt per week, cap 20

  // Paid tier bonus
  if (artist.is_paid) score += 25;

  return score;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString();
  let updated = 0;
  let enrolled = 0;

  // Get all artist profiles with their user data
  const { data: artists } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, slug, stripe_connect_id, platform_tier, platform_subscription_status, pipeline_stage, created_at');

  if (!artists || artists.length === 0) {
    return NextResponse.json({ updated: 0, enrolled: 0 });
  }

  // Batch fetch supporting data
  const artistIds = artists.map(a => a.id);
  const userIds = artists.map(a => a.user_id);

  // Track counts per artist
  const { data: trackCounts } = await supabaseAdmin
    .from('tracks')
    .select('artist_id')
    .in('artist_id', artistIds)
    .eq('is_active', true);

  const trackCountMap: Record<string, number> = {};
  (trackCounts || []).forEach(t => {
    trackCountMap[t.artist_id] = (trackCountMap[t.artist_id] || 0) + 1;
  });

  // Subscriber counts per artist
  const { data: subCounts } = await supabaseAdmin
    .from('subscriptions')
    .select('artist_id')
    .in('artist_id', artistIds)
    .eq('status', 'active');

  const subCountMap: Record<string, number> = {};
  (subCounts || []).forEach(s => {
    subCountMap[s.artist_id] = (subCountMap[s.artist_id] || 0) + 1;
  });

  // Revenue per artist
  const { data: earnings } = await supabaseAdmin
    .from('earnings')
    .select('artist_id, net_amount')
    .in('artist_id', artistIds);

  const revenueMap: Record<string, number> = {};
  (earnings || []).forEach(e => {
    revenueMap[e.artist_id] = (revenueMap[e.artist_id] || 0) + (e.net_amount || 0);
  });

  // Community posts per user
  const { data: posts } = await supabaseAdmin
    .from('community_posts')
    .select('author_id')
    .in('author_id', userIds)
    .eq('is_active', true);

  const postCountMap: Record<string, number> = {};
  (posts || []).forEach(p => {
    postCountMap[p.author_id] = (postCountMap[p.author_id] || 0) + 1;
  });

  // Last active per user
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, last_active_at')
    .in('id', userIds);

  const lastActiveMap: Record<string, string | null> = {};
  (profiles || []).forEach(p => {
    lastActiveMap[p.id] = p.last_active_at;
  });

  // Process each artist
  for (const artist of artists) {
    const hasStripe = !!artist.stripe_connect_id;
    const isPaid = artist.platform_tier && artist.platform_tier !== 'starter';
    const isCanceled = artist.platform_subscription_status === 'canceled';
    const lastActive = lastActiveMap[artist.user_id];
    const daysSinceActive = lastActive
      ? Math.floor((now.getTime() - new Date(lastActive).getTime()) / 86400000)
      : 999;
    const daysOnPlatform = Math.floor((now.getTime() - new Date(artist.created_at).getTime()) / 86400000);

    // Compute pipeline stage
    let newStage: PipelineStage;
    if (isCanceled && isPaid) {
      newStage = 'churned';
    } else if (isPaid && daysSinceActive >= INACTIVE_DAYS) {
      newStage = 'at_risk';
    } else if (isPaid) {
      newStage = 'paid';
    } else if (hasStripe) {
      newStage = 'free';
    } else if (artist.slug) {
      newStage = 'onboarding';
    } else {
      newStage = 'signed_up';
    }

    // Compute lead score
    const leadScore = computeLeadScore({
      has_stripe: hasStripe,
      track_count: trackCountMap[artist.id] || 0,
      subscriber_count: subCountMap[artist.id] || 0,
      total_revenue: revenueMap[artist.id] || 0,
      days_since_active: daysSinceActive,
      community_posts: postCountMap[artist.user_id] || 0,
      days_on_platform: daysOnPlatform,
      is_paid: !!isPaid,
    });

    // Update artist profile
    const stageChanged = artist.pipeline_stage !== newStage;
    await supabaseAdmin
      .from('artist_profiles')
      .update({
        pipeline_stage: newStage,
        platform_lead_score: leadScore,
        platform_lead_score_updated_at: now.toISOString(),
      })
      .eq('id', artist.id);

    updated++;

    // Auto-enroll in sequence if stage changed and there's a matching trigger
    if (stageChanged) {
      const triggerType = STAGE_TRIGGERS[newStage];
      if (triggerType) {
        try {
          const { data: sequence } = await supabaseAdmin
            .from('platform_sequences')
            .select('id')
            .eq('trigger_type', triggerType)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (sequence) {
            // Check not already enrolled
            const { data: existing } = await supabaseAdmin
              .from('platform_sequence_enrollments')
              .select('id')
              .eq('sequence_id', sequence.id)
              .eq('artist_user_id', artist.user_id)
              .in('status', ['active', 'completed'])
              .maybeSingle();

            if (!existing) {
              const { data: firstStep } = await supabaseAdmin
                .from('platform_sequence_steps')
                .select('delay_days')
                .eq('sequence_id', sequence.id)
                .eq('step_number', 1)
                .single();

              if (firstStep) {
                const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
                await supabaseAdmin.from('platform_sequence_enrollments').insert({
                  sequence_id: sequence.id,
                  artist_user_id: artist.user_id,
                  current_step: 0,
                  status: 'active',
                  next_send_at: nextSendAt,
                });
                enrolled++;
              }
            }
          }
        } catch (err) {
          console.error(`Platform sequence enrollment failed for ${artist.id}:`, err);
        }
      }
    }
  }

  return NextResponse.json({ updated, enrolled });
}
