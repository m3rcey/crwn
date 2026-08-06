// Personal welcome from Josh to every new artist the moment they publish their
// page. Sent exactly once, server-side, from /api/notifications/new-artist-hook
// (driven by the artist_profiles INSERT trigger). Carries the Cal.com link so
// the artist can book a 1-on-1 onboarding call with Josh to get set up to earn.
//
// Same booking link as onboardingReminder.ts — keep them in sync.
const BOOKING_URL = 'https://cal.com/jnwcreative/30min';
const DASHBOARD_URL = 'https://thecrwn.app/profile/artist';

export function artistWelcomeEmail(params: { name?: string | null }) {
  const first = (params.name || '').trim().split(' ')[0] || 'there';

  return {
    subject: `Welcome to CRWN, ${first}. Let's get you paid 👑`,
    html: `
      <div style="background-color: #1A1A1A; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="max-width: 460px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #D4AF37; font-size: 28px; font-weight: bold; margin: 0;">CRWN</h1>
          </div>
          <div style="background-color: #242424; border-radius: 12px; padding: 32px; border: 1px solid #333;">
            <p style="color: #FFFFFF; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">Hey ${first},</p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              Josh here, founder of CRWN. I saw your page just went live. Congrats, and welcome. I'm personally onboarding our first artists one by one, and I'd genuinely love to help you get yours making money.
            </p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 0 0 16px 0;">
              Grab a time and hop on a quick call with me. I'll walk your page with you: your tiers, your first drop, your Promise Calendar, and the fastest path to your first paid member. If you already sell to fans somewhere else, I'll show you how we help move it all over.
            </p>
            <div style="text-align: center; margin: 28px 0 8px 0;">
              <a href="${BOOKING_URL}" style="display: inline-block; background-color: #D4AF37; color: #000000; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 999px;">Book your onboarding call</a>
            </div>
            <p style="color: #CCCCCC; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0; text-align: center;">
              Or jump straight into your dashboard: <a href="${DASHBOARD_URL}" style="color: #D4AF37; text-decoration: none;">thecrwn.app/profile/artist</a>
            </p>
            <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6; margin: 24px 0 0 0;">
              Real excited to build with you.<br />
              Josh, CRWN
            </p>
          </div>
        </div>
      </div>
    `,
  };
}
