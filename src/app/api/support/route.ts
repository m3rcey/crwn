import { NextRequest, NextResponse } from 'next/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { checkRateLimit } from '@/lib/rateLimit';
// The repo's one exported HTML escaper. Pure, dependency-free, unit-tested.
import { escapeHtml } from '@/lib/prospectNurture/render';

// PUBLIC endpoint (no auth): anyone stuck must be able to reach support, including a
// visitor who cannot log in. That capability is preserved. What is NOT preserved is
// the ability to use it as a mailer:
//
// 1. Every value that reaches an HTML body is escaped, so a support request can no
//    longer inject markup into the founder's inbox.
// 2. The confirmation sent to the submitter carries NO submitter-authored content.
//    That address is unverified and attacker-chosen, so any attacker text inside it
//    would be phishing delivered from CRWN's own SPF/DKIM-aligned domain.
// 3. The recipient address must be a single plausible address (no commas, semicolons,
//    angle brackets or control characters), so it cannot become a multi-recipient or
//    header-injection vector.
// 4. Rate limited per IP and per email address.

// Both submitters (the /support form and the bug-report widget) send one of these.
// Anything else is filed as General rather than rejected: losing a real support
// request is worse than losing a label.
const CATEGORIES = ['General', 'Billing', 'Artist Account', 'Bug Report'] as const;
const DEFAULT_CATEGORY = 'General';

const MAX_NAME = 200;
const MAX_MESSAGE = 5000;
const MAX_EMAIL = 254;

// Conservative single-address check. Deliberately stricter than a spec-complete
// validator: commas, semicolons, quotes, angle brackets, and any whitespace
// (including CR/LF) are refused outright.
const SINGLE_EMAIL_RE = /^[^\s@,;<>"'\\]{1,64}@[^\s@,;<>"'\\]{1,189}\.[A-Za-z]{2,24}$/;

function isSingleSafeEmail(value: string): boolean {
  return value.length <= MAX_EMAIL && SINGLE_EMAIL_RE.test(value);
}

/** Collapse control characters (header-injection carriers) and bound the length. */
function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const allowed = await checkRateLimit(`ip:${ip}`, 'support', 300, 3);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const { name, email, category, message, context } = await request.json();

    if (!name || !email || !category || !message) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    const safeEmail = String(email).trim();
    if (!isSingleSafeEmail(safeEmail)) {
      return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
    }

    // A second bucket keyed on the address, so rotating IPs cannot mail-bomb one
    // person. Five support requests an hour from one address is far above real use.
    const emailAllowed = await checkRateLimit(`email:${safeEmail.toLowerCase()}`, 'support-email', 3600, 5);
    if (!emailAllowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const safeName = cleanText(name, MAX_NAME) || 'CRWN user';
    const safeMessage = cleanText(message, MAX_MESSAGE);
    if (!safeMessage) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    const rawCategory = cleanText(category, 40);
    const safeCategory = (CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : DEFAULT_CATEGORY;

    // Auto-captured context from the bug report widget: page URL, browser, user id.
    const ctx = context && typeof context === 'object' ? (context as Record<string, unknown>) : null;
    const contextLines = ctx
      ? ['page', 'userAgent', 'userId']
          .filter((k) => ctx[k])
          .map((k) => `${k}: ${cleanText(ctx[k], 300)}`)
          .join('\n')
      : '';
    const contextHtml = contextLines
      ? `<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;">
          <p style="color: #A0A0A0; margin: 0 0 8px;">Context</p>
          <p style="color: #A0A0A0; font-size: 12px; white-space: pre-wrap; margin: 0;">${escapeHtml(contextLines)}</p>
        </div>`
      : '';

    // Send to support inbox. The founder's personal address rides along so a bug
    // report is never sitting unseen in a forwarding inbox.
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'support@thecrwn.app',
      cc: 'joshn.wms@gmail.com',
      replyTo: safeEmail,
      subject: `[${safeCategory}] Support request from ${safeName}`,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #1A1A1A; border-radius: 12px; padding: 32px; color: #ffffff;">
          <h2 style="color: #D4AF37; margin-top: 0;">New Support Request</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #A0A0A0; vertical-align: top; width: 100px;">Name</td>
              <td style="padding: 8px 0; color: #ffffff;">${escapeHtml(safeName)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A0A0A0; vertical-align: top;">Email</td>
              <td style="padding: 8px 0; color: #ffffff;">${escapeHtml(safeEmail)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #A0A0A0; vertical-align: top;">Category</td>
              <td style="padding: 8px 0; color: #ffffff;">${escapeHtml(safeCategory)}</td>
            </tr>
          </table>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;">
            <p style="color: #A0A0A0; margin: 0 0 8px;">Message</p>
            <p style="color: #ffffff; white-space: pre-wrap; margin: 0;">${escapeHtml(safeMessage)}</p>
          </div>
          ${contextHtml}
        </div>
      `,
    });

    // Confirmation to the submitter. It intentionally contains NO submitter-supplied
    // text (no name, no message echo). The address is unverified, so anything the
    // sender wrote would be attacker-authored content delivered from CRWN's aligned
    // domain. The confirmation only has to say "we have it, reply to add anything".
    await resend.emails.send({
      from: FROM_EMAIL,
      to: safeEmail,
      subject: 'We received your support request: CRWN',
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; background: #1A1A1A; border-radius: 12px; padding: 32px; color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #D4AF37; font-size: 24px; margin: 0;">CRWN</h1>
          </div>
          <p style="color: #ffffff;">Hi there,</p>
          <p style="color: #A0A0A0; line-height: 1.6;">We've received your support request and will get back to you as soon as possible, typically within 24 to 48 hours.</p>
          <div style="background: #242424; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <p style="color: #A0A0A0; margin: 0 0 4px; font-size: 13px;">Category</p>
            <p style="color: #ffffff; margin: 0;">${escapeHtml(safeCategory)}</p>
          </div>
          <p style="color: #A0A0A0; line-height: 1.6;">If you need to add anything, just reply to this email and it lands on the same thread.</p>
          <p style="color: #A0A0A0; line-height: 1.6; font-size: 13px;">If you did not contact CRWN support, you can ignore this email. Nothing was changed on any account.</p>
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
