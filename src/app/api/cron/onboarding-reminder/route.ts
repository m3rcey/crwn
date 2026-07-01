import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { onboardingReminderEmail } from '@/lib/emails/onboardingReminder';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Wait this long after signup before nudging, so people who finish naturally
// aren't emailed. Also cap how far back we look, so this never surprises an old cohort.
const MIN_AGE_HOURS = 24;
const MAX_AGE_DAYS = 30;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const olderThan = new Date(now - MIN_AGE_HOURS * 60 * 60 * 1000).toISOString();
  const newerThan = new Date(now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Signups that never finished /welcome (onboarding_completed still false),
  // aged past the grace window, not yet nudged, and not admins.
  const { data: candidates, error } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, created_at, role')
    .or('onboarding_completed.is.false,onboarding_completed.is.null')
    .is('onboarding_nudge_sent_at', null)
    .lt('created_at', olderThan)
    .gt('created_at', newerThan)
    .neq('role', 'admin')
    .limit(100);

  if (error) {
    console.error('onboarding-reminder query error:', error.message);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;

  for (const p of candidates || []) {
    // Email lives on auth.users, not profiles.
    let email: string | null = null;
    try {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(p.id);
      email = u?.user?.email || null;
    } catch {
      email = null;
    }

    // Skip missing emails and synthetic canary/test accounts.
    if (!email || /canary/i.test(email) || email.includes('+test')) {
      skipped++;
      continue;
    }

    const msg = onboardingReminderEmail({ name: p.display_name });
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: email, subject: msg.subject, html: msg.html });
    } catch (e) {
      console.error(`onboarding-reminder send failed for ${p.id}:`, e);
      skipped++;
      continue;
    }

    // Stamp send-once so the next daily run skips them.
    await supabaseAdmin
      .from('profiles')
      .update({ onboarding_nudge_sent_at: new Date().toISOString() })
      .eq('id', p.id);
    sent++;
  }

  return NextResponse.json({ checked: candidates?.length || 0, sent, skipped });
}
