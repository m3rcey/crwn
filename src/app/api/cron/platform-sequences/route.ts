import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { renderPlatformSequenceEmail } from '@/lib/emails/platformSequenceEmail';
import { isEmailSuppressed } from '@/lib/leadMagnets/server';
import { appendUnsubscribeToken, emailRecipient, CRWN_PLATFORM } from '@/lib/emails/unsubscribeToken';
import { artForTrigger } from '@/lib/emails/platformSequenceArt';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

function resolveTokens(text: string, tokens: Record<string, string | null>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return tokens[key] ?? match;
  });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Find all due enrollments
  const { data: dueEnrollments } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .select('id, sequence_id, artist_user_id, current_step')
    .eq('status', 'active')
    .lte('next_send_at', now);

  if (!dueEnrollments || dueEnrollments.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  let sentCount = 0;
  let errorCount = 0;

  for (const enrollment of dueEnrollments) {
    try {
      const nextStepNumber = enrollment.current_step + 1;
      const { data: step } = await supabaseAdmin
        .from('platform_sequence_steps')
        .select('*')
        .eq('sequence_id', enrollment.sequence_id)
        .eq('step_number', nextStepNumber)
        .single();

      if (!step) {
        await supabaseAdmin
          .from('platform_sequence_enrollments')
          .update({ status: 'completed', completed_at: now })
          .eq('id', enrollment.id);
        continue;
      }

      // Check sequence still active
      const { data: sequence } = await supabaseAdmin
        .from('platform_sequences')
        .select('is_active, name, trigger_type')
        .eq('id', enrollment.sequence_id)
        .single();

      if (!sequence?.is_active) {
        await supabaseAdmin
          .from('platform_sequence_enrollments')
          .update({ status: 'canceled' })
          .eq('id', enrollment.id);
        continue;
      }

      // Get artist data
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(enrollment.artist_user_id);
      const artistEmail = authUser.user?.email;
      if (!artistEmail) {
        errorCount++;
        continue;
      }

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', enrollment.artist_user_id)
        .single();

      const { data: artistProfile } = await supabaseAdmin
        .from('artist_profiles')
        .select('slug, platform_tier, stripe_connect_id')
        .eq('user_id', enrollment.artist_user_id)
        .single();

      const displayName = profile?.display_name || 'there';
      const firstName = displayName.split(' ')[0];

      // Resolve tokens
      const tokens: Record<string, string | null> = {
        first_name: firstName,
        full_name: displayName,
        artist_slug: artistProfile?.slug || null,
        platform_tier: artistProfile?.platform_tier || 'starter',
        dashboard_url: 'https://thecrwn.app/profile/artist',
        connect_stripe_url: 'https://thecrwn.app/account/payouts',
        upgrade_url: 'https://thecrwn.app/account/billing',
      };

      // GLOBAL SUPPRESSION. This gate did not exist: an artist who unsubscribed anywhere else on
      // the platform, or who hard-bounced, kept receiving these. Checked per send rather than at
      // enrollment, because an unsubscribe can land mid-sequence.
      if (await isEmailSuppressed(supabaseAdmin, artistEmail)) {
        await supabaseAdmin
          .from('platform_sequence_enrollments')
          .update({ status: 'canceled' })
          .eq('id', enrollment.id);
        continue;
      }

      // Signed one-click unsubscribe. The signature covers the recipient, so a token for one artist
      // cannot unsubscribe another. Four of the nine sequences sell an upgrade, so this is
      // commercial email and the link is required, not optional.
      const unsubScope = {
        kind: 'platform-sequence' as const,
        id: String(enrollment.id),
        artistId: CRWN_PLATFORM,
        recipient: emailRecipient(artistEmail),
      };
      const unsubscribeUrl = appendUnsubscribeToken(
        `https://thecrwn.app/api/platform-sequences/unsubscribe/${enrollment.id}`,
        unsubScope,
      );

      // ONE renderer, shared with `npm run preview:platform-emails`, so a preview can never show
      // something different from what an artist receives. It also escapes: `first_name` comes from
      // the artist's own display name, and this template used to interpolate it raw.
      const { subject, html, text } = renderPlatformSequenceEmail(
        step.subject,
        step.body,
        tokens,
        unsubscribeUrl,
        // Banner resolved from the sequence, not the step: a sequence is one argument escalating
        // across its steps, so three steps share one picture rather than needing three.
        artForTrigger(sequence.trigger_type),
      );

      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: artistEmail,
        subject,
        html,
        // Multipart. HTML-only is a deliverability cost for no reason when the source copy is
        // already plain text.
        text,
        // RFC 8058 one-click, the same contract the prospect nurture sends use.
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      if (sendError) {
        console.error('Platform sequence email error:', sendError);
        errorCount++;
        continue;
      }

      // Schedule next step or complete
      const { data: nextStep } = await supabaseAdmin
        .from('platform_sequence_steps')
        .select('delay_days')
        .eq('sequence_id', enrollment.sequence_id)
        .eq('step_number', nextStepNumber + 1)
        .maybeSingle();

      if (nextStep) {
        const nextSendAt = new Date(Date.now() + nextStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
        await supabaseAdmin
          .from('platform_sequence_enrollments')
          .update({ current_step: nextStepNumber, next_send_at: nextSendAt })
          .eq('id', enrollment.id);
      } else {
        await supabaseAdmin
          .from('platform_sequence_enrollments')
          .update({ current_step: nextStepNumber, status: 'completed', completed_at: now, next_send_at: null })
          .eq('id', enrollment.id);
      }

      sentCount++;
    } catch (err) {
      console.error('Platform sequence error:', err);
      errorCount++;
    }
  }

  return NextResponse.json({ processed: dueEnrollments.length, sent: sentCount, errors: errorCount });
}
