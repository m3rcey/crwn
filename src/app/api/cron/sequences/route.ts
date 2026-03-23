import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { campaignEmail, resolveTokens } from '@/lib/emails/campaignEmail';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Find all due enrollments
  const { data: dueEnrollments } = await supabaseAdmin
    .from('sequence_enrollments')
    .select('id, sequence_id, fan_id, artist_id, current_step')
    .eq('status', 'active')
    .lte('next_send_at', now);

  if (!dueEnrollments || dueEnrollments.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let sentCount = 0;
  let errorCount = 0;

  for (const enrollment of dueEnrollments) {
    try {
      // Get the current step
      const nextStepNumber = enrollment.current_step + 1;
      const { data: step } = await supabaseAdmin
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', enrollment.sequence_id)
        .eq('step_number', nextStepNumber)
        .single();

      if (!step) {
        // No more steps — mark as completed
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ status: 'completed', completed_at: now })
          .eq('id', enrollment.id);
        continue;
      }

      // Check sequence is still active
      const { data: sequence } = await supabaseAdmin
        .from('sequences')
        .select('is_active')
        .eq('id', enrollment.sequence_id)
        .single();

      if (!sequence?.is_active) {
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ status: 'canceled' })
          .eq('id', enrollment.id);
        continue;
      }

      // Check fan hasn't unsubscribed from email marketing
      const { data: prefs } = await supabaseAdmin
        .from('fan_communication_prefs')
        .select('email_marketing')
        .eq('fan_id', enrollment.fan_id)
        .eq('artist_id', enrollment.artist_id)
        .maybeSingle();

      if (prefs?.email_marketing === false) {
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ status: 'canceled' })
          .eq('id', enrollment.id);
        continue;
      }

      // Get fan data for personalization
      const { data: fanProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name, username')
        .eq('id', enrollment.fan_id)
        .single();

      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(enrollment.fan_id);
      const fanEmail = authUser.user?.email;
      if (!fanEmail) {
        errorCount++;
        continue;
      }

      // Check if email is globally suppressed (hard bounce or spam complaint)
      const { data: isSuppressed } = await supabaseAdmin
        .from('email_suppressions')
        .select('id')
        .eq('email', fanEmail.toLowerCase())
        .maybeSingle();

      if (isSuppressed) {
        // Cancel enrollment — no point continuing a sequence to a dead email
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ status: 'canceled' })
          .eq('id', enrollment.id);
        continue;
      }

      // Get artist name and platform tier
      const { data: artistData } = await supabaseAdmin
        .from('artist_profiles')
        .select('platform_tier, user_id')
        .eq('id', enrollment.artist_id)
        .single();

      const { data: artistProfile } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', artistData?.user_id)
        .single();

      const artistName = artistProfile?.display_name || 'Artist';
      const fanName = fanProfile?.display_name || fanProfile?.username || 'Fan';
      const firstName = fanName.split(' ')[0];

      // Get subscription info
      const { data: sub } = await supabaseAdmin
        .from('subscriptions')
        .select('started_at, tier_id, subscription_tiers(name)')
        .eq('fan_id', enrollment.fan_id)
        .eq('artist_id', enrollment.artist_id)
        .eq('status', 'active')
        .maybeSingle();

      const tierName = (sub as any)?.subscription_tiers?.name || null;
      const daysSubscribed = sub?.started_at
        ? Math.floor((Date.now() - new Date(sub.started_at).getTime()) / 86400000)
        : 0;

      // Resolve tokens
      const personalizedBody = resolveTokens(step.body, {
        first_name: firstName,
        full_name: fanName,
        tier_name: tierName,
        artist_name: artistName,
        sub_date: sub?.started_at
          ? new Date(sub.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : null,
        days_subscribed: String(daysSubscribed),
      });

      const personalizedSubject = resolveTokens(step.subject, {
        first_name: firstName,
        full_name: fanName,
        tier_name: tierName,
        artist_name: artistName,
      });

      // We don't have a campaign_sends record for sequences, so use enrollment ID for unsubscribe
      // Create a dummy send ID approach — use enrollment ID directly
      const unsubscribeUrl = `https://thecrwn.app/api/sequences/unsubscribe/${enrollment.id}`;

      const html = campaignEmail({
        body: personalizedBody,
        artistName,
        sendId: enrollment.id, // No click tracking for sequences
        unsubscribeUrl,
        trackingPixelUrl: '', // No tracking pixel for sequences
        platformTier: artistData?.platform_tier || 'starter',
      });

      const { error: sendError } = await resend.emails.send({
        from: `${artistName} via CRWN <hello@thecrwn.app>`,
        to: fanEmail,
        subject: personalizedSubject,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
        },
      });

      if (sendError) {
        console.error('Sequence email send error:', sendError);
        errorCount++;
        continue;
      }

      // Get next step to calculate next_send_at
      const { data: nextStep } = await supabaseAdmin
        .from('sequence_steps')
        .select('delay_days')
        .eq('sequence_id', enrollment.sequence_id)
        .eq('step_number', nextStepNumber + 1)
        .maybeSingle();

      if (nextStep) {
        // Schedule next step
        const nextSendAt = new Date(Date.now() + nextStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ current_step: nextStepNumber, next_send_at: nextSendAt })
          .eq('id', enrollment.id);
      } else {
        // This was the last step
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ current_step: nextStepNumber, status: 'completed', completed_at: now, next_send_at: null })
          .eq('id', enrollment.id);
      }

      sentCount++;
    } catch (err) {
      console.error('Sequence enrollment processing error:', err);
      errorCount++;
    }
  }

  return NextResponse.json({ processed: dueEnrollments.length, sent: sentCount, errors: errorCount });
}
