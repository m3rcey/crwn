import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { welcomeEmail } from '@/lib/emails/welcome';
import { subscriptionEmail } from '@/lib/emails/subscription';
import { artistTierEmail } from '@/lib/emails/artistTier';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { type, displayName, artistName, tierName } = await req.json();

    // Only allow sending to the authenticated user's own email
    const to = user.email;
    if (!to) {
      return NextResponse.json({ error: 'No email on account' }, { status: 400 });
    }

    let subject: string;
    let html: string;

    switch (type) {
      case 'welcome':
        subject = 'Welcome to CRWN 👑';
        html = welcomeEmail(displayName || 'there');
        break;
      case 'subscription':
        subject = `You're subscribed to ${artistName} 🎉`;
        html = subscriptionEmail(displayName || 'there', artistName, tierName);
        break;
      case 'artist_tier':
        subject = `Welcome to ${tierName} on CRWN 👑`;
        html = artistTierEmail(displayName || 'there', tierName);
        break;
      default:
        return NextResponse.json({ error: 'Invalid email type' }, { status: 400 });
    }

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data?.id });
  } catch (err) {
    console.error('Email API error:', err);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
