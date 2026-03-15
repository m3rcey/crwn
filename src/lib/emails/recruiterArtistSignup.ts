export function recruiterArtistSignupEmail(params: {
  recruiterName: string;
  artistName: string;
}) {
  const { recruiterName, artistName } = params;

  return {
    subject: `An artist just signed up through your link!`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">Nice work, ${recruiterName}!</h2>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              <strong style="color: #FFFFFF;">${artistName}</strong> just signed up for a paid plan through your referral link. Their 30-day qualifying period starts now.
            </p>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              If they stay on their plan for 30 days, you will receive your flat fee payout automatically.
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
