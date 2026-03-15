export function recruiterRecurringEmail(params: {
  recruiterName: string;
  totalAmount: number;
  referralCount: number;
}) {
  const { recruiterName, totalAmount, referralCount } = params;

  return {
    subject: `Your monthly CRWN recruiter payout: $${(totalAmount / 100).toFixed(2)}`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">Monthly payout, ${recruiterName}!</h2>
            <div style="text-align: center; margin: 24px 0;">
              <p style="color: #D4AF37; font-size: 36px; font-weight: bold; margin: 0;">$${(totalAmount / 100).toFixed(2)}</p>
              <p style="color: #666; font-size: 12px; margin: 4px 0 0 0;">from ${referralCount} active artist${referralCount !== 1 ? 's' : ''}</p>
            </div>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              Your recurring commission for this month has been sent to your connected Stripe account. This is passive income from the artists you referred who are still on paid plans.
            </p>
            <div style="text-align: center;">
              <a href="https://thecrwn.app/recruit/dashboard" style="display: inline-block; background-color: #D4AF37; color: #1A1A1A; font-weight: 600; font-size: 14px; padding: 12px 32px; border-radius: 9999px; text-decoration: none;">
                View Dashboard
              </a>
            </div>
          </div>
          <div style="text-align: center; margin-top: 24px;">
            <p style="color: #666; font-size: 11px; margin: 0;">
              JNW Creative Enterprises, Inc.
              <br/>
              <a href="https://thecrwn.app/terms" style="color: #D4AF37; text-decoration: none;">Terms</a> &middot;
              <a href="https://thecrwn.app/privacy" style="color: #D4AF37; text-decoration: none;">Privacy</a>
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
