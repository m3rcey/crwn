import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';

export async function POST(request: NextRequest) {
  try {
    const { name, email, category, message } = await request.json();

    if (!name || !email || !category || !message) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Send to support inbox
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'support@thecrwn.app',
      replyTo: email,
      subject: `[${category}] Support request from ${name}`,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #1A1A1A; border-radius: 12px; padding: 32px; color: #ffffff;">
          <h2 style="color: #D4AF37; margin-top: 0;">New Support Request</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #A0A0A0; vertical-align: top; width: 100px;">Name</td>
              <td style="padding: 8px 0; color: #ffffff;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A0A0A0; vertical-align: top;">Email</td>
              <td style="padding: 8px 0; color: #ffffff;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A0A0A0; vertical-align: top;">Category</td>
              <td style="padding: 8px 0; color: #ffffff;">${category}</td>
            </tr>
          </table>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;">
            <p style="color: #A0A0A0; margin: 0 0 8px;">Message</p>
            <p style="color: #ffffff; white-space: pre-wrap; margin: 0;">${message}</p>
          </div>
        </div>
      `,
    });

    // Send confirmation to the user
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'We received your support request — CRWN',
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #1A1A1A; border-radius: 12px; padding: 32px; color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #D4AF37; font-size: 24px; margin: 0;">CRWN</h1>
          </div>
          <p style="color: #ffffff;">Hi ${name},</p>
          <p style="color: #A0A0A0; line-height: 1.6;">We've received your support request and will get back to you as soon as possible, typically within 24–48 hours.</p>
          <div style="background: #242424; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="color: #A0A0A0; margin: 0 0 4px; font-size: 13px;">Your message</p>
            <p style="color: #ffffff; margin: 0; white-space: pre-wrap;">${message}</p>
          </div>
          <p style="color: #A0A0A0; line-height: 1.6;">If you need to add anything, just reply to this email.</p>
          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #333; text-align: center;">
            <p style="color: #666; font-size: 12px; margin: 0;">JNW Creative Enterprises, Inc. © 2026</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Support form error:', error);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
