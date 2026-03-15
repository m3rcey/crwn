export function fanReferralEarningEmail(params: {
  fanName: string;
  artistName: string;
  amount: number;
  referredName: string;
}) {
  const { fanName, artistName, amount, referredName } = params;

  return {
    subject: `You just earned $${(amount / 100).toFixed(2)} from CRWN!`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">You got paid, ${fanName}!</h2>
            <div style="text-align: center; margin: 24px 0;">
              <p style="color: #D4AF37; font-size: 36px; font-weight: bold; margin: 0;">$${(amount / 100).toFixed(2)}</p>
              <p style="color: #666; font-size: 12px; margin: 4px 0 0 0;">referral commission</p>
            </div>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              <strong style="color: #FFFFFF;">${referredName}</strong> just subscribed to <strong style="color: #FFFFFF;">${artistName}</strong> through your referral link. You earn a recurring commission for as long as they stay subscribed.
            </p>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              Keep sharing your link to earn more.
            </p>
            <div style="text-align: center;">
              <a href="https://thecrwn.app/library?tab=referrals" style="display: inline-block; background-color: #D4AF37; color: #1A1A1A; font-weight: 600; font-size: 14px; padding: 12px 32px; border-radius: 9999px; text-decoration: none;">
                View Referrals
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
