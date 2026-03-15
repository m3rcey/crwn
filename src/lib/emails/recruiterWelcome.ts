export function recruiterWelcomeEmail(params: {
  displayName: string;
  referralCode: string;
}) {
  const { displayName, referralCode } = params;
  const referralUrl = `https://thecrwn.app/join/${referralCode}`;

  return {
    subject: 'Welcome to the CRWN Recruiter Program',
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">You are officially a CRWN Recruiter, ${displayName}!</h2>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              Share your unique link with artists you know. When they join a paid plan and stay for 30 days, you get paid.
            </p>
            <div style="background-color: #1A1A1A; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #666; font-size: 12px; margin: 0 0 8px 0;">Your referral link:</p>
              <p style="color: #D4AF37; font-size: 16px; font-weight: 600; margin: 0; word-break: break-all;">${referralUrl}</p>
            </div>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 8px 0;">
              <strong style="color: #FFFFFF;">How it works:</strong>
            </p>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.8; margin: 0 0 24px 0;">
              1. Share your link with artists<br/>
              2. They sign up and choose a paid plan<br/>
              3. After 30 days, you get paid directly to your Stripe account<br/>
              4. Refer more artists to unlock higher payouts
            </p>
            <div style="text-align: center;">
              <a href="https://thecrwn.app/recruit/dashboard" style="display: inline-block; background-color: #D4AF37; color: #1A1A1A; font-weight: 600; font-size: 14px; padding: 12px 32px; border-radius: 9999px; text-decoration: none;">
                Go to Dashboard
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
