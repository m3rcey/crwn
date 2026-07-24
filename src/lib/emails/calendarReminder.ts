// calendarReminder.ts — digest email for the Promise/My-CRWN Calendar. One email
// per user per run covering everything newly entering their "due soon" window, so
// it never spams. Plain, on-brand (dark + gold), inline styles for email clients.

export interface ReminderLine {
  title: string;
  whenLabel: string; // "Tomorrow", "in 2 days", "Overdue", …
  context?: string; // artist name (fan) or audience/type (artist)
}

export function calendarReminderEmail(args: {
  recipientName: string;
  audience: 'artist' | 'fan';
  items: ReminderLine[];
}): { subject: string; html: string } {
  const { recipientName, audience, items } = args;
  const firstName = (recipientName || '').split(' ')[0] || 'there';

  const heading =
    audience === 'artist'
      ? "What you promised your supporters is coming up"
      : "Here's what's coming up for you";
  const subject =
    audience === 'artist'
      ? `Promise Calendar: ${items.length} coming up`
      : `Your CRWN calendar: ${items.length} coming up`;
  const cta = audience === 'artist' ? 'Open Promise Calendar' : 'Open my calendar';
  const ctaHref = audience === 'artist'
    ? 'https://thecrwn.app/studio/promise'
    : 'https://thecrwn.app/my-calendar';

  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #2A2A2A;">
          <div style="font-size:15px;color:#FFFFFF;font-weight:600;">${escapeHtml(it.title)}</div>
          <div style="font-size:13px;color:#9A9A9A;margin-top:2px;">
            <span style="color:#D4AF37;font-weight:600;">${escapeHtml(it.whenLabel)}</span>${
        it.context ? ` &middot; ${escapeHtml(it.context)}` : ''
      }
          </div>
        </td>
      </tr>`,
    )
    .join('');

  const html = `
  <div style="background:#0D0D0D;padding:32px 16px;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#1A1A1A;border-radius:16px;padding:28px;">
      <div style="font-size:20px;font-weight:800;color:#D4AF37;margin-bottom:16px;">CRWN</div>
      <h1 style="font-size:18px;color:#FFFFFF;margin:0 0 4px;">Hey ${escapeHtml(firstName)},</h1>
      <p style="font-size:14px;color:#9A9A9A;margin:0 0 20px;">${heading}.</p>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
      <a href="${ctaHref}" style="display:inline-block;margin-top:24px;background:#D4AF37;color:#0D0D0D;font-weight:700;font-size:14px;text-decoration:none;padding:12px 24px;border-radius:999px;">${cta}</a>
      <p style="font-size:11px;color:#6A6A6A;margin-top:24px;">You're getting this because you have activity on CRWN. Manage notifications in your account settings.</p>
    </div>
  </div>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
