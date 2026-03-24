import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { partnerApplicationNotificationEmail } from '@/lib/emails/partnerApplicationNotification';
import { partnerApplicationConfirmationEmail } from '@/lib/emails/partnerApplicationConfirmation';
import { checkRateLimit } from '@/lib/rateLimit';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const allowed = await checkRateLimit(`ip:${ip}`, 'partner-apply', 300, 3);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const body = await request.json();
    const { name, email, platform, audience_size, profile_url, why_crwn } = body;

    // Validate required fields
    if (!name || !email || !platform || !audience_size || !profile_url) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Insert into partner_applications table
    const { error: insertError } = await supabaseAdmin
      .from('partner_applications')
      .insert({
        name,
        email,
        platform,
        audience_size,
        profile_url,
        why_crwn: why_crwn || null,
      });

    if (insertError) {
      console.error('Failed to insert partner application:', insertError);
      return NextResponse.json(
        { error: 'Failed to submit application' },
        { status: 500 }
      );
    }

    // Send notification email to hello@thecrwn.app
    const notificationEmail = partnerApplicationNotificationEmail({
      name,
      email,
      platform,
      audience_size,
      profile_url,
      why_crwn,
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'joshn.wms@gmail.com',
      subject: notificationEmail.subject,
      html: notificationEmail.html,
    });

    // Send confirmation email to applicant
    const firstName = name.split(' ')[0];
    const confirmationEmail = partnerApplicationConfirmationEmail({
      firstName,
    });

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: confirmationEmail.subject,
      html: confirmationEmail.html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Partner application error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
