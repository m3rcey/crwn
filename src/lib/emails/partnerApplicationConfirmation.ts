export function partnerApplicationConfirmationEmail(params: {
  firstName: string;
}) {
  const { firstName } = params;

  return {
    subject: 'CRWN Partner Program — Application Received',
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 600; margin: 0 0 12px 0;">Hey ${firstName},</h2>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              Thanks for applying to the CRWN Partner Program.
            </p>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              We'll review your application and assign your partner tier within 48 hours. All partners get:
            </p>
            <ul style="color: #A0A0A0; font-size: 14px; line-height: 1.8; margin: 0 0 24px 0; padding-left: 20px;">
              <li>Free platform access (Pro or Empire depending on tier)</li>
              <li>Your custom partner referral link</li>
              <li>$50 per artist who goes paid through your link</li>
              <li>Top-tier partners also get 10% recurring for 12 months + content bonuses up to $250/post</li>
            </ul>
            <p style="color: #A0A0A0; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
              Talk soon.
            </p>
            <p style="color: #FFFFFF; font-size: 14px; font-weight: 600; margin: 0;">— The CRWN Team</p>
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
