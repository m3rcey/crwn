// Team Splits — Resend email templates. Dark/gold CRWN styling, matching the
// other emails in this folder. All are plain functions returning an HTML string.

function shell(inner: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;"><h1 style="color:#D4AF37;font-size:32px;margin:0;">CRWN</h1></div>
    <div style="background-color:#242424;border-radius:16px;padding:32px;border:1px solid #333;">
      ${inner}
    </div>
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#666;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} JNW Creative Enterprises, Inc. All rights reserved.</p>
      <p style="color:#666;font-size:12px;margin:8px 0 0;">
        <a href="https://thecrwn.app/terms" style="color:#666;text-decoration:underline;">Terms</a> &middot;
        <a href="https://thecrwn.app/privacy" style="color:#666;text-decoration:underline;">Privacy</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<div style="text-align:center;margin:32px 0 0;">
    <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#9a7b2a,#D4AF37);color:#1A1A1A;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none;">${label}</a>
  </div>`;
}

/** Sent to a collaborator who was invited to a Team Split. `link` is absolute. */
export function teamSplitInviteEmail(
  artistName: string,
  dealTitle: string,
  roleLabel: string,
  summaryLine: string,
  link: string,
): string {
  return shell(`
    <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">${artistName} wants you on their team &#128081;</h2>
    <p style="color:#A0A0A0;font-size:16px;line-height:1.6;margin:0 0 20px;">
      You've been invited to a revenue-share deal on CRWN as <strong style="color:#D4AF37;">${roleLabel}</strong>.
    </p>
    <div style="background-color:#1A1A1A;border-radius:12px;padding:20px;margin:0 0 12px;">
      <p style="color:#FFFFFF;font-size:16px;font-weight:600;margin:0 0 8px;">${dealTitle}</p>
      <p style="color:#A0A0A0;font-size:14px;line-height:1.6;margin:0;">${summaryLine}</p>
    </div>
    <p style="color:#666;font-size:13px;line-height:1.6;margin:12px 0 0;">
      Review the full terms, ask for changes, or accept. Estimated earnings are projections, not guarantees.
    </p>
    ${button(link, 'Review the deal')}
  `);
}

/** Sent to the artist when the collaborator responds. */
export function teamSplitResponseEmail(
  collaboratorName: string,
  dealTitle: string,
  action: 'accepted' | 'rejected' | 'requested changes',
  link: string,
): string {
  const emoji = action === 'accepted' ? '&#9989;' : action === 'rejected' ? '&#10060;' : '&#128172;';
  return shell(`
    <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">${collaboratorName} ${action} your deal ${emoji}</h2>
    <div style="background-color:#1A1A1A;border-radius:12px;padding:20px;margin:0 0 12px;">
      <p style="color:#FFFFFF;font-size:16px;font-weight:600;margin:0;">${dealTitle}</p>
    </div>
    ${button(link, 'View deal')}
  `);
}

/** Sent to a collaborator when the artist releases a payout. */
export function teamSplitPayoutReleasedEmail(
  dealTitle: string,
  amount: string,
  needsPayoutSetup: boolean,
  link: string,
): string {
  return shell(`
    <h2 style="color:#FFFFFF;font-size:24px;margin:0 0 16px;">A payout was released &#128176;</h2>
    <div style="background-color:#1A1A1A;border-radius:12px;padding:20px;margin:0 0 12px;">
      <p style="color:#FFFFFF;font-size:16px;font-weight:600;margin:0 0 6px;">${dealTitle}</p>
      <p style="color:#D4AF37;font-size:22px;font-weight:700;margin:0;">${amount} available</p>
    </div>
    <p style="color:#A0A0A0;font-size:14px;line-height:1.6;margin:12px 0 0;">
      ${needsPayoutSetup
        ? 'Finish your Stripe payout setup to cash out. Payouts can only be sent once your account is connected.'
        : 'Head to your Team Deals to cash out (minimum $25.00).'}
    </p>
    ${button(link, needsPayoutSetup ? 'Set up payouts' : 'Cash out')}
  `);
}
