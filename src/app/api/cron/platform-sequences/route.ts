import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';

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
        .select('is_active, name')
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
        connect_stripe_url: 'https://thecrwn.app/profile/artist?tab=payouts',
        upgrade_url: 'https://thecrwn.app/profile/artist?tab=billing',
      };

      const personalizedSubject = resolveTokens(step.subject, tokens);
      const personalizedBody = resolveTokens(step.body, tokens);

      // Build simple HTML email
      const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0D0D0D;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="color:#D4AF37;font-size:24px;font-weight:bold;letter-spacing:2px;">CRWN</span>
    </div>
    <div style="color:#E0E0E0;font-size:15px;line-height:1.7;">
      ${personalizedBody.split('\n').map(line => line.trim() ? `<p style="margin:0 0 16px;">${line}</p>` : '').join('')}
    </div>
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #2A2A2A;text-align:center;">
      <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;font-size:12px;">CRWN</a>
      <span style="color:#555;font-size:12px;margin:0 8px;">|</span>
      <span style="color:#555;font-size:12px;">Music Monetization Platform</span>
    </div>
  </div>
</body>
</html>`;

      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: artistEmail,
        subject: personalizedSubject,
        html,
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
