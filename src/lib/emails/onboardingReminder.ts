// Founder re-engagement email for signups who never finished onboarding (/welcome).
// Sent once by /api/cron/onboarding-reminder. Mirrors the personal note Josh sends
// new artists, with the Cal.com booking link for a setup call.

const BOOKING_URL = 'https://cal.com/jnwcreative/30min';
const FINISH_URL = 'https://thecrwn.app/welcome';

export function onboardingReminderEmail(params: { name?: string | null }) {
  const first = (params.name || '').trim().split(' ')[0] || 'there';

  return {
    subject: `Let's finish setting up your CRWN page, ${first}`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <p style="color: #FFFFFF; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">Hey ${first},</p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              Josh here, founder of CRWN. You started creating your account but didn't finish setting it up, so I wanted to reach out personally.
            </p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              I'm onboarding our first artists one by one right now. I'd love to hop on a quick 30 minute call to get your page set up to actually make money: your tiers, your first upload, and getting your fans subscribing.
            </p>
            <div style="text-align: center; margin: 28px 0 8px 0;">
              <a href="${BOOKING_URL}" style="display: inline-block; background-color: #D4AF37; color: #000000; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 999px;">Book a setup call</a>
            </div>
            <p style="color: #CCCCCC; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; text-align: center;">
              Or finish setting up your page yourself: <a href="${FINISH_URL}" style="color: #D4AF37; text-decoration: none;">thecrwn.app/welcome</a>
            </p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 24px 0 0 0;">
              Looking forward to building with you.<br />
              Josh, CRWN
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
