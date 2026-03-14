import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { welcomeEmail } from '@/lib/emails/welcome';
import { subscriptionEmail } from '@/lib/emails/subscription';

export async function POST(req: NextRequest) {
  try {
    const { type, to, displayName, artistName, tierName } = await req.json();

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
