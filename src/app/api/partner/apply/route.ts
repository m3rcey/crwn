import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { partnerApplicationNotificationEmail } from '@/lib/emails/partnerApplicationNotification';
import { partnerApplicationConfirmationEmail } from '@/lib/emails/partnerApplicationConfirmation';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
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
