import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSurveyToken } from '@/lib/surveyTokens';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Detect inactive subscribers (no activity in 14 days) and enroll in re-engagement sequences
const INACTIVE_DAYS = 14;
const LOYALTY_SURVEY_MIN_DAYS = 90; // Only survey fans subscribed 90+ days

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 86400000).toISOString();
  let enrolled = 0;

  // Find all artists who have an active inactive_subscriber sequence
  const { data: sequences } = await supabaseAdmin
    .from('sequences')
    .select('id, artist_id')
    .eq('trigger_type', 'inactive_subscriber')
    .eq('is_active', true);

  if (!sequences || sequences.length === 0) {
    return NextResponse.json({ enrolled: 0, message: 'No active inactive_subscriber sequences' });
  }

  for (const sequence of sequences) {
    try {
      // Get all active subscribers for this artist
      const { data: subs } = await supabaseAdmin
        .from('subscriptions')
        .select('fan_id')
        .eq('artist_id', sequence.artist_id)
        .eq('status', 'active');

      if (!subs || subs.length === 0) continue;

      // Get artist's track IDs
      const { data: tracks } = await supabaseAdmin
        .from('tracks')
        .select('id')
        .eq('artist_id', sequence.artist_id)
        .eq('is_active', true);
      const trackIds = (tracks || []).map(t => t.id);

      for (const sub of subs) {
        // Check if already enrolled in this sequence
        const { data: existing } = await supabaseAdmin
          .from('sequence_enrollments')
          .select('id')
          .eq('sequence_id', sequence.id)
          .eq('fan_id', sub.fan_id)
          .in('status', ['active', 'completed'])
          .maybeSingle();

        if (existing) continue;

        // Check for recent activity: plays, comments, likes
        let hasRecentActivity = false;

        if (trackIds.length > 0) {
          const { count: playCount } = await supabaseAdmin
            .from('play_history')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', sub.fan_id)
            .in('track_id', trackIds)
            .gte('played_at', cutoff);

          if ((playCount || 0) > 0) {
            hasRecentActivity = true;
          }
        }

        if (!hasRecentActivity) {
          // Check community activity
          const { data: posts } = await supabaseAdmin
            .from('community_posts')
            .select('id')
            .eq('artist_id', sequence.artist_id)
            .eq('is_active', true);
          const postIds = (posts || []).map(p => p.id);

          if (postIds.length > 0) {
            const { count: commentCount } = await supabaseAdmin
              .from('community_comments')
              .select('id', { count: 'exact', head: true })
              .eq('author_id', sub.fan_id)
              .in('post_id', postIds)
              .gte('created_at', cutoff);

            if ((commentCount || 0) > 0) {
              hasRecentActivity = true;
            }
          }
        }

        if (hasRecentActivity) continue;

        // This subscriber is inactive — enroll them
        const { data: firstStep } = await supabaseAdmin
          .from('sequence_steps')
          .select('delay_days')
          .eq('sequence_id', sequence.id)
          .eq('step_number', 1)
          .single();

        if (firstStep) {
          const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin.from('sequence_enrollments').insert({
            sequence_id: sequence.id,
            fan_id: sub.fan_id,
            artist_id: sequence.artist_id,
            current_step: 0,
            status: 'active',
            next_send_at: nextSendAt,
          });
          enrolled++;
        }
      }
    } catch (err) {
      console.error(`Inactive subscriber check failed for artist ${sequence.artist_id}:`, err);
    }
  }

  // ---- LOYALTY SURVEY ENROLLMENT ----
  // Find artists with active loyalty_survey sequences, then identify long-tenured active fans
  let loyaltyEnrolled = 0;

  const { data: loyaltySequences } = await supabaseAdmin
    .from('sequences')
    .select('id, artist_id')
    .eq('trigger_type', 'loyalty_survey')
    .eq('is_active', true);

  if (loyaltySequences && loyaltySequences.length > 0) {
    const loyaltyCutoff = new Date(Date.now() - LOYALTY_SURVEY_MIN_DAYS * 86400000).toISOString();

    for (const sequence of loyaltySequences) {
      try {
        // Find fans subscribed for 90+ days and still active
        const { data: longTermSubs } = await supabaseAdmin
          .from('subscriptions')
          .select('fan_id, created_at')
          .eq('artist_id', sequence.artist_id)
          .eq('status', 'active')
          .lte('created_at', loyaltyCutoff);

        if (!longTermSubs || longTermSubs.length === 0) continue;

        for (const sub of longTermSubs) {
          // Check if already enrolled in this sequence
          const { data: existing } = await supabaseAdmin
            .from('sequence_enrollments')
            .select('id')
            .eq('sequence_id', sequence.id)
            .eq('fan_id', sub.fan_id)
            .in('status', ['active', 'completed'])
            .maybeSingle();

          if (existing) continue;

          // Check if already submitted a survey for this artist
          const { data: surveyed } = await supabaseAdmin
            .from('survey_responses')
            .select('id')
            .eq('respondent_id', sub.fan_id)
            .eq('artist_id', sequence.artist_id)
            .eq('survey_type', 'loyalty_fan')
            .maybeSingle();

          if (surveyed) continue;

          // Enroll them
          const { data: firstStep } = await supabaseAdmin
            .from('sequence_steps')
            .select('delay_days')
            .eq('sequence_id', sequence.id)
            .eq('step_number', 1)
            .single();

          if (firstStep) {
            const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
            await supabaseAdmin.from('sequence_enrollments').insert({
              sequence_id: sequence.id,
              fan_id: sub.fan_id,
              artist_id: sequence.artist_id,
              current_step: 0,
              status: 'active',
              next_send_at: nextSendAt,
            });
            loyaltyEnrolled++;
          }
        }
      } catch (err) {
        console.error(`Loyalty survey check failed for artist ${sequence.artist_id}:`, err);
      }
    }
  }

  return NextResponse.json({ enrolled, loyaltyEnrolled });
}
